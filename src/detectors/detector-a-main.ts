import { isDetectionEnabledForHost } from "../shared/gate";
import { classifyResponse } from "../shared/response-sniff";
import { DETECTOR_A_MARKER, type DetectorAVia } from "./detector-a-protocol";

function report(format: string, via: DetectorAVia, url: string): void {
  const message = { marker: DETECTOR_A_MARKER, format, via, url };
  window.postMessage(message, window.location.origin);
}

async function inspect(
  via: DetectorAVia,
  url: string,
  contentType: string | undefined,
  contentDisposition: string | undefined,
  body: ReadableStream<Uint8Array> | null,
): Promise<void> {
  const format = await classifyResponse({
    url,
    contentType,
    contentDisposition,
    body,
  });
  if (format) {
    report(format, via, url);
  }
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
      const clone = response.clone();
      await inspect(
        "fetch",
        response.url || requestUrl(args[0]),
        response.headers.get("content-type") ?? undefined,
        response.headers.get("content-disposition") ?? undefined,
        clone.body,
      );
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
    await inspect(
      "xhr",
      xhr.responseURL || xhr.__ctmUrl || "",
      xhr.getResponseHeader("content-type") ?? undefined,
      xhr.getResponseHeader("content-disposition") ?? undefined,
      xhrBody(xhr),
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

export function initDetectorAMain(): void {
  if (!isDetectionEnabledForHost(location.hostname)) {
    return;
  }
  wrapFetch();
  wrapXhr();
}

initDetectorAMain();
