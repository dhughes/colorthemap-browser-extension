export type GpsFormat = "gpx" | "fit" | "tcx" | "kml" | "kmz";

export type Signature =
  | { kind: "xml-root"; rootTokens: string[] }
  | { kind: "bytes"; offset: number; bytes: number[] }
  | { kind: "zip" };

export interface FormatSpec {
  format: GpsFormat;
  label: string;
  extensions: string[];
  mimeTypes: string[];
  signature: Signature;
  signatureSufficient: boolean;
}

export const GPS_FORMATS: readonly FormatSpec[] = [
  {
    format: "gpx",
    label: "GPX",
    extensions: [".gpx"],
    mimeTypes: ["application/gpx+xml"],
    signature: { kind: "xml-root", rootTokens: ["gpx"] },
    signatureSufficient: true,
  },
  {
    format: "fit",
    label: "FIT",
    extensions: [".fit"],
    // The registered FIT MIME (thisisant.com). Real Garmin/Strava downloads
    // usually serve octet-stream instead, so FIT leans on its extension and the
    // offset-8 ".FIT" magic, not this.
    mimeTypes: ["application/vnd.ant.fit"],
    signature: { kind: "bytes", offset: 8, bytes: [0x2e, 0x46, 0x49, 0x54] },
    signatureSufficient: true,
  },
  {
    format: "tcx",
    label: "TCX",
    extensions: [".tcx"],
    mimeTypes: ["application/vnd.garmin.tcx+xml"],
    signature: { kind: "xml-root", rootTokens: ["trainingcenterdatabase"] },
    signatureSufficient: true,
  },
  {
    format: "kml",
    label: "KML",
    extensions: [".kml"],
    mimeTypes: ["application/vnd.google-earth.kml+xml"],
    signature: { kind: "xml-root", rootTokens: ["kml"] },
    signatureSufficient: true,
  },
  {
    format: "kmz",
    label: "KMZ",
    extensions: [".kmz"],
    mimeTypes: ["application/vnd.google-earth.kmz"],
    signature: { kind: "zip" },
    signatureSufficient: false,
  },
] as const;

export const GPS_FORMAT_IDS: readonly GpsFormat[] = GPS_FORMATS.map(
  (spec) => spec.format,
);

const SPEC_BY_FORMAT = new Map<GpsFormat, FormatSpec>(
  GPS_FORMATS.map((spec) => [spec.format, spec]),
);

export function getFormatSpec(format: GpsFormat): FormatSpec {
  const spec = SPEC_BY_FORMAT.get(format);
  if (!spec) {
    throw new Error(`Unknown GPS format: ${format}`);
  }
  return spec;
}

export function formatForExtension(extension: string): GpsFormat | null {
  const normalized = extension.trim().toLowerCase();
  if (normalized === "") {
    return null;
  }
  const withDot = normalized.startsWith(".") ? normalized : `.${normalized}`;
  for (const spec of GPS_FORMATS) {
    if (spec.extensions.includes(withDot)) {
      return spec.format;
    }
  }
  return null;
}

export function formatForMimeType(mimeType: string): GpsFormat | null {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (normalized === "") {
    return null;
  }
  for (const spec of GPS_FORMATS) {
    if (spec.mimeTypes.includes(normalized)) {
      return spec.format;
    }
  }
  return null;
}
