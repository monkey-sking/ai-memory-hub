# Capability Registry

The capability registry is the read model that lets AI Memory Hub decide how a
tool should participate in cross-agent work. It is derived from existing tool
detection, runner profiles, install status, dispatch metrics, and the shared
skill layer. It does not store credentials and does not proxy model traffic.

## Commands and APIs

```bash
ai-memory-hub capabilities
ai-memory-hub capabilities --tool claude
ai-memory-hub capabilities --refresh
ai-memory-hub declare --tool opencode --models "grok-4.5" --strengths "前端开发" --by opencode
ai-memory-hub declare list
ai-memory-hub declare remove --tool opencode
ai-memory-hub models --to opencode --refresh
```

The dashboard server exposes the same model at:

```text
GET /api/capabilities
GET /api/capabilities?refresh=1
```

`ai-memory-hub status` includes `capabilitySummary`, and `/api/tools` attaches
each tool's `capability`, `permissions`, `health`, `declared`, `models`, and
`strengths` objects so UI code can show the same decision data without
recomputing it.

## Registry Fields

Each tool entry includes:

- `capability.integrationMode`: one of `direct-cli`, `direct-cli-missing`,
  `shared-state`, `gateway-rest-candidate`, `cdp-candidate`,
  `desktop-automation-candidate`, or `diagnostic-only`.
- `capability.directCli`: the tool has a known direct runner profile.
- `capability.autoDispatch`: the direct runner is currently available and safe
  for daemon/dispatch use.
- `capability.sharedState`: shared memory/radio/task coordination is configured
  or the tool is known to be shared-state-only.
- `capability.gatewayRest`: QClaw/OpenClaw-style gateway integration is a known
  future path.
- `capability.cdpCandidate` and `capability.desktopAutomation`: desktop tools
  that may be automated through CDP or app automation after explicit setup.
- `permissions`: conservative local guardrails used by workflows and reviewers.
- `health.status`: `ready-automated`, `ready-shared-state`, `needs-adapter`,
  `preconfigured-missing-tool`, `adapter-candidate`, or `missing`.
- `declared.models`: models the agent explicitly declared via `ai-memory-hub declare`.
- `declared.strengths`: areas the agent declared it is best at.
- `models.declared`: declared models; `models.discovered`: models pulled from the
  provider catalog via `ai-memory-hub models --refresh` where the CLI supports it
  (opencode, mimo, grok); `models.all`: the merged, de-duplicated list.
- `strengths.declared`: declared strengths; `strengths.observed`: derived from
  dispatch run history; `strengths.all`: the merged list.

## Declarations and Model Discovery

Agents declare what models they can run and what they are best at so dispatch
callers can route work accurately:

```bash
ai-memory-hub declare --tool opencode --models "grok-4.5,claude-sonnet-4" --strengths "前端开发,代码审查" --note "..." --by opencode
```

Declarations are stored as JSONL in `state/tool-declarations.jsonl`, keyed by
tool; the latest declaration per tool wins.

Model providers change their catalogs over time. `ai-memory-hub models --refresh`
re-pulls the provider's latest list where the runner supports a `models`
subcommand (opencode, mimo, grok). Tools without a list command (claude, codex,
gemini) rely on agent declarations. The registry exposes both `declared` and
`discovered` so callers can distinguish explicit membership from provider catalog.

`ai-memory-hub dispatch --model <model>` warns via `modelNote` when the requested
model is not in the target tool's declared/discovered list, and `ai-memory-hub
models --to <tool> --refresh` refreshes a stale catalog.

## Safety Policy

The registry intentionally separates "can coordinate" from "can execute".
Shared-state tools can receive radio/task/workflow handoffs without being
launched by the daemon. `autoDispatch` is true only when a direct runner is
available and the runner profile supports direct dispatch.

Default guardrails are:

- no push
- no delete files
- no install dependencies

Push, deletion, dependency installation, system configuration changes, and
destructive commands require fresh explicit approval.
