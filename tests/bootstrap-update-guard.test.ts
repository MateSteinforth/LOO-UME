import { spawnSync } from "node:child_process";
import {
  chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
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
  it("refuses non-main, wrong-origin, and divergent states without rejecting local files", () => {
    const directory = mkdtempSync(join(tmpdir(), "loo-ume-update-guard-"));
    try {
      const git = fakeGit(directory);
      expect(check(git, {}).status).toBe(0);
      expect(check(git, { FAKE_BRANCH: "feature" }).stderr).toContain(
        "requires the main branch",
      );
      expect(check(git, { FAKE_STATUS: "?? local-project.loo.zip" }).status).toBe(0);
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

  it("fast-forwards while preserving tracked, untracked, and ignored project files", () => {
    const directory = mkdtempSync(join(tmpdir(), "loo-ume-update-preserve-"));
    const remote = join(directory, "remote.git");
    const seed = join(directory, "seed");
    const checkout = join(directory, "checkout");
    const cleanCheckout = join(directory, "clean-checkout");
    const git = "/usr/bin/git";
    const runGit = (cwd: string, args: string[]) => {
      const result = spawnSync(git, args, { cwd, encoding: "utf8" });
      if (result.status !== 0) {
        throw new Error(`${git} ${args.join(" ")} failed: ${result.stderr}`);
      }
      return result;
    };
    try {
      runGit(directory, ["init", "--bare", remote]);
      mkdirSync(seed);
      runGit(seed, ["init", "-b", "main"]);
      runGit(seed, ["config", "user.name", "Bootstrap Test"]);
      runGit(seed, ["config", "user.email", "bootstrap@example.invalid"]);
      writeFileSync(join(seed, ".gitignore"), "/projects/local/\n");
      writeFileSync(join(seed, "application.txt"), "version 1\n");
      runGit(seed, ["add", ".gitignore", "application.txt"]);
      runGit(seed, ["commit", "-m", "version 1"]);
      runGit(seed, ["remote", "add", "origin", remote]);
      runGit(seed, ["push", "-u", "origin", "main"]);
      runGit(directory, ["clone", "--branch", "main", remote, checkout]);
      runGit(directory, ["clone", "--branch", "main", remote, cleanCheckout]);

      writeFileSync(join(seed, "feature.txt"), "updated functionality\n");
      runGit(seed, ["add", "feature.txt"]);
      runGit(seed, ["commit", "-m", "version 2"]);
      runGit(seed, ["push", "origin", "main"]);

      runGit(cleanCheckout, ["fetch", "origin", "main"]);
      const cleanUpdate = spawnSync("sh", [
        "-c",
        '. "$1"; verify_update_fast_forward "$2" "$3"; apply_update_with_preserved_changes "$2" "$3"',
        "sh",
        GUARD,
        cleanCheckout,
        git,
      ], { encoding: "utf8" });
      expect(cleanUpdate.status).toBe(0);
      expect(cleanUpdate.stdout).not.toContain("preserving local changes");
      expect(readFileSync(join(cleanCheckout, "feature.txt"), "utf8"))
        .toBe("updated functionality\n");

      writeFileSync(join(checkout, "operator-note.txt"), "pre-existing stash\n");
      runGit(checkout, ["stash", "push", "--include-untracked", "-m", "operator backup"]);
      writeFileSync(join(checkout, "application.txt"), "local tracked edit\n");
      writeFileSync(join(checkout, "saved-project.loo.zip"), "portable project\n");
      mkdirSync(join(checkout, "projects", "local"), { recursive: true });
      writeFileSync(join(checkout, "projects", "local", "library.loo.zip"), "library project\n");
      writeFileSync(
        join(checkout, "projects", "local", ".library-state.json"),
        '{"schemaVersion":"1.0.0","hiddenDemoFilenames":[]}\n',
      );
      runGit(checkout, ["fetch", "origin", "main"]);
      const update = spawnSync("sh", [
        "-c",
        '. "$1"; verify_update_fast_forward "$2" "$3"; apply_update_with_preserved_changes "$2" "$3"',
        "sh",
        GUARD,
        checkout,
        git,
      ], { encoding: "utf8" });
      expect(update.status).toBe(0);
      expect(update.stdout).toContain("preserving local changes");
      expect(update.stdout).toContain("restored local changes");
      expect(readFileSync(join(checkout, "application.txt"), "utf8"))
        .toBe("local tracked edit\n");
      expect(readFileSync(join(checkout, "feature.txt"), "utf8"))
        .toBe("updated functionality\n");
      expect(readFileSync(join(checkout, "saved-project.loo.zip"), "utf8"))
        .toBe("portable project\n");
      expect(readFileSync(join(checkout, "projects", "local", "library.loo.zip"), "utf8"))
        .toBe("library project\n");
      expect(readFileSync(join(checkout, "projects", "local", ".library-state.json"), "utf8"))
        .toContain('"hiddenDemoFilenames":[]');
      expect(runGit(checkout, ["stash", "list"]).stdout)
        .toContain("operator backup");
      expect(runGit(checkout, ["stash", "list"]).stdout)
        .not.toContain("LOO/UME automatic update backup");

      const gitLockPath = runGit(checkout, [
        "rev-parse", "--git-path", "loo-ume-update.lock",
      ]).stdout.trim();
      const lockPath = gitLockPath.startsWith("/")
        ? gitLockPath
        : resolve(checkout, gitLockPath);
      mkdirSync(lockPath);
      const concurrent = spawnSync("sh", [
        "-c",
        '. "$1"; acquire_update_lock "$2" "$3"',
        "sh",
        GUARD,
        checkout,
        git,
      ], { encoding: "utf8" });
      expect(concurrent.status).toBe(1);
      expect(concurrent.stderr).toContain("another LOO/UME update is already running");
      rmSync(lockPath, { recursive: true, force: true });

      mkdirSync(join(seed, "projects", "local"), { recursive: true });
      writeFileSync(
        join(seed, "projects", "local", "library.loo.zip"),
        "upstream collision\n",
      );
      runGit(seed, ["add", "-f", "projects/local/library.loo.zip"]);
      runGit(seed, ["commit", "-m", "collision"]);
      runGit(seed, ["push", "origin", "main"]);
      runGit(checkout, ["fetch", "origin", "main"]);
      const collision = spawnSync("sh", [
        "-c",
        '. "$1"; verify_ignored_project_collisions "$2" "$3"',
        "sh",
        GUARD,
        checkout,
        git,
      ], { encoding: "utf8" });
      expect(collision.status).toBe(1);
      expect(collision.stderr).toContain("contains the local project path");
      expect(readFileSync(join(checkout, "projects", "local", "library.loo.zip"), "utf8"))
        .toBe("library project\n");

      runGit(seed, ["rm", "projects/local/library.loo.zip"]);
      mkdirSync(join(seed, "projects", "local"), { recursive: true });
      writeFileSync(
        join(seed, "projects", "local", ".library-state.json"),
        "upstream collision\n",
      );
      runGit(seed, ["add", "-f", "projects/local/.library-state.json"]);
      runGit(seed, ["commit", "-m", "state collision"]);
      runGit(seed, ["push", "origin", "main"]);
      runGit(checkout, ["fetch", "origin", "main"]);
      const stateCollision = spawnSync("sh", [
        "-c",
        '. "$1"; verify_ignored_project_collisions "$2" "$3"',
        "sh",
        GUARD,
        checkout,
        git,
      ], { encoding: "utf8" });
      expect(stateCollision.status).toBe(1);
      expect(stateCollision.stderr).toContain(".library-state.json");
      expect(readFileSync(join(checkout, "projects", "local", ".library-state.json"), "utf8"))
        .toContain('"hiddenDemoFilenames":[]');

      runGit(seed, ["rm", "projects/local/.library-state.json"]);
      writeFileSync(join(seed, "application.txt"), "upstream version 3\n");
      runGit(seed, ["add", "application.txt"]);
      runGit(seed, ["commit", "-m", "version 3"]);
      runGit(seed, ["push", "origin", "main"]);
      runGit(checkout, ["fetch", "origin", "main"]);
      const conflict = spawnSync("sh", [
        "-c",
        '. "$1"; verify_update_fast_forward "$2" "$3"; apply_update_with_preserved_changes "$2" "$3"',
        "sh",
        GUARD,
        checkout,
        git,
      ], { encoding: "utf8" });
      expect(conflict.status).toBe(1);
      expect(conflict.stderr).toContain("local changes conflict");
      expect(conflict.stderr).toContain("Recovery stash:");
      expect(readFileSync(join(checkout, "application.txt"), "utf8"))
        .toContain("<<<<<<< Updated upstream");
      expect(runGit(checkout, ["stash", "list"]).stdout)
        .toContain("LOO/UME automatic update backup");
      expect(runGit(checkout, ["stash", "list"]).stdout)
        .toContain("operator backup");
      expect(readFileSync(join(checkout, "saved-project.loo.zip"), "utf8"))
        .toBe("portable project\n");
      expect(readFileSync(join(checkout, "projects", "local", "library.loo.zip"), "utf8"))
        .toBe("library project\n");
      expect(readFileSync(join(checkout, "projects", "local", ".library-state.json"), "utf8"))
        .toContain('"hiddenDemoFilenames":[]');
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
