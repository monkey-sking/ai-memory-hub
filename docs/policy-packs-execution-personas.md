# Policy Packs - Attachable Execution Personas

**Author:** Claude  
**Date:** 2026-06-21  
**Status:** Implemented

## Overview

Policy packs are reusable bundles of execution policies, quality gates, and behavior constraints that can be attached to agents. They define "execution personas" - standardized ways for agents to behave in specific contexts.

## Concept

Instead of configuring each agent individually, policy packs let you define named personas like:
- **conservative-reviewer** - Strict review, no modifications allowed
- **trusted-executor** - Can modify files and run tests, but not push
- **senior-developer** - Full permissions with minimal constraints
- **junior-developer** - Guided by strong quality gates and approval requirements

## Policy Pack Structure

```json
{
  "name": "conservative-reviewer",
  "title": "Conservative Code Reviewer",
  "description": "Strict review persona with read-only access and comprehensive quality gates",
  "version": "1.0.0",
  "policies": [
    {
      "operation": "modify-files",
      "decision": "deny",
      "reason": "Reviewers should not modify code"
    },
    {
      "operation": "push",
      "decision": "deny",
      "reason": "Reviewers cannot push"
    },
    {
      "operation": "read-memory",
      "decision": "allow",
      "reason": "Reviewers need context"
    }
  ],
  "qualityGate": {
    "reviewRequired": true,
    "minimalImplementation": {
      "enabled": true,
      "principles": [
        "YAGNI",
        "No premature optimization"
      ]
    }
  },
  "roles": ["reviewer"],
  "metadata": {
    "author": "system",
    "tags": ["review", "conservative", "read-only"]
  }
}
```

## Storage

Policy packs are stored in `<memoryDir>/policy/packs/`:
- `<memoryDir>/policy/packs/conservative-reviewer.json`
- `<memoryDir>/policy/packs/trusted-executor.json`
- `<memoryDir>/policy/packs/senior-developer.json`

## CLI Commands

### List Policy Packs

```bash
ai-memory-hub policy pack list
# Output:
# {
#   "packs": [
#     {
#       "name": "conservative-reviewer",
#       "title": "Conservative Code Reviewer",
#       "version": "1.0.0",
#       "roles": ["reviewer"]
#     },
#     ...
#   ]
# }
```

### Show Policy Pack Details

```bash
ai-memory-hub policy pack show conservative-reviewer
# Output: Full pack definition with policies and gates
```

### Create Policy Pack

```bash
ai-memory-hub policy pack create \
  --name junior-developer \
  --title "Junior Developer" \
  --description "Guided persona with strong quality gates" \
  --file packs/junior-developer.json
```

### Attach Pack to Agent

```bash
# Attach to specific tool
ai-memory-hub policy pack attach --pack conservative-reviewer --tool claude

# Attach to workflow role
ai-memory-hub policy pack attach --pack trusted-executor --role executor

# Temporary attach for session
ai-memory-hub policy pack attach --pack senior-developer --tool claude --session abc123
```

### Detach Pack

```bash
ai-memory-hub policy pack detach --pack conservative-reviewer --tool claude
```

### Validate Pack

```bash
ai-memory-hub policy pack validate conservative-reviewer
```

## Built-in Policy Packs

### 1. conservative-reviewer

**Persona:** Strict code reviewer, read-only access

**Policies:**
- ✅ Allow: read-memory, send-radio
- ❌ Deny: modify-files, push, delete, install-dependencies
- ⚠️  Ask: claim-task (only review tasks)

**Quality Gates:**
- reviewRequired: true
- minimalImplementation: enabled
- All anti-overengineering checks enabled

**Use Cases:**
- External code reviews
- Security audits
- Compliance checks

### 2. trusted-executor

**Persona:** Experienced developer, can modify and test but not deploy

**Policies:**
- ✅ Allow: read-memory, write-memory, modify-files, run-tests, claim-task
- ❌ Deny: push, delete, purge
- ⚠️  Ask: install-dependencies

**Quality Gates:**
- maxRepairAttempts: 3
- minimalImplementation: enabled with relaxed limits
- dependencyBudget: maxNewDependencies = 2

**Use Cases:**
- Workflow executor role
- Feature implementation
- Bug fixes

### 3. senior-developer

**Persona:** Full trust, minimal constraints, responsible for decisions

**Policies:**
- ✅ Allow: Most operations including push (to feature branches)
- ⚠️  Ask: push to main, delete production data
- ❌ Deny: purge without approval

**Quality Gates:**
- maxRepairAttempts: 5
- reviewRequired: false (self-review capable)
- minimalImplementation: informational only

**Use Cases:**
- Hotfix deployments
- Senior engineer workflows
- Emergency maintenance

### 4. junior-developer

**Persona:** Learning mode, strong guardrails, frequent approval required

**Policies:**
- ✅ Allow: read-memory, write-memory
- ⚠️  Ask: modify-files, run-tests, claim-task, install-dependencies
- ❌ Deny: push, delete, purge, system-config

