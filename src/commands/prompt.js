// prompt — `prompt` command group: template CRUD, render, and version history.
// Extracted from the index.js monolith (v2.8) as a self-contained command module.
//
// Cross-cutting deps (config resolution, hub bootstrap, file lock) are injected
// via the `deps` object so this module stays free of index.js internals and the
// giant file's function-hoisting collisions — same DI pattern as commands/events.js.
import path from "node:path";
import fs from "node:fs";
import nunjucks from "nunjucks";
import { positionalArgs, getOption, createId, ensureDir } from "../lib/cli.js";
import { readEvents } from "../lib/io.js";
import { normalizePrompt } from "../lib/entity-models.js";
import { writeFileAtomic } from "../atomic-write.js";
import { appendJsonl } from "../event-writer.js";

// Prompt template system

function getPromptsFile(memoryDir) {
  return path.join(memoryDir, "prompts", "templates.jsonl");
}

function getPromptVersionsFile(memoryDir) {
  return path.join(memoryDir, "prompts", "versions.jsonl");
}

function readPrompts(memoryDir) {
  const file = getPromptsFile(memoryDir);
  if (!fs.existsSync(file)) return [];
  return readEvents(file).map(normalizePrompt).filter((p) => p.id);
}

function createPrompt({ name, type, content, variables, description, createdBy }) {
  const now = new Date().toISOString();
  const cleanName = String(name || "").trim();
  const cleanType = String(type || "general").trim();
  const id = createId(`prompt:${cleanName}:${cleanType}`);
  return {
    id,
    createdAt: now,
    updatedAt: now,
    createdBy: String(createdBy || "manual"),
    name: cleanName,
    type: cleanType,
    description: String(description || ""),
    content: String(content || ""),
    variables: Array.isArray(variables) ? variables : [],
    version: 1
  };
}

function findPromptIndex(prompts, id) {
  const lower = id.toLowerCase();
  return prompts.findIndex((p) =>
    p.id === id || p.id.toLowerCase() === lower || p.id.toLowerCase().startsWith(lower)
  );
}

function updatePrompt(memoryDir, id, updater) {
  const prompts = readPrompts(memoryDir);
  const index = findPromptIndex(prompts, id);
  if (index === -1) {
    throw new Error(`Prompt not found: ${id}`);
  }
  const old = prompts[index];
  const updated = normalizePrompt(updater(old));
  if (updated.version === old.version) {
    updated.version = old.version + 1;
  }
  updated.updatedAt = new Date().toISOString();
  prompts[index] = updated;
  writePrompts(memoryDir, prompts);

  // Save version history
  const versionsFile = getPromptVersionsFile(memoryDir);
  appendJsonl(versionsFile, {
    promptId: old.id,
    version: old.version,
    content: old.content,
    variables: old.variables,
    snapshotAt: new Date().toISOString(),
    updatedBy: updated.createdBy
  });

  return updated;
}

function writePrompts(memoryDir, prompts) {
  const file = getPromptsFile(memoryDir);
  ensureDir(path.dirname(file));
  const lines = prompts.map((p) => JSON.stringify(normalizePrompt(p))).join("\n") + "\n";
  writeFileAtomic(file, lines, "utf8");
}

function deletePrompt(memoryDir, id) {
  const prompts = readPrompts(memoryDir);
  const index = findPromptIndex(prompts, id);
  if (index === -1) {
    throw new Error(`Prompt not found: ${id}`);
  }
  const removed = prompts.splice(index, 1)[0];
  writePrompts(memoryDir, prompts);

  // Record deletion in versions
  const versionsFile = getPromptVersionsFile(memoryDir);
  appendJsonl(versionsFile, {
    promptId: removed.id,
    version: removed.version,
    action: "deleted",
    snapshotAt: new Date().toISOString()
  });

  return removed;
}

function renderPrompt(template, variables) {
  const env = new nunjucks.Environment();
  try {
    return env.renderString(template, variables || {});
  } catch (err) {
    throw new Error(`Template render error: ${err.message}`);
  }
}

function extractVariables(content) {
  const regex = /\{\{\s*(\w+)\s*\}\}/g;
  const vars = new Set();
  let match;
  while ((match = regex.exec(content)) !== null) {
    vars.add(match[1]);
  }
  return [...vars];
}

function getPromptVersions(memoryDir, promptId) {
  const versionsFile = getPromptVersionsFile(memoryDir);
  if (!fs.existsSync(versionsFile)) return [];
  return readEvents(versionsFile).filter((v) => v.promptId === promptId);
}

function promptCommand(argv, deps) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "create":
      return promptCreateCommand(actionArgs, deps);
    case "list":
      return promptListCommand(actionArgs, deps);
    case "get":
      return promptGetCommand(actionArgs, deps);
    case "update":
      return promptUpdateCommand(actionArgs, deps);
    case "delete":
    case "rm":
      return promptDeleteCommand(actionArgs, deps);
    case "render":
      return promptRenderCommand(actionArgs, deps);
    case "versions":
      return promptVersionsCommand(actionArgs, deps);
    default:
      throw new Error("Usage: ai-memory-hub prompt <create|list|get|update|delete|render|versions> ...");
  }
}

