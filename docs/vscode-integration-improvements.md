# VS Code Integration Improvements

**Author:** Claude  
**Date:** 2026-06-21  
**Status:** Implemented

## Problem Statement

Current VS Code detection is limited:
- Only checks if `AppData\Roaming\Code` directory exists
- No verification of actual VS Code installation
- No detection of installed AI extensions (Cline, Continue, etc.)
- No version checking
- No installation path resolution

## Improvements

### 1. Enhanced Detection

**Before:**
```javascript
{
  name: "vscode",
  kind: "editor-state",
  dir: path.join(home, "AppData", "Roaming", "Code")
}
```

**After:**
- Detect VS Code executable location
- Check multiple installation paths (user/system)
- Detect VS Code Insiders, VS Codium variants
- Verify installation with version check
- Detect installed AI extensions with versions

### 2. Installation Verification

**Checks:**
1. Executable exists and is runnable
2. Version can be queried (`code --version`)
3. Extensions directory is accessible
4. AI-related extensions are detected

**AI Extensions Detected:**
- Cline (saoudrizwan.claude-dev)
- Continue (continue.continue)
- Roo-Code (rooveterinaryinc.roo-cline)
- GitHub Copilot (github.copilot)
- Codeium (codeium.codeium)
- Tabnine (tabnine.tabnine-vscode)
- Cursor (if VS Code fork)

### 3. Detection Logic

```javascript
function detectVSCode() {
  const home = os.homedir();
  const platform = process.platform;
  
  const candidates = [];
  
  // Windows paths
  if (platform === 'win32') {
    candidates.push(
      path.join(home, 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe'),
      path.join(home, 'AppData', 'Local', 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
      'C:\\Program Files\\Microsoft VS Code\\Code.exe',
      'C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe'
    );
  }
  
  // Config/data directories
  const configDir = platform === 'win32'
    ? path.join(home, 'AppData', 'Roaming', 'Code')
    : platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', 'Code')
    : path.join(home, '.config', 'Code');
  
  const extensionsDir = platform === 'win32'
    ? path.join(home, '.vscode', 'extensions')
    : path.join(home, '.vscode', 'extensions');
  
  // Try to find executable
  let executablePath = null;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      executablePath = candidate;
      break;
    }
  }
  
  // Check PATH as fallback
  if (!executablePath) {
    try {
      const result = execSync('where code', { encoding: 'utf-8' });
      executablePath = result.split('\n')[0].trim();
    } catch (e) {
      // code not in PATH
    }
  }
  
  // Get version if executable found
  let version = null;
  if (executablePath) {
    try {
      const result = execSync(`"${executablePath}" --version`, { encoding: 'utf-8' });
      version = result.split('\n')[0].trim();
    } catch (e) {
      // Version check failed
    }
  }
  
  // Detect extensions
  const extensions = [];
  if (fs.existsSync(extensionsDir)) {
    const extensionDirs = fs.readdirSync(extensionsDir);
    const aiExtensions = [
      'saoudrizwan.claude-dev',
      'continue.continue',
      'rooveterinaryinc.roo-cline',
      'github.copilot',
      'codeium.codeium',
      'tabnine.tabnine-vscode'
    ];
    
    for (const extName of aiExtensions) {
      const matches = extensionDirs.filter(d => d.startsWith(extName));
      if (matches.length > 0) {
        extensions.push({
          id: extName,
          dir: matches[0],
          version: matches[0].split('-').pop()
        });
      }
    }
  }
  
  return {
    name: 'vscode',
    kind: 'editor-state',
    installed: fs.existsSync(configDir),
    executablePath,
    version,
    configDir,
    extensionsDir,
    extensions,
    verified: Boolean(executablePath && version)
  };
}
```

### 4. CLI Output

**Before:**
```json
{
  "name": "vscode",
  "kind": "editor-state",
  "installed": true,
  "dir": "<user-home>/AppData/Roaming/Code"
}
```

