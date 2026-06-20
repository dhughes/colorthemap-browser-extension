import {
  filenameFromContentDisposition,
  filenameFromUrl,
} from "../shared/detection-url";
import type { GpsFormat } from "../shared/formats";
import { isDetectionEnabledForHost } from "../shared/gate";
import { classifyResponse } from "../shared/response-sniff";
import {
  DETECTOR_A_MARKER,
  type DetectorAMessage,
  type DetectorAVia,
} from "./detector-a-protocol";

// CTM's single-file cap. Bigger bodies aren't buffered for upload (the server
// would reject them anyway); detection still reports so the URL can be tried.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function report(
  format: GpsFormat,
  via: DetectorAVia,
  url: string,
  filename: string,
  bytes: ArrayBuffer | null,
): void {
  const message: DetectorAMessage = {
    marker: DETECTOR_A_MARKER,
    format,
    via,
    url,
    filename,
  };
  if (bytes) {
    message.bytes = bytes;
    // Transfer the buffer (it's a fresh copy, never the page's live body) so a
    // multi-MB file doesn't get structured-clone-copied across the boundary.
    window.postMessage(message, window.location.origin, [bytes]);
  } else {
    window.postMessage(message, window.location.origin);
  }
}

function filenameFor(
  url: string,
  contentDisposition: string | undefined,
  format: GpsFormat,
): string {
  if (contentDisposition) {
    const fromHeader = filenameFromContentDisposition(contentDisposition);
    if (fromHeader) {
      return fromHeader;
    }
  }
  return filenameFromUrl(url, format);
}

async function readCappedBytes(
  response: Response,
): Promise<ArrayBuffer | null> {
  const len = Number(response.headers.get("content-length"));
  if (Number.isFinite(len) && len > MAX_UPLOAD_BYTES) {
    void response.body?.cancel();
    return null;
  }
  const buffer = await response.arrayBuffer();
  return buffer.byteLength <= MAX_UPLOAD_BYTES ? buffer : null;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return "";
}

function wrapFetch(): void {
  const originalFetch = window.fetch;
  if (typeof originalFetch !== "function") {
    return;
  }
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      // Two clones: one consumed (head only) to classify, one held back to
      // buffer the full body — but only once the response is confirmed GPS, so
      // non-GPS responses are never fully read.
      const sniffClone = response.clone();
      const bytesClone = response.clone();
      const url = response.url || requestUrl(args[0]);
      const contentType = response.headers.get("content-type") ?? undefined;
      const contentDisposition =
        response.headers.get("content-disposition") ?? undefined;

      const format = await classifyResponse({
        url,
        contentType,
        contentDisposition,
        body: sniffClone.body,
      });
      if (!format) {
        void bytesClone.body?.cancel();
      } else {
        const bytes = await readCappedBytes(bytesClone);
        report(
          format,
          "fetch",
          url,
          filenameFor(url, contentDisposition, format),
          bytes,
        );
      }
    } catch {
      // Sniffing must never break the page's own fetch.
    }
    return response;
  };
}

interface TaggedXhr extends XMLHttpRequest {
  __ctmUrl?: string;
  __ctmHooked?: boolean;
}

function wrapXhr(): void {
  const proto = XMLHttpRequest.prototype;
  const originalOpen = proto.open;
  const originalSend = proto.send;

  proto.open = function (this: TaggedXhr, _method: string, url: string | URL) {
    this.__ctmUrl = typeof url === "string" ? url : url.toString();
    // eslint-disable-next-line prefer-rest-params
    return originalOpen.apply(this, arguments as never);
  } as typeof proto.open;

  proto.send = function (this: TaggedXhr) {
    // Attach the load listener once per instance. XHR objects are reused
    // (open/send repeatedly); a single persistent listener fires once per
    // completed request, whereas adding one per send() would stack them.
    if (!this.__ctmHooked) {
      this.__ctmHooked = true;
      this.addEventListener("load", () => {
        void inspectXhr(this);
      });
    }
    // eslint-disable-next-line prefer-rest-params
    return originalSend.apply(this, arguments as never);
  } as typeof proto.send;
}

async function inspectXhr(xhr: TaggedXhr): Promise<void> {
  try {
    const url = xhr.responseURL || xhr.__ctmUrl || "";
    const contentType = xhr.getResponseHeader("content-type") ?? undefined;
    const contentDisposition =
      xhr.getResponseHeader("content-disposition") ?? undefined;

    const format = await classifyResponse({
      url,
      contentType,
      contentDisposition,
      body: xhrBody(xhr),
    });
    if (!format) {
      return;
    }
    report(
      format,
      "xhr",
      url,
      filenameFor(url, contentDisposition, format),
      xhrBytes(xhr),
    );
  } catch {
    // Best-effort.
  }
}

// Parity with the fetch path: feed whatever body the page asked for as a byte
// stream so binary formats (FIT) sniff too, not just text responses.
function xhrBody(xhr: TaggedXhr): ReadableStream<Uint8Array> | null {
  switch (xhr.responseType) {
    case "":
    case "text":
      return xhr.responseText ? new Response(xhr.responseText).body : null;
    case "arraybuffer":
    case "blob":
      return xhr.response ? new Response(xhr.response).body : null;
    default:
      return null;
  }
}

// A transferable copy of the loaded body — never the page's own buffer, which
// transferring would detach. Blob/JSON/document types are skipped (the
// background re-fetches the URL instead).
function xhrBytes(xhr: TaggedXhr): ArrayBuffer | null {
  let buffer: ArrayBuffer | null = null;
  switch (xhr.responseType) {
    case "":
    case "text":
      buffer = xhr.responseText
        ? new TextEncoder().encode(xhr.responseText).buffer
        : null;
      break;
    case "arraybuffer":
      buffer =
        xhr.response instanceof ArrayBuffer ? xhr.response.slice(0) : null;
      break;
    default:
      buffer = null;
  }
  return buffer && buffer.byteLength <= MAX_UPLOAD_BYTES ? buffer : null;
}

export function initDetectorAMain(): void {
  if (!isDetectionEnabledForHost(location.hostname)) {
    return;
  }
  wrapFetch();
  wrapXhr();
}

initDetectorAMain();
