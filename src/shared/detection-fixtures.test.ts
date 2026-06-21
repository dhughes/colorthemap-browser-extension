import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { shouldSniffBody, sniffBytes } from "./sniff";

// Asserts the client-side detection contract of the committed sample fixtures in
// test-fixtures/files/. This is what the test page documents:
//   valid.*         -> detected as its format (and CTM imports it)
//   client-reject.* -> null (content sniff rejects; never reaches CTM)
//   server-reject.* -> detected as its format (passes the client sniff; CTM
//                      rejects it server-side, which this test can't exercise)
const dir = fileURLToPath(
  new URL("../../test-fixtures/files", import.meta.url),
);

const FORMATS = ["gpx", "tcx", "kml", "kmz", "fit"] as const;

function clientSniff(name: string): string | null {
  const head = new Uint8Array(readFileSync(`${dir}/${name}`).subarray(0, 2048));
  const url = `https://example.com/${name}`;
  return shouldSniffBody({ url }) ? sniffBytes(head, { url }) : null;
}

describe("sample fixtures — client-side detection contract", () => {
  for (const format of FORMATS) {
    it(`valid.${format} is detected as ${format}`, () => {
      expect(clientSniff(`valid.${format}`)).toBe(format);
    });

    it(`client-reject.${format} is rejected by the content sniff`, () => {
      expect(clientSniff(`client-reject.${format}`)).toBeNull();
    });

    it(`server-reject.${format} passes the client sniff (fails at CTM)`, () => {
      expect(clientSniff(`server-reject.${format}`)).toBe(format);
    });
  }
});
