import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GpsFormat } from "./formats";
import { matchesFormat, shouldSniffBody, sniffBytes } from "./sniff";

// Asserts the detection + send-time-validation contract of the committed sample
// fixtures in test-fixtures/files/. This is what the test page documents:
//   valid.*         -> detected, validates, CTM imports it
//   client-reject.* -> content sniff rejects (Detector A) AND send-time
//                      validation rejects (link/download paths) — never uploaded
//   server-reject.* -> passes both client checks; only CTM rejects it (no track)
const dir = fileURLToPath(
  new URL("../../test-fixtures/files", import.meta.url),
);

const FORMATS = ["gpx", "tcx", "kml", "kmz", "fit"] as const;

function head(name: string): Uint8Array {
  return new Uint8Array(readFileSync(`${dir}/${name}`).subarray(0, 2048));
}

// Detector A's body sniff (URL-gated, content-confirmed).
function clientSniff(name: string): string | null {
  const url = `https://example.com/${name}`;
  return shouldSniffBody({ url }) ? sniffBytes(head(name), { url }) : null;
}

// Send-time validation against the claimed format (the link/download paths).
function validates(name: string, format: GpsFormat): boolean {
  return matchesFormat(head(name), format);
}

describe("sample fixtures — detection & validation contract", () => {
  for (const format of FORMATS) {
    it(`valid.${format} is detected and validates`, () => {
      expect(clientSniff(`valid.${format}`)).toBe(format);
      expect(validates(`valid.${format}`, format)).toBe(true);
    });

    it(`client-reject.${format} is rejected by the sniff and by send-time validation`, () => {
      expect(clientSniff(`client-reject.${format}`)).toBeNull();
      expect(validates(`client-reject.${format}`, format)).toBe(false);
    });

    it(`server-reject.${format} passes both client checks (only CTM rejects it)`, () => {
      expect(clientSniff(`server-reject.${format}`)).toBe(format);
      expect(validates(`server-reject.${format}`, format)).toBe(true);
    });
  }
});
