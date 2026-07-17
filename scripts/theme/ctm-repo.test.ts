import { describe, expect, it } from "vitest";
import { parseMainWorktreePath, siblingCtmPath } from "./ctm-repo.ts";

describe("parseMainWorktreePath", () => {
  it("returns the first worktree path (the main checkout)", () => {
    const porcelain = [
      "worktree /Users/doug/Projects/Personal/colorthemap-browser-extension",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree /Users/doug/.claude-worktrees/colorthemap-browser-extension/issue-30_x",
      "HEAD def456",
      "branch refs/heads/issue-30_x",
      "",
    ].join("\n");
    expect(parseMainWorktreePath(porcelain)).toBe(
      "/Users/doug/Projects/Personal/colorthemap-browser-extension",
    );
  });

  it("returns null for output with no worktree lines", () => {
    expect(parseMainWorktreePath("")).toBeNull();
  });
});

describe("siblingCtmPath", () => {
  it("resolves color-the-map as a sibling of the main repo", () => {
    expect(siblingCtmPath("/Users/doug/Projects/Personal/ctm-extension")).toBe(
      "/Users/doug/Projects/Personal/color-the-map",
    );
  });
});
