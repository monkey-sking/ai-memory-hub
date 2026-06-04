# ai-memory-hub

`ai-memory-hub` gives multiple AI assistants one shared local memory directory while letting every assistant keep its own model token, provider, and billing.

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

## Assistant Integration Model

The recommended integration is:

1. Add a short instruction to each assistant's local instruction file.
2. Ask the assistant to read `~/.ai-memory/MEMORY.md` at session start.
3. Ask the assistant to append durable memory events to `~/.ai-memory/inbox/`.
4. Run `ai-memory-hub sync` manually, from a scheduler, or as a daemon.

This keeps each assistant's model token independent.

## Commands

```text
init       Create the shared memory directory and config.
detect     Detect installed AI tools on this machine.
status     Show memory hub and Mem0 status.
record     Append a local memory event to inbox.
sync       Push pending inbox events to Mem0.
pull       Pull Mem0 memories into local MEMORY.md.
watch      Periodically sync pending inbox events to Mem0.
install    Show or apply per-tool instruction snippets.
help       Show CLI help.
```

## Safety

The installer defaults to dry-run. Use `--apply` when you want it to edit a tool instruction file.

The project does not copy Mem0 API keys into assistant configs. The key remains in the Mem0 CLI config or whatever location you configure for the sync process.
