# AI Memory Hub (AMH)

**One shared memory and coordination layer for every AI coding tool you run.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

[中文说明 / Chinese README](./README.zh-CN.md)

> You run Claude Code, Codex, Gemini CLI, opencode, Antigravity, MiMo Code — and every one of them starts every session knowing *nothing* about what the others just did.
>
> AMH fixes that. One local directory. One ledger. Every agent reads and writes the same memory, messages, and tasks.

---

## The problem, concretely

You asked Codex to refactor `auth/`. Then you opened Claude Code to write tests. It has no idea:

- what Codex changed,
- which decision you rejected and why,
- that there's a blocked task waiting on a review,
- that Gemini already tried that approach and it failed.

So you re-explain. Every. Single. Time.

## What AMH actually is

**Not another vector database. Not another MCP memory server you have to trust and babysit.**

AMH is a local-first ledger + coordination bus that sits *under* your AI tools.

| | |
|---|---|
| **Shared memory** | Agents write what they learned. Anyone can search it. Core / working / archive tiers, FTS5 full-text (works for CJK too). |
| **Agent radio** | Cross-tool messaging with `replyTo` threading. One agent can leave a note for another. |
| **Shared task queue** | `open → claimed → in_progress → blocked → done`, with handoff notes and quality gates. |
| **Workflows** | Multi-role pipelines (planner / executor / reviewer / observer) with node-level history. |
| **Roles & teams** | 6 job roles, 7 registered agents, `member-of` relations, live in the dashboard. |
| **Approval gates** | Machine-readable policy checks that run *before* dispatch, not after you've been burned. |
| **Dispatch** | Hand pending work to a verified CLI runner, optionally in an isolated git worktree. |
| **Dashboard** | Local React UI for all of the above. |

### Four things AMH deliberately does NOT do

- ❌ **No LLM proxying** — each tool talks to its own API with its own key
- ❌ **No unified config** — your tools stay independently configured
- ❌ **No token scraping** — AMH does not read other tools' API keys. A credential profile is read only when you store one and a dispatch asks for it.
- ❌ **No cloud** — everything lives in `~/.ai-memory`

That last row is the whole point for a lot of people.

---

## Install

> ⚠️ **Do not install the `ai-memory-hub` package from npm.** That name is registered to an unrelated project.
> This project is not published to npm yet. Install it from source:

```bash
git clone https://github.com/monkey-sking/ai-memory-hub.git
cd ai-memory-hub
npm install && npm link
amh init
```

Requires Node 24+.

## 60-second quick start

```bash
# 1. See what's already there
amh status

# 2. Write something you don't want to re-explain
amh record "Chose Postgres over SQLite for the events table because of concurrent writers" \
  --source claude --kind decision --project myapp --tags db,architecture

# 3. Make it searchable (required after every write)
amh sync && amh index

# 4. Prove another agent can find it
amh search "why postgres"

# 5. Leave a message for a different tool
amh radio send --from claude --to codex "Don't touch auth/ until the migration lands"

# 6. Open the dashboard
amh app
```

Point any of your AI tools at it — they all speak the same CLI:

```bash
amh search "<what am I working on>"     # read before you act
amh record "<what you learned>" --source <your-name>
amh task list                            # is anything assigned to me
```

---

## Dogfooding numbers

This isn't a demo repo. It's the thing one developer actually runs every day:

- **813** memory events
- **52** cross-agent radio messages
- **66** tasks (46 done, 20 active)
- **7** registered agents: `codex`, `claude`, `gemini`, `antigravity`, `opencode`, `mimocode`, `workbuddy`

Verified via `amh status` on the maintainer's machine.

---

## How it compares

| | Supermemory | Mem0 | Basic Memory | **AMH** |
|---|---|---|---|---|
| Storage | Cloud (self-host on Scale) | Cloud only | Local markdown | **Local SQLite + JSONL** |
| Needs an account / API key | Yes | Yes | No | **No** |
| Touches your LLM traffic | Yes | Yes | No | **No** |
| Memory search | ✅ | ✅ | ✅ | ✅ |
| Inter-agent messaging | ❌ | ❌ | ❌ | **✅** |
| Shared task queue | ❌ | ❌ | ❌ | **✅** |
| Workflows & roles | ❌ | ❌ | ❌ | **✅** |
| Approval gates | ❌ | ❌ | ❌ | **✅** |
| Works without MCP | ❌ | ❌ | ❌ | **✅ (plain CLI)** |

**The one-liner:** they sell *remembering*. AMH sells *stopping five agents from working blind*.

---

## Supported tools

Claude Code · Codex · Gemini CLI · Antigravity (`agy`) · opencode · MiMo Code · Marvis · QClaw · OpenClaw · WorkBuddy · and anything that can shell out.

---

## Docs

- Full documentation: [`docs/`](./docs)
- Chinese readme: [`README.zh-CN.md`](./README.zh-CN.md)
- Contributing: [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## License

Apache-2.0
