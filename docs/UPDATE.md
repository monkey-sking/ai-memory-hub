# AI Memory Hub Update Guide

## Checking for Updates

Check if a new version is available:

```bash
ai-memory-hub update --check
```

This will show:
- Current version
- Whether you're up to date
- Number of commits behind (if any)

## Updating

Update to the latest version:

```bash
ai-memory-hub update
```

This will:
1. Fetch the latest changes from GitHub
2. Pull the changes (fails if you have local modifications)
3. Update dependencies with npm install
4. Show the new version

## Force Update

If you have local changes and want to discard them:

```bash
ai-memory-hub update --force
```

⚠️ **Warning**: This will discard all local changes!

## Manual Update

If the automatic update fails, you can update manually:

```bash
cd <local-repo-path>
git pull origin main
npm install
```

## Troubleshooting

### "You have uncommitted changes"

Either:
- Commit your changes: `git add . && git commit -m "My changes"`
- Stash them: `git stash`
- Discard them: `ai-memory-hub update --force`

### "Failed to fetch"

Check your internet connection and GitHub access:
```bash
git fetch origin main
```

### "npm install failed"

Run it manually:
```bash
cd <local-repo-path>
npm install
```
