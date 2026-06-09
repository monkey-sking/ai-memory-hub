# Contributing to AI Memory Hub

Thank you for considering contributing to AI Memory Hub! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)

## Code of Conduct

This project follows a simple code of conduct:
- Be respectful and inclusive
- Focus on constructive feedback
- Help create a welcoming environment

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs actual behavior
- **Environment details** (OS, Node version, tool versions)
- **Logs or error messages** if applicable

### Suggesting Enhancements

Enhancement suggestions are welcome! Please include:

- **Clear use case** - Why is this enhancement needed?
- **Proposed solution** - How would it work?
- **Alternatives considered** - What other approaches did you consider?

### Code Contributions

We welcome code contributions! Areas where help is especially appreciated:

- **Tool Integrations** - Adding support for new AI tools
- **CLI Runners** - Implementing dispatch runners for more tools
- **Dashboard UI** - Building the web visualization interface
- **Tests** - Adding unit and integration tests
- **Documentation** - Improving guides and examples
- **Bug Fixes** - Fixing reported issues

## Development Setup

### Prerequisites

- **Node.js** >= 18
- **Git**
- One or more AI tools (Claude, Codex, Gemini, etc.)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/<owner>/ai-memory-hub.git
cd ai-memory-hub

# Install dependencies (if any added in future)
npm install

# Link for local development
npm link

# Initialize the hub
ai-memory-hub init

# Check status
ai-memory-hub status
```

### Project Structure

```
ai-memory-hub/
├── src/
│   └── index.js         # Main CLI implementation
├── templates/           # Instruction templates for tools
├── docs/               # Documentation
│   ├── CLI.md          # Command reference
│   ├── UPDATE.md       # Update guide
│   └── *.md           # Other docs
├── examples/           # Usage examples
├── package.json        # Project metadata
├── README.md          # Project overview
├── CHANGELOG.md       # Version history
└── LICENSE            # MIT License
```

## Coding Standards

### JavaScript Style

- **ES Modules** - Use `import`/`export`, not `require`
- **Async/Await** - Prefer over callbacks or raw promises
- **Const/Let** - No `var`
- **Descriptive Names** - Functions and variables should be self-documenting
- **Comments** - Add comments for complex logic, not obvious code

### Code Organization

```javascript
// Good: Clear, descriptive function
function createContextPack({ taskId, workflowId, project }) {
  const pack = {
    id: createId(`context:${taskId}:${Date.now()}`),
    taskId: taskId || "",
    // ...
  };
  return pack;
}

// Good: Handle errors explicitly
try {
  const result = await someOperation();
  return result;
} catch (error) {
  console.error(`Operation failed: ${error.message}`);
  return null;
}
```

### File Operations

- **Use sync operations** for config/state files (small, need consistency)
- **Use JSONL** for append-only logs (radio, tasks, workflows)
- **Use locks** for concurrent writes (via `locks/hub.lock`)
- **Ensure directories** before writing files

```javascript
// Good pattern
function writeTaskEntry(memoryDir, task) {
  const file = path.join(memoryDir, "tasks", "tasks.jsonl");
  ensureDir(path.dirname(file));
  appendJsonl(file, task);
}
```

### CLI Commands

- **Consistent naming** - Use kebab-case: `task-list`, not `taskList`
- **Help text** - Every command should have clear usage
- **JSON output** - Commands should output JSON for scripting
- **Exit codes** - 0 for success, 1 for errors

```javascript
// Good command structure
function taskListCommand(argv) {
  const status = getOption(argv, "--status");
  const project = getOption(argv, "--project");
  
  const config = loadConfig();
  const tasks = readTasks(config.memoryDir)
    .filter(t => !status || t.status === status)
    .filter(t => !project || t.project === project);
  
  console.log(JSON.stringify(tasks, null, 2));
}
```

## Pull Request Process

### Before Submitting

1. **Test your changes** - Run the CLI commands you modified
2. **Update documentation** - If you added features or changed behavior
3. **Follow commit conventions** - See below
4. **Check for conflicts** - Rebase on latest main if needed

### Commit Messages

Use conventional commit format:

```
<type>: <description>

