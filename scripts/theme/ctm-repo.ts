import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// `git worktree list --porcelain` always lists the main worktree first, from
// any worktree — the same trick scripts/setup-worktree.sh uses. The CTM
// checkout is a sibling of the MAIN repo, never of a ~/.claude-worktrees path.
export function parseMainWorktreePath(porcelain: string): string | null {
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      return line.slice("worktree ".length).trim();
    }
  }
  return null;
}

export function siblingCtmPath(mainRepoDir: string): string {
  return join(dirname(mainRepoDir), "color-the-map");
}

export interface CtmRepo {
  path: string;
  explicit: boolean;
}

export function resolveCtmRepo(env: NodeJS.ProcessEnv): CtmRepo | null {
  if (env.CTM_REPO_PATH) {
    return { path: env.CTM_REPO_PATH, explicit: true };
  }
  const porcelain = execFileSync("git", ["worktree", "list", "--porcelain"], {
    encoding: "utf8",
  });
  const mainRepo = parseMainWorktreePath(porcelain);
  if (mainRepo === null) {
    return null;
  }
  const path = siblingCtmPath(mainRepo);
  return existsSync(path) ? { path, explicit: false } : null;
}

export function ctmGitInfo(repoPath: string): { sha: string; dirty: boolean } {
  const sha = execFileSync("git", ["-C", repoPath, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const status = execFileSync(
    "git",
    ["-C", repoPath, "status", "--porcelain"],
    {
      encoding: "utf8",
    },
  );
  return { sha, dirty: status.trim().length > 0 };
}
