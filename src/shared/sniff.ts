import { formatForMimeType, GPS_FORMATS } from "./formats";
import type { GpsFormat } from "./formats";
import {
  filenameFromContentDisposition,
  formatForFilename,
  formatForUrl,
  isAmbiguousDownloadUrl,
} from "./detection-url";

export interface SniffContext {
  contentType?: string;
  url?: string;
}

export interface SniffBodyHints extends SniffContext {
  contentDisposition?: string;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const XML_HEAD_BYTES = 1024;
const decoder = new TextDecoder("utf-8", { fatal: false });

function matchesAt(
  bytes: Uint8Array,
  offset: number,
  signature: number[],
): boolean {
  if (offset + signature.length > bytes.length) {
    return false;
  }
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function xmlRootToken(bytes: Uint8Array): string | null {
  const head = decoder.decode(bytes.subarray(0, XML_HEAD_BYTES));
  const normalized = head.charCodeAt(0) === 0xfeff ? head.slice(1) : head;
  const match = normalized.match(/<([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)/);
  return match ? (match[2]?.toLowerCase() ?? null) : null;
}

function isKmzCorroborated(context: SniffContext): boolean {
  const byUrl = context.url
    ? formatForUrl(context.url) === "kmz" ||
      formatForFilename(context.url) === "kmz"
    : false;
  const byMime = context.contentType
    ? formatForMimeType(context.contentType) === "kmz"
    : false;
  return byUrl || byMime;
}

export function sniffBytes(
  bytes: Uint8Array,
  context: SniffContext,
): GpsFormat | null {
  for (const spec of GPS_FORMATS) {
    const { signature } = spec;
    if (signature.kind === "bytes") {
      if (matchesAt(bytes, signature.offset, signature.bytes)) {
        return spec.format;
      }
    }
  }

  const root = xmlRootToken(bytes);
  if (root) {
    for (const spec of GPS_FORMATS) {
      if (
        spec.signature.kind === "xml-root" &&
        spec.signature.rootTokens.includes(root)
      ) {
        return spec.format;
      }
    }
  }

  if (matchesAt(bytes, 0, ZIP_MAGIC) && isKmzCorroborated(context)) {
    return "kmz";
  }

  return null;
}

export function shouldSniffBody(hints: SniffBodyHints): boolean {
  if (hints.contentType && formatForMimeType(hints.contentType) !== null) {
    return true;
  }
  if (hints.url && formatForUrl(hints.url) !== null) {
    return true;
  }
  if (hints.url && isAmbiguousDownloadUrl(hints.url)) {
    return true;
  }
  if (hints.contentDisposition) {
    const filename = filenameFromContentDisposition(hints.contentDisposition);
    if (filename && formatForFilename(filename) !== null) {
      return true;
    }
  }
  return false;
}
