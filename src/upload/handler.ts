import { getAccessToken } from "../auth/service";
import { base64ToBytes } from "../shared/base64";
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
    return await uploadTrack({
      accessToken,
      mapId: message.mapId,
      filename: message.filename,
      bytes,
    });
  } catch (error) {
    return { status: "error", detail: errorMessage(error) };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
