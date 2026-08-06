import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseToml, stringifyToml, TOMLError } from "../src/toml-lite.js";
import { createAdapter } from "../src/extension-adapters.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function tempDir() {
  return fs.mkdtemp(path.join(repoRoot, ".tmp-amh-codex-test-"));
}

test("parseToml: basic key-value pairs", () => {
  const toml = `command = "npx"
args = ["-y", "@upstash/context7-mcp"]`;
  const result = parseToml(toml);
  assert.equal(result.command, "npx");
  assert.deepEqual(result.args, ["-y", "@upstash/context7-mcp"]);
});

test("parseToml: sections and subsections", () => {
  const toml = `[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.context7.env]
KEY = "value"`;
  const result = parseToml(toml);
  assert.equal(result.mcp_servers.context7.command, "npx");
  assert.deepEqual(result.mcp_servers.context7.args, ["-y", "@upstash/context7-mcp"]);
  assert.equal(result.mcp_servers.context7.env.KEY, "value");
});

test("parseToml: comments and empty lines ignored", () => {
  const toml = `# This is a comment
[mcp_servers]

  # Another comment
[mcp_servers.context7]
command = "npx"`;
  const result = parseToml(toml);
  assert.equal(result.mcp_servers.context7.command, "npx");
});

test("parseToml: boolean values", () => {
  const toml = `enabled = true
disabled = false`;
  const result = parseToml(toml);
  assert.equal(result.enabled, true);
  assert.equal(result.disabled, false);
});

test("parseToml: empty array", () => {
  const toml = `args = []`;
  const result = parseToml(toml);
  assert.deepEqual(result.args, []);
});

test("parseToml: rejects invalid header", () => {
  const toml = `[invalid header]
key = "value"`;
  assert.throws(() => parseToml(toml), TOMLError);
});

test("parseToml: rejects invalid line", () => {
  const toml = `invalid line`;
  assert.throws(() => parseToml(toml), TOMLError);
});

test("parseToml: unclosed array", () => {
  const toml = `args = ["a", "b"`;
  assert.throws(() => parseToml(toml), TOMLError);
});

test("stringifyToml: basic object", () => {
  const obj = { command: "npx", args: ["-y", "@upstash/context7-mcp"] };
  const result = stringifyToml(obj);
  assert.match(result, /command = "npx"/);
  assert.match(result, /args = \["-y", "@upstash\/context7-mcp"\]/);
});

test("stringifyToml: nested sections", () => {
  const obj = {
    mcp_servers: {
      context7: {
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        env: { KEY: "value" },
      },
    },
  };
  const result = stringifyToml(obj);
  assert.match(result, /\[mcp_servers\.context7\]/);
  assert.match(result, /\[mcp_servers\.context7\.env\]/);
  assert.match(result, /command = "npx"/);
  assert.match(result, /KEY = "value"/);
});

test("stringifyToml: empty object", () => {
  const result = stringifyToml({});
  assert.equal(result, "\n");
});

test("stringifyToml: boolean values", () => {
  const obj = { enabled: true, disabled: false };
  const result = stringifyToml(obj);
  assert.match(result, /enabled = true/);
  assert.match(result, /disabled = false/);
});

test("round-trip: parse then stringify produces equivalent TOML", () => {
  const original = `[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.context7.env]
KEY = "value"`;
  const parsed = parseToml(original);
  const stringified = stringifyToml(parsed);
  const reparsed = parseToml(stringified);
  assert.deepEqual(reparsed, parsed);
});

test("round-trip: complex config with multiple servers", () => {
  const original = `[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.context7.env]
API_KEY = "secret"

[mcp_servers.filesystem]
command = "node"
args = ["fs-server.js"]

[mcp_servers.filesystem.env]
ROOT = "/home/user"`;
  const parsed = parseToml(original);
  const stringified = stringifyToml(parsed);
  const reparsed = parseToml(stringified);
  assert.equal(reparsed.mcp_servers.context7.command, "npx");
  assert.equal(reparsed.mcp_servers.filesystem.command, "node");
  assert.equal(reparsed.mcp_servers.context7.env.API_KEY, "secret");
  assert.equal(reparsed.mcp_servers.filesystem.env.ROOT, "/home/user");
});

test("round-trip: preserves unrelated TOML sections", () => {
  const original = `[general]
name = "my-codex"
debug = true

[mcp_servers.context7]
command = "npx"

[other_section]
key = "value"`;
  const parsed = parseToml(original);
  const stringified = stringifyToml(parsed);
  assert.match(stringified, /\[general\]/);
  assert.match(stringified, /name = "my-codex"/);
  assert.match(stringified, /debug = true/);
  assert.match(stringified, /\[other_section\]/);
  assert.match(stringified, /key = "value"/);
});

