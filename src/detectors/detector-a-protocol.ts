import { GPS_FORMAT_IDS, type GpsFormat } from "../shared/formats";

export const DETECTOR_A_MARKER = "ctm-detector-a";

export type DetectorAVia = "fetch" | "xhr";

export interface DetectorAMessage {
  marker: typeof DETECTOR_A_MARKER;
  format: GpsFormat;
  via: DetectorAVia;
  url: string;
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
    typeof candidate.url === "string"
  );
}
