import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeToolName } from "./dispatch.js";
import { execSync } from "node:child_process";
import { projectRoot } from "./paths.js";

export function readDiscoveredModels(memoryDir, tool) {
  const cacheFile = path.join(memoryDir, "state", "tool-models.json");
  if (!fs.existsSync(cacheFile)) {
    return [];
  }
  try {
    const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    const name = normalizeToolName(tool);
    return Array.isArray(cache[name]?.models) ? cache[name].models : [];
  } catch {
    return [];
  }
}

export function detectVSCodeEnhanced() {
  const home = os.homedir();
  const platform = process.platform;

  // Detect config/data directories
  const configDir = platform === 'win32'
    ? path.join(home, 'AppData', 'Roaming', 'Code')
    : platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', 'Code')
    : path.join(home, '.config', 'Code');

  const extensionsDir = platform === 'win32'
    ? path.join(home, '.vscode', 'extensions')
    : path.join(home, '.vscode', 'extensions');

  // Try to find executable
  const candidates = [];
  if (platform === 'win32') {
    candidates.push(
      path.join(home, 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe'),
      path.join(home, 'AppData', 'Local', 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
      'C:\\Program Files\\Microsoft VS Code\\Code.exe',
      'C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe'
    );
  } else if (platform === 'darwin') {
    candidates.push(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code'
    );
  } else {
    candidates.push(
      '/usr/bin/code',
      '/usr/share/code/bin/code',
      '/usr/local/bin/code'
    );
  }

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
      const whereCmd = platform === 'win32' ? 'where code' : 'which code';
      const result = execSync(whereCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      const lines = result.split('\n').filter(Boolean);
      if (lines.length > 0) {
        executablePath = lines[0].trim();
      }
    } catch (e) {
      // code not in PATH
    }
  }

  // Get version if executable found
  let version = null;
  if (executablePath) {
    try {
      const result = execSync(`"${executablePath}" --version`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 5000
      });
      const lines = result.split('\n').filter(Boolean);
      if (lines.length > 0) {
        version = lines[0].trim();
      }
    } catch (e) {
      // Version check failed
    }
  }

  // Detect AI extensions
  const extensions = [];
  const aiExtensionMap = {
    'saoudrizwan.claude-dev': 'Cline',
    'continue.continue': 'Continue',
    'rooveterinaryinc.roo-cline': 'Roo-Code',
    'github.copilot': 'GitHub Copilot',
    'codeium.codeium': 'Codeium',
    'tabnine.tabnine-vscode': 'Tabnine'
  };

  if (fs.existsSync(extensionsDir)) {
    try {
      const extensionDirs = fs.readdirSync(extensionsDir);
      for (const [extId, extName] of Object.entries(aiExtensionMap)) {
        const matches = extensionDirs.filter(d => d.startsWith(extId));
        if (matches.length > 0) {
          const dirName = matches[0];
          const versionMatch = dirName.match(/-(\d+\.\d+\.\d+)$/);
          extensions.push({
            id: extId,
            name: extName,
            dir: dirName,
            version: versionMatch ? versionMatch[1] : 'unknown'
          });
        }
      }
    } catch (e) {
      // Failed to read extensions directory
    }
  }

  const installed = fs.existsSync(configDir);
  const verified = Boolean(executablePath && version);

  return {
    name: 'vscode',
    kind: 'editor-state',
    installed,
    verified,
    executablePath: executablePath || null,
    version: version || null,
    configDir,
    extensionsDir,
    extensions,
    capability: {
      canLaunch: verified,
      canOpenFiles: verified,
      hasAIExtensions: extensions.length > 0,
      aiExtensionCount: extensions.length
    }
  };
}

export function getDashboardStaticRoot() {
  const publicDir = path.join(projectRoot(), "public");
  if (fs.existsSync(publicDir) && fs.statSync(publicDir).isDirectory()) {
    return publicDir;
  }
  return path.join(projectRoot(), "dashboard-next", "dist");
}

export function readTemplate(name) {
  return fs.readFileSync(path.join(projectRoot(), "templates", name), "utf8");
}