test("Codex adapter: reads MCP servers from TOML", async () => {
  const home = await tempDir();
  try {
    const codexDir = path.join(home, ".codex");
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      path.join(codexDir, "config.toml"),
      `[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.context7.env]
API_KEY = "secret"
`
    );

    const adapter = createAdapter({ app: "codex", homeDir: home });
    const result = await adapter.readMcp();
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].id, "context7");
    assert.equal(result.records[0].server.command, "npx");
    assert.deepEqual(result.records[0].server.args, ["-y", "@upstash/context7-mcp"]);
    assert.equal(result.records[0].server.env.API_KEY, "secret");
    assert.equal(result.diagnostics.length, 0);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("Codex adapter: missing file returns empty array", async () => {
  const home = await tempDir();
  try {
    const adapter = createAdapter({ app: "codex", homeDir: home });
    const result = await adapter.readMcp();
    assert.equal(result.records.length, 0);
    assert.equal(result.diagnostics.length, 0);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("Codex adapter: malformed TOML returns diagnostics", async () => {
  const home = await tempDir();
  try {
    const codexDir = path.join(home, ".codex");
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      path.join(codexDir, "config.toml"),
      `[invalid header with spaces]
key = "value"
`
    );

    const adapter = createAdapter({ app: "codex", homeDir: home });
    const result = await adapter.readMcp();
    assert.equal(result.records.length, 0);
    assert.ok(result.diagnostics.length > 0);
    assert.equal(result.diagnostics[0].level, "error");
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("Codex adapter: writes MCP servers to TOML", async () => {
  const home = await tempDir();
  try {
    const codexDir = path.join(home, ".codex");
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      path.join(codexDir, "config.toml"),
      `[general]
name = "my-codex"
`
    );

    const adapter = createAdapter({ app: "codex", homeDir: home });
    const records = [
      {
        id: "context7",
        server: {
          command: "npx",
          args: ["-y", "@upstash/context7-mcp"],
          env: { API_KEY: "secret" },
        },
      },
    ];

    const result = await adapter.writeMcp(records, { apply: true });
    assert.equal(result.applied, true);

    const content = await fs.readFile(path.join(codexDir, "config.toml"), "utf8");
    assert.match(content, /\[general\]/);
    assert.match(content, /name = "my-codex"/);
    assert.match(content, /\[mcp_servers\.context7\]/);
    assert.match(content, /command = "npx"/);
    assert.match(content, /API_KEY = "secret"/);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("Codex adapter: hostile IDs handled correctly", async () => {
  const home = await tempDir();
  try {
    const codexDir = path.join(home, ".codex");
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      path.join(codexDir, "config.toml"),
      `[mcp_servers.valid-id]
command = "npx"

[mcp_servers.another_valid-id]
command = "node"

[mcp_servers._private]
command = "underscore"
`
    );

    const adapter = createAdapter({ app: "codex", homeDir: home });
    const result = await adapter.readMcp();
    assert.equal(result.records.length, 3);
    assert.equal(result.records[0].id, "valid-id");
    assert.equal(result.records[1].id, "another_valid-id");
    assert.equal(result.records[2].id, "_private");
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("Codex adapter: array args preserved correctly", async () => {
  const home = await tempDir();
  try {
    const codexDir = path.join(home, ".codex");
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      path.join(codexDir, "config.toml"),
      `[mcp_servers.complex]
command = "node"
args = ["-r", "ts-node/register", "src/server.ts", "--port", "3000"]
`
    );

    const adapter = createAdapter({ app: "codex", homeDir: home });
    const result = await adapter.readMcp();
    assert.equal(result.records.length, 1);
    assert.deepEqual(result.records[0].server.args, [
      "-r",
      "ts-node/register",
      "src/server.ts",
      "--port",
      "3000",
    ]);

    await adapter.writeMcp(result.records, { apply: true });
    const content = await fs.readFile(path.join(codexDir, "config.toml"), "utf8");
    assert.match(
      content,
      /args = \["-r", "ts-node\/register", "src\/server.ts", "--port", "3000"\]/
    );
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("Codex adapter: nested env object handled", async () => {
  const home = await tempDir();
  try {
    const codexDir = path.join(home, ".codex");
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      path.join(codexDir, "config.toml"),
      `[mcp_servers.server1]
command = "npx"

[mcp_servers.server1.env]
API_KEY = "key1"
SECRET = "secret1"
DEBUG = "true"
`
    );

    const adapter = createAdapter({ app: "codex", homeDir: home });
    const result = await adapter.readMcp();
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].server.env.API_KEY, "key1");
    assert.equal(result.records[0].server.env.SECRET, "secret1");
    assert.equal(result.records[0].server.env.DEBUG, "true");
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("Codex adapter: preserves unrelated TOML sections on write", async () => {
  const home = await tempDir();
  try {
    const codexDir = path.join(home, ".codex");
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      path.join(codexDir, "config.toml"),
      `[general]
name = "my-codex"
debug = true

[mcp_servers.existing]
command = "old-command"
`
    );

    const adapter = createAdapter({ app: "codex", homeDir: home });
    const records = [
      {
        id: "new-server",
        server: {
          command: "new-command",
          args: ["--verbose"],
        },
      },
    ];

    await adapter.writeMcp(records, { apply: true });
    const content = await fs.readFile(path.join(codexDir, "config.toml"), "utf8");
    assert.match(content, /\[general\]/);
    assert.match(content, /name = "my-codex"/);
    assert.match(content, /debug = true/);
    assert.match(content, /\[mcp_servers\.existing\]/);
    assert.match(content, /command = "old-command"/);
    assert.match(content, /\[mcp_servers\.new-server\]/);
    assert.match(content, /command = "new-command"/);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("Codex adapter: skill path is ~/.agents/skills", () => {
  const home = "/test/home";
  const adapter = createAdapter({ app: "codex", homeDir: home });
  assert.equal(adapter.getSkillPath(), path.join(home, ".agents", "skills"));
});

test("Codex adapter: config path is ~/.codex/config.toml", () => {
  const home = "/test/home";
  const adapter = createAdapter({ app: "codex", homeDir: home });
  assert.equal(adapter.getMcpPath(), path.join(home, ".codex", "config.toml"));
});
