# Project Registry

The project registry stores project metadata separately from durable memories, tasks, radio messages, and workflows. It gives every AI tool a shared source of truth for project names, aliases, status, relationships, and resource links.

Data is stored at:

```text
%USERPROFILE%\.ai-memory\projects\projects.jsonl
```

## Record Shape

Each JSONL record is normalized to this shape:

```json
{
  "id": "ai-memory-hub",
  "name": "AI Memory Hub",
  "displayName": "AI Memory Hub",
  "status": "active",
  "type": "tool",
  "description": "Local-first shared memory hub for multiple AI tools.",
  "metadata": {
    "basedOn": "",
    "relation": ""
  },
  "aliases": [],
  "resources": {
    "repo": "https://github.com/<owner>/ai-memory-hub",
    "docs": []
  },
  "createdAt": "2026-06-01T00:00:00Z",
  "updatedAt": "2026-06-11T12:00:00Z"
}
```

Supported statuses are `active`, `paused`, `planning`, and `archived`. Dashboard selectors show only visible projects: `active`, `paused`, and `planning`, excluding `test-*` project ids.

## CLI

```bash
ai-memory-hub project list --status visible
ai-memory-hub project add <id> --name <name> --status active
ai-memory-hub project update <id-or-alias> --status paused --description "reason"
ai-memory-hub project show <id-or-alias>
ai-memory-hub project alias <id-or-alias> <alias>
ai-memory-hub project relate <id-or-alias> --based-on <parent-id> --relation reskin
ai-memory-hub project archive <id-or-alias> --by <tool>
ai-memory-hub project migrate --apply
```

Use `project show` before creating a new project if the name may already exist as an alias.

## API

The dashboard server exposes these endpoints:

```text
GET    /api/projects
GET    /api/projects/:id
POST   /api/projects
PATCH  /api/projects/:id
DELETE /api/projects/:id
```

`DELETE` is a soft delete: it sets `status` to `archived` and records `archivedAt` / `archivedBy`.

## Dashboard

The dashboard includes a Projects tab for:

- Viewing total, visible, archived, and unregistered project references.
- Creating and editing project metadata.
- Archiving projects.
- Viewing aliases, relationships, and resource links.

Task and workflow project filters resolve ids, names, display names, and aliases against the registry.

## AI Tool Guidance

Before using a new project name in tasks, workflows, or radio, check the registry:

```bash
ai-memory-hub project show <project-or-alias>
```

If the project does not exist, create it first or ask the user when the identity is ambiguous. Prefer stable `id` values in automation and use `displayName` for UI labels.

Do not manually edit `projects/projects.jsonl` during normal operation. Use the CLI or dashboard API so locking and normalization are applied.
