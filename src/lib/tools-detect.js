// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { normalizeToolName } from "./dispatch.js";
import { getSafeStaticRelativePath } from "./http.js";
import { projectRoot } from "./paths.js";
import { getContentType } from "./util.js";

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

export function getLocalInstallTargets(cwd, memoryDir) {
  return [
    {
      tool: "codex",
      file: path.join(cwd, "AGENTS.md"),
      template: readTemplate("AGENTS.md")
    },
    {
      tool: "codex-app",
      file: path.join(cwd, "AGENTS.md"),
      template: readTemplate("AGENTS.md")
    },
    {
      tool: "claude",
      file: path.join(cwd, "CLAUDE.md"),
      template: readTemplate("CLAUDE.md")
    },
    {
      tool: "claude-desktop",
      file: path.join(cwd, "CLAUDE.md"),
      template: readTemplate("CLAUDE.md")
    },
    {
      tool: "gemini",
      file: path.join(cwd, "GEMINI.md"),
      template: readTemplate("GEMINI.md")
    },
    {
      tool: "antigravity",
      file: path.join(cwd, "GEMINI.md"),
      template: readTemplate("GEMINI.md")
    },
    {
      tool: "antigravity-cockpit",
      file: path.join(cwd, "GEMINI.md"),
      template: readTemplate("GEMINI.md")
    },
    {
      tool: "antigravity-gemini",
      file: path.join(cwd, "GEMINI.md"),
      template: readTemplate("GEMINI.md")
    },
    {
      tool: "cursor",
      file: path.join(cwd, ".cursorrules"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "windsurf",
      file: path.join(cwd, ".windsurfrules"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "cline",
      file: path.join(cwd, ".clinerules"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "roo-code",
      file: path.join(cwd, ".clinerules"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "aider",
      file: path.join(cwd, ".aider.instructions.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "mimocode",
      file: path.join(cwd, ".mimocode", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("MIMOCODE_SKILL.md")
    },
    {
      tool: "grok",
      file: path.join(cwd, "AGENTS.md"),
      template: readTemplate("AGENTS.md")
    },
    {
      tool: "vscode",
      file: path.join(cwd, ".github", "copilot-instructions.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "chatgpt",
      file: path.join(cwd, "CHATGPT.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "ollama",
      file: path.join(cwd, "OLLAMA.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "cherry-studio",
      file: path.join(cwd, "CHERRY_STUDIO.md"),
      template: readTemplate("shared-instructions.md")
    }
  ];
}

export function getInstallTargets(memoryDir) {
  const home = os.homedir();
  return [
    {
      tool: "codex",
      file: path.join(home, ".codex", "AGENTS.md"),
      template: readTemplate("AGENTS.md")
    },
    {
      tool: "claude",
      file: path.join(home, ".claude", "CLAUDE.md"),
      template: readTemplate("CLAUDE.md")
    },
    {
      tool: "gemini",
      file: path.join(home, ".gemini", "GEMINI.md"),
      template: readTemplate("GEMINI.md")
    },
    {
      tool: "codebuddy",
      file: path.join(home, ".codebuddy", "CODEBUDDY.md"),
      template: readTemplate("AGENTS.md")
    },
    {
      tool: "codebuddy",
      file: path.join(memoryDir, "tools", "codebuddy-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "antigravity",
      file: path.join(memoryDir, "tools", "antigravity-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "antigravity-cockpit",
      file: path.join(memoryDir, "tools", "antigravity-cockpit-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "antigravity-gemini",
      file: path.join(memoryDir, "tools", "antigravity-gemini-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "cc-switch",
      file: path.join(memoryDir, "tools", "cc-switch-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "codex-app",
      file: path.join(memoryDir, "tools", "codex-app-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    {
      tool: "marvis",
      file: path.join(home, "AppData", "Roaming", "Tencent", "Marvis", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("MARVIS_SKILL.md")
    },
    {
      tool: "qclaw",
      file: path.join(home, ".qclaw", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("QCLAW_SKILL.md")
    },
    {
      tool: "coze",
      file: path.join(home, ".coze", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("COZE_SKILL.md")
    },
    {
      tool: "openclaw",
      file: path.join(home, ".openclaw", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("OPENCLAW_SKILL.md")
    },
    {
      tool: "opencode",
      file: path.join(home, ".config", "opencode", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("OPENCODE_SKILL.md")
    },
    {
      tool: "mimocode",
      file: path.join(home, ".config", "mimocode", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("MIMOCODE_SKILL.md")
    },
    {
      tool: "grok",
      file: path.join(home, ".grok", "AGENTS.md"),
      template: readTemplate("AGENTS.md")
    },
    {
      tool: "grok",
      file: path.join(home, ".grok", "skills", "ai-memory-hub", "SKILL.md"),
      template: readTemplate("GROK_SKILL.md")
    },
    {
      tool: "grok",
      file: path.join(memoryDir, "tools", "grok-shared-memory.md"),
      template: readTemplate("shared-instructions.md")
    },
    ...[
      "claude-desktop",
      "cursor",
      "windsurf",
      "vscode",
      "continue",
      "cline",
      "roo-code",
      "trae",
      "kiro",
      "zed",
      "chatgpt",
      "ollama",
      "lmstudio",
      "jan",
      "anythingllm",
      "cherry-studio",
      "dify",
      "open-webui",
      "aider",
      "tabby",
      "codeium",
      "augment",
      "supermaven"
    ].map((tool) => ({
      tool,
      file: path.join(memoryDir, "tools", `${tool}-shared-memory.md`),
      template: readTemplate("shared-instructions.md")
    }))
  ];
}

export function renderDashboard() {
  const indexPath = path.join(getDashboardStaticRoot(), "index.html");
  if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
    return fs.readFileSync(indexPath, "utf8");
  }
  return readTemplate("dashboard-v2.html");
}

export function getInstructionIncludeFiles(memoryDir) {
  const targets = [
    ...getInstallTargets(memoryDir),
    ...getLocalInstallTargets(process.cwd(), memoryDir)
  ];
  const files = new Set();
  for (const target of targets) {
    if (target.file) {
      files.add(path.resolve(target.file));
    }
  }
  return [...files].sort();
}

export function getInstallTargetForTool(memoryDir, toolName, installTargets) {
  const targets = installTargets || getInstallTargets(memoryDir);
  return targets.find((target) => target.tool === toolName) || null;
}

export function sendStaticFile(res, pathname) {
  const publicDir = getDashboardStaticRoot();
  const relativePath = getSafeStaticRelativePath(pathname);
  if (!relativePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  const filePath = path.join(publicDir, relativePath);
  const normalizedFilePath = path.resolve(filePath);
  const normalizedPublicDir = path.resolve(publicDir);

  if (!normalizedFilePath.startsWith(normalizedPublicDir + path.sep) && normalizedFilePath !== normalizedPublicDir) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(normalizedFilePath) || !fs.statSync(normalizedFilePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(normalizedFilePath);
  const contentTypeMap = {
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".html": "text/html; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
  };

  res.writeHead(200, {
    "Content-Type": contentTypeMap[ext] || "text/plain",
    "Cache-Control": "public, max-age=3600"
  });
  fs.createReadStream(normalizedFilePath).pipe(res);
}

export function sendStaticAsset(res, pathname) {
  const publicDir = getDashboardStaticRoot();
  const relativePath = getSafeStaticRelativePath(pathname);
  if (!relativePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  const assetPath = path.join(publicDir, relativePath);
  const assetsRoot = path.join(publicDir, "assets");
  const normalizedAssetPath = path.resolve(assetPath);
  const normalizedAssetsRoot = path.resolve(assetsRoot);

  if (!normalizedAssetPath.startsWith(normalizedAssetsRoot + path.sep) && normalizedAssetPath !== normalizedAssetsRoot) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(normalizedAssetPath) || !fs.statSync(normalizedAssetPath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": getContentType(normalizedAssetPath),
    "Cache-Control": "public, max-age=31536000, immutable"
  });
  fs.createReadStream(normalizedAssetPath).pipe(res);
}
