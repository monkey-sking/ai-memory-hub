import { getOption } from "../lib/cli.js";
import { extractQualityGate, normalizeQualityGate } from "../lib/entity-models.js";

// recipe command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function recipeCommand(argv, deps) {
  const action = argv[0] || "list";
  switch (action) {
    case "list":
      return recipeListCommand(argv.slice(1), deps);
    case "show":
      return recipeShowCommand(argv.slice(1), deps);
    case "create":
      return recipeCreateCommand(argv.slice(1), deps);
    case "validate":
      return recipeValidateCommand(argv.slice(1), deps);
    default:
      throw new Error(`Unknown recipe action: ${action}\nTry: ai-memory-hub recipe list|show|create|validate`);
  }
}

export function recipeListCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const recipes = deps.listRecipes(config.memoryDir);
  console.log(JSON.stringify(recipes, null, 2));
}

export function recipeShowCommand(argv, deps) {
  const recipeName = argv[0] || "";

  if (!recipeName) {
    throw new Error("Usage: ai-memory-hub recipe show <recipe-name>");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const recipe = deps.readRecipe(config.memoryDir, recipeName);

  if (!recipe) {
    throw new Error(`Recipe not found: ${recipeName}`);
  }

  console.log(JSON.stringify(recipe, null, 2));
}

export function recipeCreateCommand(argv, deps) {
  const recipeName = getOption(argv, "--recipe") || "";
  const project = getOption(argv, "--project") || "";
  const toolsStr = getOption(argv, "--tools") || "";

  if (!recipeName || !toolsStr) {
    throw new Error("Usage: ai-memory-hub recipe create --recipe <name> --tools role1:tool1,role2:tool2 [--project <name>] [--var key=value]");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  // Parse tool mapping: "analyzer:claude,writer:codex,reviewer:gemini"
  const toolMapping = {};
  toolsStr.split(",").forEach((pair) => {
    const [role, tool] = pair.split(":").map((s) => s.trim());
    if (role && tool) {
      toolMapping[role] = tool;
    }
  });

  // Parse variables: --var priority=high --var scope=docs
  const variables = { project };
  argv.forEach((arg, idx) => {
    if (arg === "--var" && argv[idx + 1]) {
      const [key, value] = argv[idx + 1].split("=").map((s) => s.trim());
      if (key && value) {
        variables[key] = value;
      }
    }
  });

  const result = deps.createWorkflowFromRecipe(config.memoryDir, recipeName, toolMapping, variables);

  console.log(JSON.stringify({
    workflow: result.workflow,
    tasks: result.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      assignee: t.assignee,
      recipeStep: t.recipeStep || null,
      qualityGate: t.qualityGate || null
    })),
    recipe: {
      name: result.recipe.name,
      steps: result.recipe.steps.length,
      qualityGate: normalizeQualityGate(extractQualityGate(result.recipe))
    }
  }, null, 2));
}

export function recipeValidateCommand(argv, deps) {
  const recipeName = argv[0] || "";

  if (!recipeName) {
    throw new Error("Usage: ai-memory-hub recipe validate <recipe-name>");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const recipe = deps.readRecipe(config.memoryDir, recipeName);

  if (!recipe) {
    throw new Error(`Recipe not found: ${recipeName}`);
  }

  const validation = deps.validateRecipe(recipe);

  if (validation.valid) {
    console.log(JSON.stringify({ valid: true, message: "Recipe is valid" }, null, 2));
  } else {
    console.log(JSON.stringify({ valid: false, error: validation.error }, null, 2));
    process.exit(1);
  }
}