**Quality Gates:**
- reviewRequired: true
- maxRepairAttempts: 2
- minimalImplementation: strict enforcement
- dependencyBudget: maxNewDependencies = 1, requireJustification = true
- maxNewFiles: 2
- maxLinesPerFile: 150

**Use Cases:**
- Training new team members
- High-risk projects
- Compliance-heavy environments

### 5. planner-persona

**Persona:** Scope definition and planning, no implementation

**Policies:**
- ✅ Allow: read-memory, write-memory, send-radio
- ❌ Deny: modify-files, run-tests, push, delete, install-dependencies
- ⚠️  Ask: claim-task, dispatch

**Quality Gates:**
- Planning-specific checks
- Scope clarity requirements

**Use Cases:**
- Workflow planner role
- Architecture design
- Requirements gathering

## Pack Inheritance

Policy packs can inherit from other packs:

```json
{
  "name": "senior-reviewer",
  "inherits": "conservative-reviewer",
  "title": "Senior Reviewer with Write Access",
  "policies": [
    {
      "operation": "modify-files",
      "decision": "allow",
      "reason": "Senior reviewers can make small fixes"
    }
  ]
}
```

Inheritance rules:
1. Child pack inherits all parent policies
2. Child pack can override parent policies (more specific wins)
3. Quality gates merge (child extends parent)
4. Multiple inheritance is not supported

## Pack Application Resolution

When an agent performs an action, packs are applied in this order:

1. **Session-specific pack** (if attached with --session)
2. **Tool-specific pack** (attached to the tool name)
3. **Role-specific pack** (attached to workflow role)
4. **Default policies** (if no pack applies)

Within each level, explicit policies override inherited policies.

## Integration with Existing Policy System

Policy packs are syntactic sugar over the existing policy rule system:

1. When a pack is attached, its policies are converted to policy rules with appropriate priority
2. Pack policies get priority 50-99 (higher than defaults at 0, lower than manual rules at 100+)
3. Detaching a pack removes its generated rules
4. Manual policy rules (priority 100+) always override pack policies

## File Structure

```
<memoryDir>/
  policy/
    rules.jsonl              # Individual policy rules
    packs/                   # Policy pack definitions
      conservative-reviewer.json
      trusted-executor.json
      senior-developer.json
      junior-developer.json
      planner-persona.json
    attachments.jsonl        # Pack attachment records
```

## Attachment Records

Attachments are tracked in `<memoryDir>/policy/attachments.jsonl`:

```json
{
  "type": "policy.attachment",
  "id": "attach_abc123",
  "pack": "conservative-reviewer",
  "target": {
    "type": "tool",        // tool | role | session
    "value": "claude"
  },
  "attachedAt": "2026-06-21T...",
  "attachedBy": "human",
  "priority": 50,
  "active": true
}
```

## Example Workflows

### Workflow 1: Review-Only Agent

```bash
# Set up claude as conservative reviewer
ai-memory-hub policy pack attach --pack conservative-reviewer --tool claude

# Verify permissions
ai-memory-hub policy show --actor claude
# Shows all modify/push/delete operations are denied

# Run review
ai-memory-hub dispatch --to claude --project myproject
# Agent can read and comment, but cannot modify files
```

### Workflow 2: Trusted Workflow Executor

```bash
# Create workflow from recipe
ai-memory-hub recipe create lights-out-local \
  --executor claude \
  --reviewer gemini

# Attach appropriate packs
ai-memory-hub policy pack attach --pack trusted-executor --role executor
ai-memory-hub policy pack attach --pack conservative-reviewer --role reviewer

# Dispatch respects role-based packs
# executor (claude) can modify files
# reviewer (gemini) can only read
```

### Workflow 3: Emergency Hotfix

```bash
# Temporarily elevate permissions for urgent fix
ai-memory-hub policy pack attach \
  --pack senior-developer \
  --tool claude \
  --session $(ai-memory-hub session current)

# Work with elevated permissions
# ... make changes ...

# Detach after fix
ai-memory-hub policy pack detach \
  --pack senior-developer \
  --tool claude \
  --session $(ai-memory-hub session current)
```

## Best Practices

1. **Start Conservative** - Begin with restrictive packs, relax as trust builds
2. **Use Roles, Not Tools** - Attach packs to workflow roles, not individual tools
3. **Session-Specific for Exceptions** - Use session attachments for temporary elevation
4. **Version Your Packs** - Track pack evolution, test before deployment
5. **Document Personas** - Clear descriptions help team understand when to use each pack
6. **Regular Audits** - Review attached packs monthly, remove stale attachments

## Future Enhancements

1. **Pack Templates** - Generate packs from existing agent behavior
2. **Pack Diff** - Compare two packs side-by-side
3. **Pack Testing** - Dry-run to see what would be allowed/denied
4. **Pack Analytics** - Track which operations are attempted vs allowed
5. **Dynamic Packs** - Adjust policies based on context (time of day, project risk, etc.)

## See Also

- [Permission Policy Layer Design](./permission-policy-layer-design.md)
- [Execution Policy Workflow Integration](./execution-policy-workflow-integration.md)
- [Quality Gate Rules](./quality-gate-rules.md)
- [Anti-Overengineering Review Policy](./anti-overengineering-review-policy.md)
