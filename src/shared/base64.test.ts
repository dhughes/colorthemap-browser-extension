import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64 } from "./base64";

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

describe("base64 round-trip", () => {
  it("preserves arbitrary binary bytes (incl. 0x00 and 0xFF)", () => {
    const original = bytes(0x00, 0x2e, 0x46, 0x49, 0x54, 0xff, 0x80, 0x01);
    const restored = new Uint8Array(base64ToBytes(bytesToBase64(original)));
    expect([...restored]).toEqual([
      0x00, 0x2e, 0x46, 0x49, 0x54, 0xff, 0x80, 0x01,
    ]);
  });

  it("round-trips text content", () => {
    const original = new TextEncoder().encode("<gpx></gpx>").buffer;
    const restored = base64ToBytes(bytesToBase64(original));
    expect(new TextDecoder().decode(restored)).toBe("<gpx></gpx>");
  });

  it("handles an empty buffer", () => {
    expect(bytesToBase64(new ArrayBuffer(0))).toBe("");
    expect(base64ToBytes("").byteLength).toBe(0);
  });

  it("round-trips a payload larger than the chunk size", () => {
    const big = new Uint8Array(0x8000 * 2 + 5);
    for (let i = 0; i < big.length; i += 1) {
      big[i] = i % 256;
    }
    const restored = new Uint8Array(base64ToBytes(bytesToBase64(big.buffer)));
    expect(restored.length).toBe(big.length);
    expect(restored[0]).toBe(0);
    expect(restored[257]).toBe(1);
    expect(restored[big.length - 1]).toBe((big.length - 1) % 256);
  });
});
