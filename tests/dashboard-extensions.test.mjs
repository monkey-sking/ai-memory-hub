import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const srcRoot = path.join(repoRoot, "dashboard-next", "src");

async function readSource(relativePath) {
  return readFile(path.join(srcRoot, relativePath), "utf8");
}

// Returns the balanced `{ ... }` body that follows `marker` inside `source`.
function extractObjectBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing object literal: ${marker}`);
  const openingBrace = source.indexOf("{", start);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`Unbalanced object literal: ${marker}`);
}

// Splits the `const labels = { zh: {...}, en: {...} }` dictionary into its two locale bodies.
function splitLabelLocales(copyModule) {
  const labels = extractObjectBlock(copyModule, "const labels = {");
  return {
    zh: extractObjectBlock(labels, "\n  zh: {"),
    en: extractObjectBlock(labels, "\n  en: {")
  };
}

test("Extensions page is lazy-loaded and routed correctly", async () => {
  const app = await readSource("App.tsx");

  assert.match(app, /const\s+Extensions\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(['"]\.\/pages\/Extensions['"]\)\s*\)/);
  assert.match(app, /<Route\s+path="extensions"\s+element=\{<Extensions\s*\/>\}/);
});

test("Extensions page uses apiGet/apiPost from shared lib", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /from\s+['"]\.\.\/lib\/api['"]/);
  assert.match(extensions, /apiGet<[^>]+>\(['"]\/api\/extensions/);
  assert.match(extensions, /apiPost\(['"]\/api\/extensions\/(diff|sync|import|remove)['"]/);
  assert.match(extensions, /apiGet<[^>]+>\(['"]\/api\/extensions\/status['"]/);
});

test("Extensions page imports tool metadata for app icons", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /from\s+['"]\.\.\/lib\/toolMetadata['"]/);
  assert.match(extensions, /toolIconFiles/);
  assert.match(extensions, /toolDisplayNames/);
});

test("Extensions page defines all four target apps", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /const\s+APPS\s*=\s*\[['"]claude['"],\s*['"]codex['"],\s*['"]gemini['"],\s*['"]opencode['"]\]/);
});

test("Extensions page supports app selector toggle", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /function\s+toggleApp/);
  assert.match(extensions, /setSelectedApps/);
  assert.match(extensions, /extensions-app-btn/);
  assert.match(extensions, /extensions-app-icon/);
});

test("Extensions page has preview diff and apply sync flow", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /function\s+runDiff/);
  assert.match(extensions, /function\s+runSync/);
  assert.match(extensions, /showPreview/);
  assert.match(extensions, /diffPreview/);
  assert.match(extensions, /groupedDiffChanges/);
  assert.match(extensions, /previewApply/);
});

test("Extensions page displays conflict status with appropriate styling", async () => {
  const extensions = await readSource("pages/Extensions.tsx");
  assert.match(extensions, /conflictCount/);
  assert.match(extensions, /copy\.extensions\.conflicts/);
  assert.match(extensions, /action === 'conflict'/);
});

test("Extensions page has client status display", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /function\s+ClientStatus/);
  assert.match(extensions, /diagnostics/);
  assert.match(extensions, /copy\.extensions\.detected/);
});

test("Extensions page supports remove action with confirmation", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /removeExtension/);
  assert.match(extensions, /apiPost.*extensions\/remove/);
  assert.match(extensions, /copy\.extensions\.remove/);
  assert.match(extensions, /removeTarget/);
  assert.match(extensions, /copy\.extensions\.confirmYes/);
});

test("Extensions page has filter and search functionality", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /kindFilter/);
  assert.match(extensions, /kindFilterValue/);
  assert.match(extensions, /id: ['"]extensions-search['"]/);
  assert.match(extensions, /filteredRecords/);
});

test("Extensions page has i18n support for zh/en", async () => {
  const extensions = await readSource("pages/Extensions.tsx");
  const copyModule = await readSource("lib/dashboardCopy.ts");

  // The page reads its language from the app shell and resolves every string
  // through the centralized dictionary instead of inline `language === 'zh' ? ...` ternaries.
  assert.match(extensions, /from\s+['"]\.\.\/lib\/dashboardCopy['"]/);
  assert.match(extensions, /const\s*\{\s*language\s*\}\s*=\s*useOutletContext<AppOutletContext>\(\)/);
  assert.match(extensions, /const\s+copy\s*=\s*dashboardLabels\[language\]/);
  assert.match(extensions, /copy\.extensions\./);
  assert.doesNotMatch(extensions, /language\s*===\s*['"]zh['"]\s*\?/);

  // Both locales must actually carry the `extensions` section of the dictionary.
  const { zh, en } = splitLabelLocales(copyModule);
  const zhExtensions = extractObjectBlock(zh, "extensions: {");
  const enExtensions = extractObjectBlock(en, "extensions: {");
  for (const key of ["title", "subtitle", "openSkillsPage", "applyElsePreview"]) {
    assert.match(zhExtensions, new RegExp(`\\b${key}:\\s*'[^']+'`), `zh extensions copy missing ${key}`);
    assert.match(enExtensions, new RegExp(`\\b${key}:\\s*'[^']+'`), `en extensions copy missing ${key}`);
  }
  assert.notEqual(zhExtensions, enExtensions);
});

