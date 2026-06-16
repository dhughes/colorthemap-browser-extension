import { classifyByMetadata } from "./classify";
import { filenameFromContentDisposition } from "./detection-url";
import type { GpsFormat } from "./formats";
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
// XHR wraps: try the cheap metadata signals first (extension, then MIME — see
// classifyByMetadata), and only read the body to magic-byte sniff when a hint
// says it could be GPS. Transport-agnostic: callers just supply a byte stream.
export async function classifyResponse(
  input: ResponseSniffInput,
): Promise<GpsFormat | null> {
  const filename = input.contentDisposition
    ? (filenameFromContentDisposition(input.contentDisposition) ?? undefined)
    : undefined;

  const cheap = classifyByMetadata({
    url: input.url,
    filename,
    contentType: input.contentType,
  });
  if (cheap) {
    return cheap;
  }

  if (
    !input.body ||
    !shouldSniffBody({
      url: input.url,
      contentType: input.contentType,
      contentDisposition: input.contentDisposition,
    })
  ) {
    return null;
  }

  return sniffBytes(await readHead(input.body), {
    url: input.url,
    contentType: input.contentType,
  });
}
