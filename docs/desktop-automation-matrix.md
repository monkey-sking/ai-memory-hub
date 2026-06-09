# Desktop Automation Matrix

This matrix consolidates the 2026-06-09 multi-agent research on local desktop and GUI-style tools connected to AI Memory Hub.

## Decision Summary

Use direct CLI runners only for tools with verified prompt-safe command entry points. For desktop GUI tools, use shared AI Memory Hub state as the default coordination layer, then add a tool-specific automation bridge only when a stable local interface is verified.

Recommended priority:

1. Keep `radio`, `task`, `workflow`, `dispatch`, and `daemon` as the shared control plane for every tool.
2. Use CDP only for Electron/Chromium apps launched with an explicit remote-debugging port.
3. Use QClaw/OpenClaw native gateway, CLI, ACP, config, and heartbeat hooks where available.
4. Treat IPC and private app databases as diagnostic-only until the app-specific protocol is documented or reverse engineered.

## Matrix

| Tool | Local state observed | Best automation entry | Feasibility | Recommendation |
| --- | --- | --- | --- | --- |
| Claude Desktop | `AppData/Roaming/Claude` | CDP when launched with remote debugging; shared memory otherwise | Medium | Prefer shared state for coordination. Use CDP for inspection or controlled UI actions only after launching with a known `--remote-debugging-port`. IPC needs app-specific reverse engineering. |
| Codex App | `.codex` app/config state | CDP or in-app automation if exposed; shared memory otherwise | Medium | Keep CLI `codex` as the direct runner. Treat the app surface as shared-state-first unless a stable debugging endpoint is explicitly enabled. |
| Antigravity | `.antigravity` | CDP for Chromium/Electron surfaces; shared memory instructions | Medium | Use CDP as the first automation experiment. Do not depend on IPC until protocol and socket locations are confirmed. |
| Antigravity Cockpit | `.antigravity_cockpit` | App state plus possible local browser/CDP surface | Low-Medium | Use shared state and manual/app automation first. Investigate process command line and open ports before building a bridge. |
| Antigravity Gemini | `.gemini/antigravity` | Shared state, generated artifacts, possible internal app state | Low-Medium | Use as a state/artifact source. Avoid writing internal state directly except for documented import/export files. |
| Marvis | `AppData/Roaming/Tencent/Marvis` | Shared-state request/response through radio/task | Medium | Current safe integration is shared memory/radio. No stable CLI/REST prompt runner is verified on this machine. |
| QClaw | `.qclaw` | QClaw/OpenClaw gateway, ACP, config, skills, heartbeat hooks | High | Integrate through gateway/API or radio/task bridge. Use `HEARTBEAT.md`/skills for periodic polling and progress signals. |
| OpenClaw | `.openclaw` | `openclaw` CLI, gateway REST API, ACP, config, heartbeat hooks | High | Best target for an automated adapter. Prefer gateway REST/API plus shared radio events over GUI driving. |
| CC-Switch | `.cc-switch` | Local config/state, shared memory instructions | Low | Treat as an environment/config helper. No prompt runner or automation API is verified; do not build dispatch around it yet. |

## Interface Guidance

CDP:

- Works only when the app exposes a Chromium debugging endpoint.
- Good for screenshots, DOM inspection, click/type automation, and reading UI state.
- Risk: launch flags, profiles, auth state, and app updates can break automation.

IPC:

- Useful only after confirming socket names, message schema, and authentication.
- Do not make IPC the default adapter path for Claude Desktop, Codex App, or Antigravity.

REST and gateway APIs:

- Preferred where the tool owns a documented local server.
- QClaw/OpenClaw are the best current candidates because existing research identified gateway REST/API, ACP, config, and heartbeat hooks.

Shared state:

- Baseline path for all tools.
- Use `radio` for requests/reviews, `task` for durable work ownership, `workflow` for multi-role coordination, and `dispatch progress`/`heartbeat` for long-running work.

## Next Implementation Steps

1. Add an adapter registry that distinguishes `direct-cli`, `shared-state`, `cdp`, `gateway-rest`, and `diagnostic-only`.
2. Prototype an OpenClaw/QClaw gateway adapter first because it has the clearest non-GUI interface.
3. Add a CDP discovery command that checks process flags and known localhost debugging ports without assuming access.
4. Keep Marvis and CC-Switch on shared-state-only until a stable prompt/API surface is verified.
