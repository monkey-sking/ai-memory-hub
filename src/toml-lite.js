/**
 * Narrow TOML reader/writer for Codex config.
 * Supports only the subset needed for ~/.codex/config.toml:
 * - [section] and [section.subsection] headers
 * - key = "string"
 * - key = [array] (array of strings)
 * - [section.key] for nested objects (like env)
 */

export function parseToml(text) {
  if (typeof text !== "string") throw new TypeError("Expected string input");
  const result = {};
  let current = result;
  const pathStack = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const headerMatch = trimmed.match(/^\[(.+)\]$/);
    if (headerMatch) {
      const header = headerMatch[1].trim();
      const parts = splitHeader(header);
      current = result;
      pathStack.length = 0;
      for (const part of parts) {
        if (!part) {
          throw new TOMLError(`Invalid header part: ${part}`, { line: i + 1 });
        }
        if (!current[part]) current[part] = {};
        current = current[part];
        pathStack.push(part);
      }
      continue;
    }
    const kvMatch = trimmed.match(/^("[^"]+"|'[^']+'|[a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
    if (!kvMatch) {
      throw new TOMLError(`Invalid line: ${trimmed}`, { line: i + 1 });
    }
    const keyToken = kvMatch[1].trim();
    const key = (keyToken.startsWith('"') || keyToken.startsWith("'")) ? keyToken.slice(1, -1) : keyToken;
    const rawValue = kvMatch[2].trim();
    const value = parseValue(rawValue, i + 1);
    current[key] = value;
  }
  return result;
}

function splitHeader(header) {
  const parts = [];
  let current = "";
  let quote = "";
  for (let i = 0; i < header.length; i += 1) {
    const ch = header[i];
    if ((ch === '"' || ch === "'") && header[i - 1] !== '\\') quote = quote ? (quote === ch ? "" : quote) : ch;
    if (ch === '.' && !quote) { parts.push(current.trim()); current = ""; }
    else current += ch;
  }
  if (quote) throw new TOMLError("Unclosed quoted header");
  if (current.trim()) parts.push(current.trim());
  return parts.map((part) => {
    const trimmed = part.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1).replace(/\\([\\'])/g, '$1');
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) throw new TOMLError("Invalid header part: " + trimmed);
    return trimmed;
  });
}
function parseValue(raw, line) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^".*"$/.test(raw)) return raw.slice(1, -1);
  if (/^\[/.test(raw)) {
    if (!raw.endsWith("]")) {
      throw new TOMLError("Unclosed array", { line });
    }
    const inner = raw.slice(1, -1).trim();
    if (inner === "") return [];
    const items = [];
    let current = "";
    let inQuote = false;
    let escape = false;
    for (const ch of inner) {
      if (escape) {
        current += ch;
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        current += ch;
        continue;
      }
      if (ch === '"') {
        inQuote = !inQuote;
        current += ch;
        continue;
      }
      if (ch === "," && !inQuote) {
        items.push(parseArrayItem(current.trim(), line));
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim()) items.push(parseArrayItem(current.trim(), line));
    return items;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parseArrayItem(raw, line) {
  if (/^".*"$/.test(raw)) return raw.slice(1, -1);
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export class TOMLError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "TOMLError";
    this.line = details.line;
    this.code = "TOML_PARSE_ERROR";
  }
}

export function stringifyToml(obj, indent = "  ") {
  if (typeof obj !== "object" || obj === null) throw new TypeError("Expected object input");
  const lines = [];

  function isScalarOrArray(v) {
    return v === null || v === undefined || typeof v !== "object" || Array.isArray(v);
  }

  function emit(section, prefix) {
    const scalarEntries = Object.entries(section).filter(([, v]) => isScalarOrArray(v));
    const tableEntries = Object.entries(section).filter(([, v]) => !isScalarOrArray(v));
    if (prefix) {
      lines.push(`[${prefix}]`);
      for (const [key, value] of scalarEntries) lines.push(`${key} = ${formatValue(value)}`);
      lines.push("");
    } else {
      for (const [key, value] of scalarEntries) lines.push(`${key} = ${formatValue(value)}`);
    }
    for (const [key, value] of tableEntries) emit(value, prefix ? `${prefix}.${key}` : key);
  }
  function formatValue(value) {
    if (value === null || value === undefined) return '""';
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return `"${value}"`;
    if (Array.isArray(value)) {
      if (value.length === 0) return "[]";
      const items = value.map((v) => formatValue(v));
      return `[${items.join(", ")}]`;
    }
    if (typeof value === "object") {
      const entries = Object.entries(value).map(([k, v]) => `${k} = ${formatValue(v)}`);
      return `{${entries.join(", ")}}`;
    }
    return `"${String(value)}"`;
  }

  emit(obj, "");
  return lines.join("\n") + "\n";
}

export function readTomlFile(file, fs) {
  return fs.readFile(file, "utf8").then(
    (content) => ({ value: parseToml(content), diagnostics: [] }),
    (err) =>
      err.code === "ENOENT"
        ? { value: {}, diagnostics: [] }
        : { value: {}, diagnostics: [{ code: "read_error", file, message: err.message }] }
  );
}

export function writeTomlFile(file, obj, fs, { backup = false } = {}) {
  return fs.mkdir(new URL(".", new URL(`file://${file}`)).pathname || ".", { recursive: true }).then(
    () => backup ? fs.copyFile(file, `${file}.${Date.now()}.bak`).catch(() => {}) : Promise.resolve()
  ).then(() => {
    const tmp = `${file}.${process.pid}.tmp`;
    return fs.writeFile(tmp, stringifyToml(obj)).then(() => fs.rename(tmp, file));
  });
}
