import { aliveMessage } from "./shared/alive";
import { initDetectorABridge } from "./detectors/detector-a-bridge";
import { initDetectorC } from "./detectors/detector-c";

console.log(aliveMessage("content"), "on", location.href);

initDetectorC();
initDetectorABridge();
