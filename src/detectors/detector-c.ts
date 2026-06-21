import { filenameFromUrl, linkDownloadFormat } from "../shared/detection-url";
import { isDetectionEnabledForHost } from "../shared/gate";
import { requestUploadDialog } from "../ui/upload-dialog";

// Anchors we've already wired, so MutationObserver re-runs are no-ops.
const handled = new WeakSet<HTMLAnchorElement>();
let observer: MutationObserver | null = null;

function evaluateLink(link: HTMLAnchorElement): void {
  if (handled.has(link)) {
    return;
  }
  const format = linkDownloadFormat(link.href);
  if (!format) {
    return;
  }
  handled.add(link);
  // No preventDefault: the browser's normal download still proceeds. We only
  // *also* offer to send the file to CTM. Detector C flags by URL only (path
  // extension, a ?format= param, or an export-path segment); the bytes are
  // confirmed at send — for a same-origin link the dialog sniffs them first, so
  // a URL-level false positive never reaches CTM.
  link.addEventListener("click", () => {
    void requestUploadDialog({
      url: link.href,
      filename: filenameFromUrl(link.href, format),
      format,
      sourceHostname: location.hostname,
    });
  });
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
