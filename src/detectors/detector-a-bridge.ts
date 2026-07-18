import { isDetectionEnabledForHost } from "../shared/gate";
import { openUploadToast } from "../ui/upload-toast";
import { isDetectorAMessage } from "./detector-a-protocol";

export function initDetectorABridge(): void {
  window.addEventListener("message", (event) => {
    // Same-origin only. This is a structural filter, NOT authentication:
    // same-origin page scripts can post here too, so the upload is gated by the
    // user's explicit Send click and CTM's server-side validation, never by
    // trusting these bytes. We deliberately do NOT check event.source === window
    // — Firefox's MAIN/isolated content-script wrappers make that identity check
    // fail even for our own main-world post.
    if (event.origin !== location.origin) {
      return;
    }
    if (!isDetectorAMessage(event.data)) {
      return;
    }
    if (!isDetectionEnabledForHost(location.hostname)) {
      return;
    }
    // The page fetched a GPS file — offer to also send it to CTM. The bytes the
    // main world captured ride along (base64), so the upload doesn't re-fetch.
    openUploadToast({
      url: event.data.url,
      filename: event.data.filename,
      format: event.data.format,
      bytesBase64: event.data.bytesBase64,
    });
  });
}

// Its own content script at document_start so the listener is registered before
// the main-world wrap (also document_start) can post an early detection.
initDetectorABridge();
