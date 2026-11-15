# Failure-learning log

This file records reusable lessons from work that went wrong or nearly went
wrong. Its purpose is to change future agent behavior.

Entries F-001 to F-194 are in
[`docs/archive/FAILURES-through-2026-09.md`](docs/archive/FAILURES-through-2026-09.md).
Do not read the archive from start to end. Search it for the subsystem, tool,
or symptom of the current task:

```bash
rg -n '^### F-' docs/archive/FAILURES-through-2026-09.md      # all titles
rg -n -i -A8 '<keyword>' docs/archive/FAILURES-through-2026-09.md
```

## Rules

- Add an entry only when the cause and the prevention can help the next agent.
  Mark an incomplete investigation as incomplete.
- Describe the system or workflow failure. Do not assign blame. Do not record
  credentials, private data, or large raw logs.
- Update an existing entry when the same failure occurs again. Archived
  entries can be updated in the archive.
- Promote a recurring prevention rule into `AGENTS.md`,
  `docs/AGENT_NOTES.md`, or an automated check.
- A log entry does not complete a task. Apply the correction and verify it.
- When this file is longer than approximately 150 lines, move the oldest
  entries to a new dated file in `docs/archive/`.

## Entry template

Next identifier: **F-199** (F-197 and F-198 are on the unmerged branch
`claude/ddp-present-overlap`; F-196 is not used). Add new entries at the top of **Lessons**.

```markdown
### F-NNN — Short, specific title

- **Date:** YYYY-MM-DD
- **Symptom:** What observable result showed the problem?
- **Cause:** Which assumption, decision, or condition caused it?
- **Correction:** What restored the work?
- **Prevention:** What must a future agent do or verify?
- **Evidence:** Test, file, commit, or command result.
- **Status:** Resolved, mitigated, monitoring, or investigating.
```

## Lessons

### F-195 — Worktrees and preserved artifacts under `/tmp` did not survive a restart

- **Date:** 2026-11-15
- **Symptom:** 32 registered task worktrees under `/tmp/loo-ume-*` were
  missing. The task board named
  `/tmp/loo-ume-ddp-audio-unified/build/firmware-unified/wled-audio-ddp-2609099.bin`
  as the preserved accepted firmware. A search below `/home/mate` did not find
  this file.
- **Cause:** The host clears `/tmp`. The host started again on 2026-11-13.
  Build output and private device records are not in Git, thus only the
  commits on the task branches remained.
- **Correction:** `git worktree prune` removed the stale records. The branches
  and their commits are intact. The firmware image was not recovered. Its
  source, receipt, and SHA-256 are in `firmware/ddp-expiry/`.
- **Prevention:** Do not put a task worktree, a toolchain, or the only copy of
  an artifact under `/tmp`. Use a directory adjacent to the repository. Copy
  each artifact that a task record tells agents to preserve into `build/` of
  the primary checkout, and verify its SHA-256 there.
- **Evidence:** `git worktree prune -v` on 2026-11-15; `uptime -s`; `find`
  for the image name.
- **Status:** Mitigated. A rebuild of image 2609099 is not verified.
