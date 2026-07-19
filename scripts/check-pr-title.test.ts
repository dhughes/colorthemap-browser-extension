import { describe, expect, it } from "vitest";
import { ALLOWED_TYPES, validatePrTitle } from "./check-pr-title";

describe("validatePrTitle", () => {
  it("accepts a plain type and subject", () => {
    expect(validatePrTitle("feat: add strava detection")).toBeNull();
    expect(validatePrTitle("fix: correct an off-by-one")).toBeNull();
  });

  it("accepts an optional scope", () => {
    expect(validatePrTitle("feat(detection): add strava")).toBeNull();
    expect(validatePrTitle("fix(auth): refresh before expiry")).toBeNull();
  });

  it("accepts a breaking-change marker, with and without a scope", () => {
    expect(validatePrTitle("feat!: drop Manifest V2 support")).toBeNull();
    expect(
      validatePrTitle("refactor(core)!: rename the message bus"),
    ).toBeNull();
  });

  it("accepts every allowed type", () => {
    for (const type of ALLOWED_TYPES) {
      expect(validatePrTitle(`${type}: a subject`)).toBeNull();
    }
  });

  it("rejects an unknown type", () => {
    expect(validatePrTitle("feature: add thing")).not.toBeNull();
    expect(validatePrTitle("wip: still going")).not.toBeNull();
  });

  it("does not accept a type that is only a prefix of a longer word", () => {
    expect(validatePrTitle("features: add thing")).not.toBeNull();
    expect(validatePrTitle("cirrus: x")).not.toBeNull();
  });

  it("requires a colon followed by a space", () => {
    expect(validatePrTitle("feat add thing")).not.toBeNull();
    expect(validatePrTitle("feat:no space")).not.toBeNull();
  });

  it("rejects an empty or whitespace-only subject", () => {
    expect(validatePrTitle("feat: ")).not.toBeNull();
    expect(validatePrTitle("feat:    ")).not.toBeNull();
  });

  it("rejects the legacy [#NN] prefix style", () => {
    expect(validatePrTitle("[#7] Release pipeline")).not.toBeNull();
  });

  it("rejects an empty title", () => {
    expect(validatePrTitle("")).not.toBeNull();
  });

  it("treats the subject as opaque data, not shell input", () => {
    expect(validatePrTitle("feat: support $(weird) `titles`")).toBeNull();
  });
});