function promptCreateCommand(argv, deps) {
  const { loadConfig, ensureHub, withHubLock } = deps;
  const name = positionalArgs(argv).join(" ").trim();
  if (!name) {
    throw new Error('Usage: ai-memory-hub prompt create <name> --type prd --file template.njk [--description text]');
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const type = getOption(argv, "--type") || "general";
  const filePath = getOption(argv, "--file") || "";
  const description = getOption(argv, "--description") || "";
  const createdBy = getOption(argv, "--from") || getOption(argv, "--by") || "manual";

  let content = "";
  if (filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Template file not found: ${resolved}`);
    }
    content = fs.readFileSync(resolved, "utf8");
  } else {
    content = getOption(argv, "--content") || "";
  }

  if (!content) {
    throw new Error("Template content is required. Use --file <path> or --content <text>.");
  }

  const variables = extractVariables(content);

  return withHubLock(config.memoryDir, "prompt-create", () => {
    const prompts = readPrompts(config.memoryDir);
    const prompt = createPrompt({ name, type, content, variables, description, createdBy });
    prompts.push(prompt);
    writePrompts(config.memoryDir, prompts);
    console.log(JSON.stringify(prompt, null, 2));
  }, config.sync.lockStaleMs);
}

function promptListCommand(argv, deps) {
  const { loadConfig, ensureHub } = deps;
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const type = getOption(argv, "--type") || "";
  const limit = Number(getOption(argv, "--limit") || 50);
  let prompts = readPrompts(config.memoryDir);
  if (type) {
    prompts = prompts.filter((p) => p.type === type);
  }
  prompts = prompts
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, limit);
  console.log(JSON.stringify(prompts, null, 2));
}

function promptGetCommand(argv, deps) {
  const { loadConfig, ensureHub } = deps;
  const id = positionalArgs(argv)[0] || getOption(argv, "--id") || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub prompt get <id-or-name>");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const prompts = readPrompts(config.memoryDir);
  const index = findPromptIndex(prompts, id);
  if (index === -1) {
    throw new Error(`Prompt not found: ${id}`);
  }
  console.log(JSON.stringify(prompts[index], null, 2));
}

function promptUpdateCommand(argv, deps) {
  const { loadConfig, ensureHub, withHubLock } = deps;
  const id = positionalArgs(argv)[0] || getOption(argv, "--id") || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub prompt update <id> --file template.njk");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const filePath = getOption(argv, "--file") || "";
  const name = getOption(argv, "--name") || "";
  const type = getOption(argv, "--type") || "";
  const description = getOption(argv, "--description");

  return withHubLock(config.memoryDir, "prompt-update", () => {
    const updated = updatePrompt(config.memoryDir, id, (prompt) => {
      const result = { ...prompt };
      if (name) result.name = name;
      if (type) result.type = type;
      if (description !== null && description !== undefined) result.description = description;
      if (filePath) {
        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) {
          throw new Error(`Template file not found: ${resolved}`);
        }
        result.content = fs.readFileSync(resolved, "utf8");
      } else {
        const content = getOption(argv, "--content");
        if (content) result.content = content;
      }
      result.variables = extractVariables(result.content);
      return result;
    });
    console.log(JSON.stringify(updated, null, 2));
  }, config.sync.lockStaleMs);
}

function promptDeleteCommand(argv, deps) {
  const { loadConfig, ensureHub, withHubLock } = deps;
  const id = positionalArgs(argv)[0] || getOption(argv, "--id") || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub prompt delete <id>");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  return withHubLock(config.memoryDir, "prompt-delete", () => {
    const removed = deletePrompt(config.memoryDir, id);
    console.log(JSON.stringify({ ok: true, deleted: removed }, null, 2));
  }, config.sync.lockStaleMs);
}

function promptRenderCommand(argv, deps) {
  const { loadConfig, ensureHub } = deps;
  const id = positionalArgs(argv)[0] || getOption(argv, "--id") || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub prompt render <id> --vars '{\"key\":\"value\"}'");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const prompts = readPrompts(config.memoryDir);
  const index = findPromptIndex(prompts, id);
  if (index === -1) {
    throw new Error(`Prompt not found: ${id}`);
  }
  const prompt = prompts[index];
  let variables = {};
  const varsJson = getOption(argv, "--vars") || "";
  if (varsJson) {
    try {
      variables = JSON.parse(varsJson);
    } catch (err) {
      throw new Error(`Invalid --vars JSON: ${err.message}`);
    }
  }
  const rendered = renderPrompt(prompt.content, variables);
  console.log(rendered);
}

function promptVersionsCommand(argv, deps) {
  const { loadConfig, ensureHub } = deps;
  const id = positionalArgs(argv)[0] || getOption(argv, "--id") || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub prompt versions <id>");
  }
  const config = loadConfig();
  ensureHub(config.memoryDir);
  const prompts = readPrompts(config.memoryDir);
  const index = findPromptIndex(prompts, id);
  if (index === -1) {
    throw new Error(`Prompt not found: ${id}`);
  }
  const versions = getPromptVersions(config.memoryDir, prompts[index].id);
  console.log(JSON.stringify(versions, null, 2));
}

export { promptCommand, renderPrompt, extractVariables, findPromptIndex, createPrompt };