test("Extensions page imports from shared UI components", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /from\s+['"]\.\.\/components\/ui\/button['"]/);
  assert.match(extensions, /Card/);
  assert.match(extensions, /from\s+['"]\.\.\/components\/ui\/badge['"]/);
});

test("Extensions CSS has responsive breakpoints for mobile", async () => {
  const css = await readSource("index.css");
  assert.match(css, /@media/);
  assert.match(css, /var\(--/);
});

test("Extensions CSS uses design tokens from root", async () => {
  const css = await readSource("index.css");

  assert.match(css, /var\(--border\)|var\(--color-line\)/);
  assert.match(css, /var\(--[a-z-]+\)/);

  // The design tokens in src/index.css are raw hex values, so `hsl(var(--token))`
  // is invalid CSS and the whole declaration gets silently dropped by the browser.
  assert.doesNotMatch(css, /hsl\(var\(--/);
});

test("Sidebar includes Extensions navigation link", async () => {
  const sidebar = await readSource("components/Layout.tsx");

  assert.match(sidebar, /extensions/);
  assert.match(sidebar, /icon:\s*(Plug|Blocks)/);
  assert.match(sidebar, /label:\s*\{\s*zh:\s*['"]扩展['"],\s*en:\s*['"]Extensions['"]/);
});

test("Extensions page keeps MCP and Skill surfaces separate", async () => {
  const extensions = await readSource("pages/Extensions.tsx");
  const copyModule = await readSource("lib/dashboardCopy.ts");

  assert.match(extensions, /kindFilterValue/);
  assert.match(extensions, /kindFilter/);
  assert.match(extensions, /'mcp'/);

  // The "go manage Skills elsewhere" signpost now lives in the shared copy dictionary.
  assert.match(extensions, /copy\.extensions\.skillManagement/);
  const { zh, en } = splitLabelLocales(copyModule);
  assert.match(extractObjectBlock(en, "extensions: {"), /openSkillsPage:\s*'[^']*Skills page[^']*'/);
  assert.match(extractObjectBlock(zh, "extensions: {"), /openSkillsPage:\s*'[^']*Skills[^']*'/);
});

test("Extensions page has preview vs apply toggle", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  const copyModule = await readSource("lib/dashboardCopy.ts");

  assert.match(extensions, /previewApply/);
  assert.match(extensions, /setPreviewApply/);
  assert.match(extensions, /setPreviewApply/);

  // The toggle label moved into the shared copy dictionary; the page renders it via `copy.`.
  assert.match(extensions, /copy\.extensions\.applyElsePreview/);
  const { zh, en } = splitLabelLocales(copyModule);
  assert.match(extractObjectBlock(en, "extensions: {"), /applyElsePreview:\s*'Apply \(else preview only\)'/);
  assert.match(extractObjectBlock(zh, "extensions: {"), /applyElsePreview:\s*'[^']+'/);
});

test("Extensions page shows diff counts for add/conflict/current", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /addCount/);
  assert.match(extensions, /conflictCount/);
  assert.match(extensions, /currentCount/);
  assert.match(extensions, /copy\.extensions\.toAdd/);
});

test("Extensions page shows managed extension count", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /managedCount/);
  assert.match(extensions, /copy\.extensions\.unmanaged/);
});

test("Extensions page has Status sub-component for per-app display", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /function\s+ClientStatus\(/);
  assert.match(extensions, /client\.managed/);
  assert.match(extensions, /notDetected/);
});
