# External Domain Packs for AI Memory Hub

## Status

Design approved at the direction level by the user; implementation follows this document.

## Context

AI Memory Hub (AMH) is a generic multi-agent collaboration layer. Domain-specific
knowledge must remain data, not become hard-coded product behavior. A package such
as `reverse-skill` should be loadable as an external domain pack without adding
reverse-engineering logic to the AMH source tree.

## Goals

- Register external Skill, Recipe, Capability, and optional Evidence schema packs.
- Discover packs from explicit paths and the AMH data directory.
- Validate pack metadata and referenced files before enabling a pack.
- Enable/disable and inspect packs through a stable CLI/API surface.
- Keep domain content, tool paths, and project samples outside AMH source code.
- Preserve current memory, task, workflow, policy, and dispatch behavior.

## Non-goals

- Do not implement reverse-engineering logic in AMH.
- Do not automatically install external tools.
- Do not execute pack scripts during registration or validation.
- Do not move project-specific evidence or secrets into the AMH repository.
- Do not replace existing recipes or adapters in this first increment.

## Architecture

```text
External pack directory / ~/.ai-memory/packs/
  manifest.json
  skills/ recipes/ capabilities/ schemas/
          |
          v
AMH Pack Registry + Validator
          |
          +--> Skill/Recipe/Capability discovery
          +--> workflow and capability consumers
          +--> evidence/finding schema registry
```

The registry stores only pack metadata and resolved paths in the AMH data
directory. Pack content remains at its original path. A pack is enabled only
after validation succeeds and the user explicitly enables it.

## Manifest

```json
{
  "id": "reverse-skill",
  "name": "Reverse Engineering Skill Router",
  "version": "0.1.0",
  "type": "domain-pack",
  "source": "external",
  "root": "<user-home>/reverse-skill",
  "entry": {
    "skills": "skills",
    "recipes": "recipes",
    "capabilities": "capabilities"
  },
  "permissions": {
    "network": "ask",
    "toolInstall": "deny",
    "scriptExecution": "ask"
  }
}
```

The first implementation accepts a manifest supplied by the caller or a
manifest located at `<root>/amh-pack.json`. It must reject path traversal,
missing roots, invalid IDs, and entries that resolve outside the pack root.

## Registry behavior

- `pack add --path <dir>`: validate and register disabled metadata.
- `pack list`: show registered packs and validation/enabled state.
- `pack show <id>`: show manifest, paths, and validation diagnostics.
- `pack enable <id>`: enable only a validated pack.
- `pack disable <id>`: disable without deleting files.
- `pack validate [<id>]`: re-run filesystem-only validation.

Registry records are append-only events under the AMH data directory and are
project-independent. The registry must never copy or rewrite external pack
files during these operations.

## Safety and compatibility

- Registration and validation are filesystem-only and do not run scripts.
- Existing commands and built-in recipes remain unchanged.
- Pack permissions are metadata for future dispatch preflight; this increment
  records them but does not silently broaden execution authority.
- The registry must tolerate a missing external path and report it as invalid
  without deleting the registration.

## Acceptance criteria

1. A valid external pack can be added, listed, inspected, enabled, disabled,
   and revalidated from the CLI.
2. Invalid manifests and paths produce actionable diagnostics and no enabled
   record.
3. The AMH repository contains no reverse-specific route, tool, or sample data.
4. The existing test suite passes.
5. `reverse-skill` can be registered by path as an external pack without
   copying its files into AMH.

## Follow-up increments

- Load enabled pack recipes and skills into workflow discovery.
- Expose pack capabilities through the existing capability registry.
- Add signed/versioned pack updates and trust policy.
- Add generic Evidence/Finding schema registration and report adapters.
- Add dashboard views after the CLI/data contract is stable.
