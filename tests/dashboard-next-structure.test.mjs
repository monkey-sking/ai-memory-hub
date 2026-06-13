import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const srcRoot = path.join(repoRoot, "dashboard-next", "src");

async function readSource(relativePath) {
  return readFile(path.join(srcRoot, relativePath), "utf8");
}

test("React dashboard routes are code split at the route boundary", async () => {
  const app = await readSource("App.tsx");

  assert.match(app, /import\s+\{\s*lazy\s*,\s*Suspense\s*\}\s+from\s+['"]react['"]/);
  assert.match(app, /const\s+Dashboard\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(['"]\.\/pages\/Dashboard['"]\)\s*\)/);
  assert.match(app, /const\s+Chat\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(['"]\.\/pages\/Chat['"]\)\s*\)/);
  assert.match(app, /<Suspense\s+fallback=\{<RouteFallback\s*\/>\}>/);
  assert.doesNotMatch(app, /import\s+Dashboard\s+from\s+['"]\.\/pages\/Dashboard['"]/);
  assert.doesNotMatch(app, /import\s+Chat\s+from\s+['"]\.\/pages\/Chat['"]/);
});

test("Dashboard copy and tool metadata live outside the page component", async () => {
  const dashboard = await readSource("pages/Dashboard.tsx");
  const copyModule = await readSource("lib/dashboardCopy.ts");
  const toolModule = await readSource("lib/toolMetadata.ts");

  assert.match(dashboard, /from\s+['"]\.\.\/lib\/dashboardCopy['"]/);
  assert.match(dashboard, /from\s+['"]\.\.\/lib\/toolMetadata['"]/);
  assert.doesNotMatch(dashboard, /const\s+labels\s*=/);
  assert.doesNotMatch(dashboard, /const\s+toolIconFiles\s*=/);
  assert.doesNotMatch(dashboard, /const\s+toolKinds\s*=/);
  assert.doesNotMatch(dashboard, /const\s+toolDisplayNames\s*=/);

  assert.match(copyModule, /export\s+const\s+dashboardLabels/);
  assert.match(copyModule, /export\s+const\s+dashboardTitles/);
  assert.match(copyModule, /export\s+const\s+dashboardSubtitles/);
  assert.match(toolModule, /export\s+const\s+toolIconFiles/);
  assert.match(toolModule, /export\s+const\s+toolKinds/);
  assert.match(toolModule, /export\s+const\s+toolDisplayNames/);
});

test("Dashboard modal traps keyboard focus and exposes dialog semantics", async () => {
  const dashboard = await readSource("pages/Dashboard.tsx");

  assert.match(dashboard, /const\s+focusableSelectors\s*=/);
  assert.match(dashboard, /function\s+trapModalFocus/);
  assert.match(dashboard, /event\.key\s*===\s*['"]Escape['"]/);
  assert.match(dashboard, /event\.key\s*===\s*['"]Tab['"]/);
  assert.match(dashboard, /role=['"]dialog['"]/);
  assert.match(dashboard, /aria-modal=['"]true['"]/);
  assert.match(dashboard, /aria-labelledby=\{titleId\}/);
});

test("Chat uses detected tools and shows the returned radio content", async () => {
  const chat = await readSource("pages/Chat.tsx");

  assert.match(chat, /apiGet<[^>]+>\(['"]\/api\/tools\?refresh=1['"]\)/);
  assert.match(chat, /tools\.map\(/);
  assert.match(chat, /formatRadioReceipt\(/);
  assert.match(chat, /textOf\(message\.text/);
  assert.doesNotMatch(chat, /<option value=['"]claude['"]>claude<\/option>/);
  assert.doesNotMatch(chat, /radio:\$\{textOf\(message\.id,\s*['"]sent['"]\)\}\s*->\s*\$\{to\}/);
});

test("Task cards keep primary actions visible and move review actions into a menu", async () => {
  const dashboard = await readSource("pages/Dashboard.tsx");
  const css = await readSource("pages/Dashboard.css");

  assert.match(dashboard, /function\s+TaskActionMenu/);
  assert.match(dashboard, /aria-haspopup=['"]menu['"]/);
  assert.match(dashboard, /role=['"]menu['"]/);
  assert.match(dashboard, /role=['"]menuitem['"]/);
  assert.match(css, /\.task-action-menu/);
  assert.match(css, /\.task-action-menu-items/);
});

test("Dashboard hides empty filter dropdowns instead of rendering unusable selects", async () => {
  const dashboard = await readSource("pages/Dashboard.tsx");

  assert.match(dashboard, /function\s+FilterSelect/);
  assert.match(dashboard, /if\s*\(!options\.length\)\s*return\s+null/);
  assert.match(dashboard, /<FilterSelect[\s\S]+options=\{projectOptions\}/);
  assert.match(dashboard, /<FilterSelect[\s\S]+options=\{priorityOptions\}/);
  assert.match(dashboard, /<FilterSelect[\s\S]+options=\{senderOptions\}/);
});

test("Dashboard exposes a toast notification stack for async actions", async () => {
  const dashboard = await readSource("pages/Dashboard.tsx");
  const css = await readSource("pages/Dashboard.css");

  assert.match(dashboard, /type\s+ToastMessage\s*=/);
  assert.match(dashboard, /const\s+showToast\s*=\s*useCallback/);
  assert.match(dashboard, /function\s+ToastStack/);
  assert.match(dashboard, /aria-live=['"]polite['"]/);
  assert.match(dashboard, /<ToastStack\s+toasts=\{toasts\}/);
  assert.match(css, /\.toast-stack/);
  assert.match(css, /\.toast\./);
});

test("Memory panel supersedes records instead of editing the ledger directly", async () => {
  const dashboard = await readSource("pages/Dashboard.tsx");
  const copyModule = await readSource("lib/dashboardCopy.ts");

  assert.match(dashboard, /const\s+memoryRecords\s*=\s*asArray<AnyRecord>\(model\.memory\.records\)/);
  assert.match(dashboard, /supersedeMemory/);
  assert.match(dashboard, /\/api\/memory\/supersede/);
  assert.match(dashboard, /metadata\.supersedes/);
  assert.match(dashboard, /copy\.supersedeMemory/);
  assert.match(copyModule, /supersedeMemory/);
});

test("Radio messages can open compose as a threaded reply", async () => {
  const dashboard = await readSource("pages/Dashboard.tsx");
  const copyModule = await readSource("lib/dashboardCopy.ts");

  assert.match(dashboard, /replyTo:/);
  assert.match(dashboard, /startReply/);
  assert.match(dashboard, /replyTo:\s*textOf\(message\.id\)/);
  assert.match(dashboard, /thread:\s*textOf\(message\.thread\s*\|\|\s*message\.id\)/);
  assert.match(dashboard, /copy\.reply/);
  assert.match(copyModule, /reply:/);
});

test("Task menu includes a low-frequency radio request shortcut", async () => {
  const dashboard = await readSource("pages/Dashboard.tsx");
  const copyModule = await readSource("lib/dashboardCopy.ts");

  assert.match(dashboard, /key:\s*['"]radio-request['"]/);
  assert.match(dashboard, /\/api\/radio\/send/);
  assert.match(dashboard, /thread:\s*id/);
  assert.match(dashboard, /replyTo:\s*id/);
  assert.match(dashboard, /copy\.sendRadioRequest/);
  assert.match(copyModule, /sendRadioRequest/);
});
