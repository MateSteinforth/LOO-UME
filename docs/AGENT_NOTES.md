# Agent notes: hosts, models, and tool pitfalls

`AGENTS.md` contains the rules for all agents. This page contains the details
that apply only to one host or one type of work. Read only the section that
applies to the current task.

## Model tiers

`AGENTS.md` names three tiers. Use the cheapest tier that can do the work.

| Tier         | Use                                                                                      | Codex         | Claude Code   |
| ------------ | ---------------------------------------------------------------------------------------- | ------------- | ------------- |
| **Light**    | Bounded inspection, test runs, log review, mechanical edits, first-pass review           | GPT-5.6 Luna  | Haiku         |
| **Standard** | Normal implementation, medium-complexity debugging                                       | GPT-5.6 Terra | Sonnet        |
| **Deep**     | Orchestration, architecture, hard debugging, high-risk refactors, geometry, final review | GPT-5.6 Sol   | Opus or Fable |

Update this table when a host or a model changes. Do not put model names in
`AGENTS.md` or `TASKS.md`.

## Host: Codex

- Use the `apply_patch` helper first. It can fail with
  `fs sandbox helper failed` / `bwrap: No permissions to create a new
namespace` while approved shell commands still work. Then apply an exact
  unified diff with `git apply --unidiff-zero`. Do not search for another
  method unless this also fails.
- For a new untracked file, stage only that empty path to give Git a patch
  base. Generate the diff from that path to the intended content, not from
  `/dev/null`. Apply it, run `git restore --staged <path>`, and verify that no
  other path is staged.
- Before a line-number-only `git apply --unidiff-zero` in a shared worktree,
  read the exact target again. Prefer context hunks.
- The standalone `patch` utility, Python `yaml`/PyYAML, and Ruby are not
  installed. Validate a GitHub Actions workflow with
  `npx --yes yaml-lint .github/workflows/render.yml`.

## Host: Claude Code

- Claude Code reads `AGENTS.md` as the project instructions. Do not add a
  second rule file with the same content.
- Shell state does not persist between commands. Use absolute paths and
  `git -C <dir>` / `npm --prefix <dir>`; do not use `cd` in compound commands.
- Use the file edit tools for edits. The Codex patch fallback does not apply.

## Host: all

- Do not put a task worktree or the only copy of an artifact under `/tmp`
  (F-199). Use a directory adjacent to the repository.
- Do not assume that a repository-local GitHub CLI exists under `.tools`. When
  `gh` is absent, use the public GitHub Actions REST API with `curl` and parse
  the saved JSON with Node.js.
- When an `rg` pattern contains Markdown backticks, put the complete shell
  argument in single quotes. Backticks in double quotes run as command
  substitutions.

## Node and TypeScript

- `npx tsx -e` compiles its input as CommonJS and cannot import a TypeScript
  script that has top-level `await`. Use
  `node --import tsx --input-type=module -e '...'`.
- `tsconfig.node.json` has an explicit web-module list. When a Node-side test
  or script imports a new file under `web/src/`, add the file to that list
  before the production TypeScript build.
- When the pinned Node archive changes, keep `bin/node` and the real npm/npx
  CLI target files in the executable list of
  `toolchains/bootstrap/install-manifest.json`. Safe extraction normalizes file
  modes; a list with only the npm symlinks breaks nested npm commands.
- Windows PowerShell verification must call `npm.cmd`, not the `npm.ps1` shim.
  Clean checks clear `PATH`; call system tools by validated absolute path, for
  example `%SystemRoot%\System32\taskkill.exe`, with argument arrays and no
  shell.

## Browser tests and preview servers

- Assert handled import failures in `#pipeline-status`. The animation loop can
  clear `#viewer-error`, and generator discovery can replace a pipeline
  message. For successful imports, wait on the surface, mapping, asset, and
  control states.
- WLED engine readiness is not editor readiness. Before portable file
  operations, wait for the initial surface state. It is set after generator
  discovery and project restoration.
- To make generated mechanics stale in a test, use a valid pose change or an
  additive placement. Do not delete a panel that stored `boundaryTopology`
  references.
- Tests must not use ignored generated preview output as fixture input. Use
  tracked fixtures, or build derived fixtures from tracked sources below the
  test output directory.
- Do not run `stage:sculptures` while a Vite preview is active. Stop the
  preview before browser tests, because their web server stages the same
  files. Stage one time after all checks, start the preview again, and verify
  that each registry source returns JSON. A live Vite process can cache HTML
  fallbacks for valid JSON paths.
- On a host with more than one worktree, do not let Playwright use an unknown
  server on port 4174. Confirm the owner, or run the check with `CI=1`.

## Git

- `git worktree move` refuses a worktree with an initialized submodule. Do not
  force-remove it and do not edit submodule Git paths. Keep the dirty worktree
  until its owner commits or discards the changes.
- If a push is blocked because the destination is not verified, report the
  exact commit, ref, and remote URL. Get operator approval, then repeat the
  same push. Do not use an indirect push method.

## Review links

- Phone review: `npm run preview:phone` from the repository root. It makes a
  temporary Cloudflare quick-tunnel URL and verifies the public HTML,
  sculpture JSON, JavaScript, and WLED WASM endpoints. Call it a review link,
  not a deployment. Do not give a `localhost` URL instead.
- LAN review: `npm run lan`. It binds Vite to all interfaces, selects the
  first free port at or above 4175, and prints the URL. Do not build the host
  and port command by hand.
