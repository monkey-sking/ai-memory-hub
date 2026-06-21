# Anti-Overengineering Review Policy

**Author:** Claude  
**Date:** 2026-06-21  
**Status:** Active

## Overview

This document defines standardized review checks to detect and prevent over-engineering in code reviews. It complements the `minimalImplementation` quality gate by providing concrete, actionable review criteria.

## Core Principles

1. **YAGNI (You Ain't Gonna Need It)** - Only build what's needed now
2. **Solve the stated problem only** - No scope creep
3. **Prefer boring solutions** - Simple beats clever
4. **No premature optimization** - Optimize when proven necessary
5. **No speculative features** - Build for today, not theoretical tomorrow

## Review Checklist

### 1. Abstraction Audit

**Red Flags:**
- [ ] Abstractions with only 1 call site
- [ ] Interfaces with only 1 implementation
- [ ] Base classes with only 1 subclass
- [ ] Strategy patterns without demonstrated variability
- [ ] Builder patterns for simple objects

**Questions to Ask:**
- How many concrete uses does this abstraction have **right now**?
- What would break if we inlined this?
- Is this solving a real problem or a hypothetical one?

**Example:**
```javascript
// ❌ Over-engineered: abstraction for single use
class UserRepositoryInterface {
  findById(id) {}
  save(user) {}
}
class DatabaseUserRepository extends UserRepositoryInterface {
  findById(id) { return db.query('SELECT * FROM users WHERE id = ?', id); }
  save(user) { return db.query('INSERT INTO users ...', user); }
}

// ✅ Minimal: direct implementation
function findUserById(id) {
  return db.query('SELECT * FROM users WHERE id = ?', id);
}
function saveUser(user) {
  return db.query('INSERT INTO users ...', user);
}
```

### 2. Configuration Complexity

**Red Flags:**
- [ ] Configuration for things that never vary
- [ ] Configuration DSLs or custom parsing
- [ ] YAML/JSON config files with > 3 nesting levels
- [ ] Feature flags that are always on
- [ ] Environment variables for hardcoded values

**Questions to Ask:**
- Does this value actually change between deployments?
- Could this be a constant instead?
- Is the config more complex than what it configures?

**Example:**
```javascript
// ❌ Over-configured
config.yaml:
  database:
    connection:
      host: localhost
      port: 5432
      pool:
        min: 2
        max: 10
        idleTimeout: 30000

// ✅ Minimal: one config point
DATABASE_URL=postgres://localhost:5432/mydb
```

### 3. Premature Generalization

**Red Flags:**
- [ ] Generic "framework" for single use case
- [ ] Plugin systems with 0-1 plugins
- [ ] Middleware chains with 1-2 middlewares
- [ ] Event systems for synchronous calls
- [ ] Template engines for static strings

**Questions to Ask:**
- How many actual use cases exist today?
- What's the cost of adding this later if needed?
- Are we building a framework or solving a problem?

### 4. Dependency Bloat

**Red Flags:**
- [ ] Heavy library for simple task (e.g., lodash for one function)
- [ ] Deprecated packages (moment, request, etc.)
- [ ] Multiple libraries for same purpose
- [ ] Transitive dependencies > 100
- [ ] Bundle size increase > 20% for minor feature

**Questions to Ask:**
- Can stdlib do this?
- Can existing dependencies do this?
- What's the maintenance burden?
- What's the security surface area?

**Common Violations:**
```javascript
// ❌ Heavy dependency for trivial operation
import _ from 'lodash';
const unique = _.uniq(array);

// ✅ Use stdlib
const unique = [...new Set(array)];

// ❌ Deprecated package
import moment from 'moment';
const date = moment().format('YYYY-MM-DD');

// ✅ Use native API
const date = new Date().toISOString().split('T')[0];
```

### 5. Unused Code

**Red Flags:**
- [ ] Functions/classes with 0 call sites
- [ ] Commented-out code blocks
- [ ] "Utils" files with 20+ unrelated functions
- [ ] Dead feature flags
- [ ] Unreachable code paths

**Detection Commands:**
```bash
# Find unused exports (requires grep and basic analysis)
grep -r "export function" src/ | while read line; do
  func=$(echo $line | sed 's/.*export function \([a-zA-Z0-9_]*\).*/\1/');
  count=$(grep -r "$func" src/ | wc -l);
  if [ $count -eq 1 ]; then echo "Unused: $line"; fi
done

# Find TODO/FIXME markers
grep -rn "TODO\|FIXME\|HACK\|XXX" src/

# Find commented code blocks
grep -rn "^[[:space:]]*//.*{$" src/
```

### 6. Future-Proofing

**Red Flags:**
- [ ] "We might need X later" without concrete plan
- [ ] Hooks/callbacks with no current consumers
- [ ] Versioning for internal-only APIs
- [ ] Compatibility layers for no known old clients
- [ ] "Extensibility" without extension points in use

**Questions to Ask:**
- Is there a ticket/requirement for this future need?
- What's the cost of adding this later?
- How likely is this to be actually used?

### 7. Test Over-Engineering

**Red Flags:**
- [ ] Test fixtures more complex than production code
- [ ] Mocking frameworks for simple stubs
- [ ] 100% coverage including trivial getters/setters
- [ ] E2E tests for unit-testable logic
- [ ] Test DSLs that obscure what's being tested

**Balance:**
- Test the behavior, not the implementation
- Mock external dependencies, not your own code
- One test per behavior, not per line
- Integration tests for integration, unit tests for logic

### 8. Documentation Overkill

**Red Flags:**
- [ ] JSDoc on self-explanatory functions
- [ ] Architecture diagrams for 3-file projects
- [ ] Inline comments explaining obvious code
- [ ] Separate "developer guide" for simple library
- [ ] API docs auto-generated but never read

**Good Documentation:**
- WHY decisions were made (not WHAT the code does)
- Non-obvious behavior or edge cases
- Examples of actual usage
- Architecture decisions (ADRs) for big choices

## Automated Checks

### Complexity Metrics

```bash
# Lines per file
find src -name "*.js" -exec wc -l {} \; | sort -rn | head -10

# Function length (rough estimate)
grep -n "function\|const.*=.*=>.*{" src/**/*.js | \
  awk -F: '{print $1}' | uniq -c | sort -rn | head -10

# Cyclomatic complexity (requires tool)
npx complexity-report src/
```

### Dependency Analysis

```bash
# List all dependencies with sizes
npm list --depth=0

# Find large dependencies
du -sh node_modules/* | sort -rh | head -10

# Check for outdated/deprecated packages
npm outdated
npm audit
```

### Code Duplication

```bash
# Find duplicate code blocks (requires jscpd or similar)
npx jscpd src/

# Find similar function names (potential duplication)
grep -roh "function [a-zA-Z0-9_]*" src/ | sort | uniq -c | sort -rn
```

## Review Questions Template

When reviewing code, ask:

1. **Necessity**
   - Is this solving a real, stated problem?
   - Could we ship without this?

2. **Simplicity**
   - What's the simplest solution?
   - Have we chosen it?

3. **Usage**
   - How many call sites exist today?
   - Are there concrete use cases for all branches?

4. **Cost**
   - Lines of code added vs value delivered
   - Dependencies added vs benefit
   - Maintenance burden vs feature importance

5. **Alternatives**
   - Could stdlib do this?
   - Could existing code be reused?
   - Could this wait until proven necessary?

## Reviewer Guidelines

### Green Light (✅ Approve)

- Solves stated problem with minimal code
- No unused abstractions
- Dependencies justified
- Clear, boring implementation
- Tests match the scope

### Yellow Light (⚠️ Request Changes)

- Some over-engineering but fixable
- Abstractions defensible with 2+ uses
- Small scope creep that could be trimmed
- Minor dependency concerns

### Red Light (❌ Reject)

- Solves hypothetical problems
- Framework for single use case
- Adds heavy dependencies unnecessarily
- Significantly more complex than needed
- Abstractions with single use

## Examples from Real Reviews

### Example 1: Configuration Overkill

**Problem:**
```javascript
// config/database.js
export const databaseConfig = {
  development: { host: 'localhost', port: 5432 },
  staging: { host: 'staging-db', port: 5432 },
  production: { host: 'prod-db', port: 5432 }
};

// db.js
const config = databaseConfig[process.env.NODE_ENV];
const connection = createConnection(config);
```

**Fix:**
```javascript
// Just use environment variable directly
const connection = createConnection(process.env.DATABASE_URL);
```

### Example 2: Premature Abstraction

**Problem:**
```javascript
class EmailService {
  async send(email) { /* ... */ }
}
class SMSService {
  async send(sms) { /* ... */ }
}
class NotificationService {
  constructor(strategy) { this.strategy = strategy; }
  async notify(message) { return this.strategy.send(message); }
}
// Only ever used with EmailService
const notifier = new NotificationService(new EmailService());
```

**Fix:**
```javascript
// Just use email directly
async function sendEmail(to, subject, body) { /* ... */ }
```

### Example 3: Unused Extensibility

**Problem:**
```javascript
class UserRepository {
  constructor(db, cache, logger, metrics, hooks) {
    this.db = db;
    this.cache = cache;
    this.logger = logger;
    this.metrics = metrics;
    this.hooks = hooks; // Never actually used
  }
  // hooks system with 0 registered hooks
}
```

**Fix:**
```javascript
class UserRepository {
  constructor(db) {
    this.db = db;
    // Add other dependencies when actually needed
  }
}
```

## Integration with Quality Gates

This review policy works with the `minimalImplementation` quality gate:

```json
{
  "minimalImplementation": {
    "enabled": true,
    "principles": [
      "YAGNI",
      "Solve stated problem only",
      "No premature optimization",
      "Prefer boring solutions"
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

## CLI Support

```bash
# Run anti-overengineering checks
ai-memory-hub recipe validate <recipe-name>

# Check policy compliance
ai-memory-hub policy check --actor role:reviewer --operation modify-files

# Review checklist
ai-memory-hub review --checklist anti-overengineering
```

## See Also

- [Quality Gate Rules](./quality-gate-rules.md) - Machine-readable gates
- [Execution Policy Workflow Integration](./execution-policy-workflow-integration.md) - Role-based enforcement
- [Development Recipe Packs](./development-recipe-packs.md) - Recipe system

## References

- **YAGNI Principle** - Extreme Programming
- **The Grug Brained Developer** - https://grugbrain.dev/
- **Prefer Boring Technology** - Dan McKinley
- **Write Code That Is Easy to Delete** - https://programmingisterrible.com/
- **The Wrong Abstraction** - Sandi Metz
