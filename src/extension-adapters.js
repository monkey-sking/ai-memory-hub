import fs from "node:fs/promises";
import path from "node:path";
import { normalizeMcpServer } from "./extension-registry.js";
import { parseToml, stringifyToml, TOMLError } from "./toml-lite.js";

const APP_CONFIGS = {
  claude: {
    configRel: [".claude.json"],
    mcpKey: "mcpServers",
    skillDir: [".claude", "skills"],
    format: "json",
  },
  gemini: {
    configRel: [".gemini", "settings.json"],
    mcpKey: "mcpServers",
    skillDir: [".gemini", "skills"],
    format: "json",
  },
  opencode: {
    configRel: [".config", "opencode", "opencode.json"],
    mcpKey: "mcp",
    skillDir: [".config", "opencode", "skills"],
    format: "json",
  },
  codex: {
    configRel: [".codex", "config.toml"],
    mcpKey: "mcp_servers",
    skillDir: [".agents", "skills"],
    format: "toml",
  },
};

const SUPPORTED_APPS = Object.keys(APP_CONFIGS);

function resolveConfigPath(app, homeDir) {
  return path.join(homeDir, ...APP_CONFIGS[app].configRel);
}

function resolveSkillDir(app, homeDir) {
  return path.join(homeDir, ...APP_CONFIGS[app].skillDir);
}

async function readConfigSafe(filePath, format) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (format === "toml") {
      try {
        return { value: parseToml(raw), diagnostics: [] };
      } catch (e) {
        return {
          value: {},
          diagnostics: [{ level: "error", message: e.message, path: filePath, code: e.code }],
        };
      }
    }
    return { value: JSON.parse(raw), diagnostics: [] };
  } catch (e) {
    if (e.code === "ENOENT") return { value: {}, diagnostics: [] };
    return {
      value: {},
      diagnostics: [{ level: "error", message: e.message, path: filePath }],
    };
  }
}

function normalizeEntry(id, raw, app) {
  const knownServerKeys = new Set([
    "type",
    "command",
    "args",
    "env",
    "url",
    "headers",
    "extra",
  ]);
  const extra = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!knownServerKeys.has(k)) extra[k] = v;
  }

  const server = { ...raw };
  if (Object.keys(extra).length) server.extra = extra;

  const normalized = normalizeMcpServer(server);
  return {
    id,
    kind: "mcp",
    server: normalized,
    apps: { [app]: true },
    managed: false,
    updatedAt: new Date().toISOString(),
  };
}

function flattenTomlServers(value, prefix = "") {
  const out = [];
  for (const [key, child] of Object.entries(value || {})) {
    const id = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && (child.command || child.url || child.type)) out.push([id, child]);
    else if (child && typeof child === "object") out.push(...flattenTomlServers(child, id));
  }
  return out;
}
async function scanSkillDir(skillDir) {
  const records = [];
  const diagnostics = [];
  let entries;
  try {
    entries = await fs.readdir(skillDir, { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT") return { records, diagnostics };
    diagnostics.push({ level: "error", message: e.message, path: skillDir });
    return { records, diagnostics };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(skillDir, entry.name, "SKILL.md");
    try {
      const content = await fs.readFile(skillFile, "utf8");
      const titleMatch = content.match(/^#\s+(.+)/m);
      const descMatch = content.match(/^>\s*(.+)/m);
      records.push({
        id: entry.name,
        kind: "skill",
        source: { type: "local", path: skillFile },
        title: titleMatch ? titleMatch[1].trim() : entry.name,
        description: descMatch ? descMatch[1].trim() : "",
        managed: false,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      if (e.code !== "ENOENT") {
        diagnostics.push({
          level: "warn",
          message: `Failed to read ${skillFile}: ${e.message}`,
          path: skillFile,
        });
      }
    }
  }
  return { records, diagnostics };
}

export function createAdapter({ app, homeDir }) {
  if (!SUPPORTED_APPS.includes(app)) {
    throw new Error(
      `Unsupported app: ${app}. Supported: ${SUPPORTED_APPS.join(", ")}`
    );
  }

  const configFile = resolveConfigPath(app, homeDir);
  const skillDirectory = resolveSkillDir(app, homeDir);
  const mcpKey = APP_CONFIGS[app].mcpKey;
  let diagnostics = [];

  return {
    app,
    getMcpPath() {
      return configFile;
    },
    getSkillPath() {
      return skillDirectory;
    },
    getDiagnostics() {
      return [...diagnostics];
    },

    async readMcp() {
      diagnostics = [];
      const format = APP_CONFIGS[app].format;
      const { value, diagnostics: readDiags } = await readConfigSafe(configFile, format);
      diagnostics.push(...readDiags);

      const rawEntries = APP_CONFIGS[app].format === "toml" ? Object.fromEntries(flattenTomlServers(value[mcpKey] || {})) : (value[mcpKey] || {});
      const records = [];
      const unmanaged = [];

      for (const [id, raw] of Object.entries(rawEntries)) {
        try {
          records.push(normalizeEntry(id, raw, app));
        } catch (e) {
          diagnostics.push({
            level: "warn",
            message: `Invalid MCP entry "${id}": ${e.message}`,
            path: configFile,
          });
          unmanaged.push(id);
        }
      }

      return {
        records,
        unmanaged,
        diagnostics: [...diagnostics],
        _raw: value,
      };
    },

    async writeMcp(records, { apply = false, managed = null } = {}) {
      const current = await this.readMcp();
      const raw = current._raw || {};
      const format = APP_CONFIGS[app].format;

      if (!raw[mcpKey]) raw[mcpKey] = {};

      const managedSet =
        managed instanceof Set
          ? managed
          : new Set(records.filter((r) => r.managed !== false).map((r) => r.id));

      for (const record of records) {
        if (managedSet.has(record.id)) {
          raw[mcpKey][record.id] = record.server;
        }
      }

      if (!apply) {
        return {
          applied: false,
          file: configFile,
          records,
          raw,
        };
      }

      await fs.mkdir(path.dirname(configFile), { recursive: true });

      const timestamp = Date.now();
      const baseName = path.basename(configFile);
      const backupPath = path.join(
        path.dirname(configFile),
        `backup_${timestamp}_${baseName}`
      );

      try {
        await fs.copyFile(configFile, backupPath);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }

      const tmpPath = `${configFile}.${process.pid}.${timestamp}.tmp`;
      const content = format === "toml" ? stringifyToml(raw) : JSON.stringify(raw, null, 2) + "\n";
      await fs.writeFile(tmpPath, content);
      await fs.rename(tmpPath, configFile);

      return {
        applied: true,
        file: configFile,
        backup: backupPath,
        records,
      };
    },

    async readSkills() {
      diagnostics = [];
      const { records, diagnostics: scanDiags } = await scanSkillDir(
        skillDirectory
      );
      diagnostics.push(...scanDiags);
      return { records, diagnostics: [...diagnostics] };
    },

    async writeSkills(_records, { apply = false } = {}) {
      if (!apply) {
        return { applied: false, dir: skillDirectory };
      }
      await fs.mkdir(skillDirectory, { recursive: true });
      return { applied: true, dir: skillDirectory };
    },
  };
}