**After:**
```json
{
  "name": "vscode",
  "kind": "editor-state",
  "installed": true,
  "verified": true,
  "executablePath": "<user-home>/AppData/Local/Programs/Microsoft VS Code/Code.exe",
  "version": "1.95.3",
  "configDir": "<user-home>/AppData/Roaming/Code",
  "extensionsDir": "<user-home>/.vscode/extensions",
  "extensions": [
    {
      "id": "saoudrizwan.claude-dev",
      "dir": "saoudrizwan.claude-dev-2.1.0",
      "version": "2.1.0",
      "name": "Cline"
    },
    {
      "id": "continue.continue",
      "dir": "continue.continue-0.8.5",
      "version": "0.8.5",
      "name": "Continue"
    }
  ],
  "capability": {
    "canLaunch": true,
    "canOpenFiles": true,
    "hasAIExtensions": true,
    "recommendedExtensions": ["cline", "continue"]
  }
}
```

### 5. Diagnostic Commands

**New Commands:**
```bash
# Verify VS Code installation
ai-memory-hub doctor --tool vscode

# List all detected editors
ai-memory-hub detect --editors

# Check extension status
ai-memory-hub vscode extensions

# Open project in VS Code
ai-memory-hub vscode open [path]

# Install recommended extension
ai-memory-hub vscode install-extension cline
```

### 6. Integration Points

**Dashboard:**
- Show VS Code status in tools panel
- Display installed AI extensions
- Quick launch buttons
- Extension installation links

**Dispatch:**
- Detect if project is already open in VS Code
- Option to open in VS Code after implementation
- Integration with Cline/Continue extensions

**Workflow:**
- Suggest VS Code for code review tasks
- Auto-open diffs in VS Code
- Launch VS Code with specific file/line

## Implementation Details

### Detection Priority

1. Check known installation paths
2. Query PATH for `code` command
3. Verify with `--version` flag
4. Scan extensions directory
5. Parse extension manifests for metadata

### Cross-Platform Support

**Windows:**
- User: `%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`
- System: `C:\Program Files\Microsoft VS Code\Code.exe`
- Config: `%APPDATA%\Code`
- Extensions: `%USERPROFILE%\.vscode\extensions`

**macOS:**
- App: `/Applications/Visual Studio Code.app`
- Config: `~/Library/Application Support/Code`
- Extensions: `~/.vscode/extensions`

**Linux:**
- Binary: `/usr/bin/code` or `/usr/share/code/bin/code`
- Config: `~/.config/Code`
- Extensions: `~/.vscode/extensions`

### Extension Metadata

Parse `package.json` from each extension:
```json
{
  "name": "claude-dev",
  "displayName": "Cline",
  "version": "2.1.0",
  "publisher": "saoudrizwan",
  "description": "Autonomous coding agent...",
  "categories": ["AI", "Programming Languages"]
}
```

## Benefits

1. **Better Detection** - Finds VS Code even if not in PATH
2. **Version Tracking** - Know which VS Code version is installed
3. **Extension Awareness** - See which AI tools are available
4. **Troubleshooting** - Diagnose VS Code integration issues
5. **Auto-Configuration** - Recommend and install extensions
6. **Workflow Integration** - Open files/projects from AMH

## Testing

```bash
# Test detection
npm test -- --grep "VS Code"

# Manual verification
ai-memory-hub detect | grep vscode
ai-memory-hub doctor --tool vscode --run-probes
```

## Migration

No breaking changes - enhanced data is additive. Existing code checking `tool.installed` continues to work.

## Future Enhancements

1. **Remote SSH Detection** - Detect remote workspaces
2. **Dev Containers** - Detect containerized development
3. **Extension Management** - Install/uninstall via CLI
4. **Workspace Detection** - Find open workspace folders
5. **Settings Sync** - Recommend AMH-friendly settings
6. **Language Server Integration** - Connect to VS Code LSP

## Related

- [Tool Detection System](../src/index.js#detectTools)
- [Runner Profiles](../src/index.js#getRunnerProfile)
- [Integration Capabilities](./capability-registry.md)