[optional body]

[optional footer]
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

**Examples:**

```
feat: add Gemini CLI runner support for automatic dispatch

- Implement getToolRunner for Gemini
- Support non-interactive mode with -p flag
- Enable automatic dispatch for Gemini tool
```

```
fix: resolve ES module __dirname compatibility issue

Add __dirname and __filename definitions for ES modules
```

```
docs: complete README with comprehensive feature list

- Expand to 717 lines with full feature documentation
- Add installation guide and quick start
- Document all 13 core features
```

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated (if applicable)
- [ ] No breaking changes (or documented with migration guide)
- [ ] Tested on your local environment
- [ ] Commit messages follow conventions

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring

## Testing
How did you test these changes?

## Related Issues
Closes #issue_number (if applicable)
```

## Issue Guidelines

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Run command '...'
2. See error

**Expected behavior**
What you expected to happen

**Environment:**
- OS: [e.g. Windows 11, macOS 14, Ubuntu 22.04]
- Node version: [e.g. 18.17.0]
- ai-memory-hub version: [e.g. 0.1.0]
- Connected tools: [e.g. Claude, Codex]

**Logs**
Paste relevant logs or error messages
```

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
Description of the problem

**Describe the solution you'd like**
Clear description of what you want to happen

**Describe alternatives you've considered**
Other solutions or features you've considered

**Additional context**
Any other context or screenshots
```

## Adding Tool Support

### For CLI Tools

1. **Detect the tool** - Add to `detectTools()` function
2. **Add instruction template** - Create template in `templates/`
3. **Add CLI runner** (optional) - Update `getToolRunner()` if auto-dispatch needed
4. **Test integration** - Verify detection and instruction installation

Example:

```javascript
// In detectTools()
{
  name: "your-tool",
  kind: "cli-config",
  dir: path.join(home, ".your-tool")
}

// In getToolRunner() - if CLI runner available
if (tool === "your-tool") {
  if (!commandExists("your-tool")) {
    return { available: false, reason: "your-tool CLI not found" };
  }
  return {
    available: true,
    preview: "your-tool --non-interactive <prompt>",
    command: "your-tool",
    args: ["--non-interactive"]
  };
}
```

### For App Tools

1. **Detect installation** - Check app data directory
2. **Generate adapter note** - Tools without CLI get adapter instructions
3. **Document integration** - Update README with new tool support

## Testing

Currently, the project uses manual testing. Contributions to add automated tests are welcome!

### Manual Testing Checklist

- [ ] `ai-memory-hub init` creates directory structure
- [ ] `ai-memory-hub status` shows correct state
- [ ] `ai-memory-hub sync` processes inbox events
- [ ] Task commands work (add, claim, done)
- [ ] Radio messages send and list correctly
- [ ] Workflow creation and execution work
- [ ] Recipe validation and creation work
- [ ] Metrics display correctly
- [ ] Update check works

### Future: Automated Tests

We plan to add:
- Unit tests for core functions
- Integration tests for CLI commands
- E2E tests for multi-tool workflows

## Documentation

### Where to Document

- **README.md** - Project overview, features, quick start
- **docs/CLI.md** - Complete command reference
- **docs/UPDATE.md** - Update instructions
- **CHANGELOG.md** - Version history and changes
- **Code comments** - Complex logic and design decisions

### Documentation Style

- **Be concise** - Get to the point quickly
- **Use examples** - Show, don't just tell
- **Keep it current** - Update docs with code changes
- **Chinese + English** - Both languages when possible

## Release Process

(For maintainers)

1. Update version in `package.json`
2. Update `CHANGELOG.md` with changes
3. Create git tag: `git tag v0.x.0`
4. Push tag: `git push origin v0.x.0`
5. Create GitHub release with changelog
6. (Future) Publish to npm: `npm publish`

## Questions?

- **GitHub Issues** - For bugs and feature requests
- **GitHub Discussions** - For questions and ideas
- **Pull Requests** - For direct code contributions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to AI Memory Hub! 🚀
