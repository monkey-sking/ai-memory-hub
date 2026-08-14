# AMH Git Agent Workflow

This workflow absorbs the useful parts of GitX without giving an agent
unreviewed authority to create branches, push, open pull requests, or create
GitHub issues.

## Before changing history

1. Read the project instructions and AMH shared context.
2. Run `git status --short`, confirm the current branch, and inspect the
   recent history.
3. Separate unrelated working-tree changes from the files owned by the task.
   Never stage another agent's untracked or modified files without explicit
   ownership.
4. Preview logical commit groups before staging. A commit should represent one
   coherent behavior or documentation change.
5. Scan the staged diff for credentials, tokens, private keys, personal data,
   generated secrets, and accidental local paths.

## Before committing

- Run the smallest relevant tests first, then the broader regression suite when
  the change crosses component boundaries.
- Run syntax/type checks for touched code and `git diff --check`.
- Confirm the commit message describes the actual behavior and, when useful,
  includes the AMH task or workflow reference.
- Review the staged file list and diff. Do not use a blanket `git add .` in a
  shared worktree.

## Push and branch policy

- Keep the repository on the approved `main` baseline unless the user or task
  explicitly authorizes a temporary branch/worktree.
- Push only after verification and explicit user/project authorization. Record
  the commit and push result in the AMH task or workflow, then run `sync`.
- Pull or merge only after checking remote changes and conflicts. Preserve
  other agents' commits; never reset or overwrite them implicitly.
- Do not let a generic Git skill automatically create branches, push, open PRs,
  or create GitHub issues. Those are separate externally-visible actions.

## Reusable commands

```text
git status --short
git branch --show-current
git log --oneline -8
git diff --stat
git diff --check
```

For multi-agent work, pair this Git workflow with AMH `task`/`workflow` state:
claim before editing, note progress and risks, verify before completion, and
write the final commit/push result back to AMH.
