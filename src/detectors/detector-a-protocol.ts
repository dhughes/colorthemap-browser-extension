import { GPS_FORMAT_IDS, type GpsFormat } from "../shared/formats";

export const DETECTOR_A_MARKER = "ctm-detector-a";

export type DetectorAVia = "fetch" | "xhr";

export interface DetectorAMessage {
  marker: typeof DETECTOR_A_MARKER;
  format: GpsFormat;
  via: DetectorAVia;
  url: string;
  filename: string;
  // The intercepted response body, transferred from the main world so the
  // upload doesn't have to re-fetch. Absent when too large to buffer or the
  // response type couldn't be read — the background then re-fetches the URL.
  bytes?: ArrayBuffer;
}

export function isDetectorAMessage(value: unknown): value is DetectorAMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.marker === DETECTOR_A_MARKER &&
    GPS_FORMAT_IDS.includes(candidate.format as GpsFormat) &&
    (candidate.via === "fetch" || candidate.via === "xhr") &&
    typeof candidate.url === "string" &&
    typeof candidate.filename === "string" &&
    (candidate.bytes === undefined || candidate.bytes instanceof ArrayBuffer)
  );
}
