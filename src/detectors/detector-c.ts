import { sendDetection } from "../shared/bus";
import { formatForUrl } from "../shared/detection-url";
import { getFormatSpec, type GpsFormat } from "../shared/formats";
import { isDetectionEnabledForHost } from "../shared/gate";

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
    // Logging only: flag the candidate by its extension. The file's content is
    // confirmed (magic-byte sniff) at send time, uniformly across detectors,
    // once the upload path exists — Detector C can't read the bytes here.
    void sendDetection({
      detector: "C",
      format,
      source: "link",
      url: link.href,
    });
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
