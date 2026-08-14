# Failure-learning log

This file records reusable lessons from work that went wrong or nearly went
wrong. Its purpose is to change future agent behavior, not to preserve every
error message. Read it during task startup and update it in the same change that
reveals a durable lesson.

## How to use this log

- Add an entry when the cause and prevention are understood well enough to help
  the next agent. If the investigation is incomplete, mark that explicitly.
- Describe the system or workflow failure without assigning blame. Never record
  credentials, tokens, private data, or unnecessary raw logs.
- Prefer a small reproducible symptom and a concrete prevention step. Link to a
  test, issue, commit, decision, or canonical document when one exists.
- Update an existing entry when the same failure recurs. Promote repeated
  lessons into `AGENTS.md`, an architecture/decision page, or an automated test;
  keep this entry as the history and rationale.
- A log entry does not make a task complete. Apply the correction, verify the
  result, and report any remaining risk.

## Entry template

Copy this section for new entries and replace `NNN` with the next identifier.

```markdown
### F-NNN — Short, specific title

- **Date:** YYYY-MM-DD
- **Context:** What task or subsystem was involved?
- **Symptom:** What observable result showed that something was wrong?
- **Cause:** Which mistaken assumption, decision, or condition produced it?
- **Correction:** What restored the work?
- **Prevention:** What should a future agent do or verify before repeating it?
- **Evidence:** Relevant test, file, issue, commit, or command result.
- **Status:** Resolved, mitigated, monitoring, or investigating.
```

## Lessons

### F-001 — Sandbox helper can fail before repository commands run

- **Date:** 2026-08-14
- **Context:** Repository inspection and file editing in the managed Codex
  environment.
- **Symptom:** A normal command or `apply_patch` exits before doing any work with
  `bwrap: No permissions to create a new namespace` or
  `fs sandbox helper failed`.
- **Cause:** This environment may disallow the unprivileged namespace used by
  the sandbox helper even though an approved command can still run.
- **Correction:** Re-run the exact necessary command through the environment's
  approval path. For file edits, try `apply_patch` first and then use the exact
  `git apply --unidiff-zero` fallback documented in `AGENTS.md` if that helper
  fails.
- **Prevention:** Recognize this specific pre-execution failure, preserve the
  requested command's scope, and follow the established fallback instead of
  changing tools repeatedly or assuming the repository itself is broken.
- **Evidence:** `AGENTS.md`, under **Working safely**.
- **Status:** Mitigated.

### F-002 — A narrow documentation inventory can miss the existing control plane

- **Date:** 2026-08-14
- **Context:** Adding orchestrator guidance to a repository that already had a
  persistent task board.
- **Symptom:** The first workflow draft told agents to read architecture and
  failure guidance but omitted `TASKS.md`, even though that file was already the
  source of truth for work status.
- **Cause:** Initial discovery searched a selected list of documentation names
  instead of inventorying all top-level coordination files and recent workflow
  commits.
- **Correction:** Connect `AGENTS.md`, `TASKS.md`, `FAILURES.md`, and the
  bootstrap manual explicitly, with one responsibility for each file.
- **Prevention:** Before creating agent-control documents, inspect all top-level
  files, search existing documentation for workflow terms, and review recent
  relevant history. Reconcile existing authorities instead of creating a
  parallel process.
- **Evidence:** `TASKS.md` and commit `ae9022d`.
- **Status:** Resolved.
