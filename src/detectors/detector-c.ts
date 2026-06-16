import { sendDetection, sendSkip } from "../shared/bus";
import { formatForUrl } from "../shared/detection-url";
import { getFormatSpec, type GpsFormat } from "../shared/formats";
import { isDetectionEnabledForHost } from "../shared/gate";
import { classifyResponse } from "../shared/response-sniff";

const BADGE_HOST_TAG = "ctm-import-badge";

const badged = new WeakSet<HTMLAnchorElement>();
let observer: MutationObserver | null = null;

function buildBadge(link: HTMLAnchorElement, format: GpsFormat): HTMLElement {
  const host = document.createElement(BADGE_HOST_TAG);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    button {
      all: initial;
      cursor: pointer;
      font: 600 11px/1.4 system-ui, sans-serif;
      color: #fff;
      background: #2b7a4b;
      border-radius: 4px;
      padding: 2px 6px;
      margin-inline-start: 6px;
      vertical-align: middle;
    }
    button:hover { background: #225f3b; }
  `;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `Send to CTM (${getFormatSpec(format).label})`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void verifyAndReport(link.href);
  });

  shadow.append(style, button);
  return host;
}

function evaluateLink(link: HTMLAnchorElement): void {
  if (badged.has(link)) {
    return;
  }
  const format = formatForUrl(link.href);
  if (!format) {
    return;
  }
  badged.add(link);
  link.insertAdjacentElement("afterend", buildBadge(link, format));
}

// The link's extension only tells us what it *looks* like. A URL ending in
// .gpx can resolve to an HTML page (e.g. GitHub's /blob view), so confirm the
// linked resource is really GPS data before claiming we'd send it. Same-origin
// links verify today; cross-origin ones need host permissions (upload work),
// and fail closed to "could not verify" until then.
async function verifyAndReport(url: string): Promise<void> {
  try {
    const response = await fetch(url);
    const format = await classifyResponse({
      url,
      contentType: response.headers.get("content-type") ?? undefined,
      contentDisposition:
        response.headers.get("content-disposition") ?? undefined,
      body: response.body,
    });
    if (format) {
      void sendDetection({ detector: "C", format, source: "link", url });
    } else {
      void sendSkip({
        detector: "C",
        url,
        reason: "linked resource is not GPS data",
      });
    }
  } catch {
    void sendSkip({
      detector: "C",
      url,
      reason: "could not verify linked resource",
    });
  }
}

function scan(root: ParentNode): void {
  for (const link of root.querySelectorAll("a[href]")) {
    if (link instanceof HTMLAnchorElement) {
      evaluateLink(link);
    }
  }
}

function handleMutations(records: MutationRecord[]): void {
  for (const record of records) {
    if (record.type === "attributes") {
      if (record.target instanceof HTMLAnchorElement) {
        evaluateLink(record.target);
      }
      continue;
    }
    for (const node of record.addedNodes) {
      if (node instanceof HTMLAnchorElement) {
        evaluateLink(node);
      } else if (node instanceof Element) {
        scan(node);
      }
    }
  }
}

export function initDetectorC(): void {
  if (!isDetectionEnabledForHost(location.hostname)) {
    return;
  }

  scan(document);

  observer = new MutationObserver(handleMutations);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href"],
  });

  window.addEventListener(
    "pagehide",
    () => {
      observer?.disconnect();
      observer = null;
    },
    { once: true },
  );
}
