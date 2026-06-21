# Quality Gate Rules

**Last Updated:** 2026-06-21  
**Author:** Claude  
**Status:** Implemented

## Overview

Quality gates provide machine-readable constraints for workflow steps and recipes. This document describes the available quality gate rules and their usage.

## Core Fields

### verifyCommands

Array of verification commands to run after implementation.

```json
{
  "verifyCommands": [
    {
      "id": "syntax-check",
      "command": "node --check src/index.js",
      "required": true,
      "description": "Verify JavaScript syntax"
    },
    {
      "id": "unit-tests",
      "command": "npm.cmd test",
      "required": true
    }
  ]
}
```

**Fields:**
- `id` - Unique identifier for the command
- `source` - Alternative: use a predefined command source (e.g., `"task-spec"`, `"changed-files"`)
- `command` - Shell command to execute
- `args` - Optional array of arguments
- `required` - Boolean indicating if failure blocks completion
- `description` - Human-readable description
- `timeoutMs` - Optional timeout in milliseconds

### reviewRequired

Boolean flag indicating whether human review is required before completion.

```json
{
  "reviewRequired": true
}
```

### maxRepairAttempts

Maximum number of repair attempts after verification or review failures.

```json
{
  "maxRepairAttempts": 3
}
```

### stopWhen

Array of conditions that should halt execution immediately.

```json
{
  "stopWhen": [
    "acceptance_unclear",
    "credentials_required",
    "human_approval_required",
    "unsafe_action_required",
    "verification_unavailable",
    "max_repair_attempts_reached"
  ]
}
```

### allowedActions

Array of actions explicitly permitted during workflow execution.

```json
{
  "allowedActions": [
    "read_project_and_shared_memory",
    "local_file_edits",
    "focused_tests",
    "local_commit_when_guardrails_allow"
  ]
}
```

### forbiddenActions

Array of actions explicitly prohibited during workflow execution.

```json
{
  "forbiddenActions": [
    "git_push_without_approval",
    "file_deletion_without_approval",
    "dependency_install_without_approval",
    "system_configuration_without_approval"
  ]
}
```

## Anti-Overengineering Rules

### minimalImplementation

Enforces minimal implementation principles to prevent over-engineering.

```json
{
  "minimalImplementation": {
    "enabled": true,
    "principles": [
      "YAGNI - You Ain't Gonna Need It",
      "Solve the stated problem only",
      "No premature optimization",
      "No speculative features",
      "Prefer boring solutions over clever ones"
    ],
    "forbiddenPatterns": [
      "abstract factory",
      "strategy pattern without demonstrated need",
      "plugin system for single use case",
      "configuration DSL",
      "custom framework"
    ],
    "maxNewFiles": 3,
    "maxLinesPerFile": 300
  }
}
```

**Fields:**
- `enabled` (boolean) - Turn this gate on or off
- `principles` (string[]) - List of principles to follow
- `forbiddenPatterns` (string[]) - Design patterns and approaches to avoid
- `maxNewFiles` (integer) - Maximum number of new files allowed
- `maxLinesPerFile` (integer) - Maximum lines per file

**Purpose:**

Prevents common over-engineering patterns:
- **Premature abstraction** - Creating abstractions with only one use case
- **Speculative generality** - Adding features "in case we need them later"
- **Framework creation** - Building custom frameworks for simple problems
- **Configuration complexity** - DSLs and config layers for static use cases

**Review Checklist:**
- [ ] Are there abstractions with single call sites?
- [ ] Is there code solving future problems not in the current scope?
- [ ] Are there configuration options for things that don't vary?
- [ ] Is the solution simpler than the problem it solves?

### dependencyBudget

Controls the addition of new dependencies to prevent dependency bloat.

```json
{
  "dependencyBudget": {
    "enabled": true,
    "maxNewDependencies": 1,
    "maxTotalSizeMB": 5,
    "allowedScopes": [
      "dependencies"
    ],
    "forbiddenPackages": [
      "lodash",
      "moment",
      "request"
    ],
    "requireJustification": true
  }
}
```

