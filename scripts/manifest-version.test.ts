import { describe, expect, it } from "vitest";
import { toManifestVersion } from "./manifest-version";

describe("toManifestVersion", () => {
  it("passes through a clean release version", () => {
    expect(toManifestVersion("0.1.0")).toBe("0.1.0");
    expect(toManifestVersion("1.2.3")).toBe("1.2.3");
  });

  it("keeps the 0.0.0 development default", () => {
    expect(toManifestVersion("0.0.0")).toBe("0.0.0");
  });

  it("strips a prerelease suffix down to the numeric core", () => {
    expect(toManifestVersion("0.1.0-rc.1")).toBe("0.1.0");
    expect(toManifestVersion("1.0.0-beta.3")).toBe("1.0.0");
  });

  it("strips build metadata", () => {
    expect(toManifestVersion("1.0.0+build.5")).toBe("1.0.0");
    expect(toManifestVersion("1.0.0-beta.3+exp.sha.5114f85")).toBe("1.0.0");
  });

  it("accepts one to four components", () => {
    expect(toManifestVersion("2")).toBe("2");
    expect(toManifestVersion("2.5")).toBe("2.5");
    expect(toManifestVersion("1.2.3.4")).toBe("1.2.3.4");
  });

  it("tolerates surrounding whitespace", () => {
    expect(toManifestVersion("  0.1.0\n")).toBe("0.1.0");
  });

  it("rejects more than four components", () => {
    expect(() => toManifestVersion("1.2.3.4.5")).toThrow(/1-4/);
  });

  it("rejects non-numeric input", () => {
    expect(() => toManifestVersion("abc")).toThrow();
    expect(() => toManifestVersion("")).toThrow();
    expect(() => toManifestVersion("1.2.")).toThrow();
  });

  it("rejects leading zeros in a component", () => {
    expect(() => toManifestVersion("1.02.3")).toThrow();
  });

  it("rejects a component above 65535", () => {
    expect(() => toManifestVersion("1.70000.0")).toThrow(/65535/);
  });
});
