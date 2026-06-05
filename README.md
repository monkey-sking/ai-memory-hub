# ai-memory-hub

`ai-memory-hub` gives multiple AI assistants one shared local memory directory while letting every assistant keep its own model token, provider, and billing.

It includes both:

- A CLI for automation, install snippets, and sync jobs.
- A local dashboard app for inspecting memory, detected AI apps, pending inbox items, and Mem0 sync status.

It does not proxy LLM traffic. Claude, Codex, Gemini, QClaw, OpenClaw, and similar tools continue to use their own credentials. The only shared part is a local directory:

```text
~/.ai-memory/
  profile.md
  MEMORY.md
  inbox/
  synced/
  memories/
  tools/
  state/
```

A local sync command can push new memory events from `inbox/` to Mem0 and pull Mem0 memories back into `MEMORY.md`.

It also includes a built-in Agent Radio message bus for cross-agent handoffs, reviews, risk notes, and status updates. This is implemented inside `ai-memory-hub`; it does not depend on h5i.

## Why

Most AI tools have separate local memory systems. This project creates a neutral place that each tool can read from and write to. Mem0 becomes the cloud backend for that shared memory, but only the sync process needs the Mem0 key.

## Quick Start

```bash
npm install -g .
ai-memory-hub init
ai-memory-hub detect
ai-memory-hub status
```

Record a memory event:

```bash
ai-memory-hub record "User prefers concise Chinese explanations." --source codex
```

Sync pending local memory events to Mem0:

```bash
ai-memory-hub sync
```

Pull Mem0 memories into the local shared snapshot:

```bash
ai-memory-hub pull
```

Run a long-lived watcher that syncs new local inbox events to Mem0:

```bash
ai-memory-hub watch --interval-ms 30000
```

Start the local dashboard app:

```bash
ai-memory-hub app --port 38787
```

Open:

```text
http://127.0.0.1:38787
```

The dashboard can:

- Show Mem0 connection status.
- Show the shared memory directory.
- Show pending local memory events.
- Record new durable memory events.
- Send and inspect Agent Radio messages.
- Trigger `sync` and `pull`.
- Detect installed AI tools and apps.

## Mem0

The sync command reads Mem0 credentials from the normal Mem0 CLI config:

```text
~/.mem0/config.json
```

You can create that config with:

```bash
mem0 init --agent
```

or use your own account:

```bash
mem0 init --api-key m0-xxx --user-id your-user-id
```

AI tools do not need the Mem0 key. They only need instructions or hooks that read and write `~/.ai-memory`.

Each AI tool keeps its own model credentials. For example:

- Codex keeps using its own Codex/OpenAI/custom provider token.
- Claude keeps using its own Anthropic or compatible provider token.
- Gemini and Antigravity keep using their own OAuth/API credentials.
- QClaw/OpenClaw keep using their own provider/account setup.

Mem0 is only the shared memory backend used by the sync process.

## Agent Radio

Agent Radio is a local cross-agent message bus owned by `ai-memory-hub`.

Messages are stored as JSONL:

```text
~/.ai-memory/radio/messages.jsonl
```

Use it for short-lived collaboration:

- handoffs between agents
- review requests
- risk notes
- done/status updates
- coordination that should not immediately become long-term memory

Send a message:

```bash
ai-memory-hub radio send "Please review the latest implementation." --from codex --to claude --type review
```

List recent messages:

```bash
ai-memory-hub radio list --limit 10
```

Promote an important radio message into the memory inbox:

```bash
ai-memory-hub radio promote --id <message-id>
ai-memory-hub sync
```

Promotion copies the radio message into:

```text
~/.ai-memory/inbox/events.jsonl
```

Then the normal `sync` command sends it to Mem0.

## Assistant Integration Model

The recommended integration is:

1. Add a short instruction to each assistant's local instruction file.
2. Ask the assistant to read `~/.ai-memory/MEMORY.md` at session start.
3. Ask the assistant to append durable memory events to `~/.ai-memory/inbox/`.
4. Run `ai-memory-hub sync` manually, from a scheduler, or as a daemon.

This keeps each assistant's model token independent.

## Configure AI Tools

Use `install` to inject shared-memory instructions into supported tools. This does not write Mem0 keys into those tools and does not change their model provider configuration.

Preview first:

```bash
ai-memory-hub install --tool codex
ai-memory-hub install --tool claude
ai-memory-hub install --tool gemini
```

Apply:

```bash
ai-memory-hub install --tool codex --apply
ai-memory-hub install --tool claude --apply
ai-memory-hub install --tool gemini --apply
```

On Windows, this writes:

```text
%USERPROFILE%\.codex\AGENTS.md
%USERPROFILE%\.claude\CLAUDE.md
%USERPROFILE%\.gemini\GEMINI.md
```

The injected instruction tells the assistant to read:

```text
%USERPROFILE%\.ai-memory\MEMORY.md
```

and append durable memory events to:

```text
%USERPROFILE%\.ai-memory\inbox\events.jsonl
```

It also tells the assistant to use Agent Radio for cross-agent messages:

```text
%USERPROFILE%\.ai-memory\radio\messages.jsonl
```

For app-style tools where a stable instruction injection point is not yet guaranteed, `install` generates adapter notes under the shared memory directory:

```bash
ai-memory-hub install --tool antigravity --apply
ai-memory-hub install --tool qclaw --apply
ai-memory-hub install --tool openclaw --apply
ai-memory-hub install --tool codex-app --apply
```

These create files such as:

```text
%USERPROFILE%\.ai-memory\tools\antigravity-shared-memory.md
%USERPROFILE%\.ai-memory\tools\qclaw-shared-memory.md
%USERPROFILE%\.ai-memory\tools\openclaw-shared-memory.md
%USERPROFILE%\.ai-memory\tools\codex-app-shared-memory.md
```

They are safe adapter notes, not invasive edits to internal app databases or opaque state files.

### Current Support Matrix

```text
Codex CLI      Direct instruction injection via ~/.codex/AGENTS.md
Claude         Direct instruction injection via ~/.claude/CLAUDE.md
Gemini         Direct instruction injection via ~/.gemini/GEMINI.md
Antigravity    Detected; adapter note generated under ~/.ai-memory/tools
Codex App      Detected; adapter note generated under ~/.ai-memory/tools
QClaw          Detected; adapter note generated under ~/.ai-memory/tools
OpenClaw       Detected; adapter note generated under ~/.ai-memory/tools
CC Switch      Detected; no direct injection yet
```

## Detected Apps

The detector checks local state/config directories for:

- Codex CLI and Codex app state
- Claude
- Gemini
- Antigravity
- Antigravity Cockpit
- Gemini Antigravity state
- QClaw
- OpenClaw
- CC Switch

Detection is intentionally non-invasive: it reports local app state and does not read or copy model tokens.

## Commands

```text
init       Create the shared memory directory and config.
detect     Detect installed AI tools on this machine.
status     Show memory hub and Mem0 status.
record     Append a local memory event to inbox.
radio      Send, list, and promote cross-agent radio messages.
sync       Push pending inbox events to Mem0.
pull       Pull Mem0 memories into local MEMORY.md.
watch      Periodically sync pending inbox events to Mem0.
app        Start the local dashboard app.
install    Show or apply per-tool instruction snippets.
help       Show CLI help.
```

## Safety

The installer defaults to dry-run. Use `--apply` when you want it to edit a tool instruction file.

The project does not copy Mem0 API keys into assistant configs. The key remains in the Mem0 CLI config or whatever location you configure for the sync process.
