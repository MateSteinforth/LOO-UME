# Bootstrapping an agentic repository

Use this manual when a repository is newly cloned, reopened after a long pause,
or handed to an agent that must act as the orchestrator. The goal is a small,
evidence-backed control plane that survives chat sessions and lets future agents
resume work without reconstructing intent from conversation history.

Do not copy this repository's LED, geometry, or fabrication rules into unrelated
projects. Copy the operating model, then derive every project-specific rule from
the target repository and its maintainers.

## What the workflow establishes

| File | Single responsibility |
| --- | --- |
| `AGENTS.md` | Mandatory repository-specific operating rules, sources of truth, guardrails, and verification commands |
| `docs/ARCHITECTURE.md` | Current system shape, data flow, subsystem boundaries, and known seams |
| `TASKS.md` | Persistent prioritized work status, dependencies, acceptance criteria, and review state |
| `FAILURES.md` | Reusable lessons from mistakes, failed assumptions, corrections, and prevention |
| `docs/DECISIONS.md` | Implemented choices and consequences when the repository needs a durable decision record |

Adapt names when the repository already has equivalent files. Link existing
authorities instead of duplicating them. Current behavior, planned behavior,
task status, and failure history are different kinds of truth and should not be
collapsed into one giant document.

## What to tell the first agent

Paste the following prompt into the first agent session. Replace the bracketed
text, and remove the final paragraph if you want a documentation-only bootstrap.

```text
Act as the primary orchestrator for this repository. Own the outcome end to end:
scope, architecture, task decomposition, integration, verification, durable
documentation, and the final report. You are explicitly authorized to use
subagents, when available, for bounded independent audits, implementation
slices, and separate review. Subagents report to you; do not use me as a message
relay. Avoid concurrent edits to the same file, and personally inspect every
delegated result before accepting it.

First orient yourself. Read any existing AGENTS.md and README, then inventory
all top-level files, documentation, manifests, CI, tests, current git status,
recent relevant history, and existing planning or decision records. Preserve
all pre-existing changes as user-owned. Search broadly for existing task boards,
handoffs, architecture notes, TODOs, and failure logs before creating anything.
Do not assume documentation is current: verify important claims against code,
tests, and build configuration.

Establish or reconcile a persistent agent control plane:

1. AGENTS.md: project purpose, sources of truth, architectural and safety
   guardrails, editing rules, verification commands, and the orchestrator loop.
2. docs/ARCHITECTURE.md (or the existing equivalent): implemented system shape,
   data flow, subsystem ownership, boundaries, and known seams.
3. TASKS.md (or the existing equivalent): stable task IDs; ordered Ready work;
   at most one implementation slice In Progress; outcome, acceptance,
   dependencies, verification, and human-review requirements for each task.
4. FAILURES.md: a concise template and reusable lessons containing context,
   symptom, cause, correction, prevention, evidence, and status.
5. docs/DECISIONS.md only if durable implemented decisions are otherwise hard
   to recover. Keep proposals in the task board or roadmap, not in decisions.

Reconcile rather than overwrite existing guidance. Do not invent architecture,
completed work, priorities, or verification results. Clearly distinguish what
is implemented, proposed, provisional, blocked, and human-validated. Turn the
request into explicit acceptance criteria and choose the narrowest meaningful
checks. For work with multiple substantive steps, maintain a visible plan.

After the control plane is coherent, show me a concise summary of the system,
the highest-priority Ready work, important risks, and any decisions only I can
make. Wait for my approval before the first substantial implementation. Keep
TASKS.md current at meaningful state changes, use an independent review when
the scope or risk justifies it, record reusable failures during the same task,
update knowledge pages with behavior changes, and close each slice with an
inspected diff and evidence from the relevant checks.

Treat delivery cleanup as part of every successfully completed task; do not
wait for me to request it again. Commit the scoped changes, push the task branch
when permitted, and move the task to **Ready to Merge**. Merge or fast-forward
into the base branch and push it only with explicit repository or operator
authorization. After an authorized integration push succeeds, verify that the
task worktree is clean and the task branch is merged, then remove the temporary
worktree and delete the merged local task branch. Delete a remote task branch
only when this task created it and repository policy does not require it to
remain. If the work ran in a separate agent, task, or thread, preserve its
handoff and archive or close it after its result is integrated. Never delete
dirty, unmerged, unrelated, or uniquely useful work. Respect approval gates and
report an exact blocker instead of bypassing one.
```

This prompt explicitly authorizes delegation. If the environment or higher-level
instructions do not permit subagents, the orchestrator should use the same loop
serially and record that constraint without pretending an independent review
occurred.

## First-session procedure

### 1. Inventory before writing

Start read-only. Inspect the worktree and locate all potential authorities, not
just familiar filenames. Useful evidence includes:

- top-level files and repository-local agent instructions;
- package/build manifests, entry points, schemas, migrations, and generated
  artifacts;
- CI workflows and the commands they actually run;
- tests and fixtures that encode behavior more reliably than prose;
- recent Git history for architectural changes and naming conventions;
- TODO/FIXME markers, roadmaps, issue references, handoffs, and task boards;
- dirty or untracked files that must not be overwritten.

