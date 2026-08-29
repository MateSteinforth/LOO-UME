import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const GUARD = resolve("scripts/bootstrap-update-guard.sh");
const APPROVED = "https://github.com/MateSteinforth/LOO-UME.git";

function fakeGit(directory: string): string {
  const path = join(directory, "git");
  writeFileSync(path, `#!/bin/sh
case "$*" in
  *"branch --show-current"*) echo "\${FAKE_BRANCH-main}" ;;
  *"status --porcelain"*) printf '%s' "\${FAKE_STATUS-}" ;;
  *"remote get-url origin"*) echo "\${FAKE_ORIGIN-}" ;;
  *"merge-base --is-ancestor"*) exit "\${FAKE_FF_STATUS-0}" ;;
  *) exit 2 ;;
esac
`);
  chmodSync(path, 0o700);
  return path;
}

function check(
  git: string,
  environment: Record<string, string>,
): ReturnType<typeof spawnSync> {
  return spawnSync("sh", [
    "-c",
    '. "$1"; verify_update_checkout "$2" "$3" "$4"',
    "sh",
    GUARD,
    "/checkout",
    git,
    APPROVED,
  ], {
    encoding: "utf8",
    env: { ...process.env, FAKE_ORIGIN: APPROVED, ...environment },
  });
}

describe("bootstrap update guard", () => {
  it("refuses non-main, dirty, wrong-origin, and divergent states", () => {
    const directory = mkdtempSync(join(tmpdir(), "loo-ume-update-guard-"));
    try {
      const git = fakeGit(directory);
      expect(check(git, {}).status).toBe(0);
      expect(check(git, { FAKE_BRANCH: "feature" }).stderr).toContain(
        "requires the main branch",
      );
      expect(check(git, { FAKE_STATUS: "?? local.txt" }).stderr).toContain(
        "requires a clean checkout",
      );
      expect(check(git, { FAKE_ORIGIN: "https://example.invalid/repo.git" }).stderr)
        .toContain("not the approved LOO/UME repository");

      const divergent = spawnSync("sh", [
        "-c",
        '. "$1"; verify_update_fast_forward "$2" "$3"',
        "sh",
        GUARD,
        "/checkout",
        git,
      ], {
        encoding: "utf8",
        env: { ...process.env, FAKE_FF_STATUS: "1" },
      });
      expect(divergent.status).toBe(1);
      expect(divergent.stderr).toContain("has diverged");
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
