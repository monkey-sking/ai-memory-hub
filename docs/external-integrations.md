# External integrations

AMH now exposes safe, explicit adapters for the remaining integration points. They produce plans or payloads locally; they do not silently send network requests or execute remote commands.

## GitHub

`amh gh request --owner <owner> --repo <repo> --pull <number>` builds a read-only API request. Set `GITHUB_TOKEN` only in the process environment when authenticated API access is needed. `amh gh webhook --data payload.json` normalizes a `pull_request` webhook; task updates require the explicit `--apply` flag.

## SSH execution

`amh ssh plan --host <host> --user <user> --worktree <path> --command "npm test"` creates an approval-gated plan. Shell metacharacters are rejected and the command is never executed by AMH.

## Domain packs and skills

Pack manifests can include `trust: { required, payload, signature, publicKey }`. Validation reports `verified`, `unsigned`, `required`, or `invalid`; a required unverified signature prevents enabling the pack. `amh skill render` produces a provenance-bearing `SKILL.md` draft for review before it is installed.

## Notifications

`amh notify payload --title "Review" --message "Approval required" --url <url>` and `POST /api/notifications/payload` return Feishu interactive-card and WeCom Markdown payloads. Sending remains an explicit adapter/configuration step, so missing credentials cannot be mistaken for a successful delivery.
