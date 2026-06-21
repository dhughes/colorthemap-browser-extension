import { getAccessToken } from "../auth/service";
import { base64ToBytes } from "../shared/base64";
import { getFormatSpec } from "../shared/formats";
import { matchesFormat } from "../shared/sniff";
import { fetchMaps } from "./maps";
import {
  isListMapsMessage,
  isUploadMessage,
  type ListMapsResult,
  type UploadMessage,
  type UploadResult,
} from "./messages";
import { fetchFileBytes, uploadTrack } from "./service";

// Routes upload-related runtime messages to the matching action, returning a
// Promise the onMessage listener forwards as the response — or undefined for
// messages this handler doesn't own, letting other listeners handle them.
export function handleUploadMessage(
  message: unknown,
): Promise<ListMapsResult | UploadResult> | undefined {
  if (isListMapsMessage(message)) return handleListMaps();
  if (isUploadMessage(message)) return handleUpload(message);
  return undefined;
}

async function handleListMaps(): Promise<ListMapsResult> {
  try {
    const accessToken = await getAccessToken();
    return { ok: true, maps: await fetchMaps(accessToken) };
  } catch (error) {
    console.error("[ctm] list maps failed", error);
    return { ok: false, error: errorMessage(error) };
  }
}

async function handleUpload(message: UploadMessage): Promise<UploadResult> {
  try {
    const accessToken = await getAccessToken();
    // The content script hands over the bytes it already holds (Detector A's
    // intercepted body or a same-origin read), base64-encoded. When absent, this
    // is the cross-origin link path: re-fetch with the granted host permission.
    const bytes =
      message.bytesBase64 !== undefined
        ? base64ToBytes(message.bytesBase64)
        : await fetchFileBytes(message.url);

    // Validate the bytes against the claimed format before uploading. Detector A
    // already content-checked its bytes, but the link/download paths (C/B) only
    // know the extension/MIME — so an HTML-named-.gpx reaches here. Reject it
    // locally with a clear message instead of round-tripping to CTM for a 400.
    if (!matchesFormat(new Uint8Array(bytes), message.format)) {
      return {
        status: "error",
        detail: `This doesn't look like a valid ${getFormatSpec(message.format).label} file.`,
      };
    }

    return await uploadTrack({
      accessToken,
      mapId: message.mapId,
      filename: message.filename,
      bytes,
    });
  } catch (error) {
    console.error("[ctm] upload failed", error);
    return { status: "error", detail: errorMessage(error) };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
