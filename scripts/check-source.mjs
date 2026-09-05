import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
function fail(message) {
  console.error(message);
  process.exit(1);
}
const [mode, ...options] = process.argv.slice(2);
if (!["format", "format:check", "lint", "lint:typed"].includes(mode)) {
  fail("Select format, format:check, lint, or lint:typed.");
}
if (options.some((option) => option !== "--all")) {
  fail("Only --all is supported. Use CHECK_BASE to select a Git base.");
}
function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split("\0")
      .filter(Boolean);
  } catch (error) {
    fail(
      `Git source selection failed: ${error.stderr?.toString().trim() || error.message}`,
    );
  }
}
const all = options.includes("--all");
const candidates = all
  ? [
      ...git(["ls-files", "-z"]),
      ...git(["ls-files", "--others", "--exclude-standard", "-z"]),
    ]
  : [
      ...git([
        "diff",
        "--name-only",
        "--diff-filter=ACMR",
        "-z",
        `${process.env.CHECK_BASE || "main"}...HEAD`,
      ]),
      ...git(["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD"]),
      ...git(["ls-files", "--others", "--exclude-standard", "-z"]),
    ];
const lint = mode.startsWith("lint");
const files = [...new Set(candidates)]
  .filter((path) => {
    if (!existsSync(resolve(root, path))) return false;
    if (
      !/^(?:src\/|web\/src\/|scripts\/|tests\/|electron\/|docs\/|\.github\/|[^/]+$)/.test(
        path,
      )
    )
      return false;
    return lint
      ? /\.(?:ts|mjs)$/.test(path)
      : /\.(?:[cm]?js|ts|json|md|css|html|ya?ml)$/.test(path);
  })
  .sort();
if (files.length === 0) {
  console.log(`${mode}: no ${all ? "tracked" : "changed"} source files.`);
} else {
  console.log(
    `${mode}: ${files.length} ${all ? "tracked" : "changed"} source files.`,
  );
  const tool = lint ? "eslint/bin/eslint.js" : "prettier/bin/prettier.cjs";
  const args = lint
    ? [
        "--config",
        mode === "lint:typed" ? "eslint.typed.config.mjs" : "eslint.config.mjs",
        ...(mode === "lint"
          ? [
              "--cache",
              "--cache-strategy",
              "content",
              "--cache-location",
              ".cache/eslint-fast",
            ]
          : []),
        "--max-warnings",
        "0",
      ]
    : [mode === "format" ? "--write" : "--check", "--ignore-unknown"];
  const result = spawnSync(
    process.execPath,
    [resolve(root, "node_modules", tool), ...args, "--", ...files],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  if (result.error) fail(result.error.message);
  process.exitCode = result.status ?? 1;
}
