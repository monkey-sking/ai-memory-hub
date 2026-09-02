// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./cli.js";

// 仓库根目录。从 src/index.js 搬到 src/lib/ 后相对深度变了：
// src/lib/paths.js -> dirname=src/lib -> "../.." = 仓库根（原来是 src/index.js -> ".."）
export function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function recipeReadLocations(memoryDir) {
  return [
    { source: "user", dir: path.join(memoryDir, "recipes") },
    { source: "builtin", dir: path.join(projectRoot(), "recipes") }
  ];
}

export function recipeListLocations(memoryDir) {
  return [
    { source: "builtin", dir: path.join(projectRoot(), "recipes") },
    { source: "user", dir: path.join(memoryDir, "recipes") }
  ];
}

export function readRecipe(memoryDir, recipeName) {
  for (const location of recipeReadLocations(memoryDir)) {
    const file = path.join(location.dir, `${recipeName}.json`);
    if (fs.existsSync(file)) {
      return readJson(file);
    }
  }
  return null;
}

export function listRecipes(memoryDir) {
  const recipes = new Map();
  for (const location of recipeListLocations(memoryDir)) {
    if (!fs.existsSync(location.dir)) {
      continue;
    }
    const files = fs.readdirSync(location.dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const recipe = readJson(path.join(location.dir, file));
        const name = recipe.name || path.basename(file, ".json");
        recipes.set(name, {
          name,
          title: recipe.title,
          description: recipe.description,
          version: recipe.version,
          source: location.source,
          roles: Object.keys(recipe.roles || {}),
          steps: (recipe.steps || []).length
        });
      } catch {
        // Skip malformed recipes; recipe validate reports details for explicit names.
      }
    }
  }
  return Array.from(recipes.values()).sort((a, b) => a.name.localeCompare(b.name));
}
