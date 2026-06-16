import { GPS_FORMAT_IDS, type GpsFormat } from "./formats";

export const DETECTION_MESSAGE_TYPE = "ctm-detection";

export type Detector = "A" | "B" | "C";
export type DetectionSource = "link" | "fetch" | "xhr" | "download";

const DETECTORS: readonly Detector[] = ["A", "B", "C"];
const SOURCES: readonly DetectionSource[] = [
  "link",
  "fetch",
  "xhr",
  "download",
];

export interface DetectionPayload {
  detector: Detector;
  format: GpsFormat;
  source: DetectionSource;
  url: string;
  sizeHint?: number;
}

export interface DetectionMessage extends DetectionPayload {
  type: typeof DETECTION_MESSAGE_TYPE;
}

export function createDetectionMessage(
  payload: DetectionPayload,
): DetectionMessage {
  const message: DetectionMessage = {
    type: DETECTION_MESSAGE_TYPE,
    detector: payload.detector,
    format: payload.format,
    source: payload.source,
    url: payload.url,
  };
  if (payload.sizeHint !== undefined) {
    message.sizeHint = payload.sizeHint;
  }
  return message;
}

export function isDetectionMessage(value: unknown): value is DetectionMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== DETECTION_MESSAGE_TYPE) {
    return false;
  }
  if (!DETECTORS.includes(candidate.detector as Detector)) {
    return false;
  }
  if (!GPS_FORMAT_IDS.includes(candidate.format as GpsFormat)) {
    return false;
  }
  if (!SOURCES.includes(candidate.source as DetectionSource)) {
    return false;
  }
  if (typeof candidate.url !== "string") {
    return false;
  }
  if (
    candidate.sizeHint !== undefined &&
    typeof candidate.sizeHint !== "number"
  ) {
    return false;
  }
  return true;
}

export function formatDetectionLog(message: DetectionMessage): string {
  return `[detector:${message.detector}] would send ${message.url} to CTM (${message.format}, source=${message.source})`;
}

export const SKIP_MESSAGE_TYPE = "ctm-detection-skip";

export interface SkipPayload {
  detector: Detector;
  url: string;
  reason?: string;
}

export interface SkipMessage extends SkipPayload {
  type: typeof SKIP_MESSAGE_TYPE;
}

export function createSkipMessage(payload: SkipPayload): SkipMessage {
  const message: SkipMessage = {
    type: SKIP_MESSAGE_TYPE,
    detector: payload.detector,
    url: payload.url,
  };
  if (payload.reason !== undefined) {
    message.reason = payload.reason;
  }
  return message;
}

export function isSkipMessage(value: unknown): value is SkipMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === SKIP_MESSAGE_TYPE &&
    DETECTORS.includes(candidate.detector as Detector) &&
    typeof candidate.url === "string" &&
    (candidate.reason === undefined || typeof candidate.reason === "string")
  );
}

export function formatSkipLog(message: SkipMessage): string {
  const suffix = message.reason ? ` (${message.reason})` : "";
  return `[detector:${message.detector}] would NOT send ${message.url} to CTM${suffix}`;
}