**Fields:**
- `enabled` (boolean) - Turn this gate on or off
- `maxNewDependencies` (integer) - Maximum number of new dependencies allowed
- `maxTotalSizeMB` (integer) - Maximum total size of new dependencies in MB
- `allowedScopes` (string[]) - Allowed package.json scopes (`"dependencies"`, `"devDependencies"`, `"peerDependencies"`)
- `forbiddenPackages` (string[]) - Packages that are explicitly forbidden
- `requireJustification` (boolean) - Whether adding dependencies requires written justification

**Purpose:**

Prevents dependency bloat and supply chain risks:
- **Heavy dependencies** - Large packages that add significant bundle size
- **Redundant dependencies** - Packages that duplicate stdlib or existing deps
- **Unmaintained packages** - Deprecated or abandoned packages
- **Security risks** - Packages with known vulnerabilities or suspicious maintenance

**Justification Template:**

When `requireJustification` is true, document:
1. What problem does this dependency solve?
2. Why can't stdlib/existing code solve it?
3. What are the alternatives? Why was this chosen?
4. What is the maintenance status and security posture?
5. What is the size impact?

**Common Forbidden Packages:**
- `lodash` - Use native ES methods instead
- `moment` - Use native `Date` or `Intl.DateTimeFormat`
- `request` - Deprecated; use `fetch` or `http`
- `left-pad` - Trivial to implement
- `is-*` utility packages - Usually one-liners

## Usage in Recipes

Quality gates can be defined at three levels:

### 1. Recipe Level (applies to all steps)

```json
{
  "name": "my-recipe",
  "qualityGate": {
    "reviewRequired": true,
    "minimalImplementation": {
      "enabled": true,
      "principles": ["YAGNI", "Solve the stated problem only"]
    }
  },
  "steps": [...]
}
```

### 2. Step Level (overrides recipe level)

```json
{
  "steps": [
    {
      "id": "implementation",
      "role": "executor",
      "task": "...",
      "minimalImplementation": {
        "enabled": true,
        "maxNewFiles": 2,
        "maxLinesPerFile": 200
      },
      "dependencyBudget": {
        "enabled": true,
        "maxNewDependencies": 1
      }
    }
  ]
}
```

### 3. Nested in qualityGate Object

```json
{
  "steps": [
    {
      "id": "review",
      "role": "reviewer",
      "task": "...",
      "qualityGate": {
        "reviewRequired": true,
        "minimalImplementation": {
          "enabled": true,
          "forbiddenPatterns": [
            "premature abstraction",
            "speculative generality"
          ]
        }
      }
    }
  ]
}
```

## Validation

Recipe validation checks:
- All gate fields have correct types
- Arrays contain non-empty strings
- Integers are non-negative
- Nested objects conform to schemas

```bash
# Validate a recipe
ai-memory-hub recipe validate <recipe-name>

# Create workflow from recipe (includes validation)
ai-memory-hub recipe create <recipe-name> --executor claude --reviewer gemini
```

## Example: Minimal Implementation Workflow

See `recipes/minimal-backend-api.json` for a complete example demonstrating:
- Recipe-level minimal implementation principles
- Step-level file and dependency budgets
- Review step checking for over-engineering patterns

## References

- **YAGNI Principle** - "You Aren't Gonna Need It" from Extreme Programming
- **The Grug Brained Developer** - https://grugbrain.dev/ - "complexity very, very bad"
- **Write code that is easy to delete** - https://programmingisterrible.com/post/139222674273
- **Dependency Confusion** - Supply chain attacks via malicious packages
- **Left-pad incident** - NPM ecosystem fragility from micro-dependencies

## See Also

- [Approval Gates Design](./approval-gates-design.md) - Human approval workflow
- [Permission Policy Layer](./permission-policy-layer-design.md) - Runtime permission rules
- [Development Recipe Packs](./development-recipe-packs.md) - Recipe system overview
