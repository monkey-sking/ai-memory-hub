# Execution Policy - Workflow Role Integration

**Task ID:** `c1dc372f6241eddf`  
**Priority:** High  
**Status:** Implemented  
**Author:** Claude  
**Date:** 2026-06-21

## Overview

This document describes the integration of workflow roles into the execution policy layer, enabling role-based permission control for recipe workflow steps.

## Problem Statement

Prior to this implementation:
- The policy layer supported role-based rules via `actor: "role:executor"` syntax
- Workflow recipe steps defined roles (`planner`, `executor`, `reviewer`, `observer`)
- **But workflow dispatch did not pass role information to policy checks**

This meant that a policy rule like "deny push for role:executor" could not be enforced during workflow execution.

## Solution

### 1. Extended Dispatch Job Structure

Added a `roles` field to dispatch jobs that carries workflow role information:

```javascript
{
  id: "task:abc123",
  kind: "task",
  tool: "claude",
  project: "ai-memory-hub",
  roles: ["role:executor"],  // NEW: extracted from task.recipeStep.role
  // ... other fields
}
```

### 2. Role Extraction

When creating dispatch jobs from tasks, roles are extracted from `task.recipeStep.role`:

```javascript
function dispatchJobFromTask(task) {
  const roles = [];
  if (task.recipeStep?.role) {
    roles.push(`role:${task.recipeStep.role}`);
  }
  return {
    // ...
    roles
  };
}
```

### 3. Policy Check Integration

The dispatch executor now passes roles to the policy resolver:

```javascript
const permission = resolvePermission(memoryDir, {
  actor: job.tool,
  actorRoles: job.roles || [],  // Pass workflow roles
  project: job.project || "*",
  operation: "dispatch",
  scope: "all"
});
```

## Usage Examples

### Example 1: Restrict Executor from Pushing

```bash
# Add a policy rule
ai-memory-hub policy add \
  --actor role:executor \
  --operation push \
  --decision deny \
  --reason "Executor role should not push to remote" \
  --priority 100

# Check the policy
ai-memory-hub policy check \
  --actor claude \
  --roles role:executor \
  --operation push
# → { "decision": "deny", "reason": "Executor role should not push..." }
```

### Example 2: Allow Planner to Write Memory

```bash
# Add a policy rule
ai-memory-hub policy add \
  --actor role:planner \
  --operation write-memory \
  --decision allow \
  --reason "Planners document scope and decisions" \
  --priority 100
```

### Example 3: Reviewer Requires Approval for Destructive Ops

```bash
# Add a policy rule
ai-memory-hub policy add \
  --actor role:reviewer \
  --operation delete \
  --decision ask \
  --reason "Reviewers must get approval before deleting" \
  --priority 100
```

## Recipe Integration

When using recipes like `lights-out-local.json`, each step's role is automatically enforced:

```json
{
  "steps": [
    {
      "id": "implementation",
      "role": "executor",  // This role is passed to policy checks
      "task": "Implement the approved scope..."
    },
    {
      "id": "review",
      "role": "reviewer",  // Different role, different permissions
      "task": "Review the diff..."
    }
  ]
}
```

When these steps are dispatched:
1. Task is created with `recipeStep.role = "executor"`
2. Dispatch job is built with `roles = ["role:executor"]`
3. Policy check evaluates with both `actor=claude` and `actorRoles=["role:executor"]`
4. Most specific matching rule wins (role-specific rules override tool-specific rules)

## Policy Resolution Priority

Rules are matched by specificity:

1. **Exact actor + exact project + exact scope** (specificity = 7)
2. **Exact actor + exact project** (specificity = 6)
3. **Role match + exact project** (specificity = 6)
4. **Exact actor only** (specificity = 4)
5. **Role match only** (specificity = 4)
6. **Wildcard actor** (specificity = 0)

Within the same specificity, `priority` field breaks ties, then most recent timestamp.

## Built-in Workflow Roles

Standard recipe roles:

| Role | Typical Responsibilities | Policy Recommendations |
|------|--------------------------|------------------------|
| `planner` | Define scope, acceptance criteria, constraints | Allow: read-memory, write-memory; Ask: dispatch |
| `executor` | Implement, verify, repair | Allow: modify-files, run-tests; Deny: push, delete |
| `reviewer` | Review diffs, tests, safety compliance | Allow: read-memory; Deny: modify-files, push |
| `observer` | Track state, handoffs, final summary | Allow: read-memory, write-memory; Deny: modify-files |

## CLI Commands

### Add Role-Based Policy

```bash
ai-memory-hub policy add \
  --actor role:<role-name> \
  --operation <operation> \
  --decision <allow|ask|deny> \
  [--project <project>] \
  [--scope <all|project|own>] \
  [--priority <number>] \
  [--reason <text>]
```

### Check Policy for Role

```bash
ai-memory-hub policy check \
  --actor <tool> \
  --roles role:executor,role:planner \
  --operation <operation> \
  [--project <project>]
```

### Show All Permissions for a Role

```bash
ai-memory-hub policy show \
  --actor role:executor \
  --project ai-memory-hub
```

### List Role-Based Rules

```bash
ai-memory-hub policy list | grep "role:"
```

## Implementation Details

### Files Modified

- `src/index.js`:
  - `dispatchJobFromTask()` - Extract role from `task.recipeStep.role`
  - `dispatchJobFromWorkflow()` - Add empty roles array for future extension
  - `buildDispatchJobs()` - Add roles to radio message jobs
  - `executeDispatch()` - Pass `job.roles` to `resolvePermission()`

### Data Flow

```
Recipe Step
  └─> role: "executor"
      └─> Task Creation
          └─> task.recipeStep.role = "executor"
              └─> Dispatch Job Building
                  └─> job.roles = ["role:executor"]
                      └─> Policy Check
                          └─> resolvePermission({ actorRoles: ["role:executor"] })
                              └─> Match rule where actor = "role:executor"
```

## Testing

### Unit Tests

All existing tests pass (94/95, 1 pre-existing failure unrelated to this change).

### Manual Verification

```bash
# 1. Create a deny rule for executor
ai-memory-hub policy add --actor role:executor --operation push --decision deny

# 2. Check policy with role
ai-memory-hub policy check --actor claude --roles role:executor --operation push
# Expected: { decision: "deny", ... }

# 3. Check policy without role
ai-memory-hub policy check --actor claude --operation push
# Expected: { decision: "ask", ... } (default rule)
```

## Future Enhancements

1. **Multiple Roles Per Task**: Support tasks that have multiple roles
   ```javascript
   roles: ["role:executor", "role:reviewer"]
   ```

2. **Workflow-Level Roles**: Add roles at workflow level, not just steps
   ```json
   {
     "workflow": {
       "roles": ["role:planner"],
       "steps": [...]
     }
   }
   ```

3. **Dynamic Role Assignment**: Allow policy rules to assign roles based on context
   ```bash
   # If actor is senior-dev, grant reviewer role automatically
   ```

4. **Role Hierarchies**: Define role inheritance
   ```yaml
   roles:
     senior-executor:
       inherits: [executor]
       additional-permissions: [push]
   ```

## See Also

- [Permission Policy Layer Design](./permission-policy-layer-design.md) - Overall policy architecture
- [Quality Gate Rules](./quality-gate-rules.md) - Recipe-level constraints
- [Approval Gates Design](./approval-gates-design.md) - Human approval workflow
- [Development Recipe Packs](./development-recipe-packs.md) - Recipe system overview
