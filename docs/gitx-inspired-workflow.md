# GitX-Inspired Workflow in AMH

AMH adopts the transferable workflow ideas from [GitX](https://gitxtui.github.io/docs/): make repository state and history visible, guide users through Git concepts, and use a pull-request contribution loop. AMH does not depend on the GitX TUI and does not replace GitHub.

## What AMH absorbs

- **Visible context first**: before editing, record repository root, current branch, base commit, upstream, working-tree status, recent history, and changed-file ownership.
- **Guided transitions**: `inspect → isolate → implement → verify → review → PR handoff → human push/merge` is represented by recipe steps and workflow/task notes.
- **Git/GitHub boundary**: local branch, commit, diff, and tests are evidence; push, PR creation, merge, reset, and deletion are separate externally visible actions requiring their own approval.
- **Learnable history**: review packets include commit list and diff summary, so another agent can understand the change without replaying a terminal session.
- **PR as the collaboration unit**: a passing review produces a handoff packet, not an implicit merge.

## State contract

```text
visible-start → isolate-work → small-commits → verify-and-summarize
      → pull-request-review → repair-or-handoff
```

Failure at verification or review enters a bounded repair loop. Ambiguous ownership, conflicts, or approval-sensitive actions enter `blocked`/`awaiting human approval`; they do not silently fall through to push or merge.

## AMH mapping

| GitX idea | AMH surface |
| --- | --- |
| One guided Git view | `worktree inspect`, workflow context, dashboard worktree projection |
| History visualization | commit list/diff metadata in worktree snapshots and review notes |
| Branch learning | isolated dispatch worktrees and explicit branch/base fields |
| GitHub contribution workflow | reviewer gate plus PR handoff metadata |
| Safe interactive learning | recipe stop conditions and structured step outputs |

Use the built-in `gitx-guided-pr` recipe for this flow. It is intentionally provider-neutral and keeps AMH's existing safety policy: no automatic push, merge, reset, deletion, or dependency installation.
