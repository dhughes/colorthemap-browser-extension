import { TokenExpired } from "../auth/errors";
import { getAccessToken } from "../auth/service";
import { base64ToBytes } from "../shared/base64";
import { isSafeRefetchTarget } from "../shared/refetch-safety";
import { getAllowPrivateHosts } from "../shared/settings";
import { matchesFormat } from "../shared/sniff";
import { UploadNetworkError, UploadServerError } from "./errors";
import { fetchMaps } from "./maps";
import {
  isListMapsMessage,
  isUploadMessage,
  type ListMapsResult,
  type UploadFailureReason,
  type UploadFileInput,
  type UploadMessage,
  type UploadResult,
} from "./messages";
import { fetchFileBytes, uploadTracks } from "./service";

// Routes upload-related runtime messages to the matching action, returning a
// Promise the onMessage listener forwards as the response — or undefined for
// messages this handler doesn't own, letting other listeners handle them.
export function handleUploadMessage(
  message: unknown,
): Promise<ListMapsResult | UploadResult> | undefined {
  if (isListMapsMessage(message)) return handleListMaps();
  if (isUploadMessage(message)) return handleUploadBatch(message);
  return undefined;
}

async function handleListMaps(): Promise<ListMapsResult> {
  try {
    const accessToken = await getAccessToken();
    return { ok: true, maps: await fetchMaps(accessToken) };
  } catch (error) {
    console.error("[ctm] list maps failed", error);
    return {
      ok: false,
      reason: classifyFailure(error),
      detail: detailOf(error),
    };
  }
}

interface ResolvedFile {
  filename: string;
  bytes: ArrayBuffer;
}

async function handleUploadBatch(
  message: UploadMessage,
): Promise<UploadResult> {
  try {
    const accessToken = await getAccessToken();
    const allowPrivate = await getAllowPrivateHosts();

    // Resolve every file's bytes (captured base64 or a credentialed re-fetch),
    // then sniff-validate each against its claimed format. Detector A already
    // content-checked its bytes, but the link/download paths only know the
    // extension/MIME — so an HTML-named-.gpx reaches here. A file that fails
    // locally is counted as failed and kept out of the CTM POST rather than
    // aborting the whole batch.
    const resolved = await Promise.all(
      message.files.map((file) => resolveAndValidate(file, allowPrivate)),
    );
    const valid = resolved.filter(
      (r): r is { ok: true; file: ResolvedFile } => r.ok,
    );
    const localErrors = resolved
      .filter((r): r is { ok: false; error: string } => !r.ok)
      .map((r) => r.error);

    if (valid.length === 0) {
      return {
        status: "done",
        uploaded: 0,
        duplicates: 0,
        failed: localErrors.length,
        total: message.files.length,
        errors: localErrors,
      };
    }

    const outcome = await uploadTracks({
      accessToken,
      mapId: message.mapId,
      files: valid.map((r) => r.file),
    });

    return {
      status: "done",
      uploaded: outcome.uploaded,
      duplicates: outcome.duplicates,
      failed: outcome.failed + localErrors.length,
      total: message.files.length,
      errors: [...outcome.errors, ...localErrors],
    };
  } catch (error) {
    console.error("[ctm] upload failed", error);
    return {
      status: "error",
      reason: classifyFailure(error),
      detail: detailOf(error),
    };
  }
}

async function resolveAndValidate(
  file: UploadFileInput,
  allowPrivate: boolean,
): Promise<{ ok: true; file: ResolvedFile } | { ok: false; error: string }> {
  // One generic failure line for every re-fetch/validation outcome. Keeping
  // "host unreachable" indistinguishable from "responded but wasn't a GPS file"
  // denies a malicious page an alive/dead oracle for the URLs it makes us fetch.
  const failed = {
    ok: false as const,
    error: `${file.filename} couldn't be imported.`,
  };

  // The re-fetch target (cross-origin link, no captured bytes) is page-controlled
  // and fetched with the user's cookies — refuse loopback/private/non-http(s)
  // hosts before fetching (SSRF). The captured-bytes path never re-fetches.
  if (
    file.bytesBase64 === undefined &&
    !isSafeRefetchTarget(file.url, { allowPrivate })
  ) {
    console.warn("[ctm] refusing unsafe re-fetch target", file.url);
    return failed;
  }

  // A per-file re-fetch failure (expired link, deleted resource, one flaky
  // request) is this file's problem, not the batch's — catch it so Promise.all
  // never rejects and the other files still upload.
  let bytes: ArrayBuffer;
  try {
    bytes =
      file.bytesBase64 !== undefined
        ? base64ToBytes(file.bytesBase64)
        : await fetchFileBytes(file.url);
  } catch (error) {
    console.error("[ctm] could not read file", file.url, error);
    return failed;
  }

  if (!matchesFormat(new Uint8Array(bytes), file.format)) {
    return failed;
  }
  return { ok: true, file: { filename: file.filename, bytes } };
}

// Maps a thrown error to the reason the toast translates into friendly copy.
// instanceof works here (background realm) — it wouldn't survive sendMessage.
function classifyFailure(error: unknown): UploadFailureReason {
  if (error instanceof TokenExpired) return "sign-in-required";
  if (error instanceof UploadNetworkError) return "network";
  // A 401 means CTM rejected the token (expired/revoked but not yet locally
  // stale). Route it to the sign-in prompt like a missing token — not the raw
  // server-error path, which surfaces CTM's message verbatim. 403 stays a
  // server error: authenticated but forbidden (e.g. not your map), where
  // re-authenticating wouldn't help.
  if (error instanceof UploadServerError) {
    return error.status === 401 ? "sign-in-required" : "server";
  }
  return "unknown";
}

function detailOf(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}
