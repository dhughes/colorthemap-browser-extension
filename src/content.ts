import browser from "webextension-polyfill";
import { aliveMessage } from "./shared/alive";
import { initDetectorC } from "./detectors/detector-c";
import { requestUploadDialog } from "./ui/upload-dialog";
import { isOpenDialogMessage } from "./upload/messages";

console.log(aliveMessage("content"), "on", location.href);

// Detector B runs in the background (the downloads API). When it catches a
// download it asks this tab to open the dialog (no bytes — the dialog reads the
// same-origin file itself on Send).
browser.runtime.onMessage.addListener((message: unknown) => {
  if (isOpenDialogMessage(message)) {
    void requestUploadDialog({
      url: message.url,
      filename: message.filename,
      format: message.format,
      sourceHostname: location.hostname,
    });
  }
});

// Detector A's bridge runs as its own document_start content script
// (detectors/detector-a-bridge.ts); Detector C stays here at document_idle so
// its MutationObserver doesn't observe the whole document during initial parse.
initDetectorC();
