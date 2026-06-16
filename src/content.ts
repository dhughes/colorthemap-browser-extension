import { aliveMessage } from "./shared/alive";
import { initDetectorC } from "./detectors/detector-c";

console.log(aliveMessage("content"), "on", location.href);

// Detector A's bridge runs as its own document_start content script
// (detectors/detector-a-bridge.ts); Detector C stays here at document_idle so
// its MutationObserver doesn't observe the whole document during initial parse.
initDetectorC();
