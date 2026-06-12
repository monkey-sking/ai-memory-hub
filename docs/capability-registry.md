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
```

The dashboard server exposes the same model at:

```text
GET /api/capabilities
GET /api/capabilities?refresh=1
```

`ai-memory-hub status` includes `capabilitySummary`, and `/api/tools` attaches
each tool's `capability`, `permissions`, and `health` objects so UI code can
show the same decision data without recomputing it.

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
