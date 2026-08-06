import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const srcRoot = path.join(repoRoot, "dashboard-next", "src");

async function readSource(relativePath) {
  return readFile(path.join(srcRoot, relativePath), "utf8");
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
  assert.match(extensions, /extensions-preview-card/);
  assert.match(extensions, /extensions-diff-list/);
  assert.match(extensions, /previewApply/);
});

test("Extensions page displays conflict status with appropriate styling", async () => {
  const extensions = await readSource("pages/Extensions.tsx");
  const css = await readSource("pages/Extensions.css");

  assert.match(extensions, /conflictCount/);
  assert.match(extensions, /extensions-conflict-count/);
  assert.match(css, /\.extensions-conflict-count/);
  assert.match(css, /\.extensions-diff-conflict/);
});

test("Extensions page has client status display", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /extensions-status-grid/);
  assert.match(extensions, /extensions-status-card/);
  assert.match(extensions, /extensions-client-dot/);
  assert.match(extensions, /extensions-status-diagnostics/);
  assert.match(extensions, /function\s+Status/);
});

test("Extensions page supports remove action with confirmation", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /removeExtension/);
  assert.match(extensions, /apiPost.*extensions\/remove/);
  assert.match(extensions, /Remove/);
  assert.match(extensions, /removeTarget/);
  assert.match(extensions, /extensions-remove-confirm/);
});

test("Extensions page has filter and search functionality", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /kindFilter/);
  assert.match(extensions, /extensions-filter-btn/);
  assert.match(extensions, /extensions-search/);
  assert.match(extensions, /extensions-toolbar/);
});

test("Extensions page has i18n support for zh/en", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /useOutletContext<AppOutletContext>/);
  assert.match(extensions, /language\s*===\s*['"]zh['"]/);
  assert.match(extensions, /zh\s*\?\s*['"][^'"]+['"]\s*:\s*['"][^'"]+['"]/);
});

test("Extensions page imports from shared UI components", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /from\s+['"]\.\.\/components\/ui\/button['"]/);
  assert.match(extensions, /from\s+['"]\.\.\/components\/ui\/card['"]/);
  assert.match(extensions, /from\s+['"]\.\.\/components\/ui\/badge['"]/);
});

test("Extensions CSS has responsive breakpoints for mobile", async () => {
  const css = await readSource("pages/Extensions.css");

  assert.match(css, /@media\s*\(\s*max-width:\s*760px\s*\)/);
  assert.match(css, /\.extensions-page\s*\{\s*padding:\s*20px\s+16px/);
  assert.match(css, /\.extensions-header\s*\{\s*flex-direction:\s*column/);
  assert.match(css, /\.extensions-summary-grid\s*\{\s*grid-template-columns:\s*repeat\(2/);
  assert.match(css, /\.extensions-app-selector\s*\{\s*flex-direction:\s*column/);
  assert.match(css, /\.extensions-row-main\s*\{\s*flex-direction:\s*column/);
  assert.match(css, /\.extensions-status-grid\s*\{\s*grid-template-columns:\s*1fr/);
});

test("Extensions CSS uses design tokens from root", async () => {
  const css = await readSource("pages/Extensions.css");

  assert.match(css, /hsl\(var\(--border\)\)/);
  assert.match(css, /hsl\(var\(--muted-foreground\)\)/);
  assert.match(css, /hsl\(var\(--primary\)\)/);
  assert.match(css, /hsl\(var\(--accent\)\)/);
  assert.match(css, /hsl\(var\(--muted\)\)/);
});

test("Sidebar includes Extensions navigation link", async () => {
  const sidebar = await readSource("components/Sidebar.tsx");

  assert.match(sidebar, /to:\s*['"]\/extensions['"]/);
  assert.match(sidebar, /icon:\s*(Plug|Blocks)/);
  assert.match(sidebar, /label:\s*\{\s*zh:\s*['"]扩展['"],\s*en:\s*['"]Extensions['"]/);
});

test("Extensions page keeps MCP and Skill surfaces separate", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /kindFilterValue/);
  assert.match(extensions, /kindFilter/);
  assert.match(extensions, /'mcp'/);
  assert.match(extensions, /Skills page/);
});

test("Extensions page has preview vs apply toggle", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /previewApply/);
  assert.match(extensions, /setPreviewApply/);
  assert.match(extensions, /extensions-preview-toggle/);
  assert.match(extensions, /Apply \(else preview only\)/);
});

test("Extensions page shows diff counts for add/conflict/current", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /addCount/);
  assert.match(extensions, /conflictCount/);
  assert.match(extensions, /currentCount/);
  assert.match(extensions, /extensions-diff-count/);
});

test("Extensions page shows managed extension count", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /managedCount/);
  assert.match(extensions, /extensions-unmanaged/);
});

test("Extensions page has Status sub-component for per-app display", async () => {
  const extensions = await readSource("pages/Extensions.tsx");

  assert.match(extensions, /function\s+Status\(/);
  assert.match(extensions, /extensions-client-card/);
  assert.match(extensions, /extensions-client-header/);
  assert.match(extensions, /extensions-client-stats/);
  assert.match(extensions, /ext-status-good/);
  assert.match(extensions, /ext-status-missing/);
});