Parallel read-only audits are good delegation seams: architecture, tests/build,
documentation drift, security/reliability, and backlog reconstruction. Give
each auditor a bounded question and require evidence with file paths.

### 2. Build one control plane

Prefer improving existing files over adding synonyms. The orchestrator should
be able to answer five questions without chat history:

1. What files and data are authoritative?
2. What must never be changed casually?
3. What is the next unblocked outcome and how is it accepted?
4. Which checks demonstrate that a change works?
5. What has failed before, and how do we avoid repeating it?

Keep instructions compact enough that every agent will actually read them.
Move detailed domain knowledge into focused documents and link them from
`AGENTS.md`.

### 3. Reconstruct work from evidence

A useful task is an outcome, not a vague topic. Give it a stable ID and record:

- the user-visible or system outcome;
- current gap and relevant source-of-truth files;
- acceptance criteria that can be checked;
- dependencies and priority;
- verification commands or review procedure;
- whether completion requires human, visual, security, or physical review.

Use a small state model such as **Backlog**, **Ready**, **In Progress**,
**Blocked**, **Human Review**, **Ready to Merge**, and **Done**, in that order.
Limit implementation work in progress; parallelize bounded audits and
independent checks rather than several overlapping feature branches in one
shared worktree.

### 4. Choose the cheapest viable execution mode

- **FAST** is the default for clear, low-risk work. Execute directly, omit a
  critic and independent review by default, run focused checks, and update
  durable documents only when behavior changes.
- **STANDARD** is for substantial normal features. Use a brief plan, Terra for
  implementation by default, Luna for bounded inspection or testing, and an
  independent review or test pass when useful.
- **QUALITY** is for architecture, high-risk changes, complex geometry,
  ambiguous defects, major refactors, or repeated failures. Use Sol for
  orchestration and add bounded critics, independent work, or broader checks
  only when they reduce a demonstrated risk.

Use Luna, then Terra, then Sol as complexity increases. Escalate the mode or
model only because of evidence. Stop when the acceptance criteria and relevant
checks pass; record later improvements as separate tasks.

### 5. Operate each slice

For every selected task, the orchestrator should:

1. confirm acceptance criteria and affected authorities;
2. assign non-overlapping owners for bounded work when delegation is allowed;
3. keep the critical integration path moving;
4. inspect every returned diff and assumption;
5. run focused checks, then broader checks in proportion to risk;
6. obtain a separate review when the selected mode, scope, or risk justifies it;
7. update task state, architecture/decision guidance, and failure lessons;
8. commit the scoped changes, push the task branch when permitted, and move the
   task to **Ready to Merge**;
9. integrate and push the intended base branch only after explicit authority;
   after confirming a clean worktree, merged ancestry, and a successful push,
   remove the temporary worktree, delete the merged task branch, and archive or
   close any separate agent, task, or thread whose handoff is preserved; and
10. report changed files, verification evidence, the integrated commit, cleanup
    performed, and remaining uncertainty.

The orchestrator owns shared files and the final integrated result. A subagent's
claim that tests pass is not a substitute for reviewing its work and verifying
the integrated tree.

### 6. Record failures as prevention

Log a failure only when it yields a reusable lesson. Capture the smallest useful
symptom, underlying cause, correction, and a concrete prevention step. Do not
store blame, secrets, or large raw logs. If an incident recurs, update the
existing entry and promote its prevention into `AGENTS.md`, a decision, or an
automated check.

### 7. Make reopening boring

At the end of a work slice, leave the repository so a new orchestrator can
resume by reading `AGENTS.md`, architecture, the task board, and the failure log;
checking the worktree; and taking the first unblocked Ready item. Chat history
may add context, but it must not be the only place where project state lives.

A successful slice leaves its verified changes committed and its task in
**Ready to Merge**. After an authorized integration and push, remove temporary
worktrees and merged task branches, and archive or close separate task agents or
threads after their useful handoff is recorded. Keep anything dirty, unmerged,
blocked by policy, or needed for recovery, and report it explicitly.

## Compact prompt for an already-bootstrapped repository

Once the files above exist, a later session only needs this:

```text
Act as this repository's primary orchestrator. Read AGENTS.md and every startup
document it names, inspect git status, and reconcile the current request with
the persistent task board. Preserve user changes. Own planning, delegation,
integration, verification, task-state updates, and failure learning end to end.
You may use subagents for bounded non-overlapping work and independent review,
but personally inspect their output. Take the first unblocked Ready task unless
I set another priority, and continue until it meets its recorded acceptance
criteria or requires a material decision or authority from me. Do not claim
completion without an inspected diff and relevant verification evidence. Choose
the cheapest viable execution mode and stop when acceptance passes. When the
task succeeds, commit it, push the task branch when permitted, and move it to
Ready to Merge. Integrate and push the base branch only with explicit authority;
then safely remove its clean temporary worktree and merged task branch, and
archive or close any separate agent, task, or thread after preserving its
handoff. Do not wait for a separate cleanup request.
```
