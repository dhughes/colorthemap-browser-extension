import { describe, expect, it } from "vitest";
import { isSafeRefetchTarget } from "./refetch-safety";

const safe = (url: string) => isSafeRefetchTarget(url, { allowPrivate: false });

describe("isSafeRefetchTarget (allowPrivate: false)", () => {
  it.each([
    "https://komoot.com/activity.gpx",
    "http://example.org/export?format=gpx",
    "http://8.8.8.8/x.gpx",
    "http://172.15.0.1/x.gpx", // just below the 172.16/12 private block
    "http://172.32.0.1/x.gpx", // just above it
    "http://11.0.0.1/x.gpx", // adjacent to 10/8
    "https://[2606:4700::1111]/x.gpx", // public IPv6 (Cloudflare)
  ])("allows public target %s", (url) => {
    expect(safe(url)).toBe(true);
  });

  it.each([
    "file:///etc/passwd",
    "data:text/plain,hi",
    "javascript:fetch('/')",
    "blob:https://example.com/uuid",
    "ftp://example.com/x.gpx",
  ])("rejects non-http(s) scheme %s", (url) => {
    expect(safe(url)).toBe(false);
  });

  it.each([
    "http://localhost/x.gpx",
    "http://LOCALHOST/x.gpx",
    "http://api.localhost/x.gpx",
    "http://printer.local/x.gpx",
    "http://box.home.arpa/x.gpx",
    "http://svc.internal/x.gpx",
  ])("rejects local hostname %s", (url) => {
    expect(safe(url)).toBe(false);
  });

  it.each([
    "http://127.0.0.1/x.gpx",
    "http://127.0.0.2/x.gpx",
    "http://0.0.0.0/x.gpx",
    "http://10.0.0.5/x.gpx",
    "http://172.16.0.1/x.gpx",
    "http://172.31.255.255/x.gpx",
    "http://192.168.1.1/x.gpx",
    "http://169.254.169.254/latest/meta-data/", // cloud metadata
    "http://100.64.0.1/x.gpx", // CGNAT
  ])("rejects private/loopback IPv4 %s", (url) => {
    expect(safe(url)).toBe(false);
  });

  it.each([
    "http://[::1]/x.gpx", // loopback
    "http://[::]/x.gpx", // unspecified
    "http://[fe80::1]/x.gpx", // link-local
    "http://[fc00::1]/x.gpx", // unique-local
    "http://[fd12:3456::1]/x.gpx", // unique-local (fd)
    "http://[::ffff:127.0.0.1]/x.gpx", // IPv4-mapped loopback
    "http://[::ffff:192.168.0.1]/x.gpx", // IPv4-mapped private
  ])("rejects private/loopback IPv6 %s", (url) => {
    expect(safe(url)).toBe(false);
  });

  it.each([
    "http://2130706433/x.gpx", // decimal 127.0.0.1
    "http://0x7f000001/x.gpx", // hex 127.0.0.1
    "http://0177.0.0.1/x.gpx", // octal-first-octet 127.0.0.1
    "http://0x7f.1/x.gpx", // mixed hex 127.0.0.1
  ])("rejects obfuscated loopback %s (normalizes then classifies)", (url) => {
    expect(safe(url)).toBe(false);
  });

  it("rejects an unparseable URL", () => {
    expect(safe("not a url")).toBe(false);
    expect(safe("")).toBe(false);
  });
});

describe("isSafeRefetchTarget (allowPrivate: true)", () => {
  it.each([
    "http://localhost:8080/x.gpx",
    "http://127.0.0.1:8081/x.gpx",
    "http://192.168.1.50/x.gpx",
    "http://[::1]/x.gpx",
  ])("allows private target %s when opted in", (url) => {
    expect(isSafeRefetchTarget(url, { allowPrivate: true })).toBe(true);
  });

  it.each(["file:///etc/passwd", "data:text/plain,hi", "javascript:void 0"])(
    "still rejects non-http(s) scheme %s even when opted in",
    (url) => {
      expect(isSafeRefetchTarget(url, { allowPrivate: true })).toBe(false);
    },
  );
});
