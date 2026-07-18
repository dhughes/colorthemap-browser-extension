import { readCtmError } from "./ctm-error";
import { UploadNetworkError, UploadServerError } from "./errors";

// The one place CTM API transport failures get classified: a thrown fetch
// (offline, DNS, TLS) becomes UploadNetworkError; a non-OK response becomes
// UploadServerError carrying CTM's own message. Callers receive a
// guaranteed-OK Response.
export async function ctmFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new UploadNetworkError("Could not reach Color The Map", { cause });
  }
  if (!response.ok) {
    throw new UploadServerError(response.status, await readCtmError(response));
  }
  return response;
}
