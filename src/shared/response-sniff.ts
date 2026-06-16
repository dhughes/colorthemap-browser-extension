import { formatForMimeType, type GpsFormat } from "./formats";
import { shouldSniffBody, sniffBytes } from "./sniff";

const SNIFF_HEAD_BYTES = 512;

export interface ResponseSniffInput {
  url: string;
  contentType?: string;
  contentDisposition?: string;
  body: ReadableStream<Uint8Array> | null;
}

async function readHead(
  stream: ReadableStream<Uint8Array>,
  maxBytes = SNIFF_HEAD_BYTES,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    void reader.cancel();
  }
  const head = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    head.set(chunk, offset);
    offset += chunk.length;
  }
  return head;
}

// The shared detection flow for a streamed response, used by both the fetch and
// XHR wraps. The URL extension, filename, and content-type are only *candidate*
// signals — a path ending in .gpx can be served arbitrary bytes (a JSON/HTML
// SPA route, a redirect page, anything). So those signals decide whether a
// response is worth inspecting; the response body is what actually confirms it.
// Transport-agnostic: callers just supply a byte stream.
export async function classifyResponse(
  input: ResponseSniffInput,
): Promise<GpsFormat | null> {
  const hints = {
    url: input.url,
    contentType: input.contentType,
    contentDisposition: input.contentDisposition,
  };

  // Not even a candidate — no extension/MIME/disposition hint says GPS.
  if (!shouldSniffBody(hints)) {
    return null;
  }

  // Confirm with the actual bytes before claiming anything. The sniff either
  // verifies the candidate or rejects it (e.g. a .gpx URL that returns JSON).
  if (input.body) {
    return sniffBytes(await readHead(input.body), {
      url: input.url,
      contentType: input.contentType,
    });
  }

  // No body to validate (e.g. a HEAD response). Trust only an explicit GPS
  // content-type the server deliberately set — never the URL extension alone.
  return input.contentType ? formatForMimeType(input.contentType) : null;
}
