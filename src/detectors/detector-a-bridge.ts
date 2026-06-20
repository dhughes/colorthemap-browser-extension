import { isDetectionEnabledForHost } from "../shared/gate";
import { openUploadDialog } from "../ui/upload-dialog";
import { isDetectorAMessage } from "./detector-a-protocol";

export function initDetectorABridge(): void {
  window.addEventListener("message", (event) => {
    // event.source === window is the load-bearing guard (another window can't
    // forge it); the origin check is a secondary filter. This is structural
    // disambiguation, NOT authentication — same-origin page scripts can also
    // post here, so the upload is gated by the user's explicit Send click and
    // CTM's server-side magic-byte validation, never by trusting these bytes.
    if (event.source !== window || event.origin !== location.origin) {
      return;
    }
    if (!isDetectorAMessage(event.data)) {
      return;
    }
    if (!isDetectionEnabledForHost(location.hostname)) {
      return;
    }
    // The page fetched a GPS file — offer to also send it to CTM. The bytes the
    // main world captured ride along, so the upload doesn't re-fetch.
    openUploadDialog({
      url: event.data.url,
      filename: event.data.filename,
      format: event.data.format,
      sourceHostname: location.hostname,
      bytes: event.data.bytes,
    });
  });
}

// Its own content script at document_start so the listener is registered before
// the main-world wrap (also document_start) can post an early detection.
initDetectorABridge();
