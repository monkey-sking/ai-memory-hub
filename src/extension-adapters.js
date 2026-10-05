import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
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

function unwrapMcpEntry(raw = {}) {
  if (raw.command || raw.url || raw.httpUrl || raw.type) {
    return { ...raw, url: raw.url || raw.httpUrl };
  }
  const nested = Object.values(raw).filter(value => value && typeof value === "object" && !Array.isArray(value));
  if (nested.length === 1) return unwrapMcpEntry(nested[0]);
  return raw;
}

function ccSwitchDbPath(homeDir) {
  return path.join(homeDir, ".cc-switch", "cc-switch.db");
}

function readCcSwitchMcp(app, homeDir) {
  const dbPath = ccSwitchDbPath(homeDir);
  const enabledColumn = "enabled_" + app;
  if (!existsSync(dbPath)) return { records: [], diagnostics: [] };
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db.prepare("SELECT id, name, server_config FROM mcp_servers WHERE " + enabledColumn + " = 1").all();
      const records = []; const diagnostics = [];
      for (const row of rows) {
        try {
          const server = normalizeMcpServer(unwrapMcpEntry(JSON.parse(row.server_config)));
          records.push({ id: String(row.id), kind: "mcp", server, apps: { [app]: true }, managed: false, source: { type: "cc-switch", path: dbPath }, title: row.name || row.id });
        } catch (error) { diagnostics.push({ level: "warn", message: "Invalid cc-switch MCP entry \"" + row.id + "\": " + error.message, path: dbPath }); }
      }
      return { records, diagnostics };
    } finally { db.close(); }
  } catch (error) {
    if (error.code === "ENOENT") return { records: [], diagnostics: [] };
    return { records: [], diagnostics: [{ level: "warn", message: "Unable to read cc-switch MCP database: " + error.message, path: dbPath }] };
  }
}

function normalizeEntry(id, raw, app) {
  raw = unwrapMcpEntry(raw);
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

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableValue(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function tomlHeader(line) {
  const match = line.trim().match(/^\[(.+)\]$/);
  return match ? match[1].trim() : null;
}

function headerTargetsServer(header, mcpKey, id) {
  const bases = [`${mcpKey}.${id}`, `${mcpKey}."${id}"`, `${mcpKey}.'${id}'`];
  return bases.some((base) => header === base || header.startsWith(`${base}.`));
}

function renderTomlServer(mcpKey, id, server) {
  const root = {};
  const parts = [mcpKey, ...String(id).split(".")];
  let node = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    node[parts[index]] = {};
    node = node[parts[index]];
  }
  node[parts[parts.length - 1]] = server;
  return stringifyToml(root).trimEnd();
}

// Replace only the changed mcp_servers tables. The rest of a Codex config stays
// byte-for-byte, including comments and sections this parser does not model.
function patchTomlMcpServers(original, mcpKey, previousMap, nextMap) {
  const previous = previousMap || {};
  const next = nextMap || {};
  const dirty = new Set();
  for (const id of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (stableValue(previous[id]) !== stableValue(next[id])) dirty.add(id);
  }
  if (dirty.size === 0) return original;

  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = original.split(/\r?\n/);
  if (original.endsWith("\n") || original.endsWith("\r\n")) lines.pop();
  const kept = [];
  for (let index = 0; index < lines.length; index += 1) {
    const header = tomlHeader(lines[index]);
    const id = header ? [...dirty].find((candidate) => headerTargetsServer(header, mcpKey, candidate)) : null;
    if (!id) {
      kept.push(lines[index]);
      continue;
    }
    index += 1;
    while (index < lines.length) {
      const nextHeader = tomlHeader(lines[index]);
      if (nextHeader && !headerTargetsServer(nextHeader, mcpKey, id)) break;
      index += 1;
    }
    index -= 1;
  }

  let text = kept.join(newline);
  const additions = [...dirty].filter((id) => next[id] != null).sort().map((id) => renderTomlServer(mcpKey, id, next[id]));
  if (additions.length) {
    if (text.length && !text.endsWith(newline)) text += newline;
    if (text.trim().length) text += newline;
    text += additions.join(`${newline}${newline}`) + newline;
  } else if (text.length && !text.endsWith(newline)) {
    text += newline;
  }
  return text;
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

      const ccSwitch = readCcSwitchMcp(app, homeDir);
      diagnostics.push(...ccSwitch.diagnostics);
      for (const record of ccSwitch.records) {
        if (!records.some((current) => current.id === record.id)) records.push(record);
      }

      return {
        records,
        unmanaged,
        diagnostics: [...diagnostics],
        _raw: value,
      };
    },

    async writeMcp(records, { apply = false, managed = null, removeIds = [] } = {}) {
      const current = await this.readMcp();
      // A failed parse yields _raw = {}. Rewriting that would erase the real file.
      const blocking = (current.diagnostics || []).filter((item) => item.level === "error");
      if (apply && blocking.length) {
        const error = new Error(
          `Refusing to rewrite ${configFile}: ${blocking.map((item) => item.message).join("; ")}`
        );
        error.code = "AMH_CONFIG_PARSE";
        throw error;
      }
      const raw = current._raw || {};
      const format = APP_CONFIGS[app].format;
      const previousMcp = structuredClone(raw[mcpKey] && typeof raw[mcpKey] === "object" ? raw[mcpKey] : {});
      const nextMcp = structuredClone(previousMcp);
      const removed = new Set(removeIds.map((id) => String(id)));
      for (const id of removed) delete nextMcp[id];

      const managedSet =
        managed instanceof Set
          ? managed
          : new Set(records.filter((r) => r.managed !== false).map((r) => r.id));

      for (const record of records) {
        if (managedSet.has(record.id) && !removed.has(record.id)) {
          nextMcp[record.id] = record.server;
        }
      }
      raw[mcpKey] = nextMcp;

      if (!apply) {
        return {
          applied: false,
          file: configFile,
          records,
          raw,
        };
      }

      if (stableValue(previousMcp) === stableValue(nextMcp)) {
        return { applied: false, unchanged: true, file: configFile, records };
      }

      let original = null;
      try {
        original = await fs.readFile(configFile, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const content = format === "toml"
        ? patchTomlMcpServers(original || "", mcpKey, previousMcp, nextMcp)
        : JSON.stringify(raw, null, 2) + "\n";
      if (original != null && content === original) {
        return { applied: false, unchanged: true, file: configFile, records };
      }

      await fs.mkdir(path.dirname(configFile), { recursive: true });

      const timestamp = Date.now();
      const baseName = path.basename(configFile);
      const backupPath = path.join(
        path.dirname(configFile),
        `backup_${timestamp}_${baseName}`
      );

      if (original != null) await fs.copyFile(configFile, backupPath);

      const tmpPath = `${configFile}.${process.pid}.${timestamp}.tmp`;
      await fs.writeFile(tmpPath, content);
      await fs.rename(tmpPath, configFile);

      return {
        applied: true,
        file: configFile,
        backup: original != null ? backupPath : undefined,
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


