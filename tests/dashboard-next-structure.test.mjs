import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const srcRoot = path.join(repoRoot, "dashboard-next", "src");

async function readSource(relativePath) {
  return readFile(path.join(srcRoot, relativePath), "utf8");
}

function extractCssBlock(source, atRule) {
  const start = source.indexOf(atRule);
  assert.notEqual(start, -1, `Missing CSS at-rule: ${atRule}`);
  const openingBrace = source.indexOf("{", start);
  assert.notEqual(openingBrace, -1, `Missing opening brace for: ${atRule}`);

  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  assert.fail(`Unbalanced CSS block: ${atRule}`);
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

  assert.match(chat, /apiGet<[^>]+>\(['"]\/api\/tools['"]\)/);
  assert.match(chat, /tools\.map\(/);
  assert.match(chat, /formatRadioReceipt\(/);
  assert.match(chat, /textOf\(message\.text/);
  assert.doesNotMatch(chat, /<option value=['"]claude['"]>claude<\/option>/);
  assert.doesNotMatch(chat, /radio:\$\{textOf\(message\.id,\s*['"]sent['"]\)\}\s*->\s*\$\{to\}/);
});

test("Task cards keep primary actions visible and move review actions into a menu", async () => {
  const tasks = await readSource("components/TasksPanel.tsx");
  const css = await readSource("pages/Dashboard.css");

  assert.match(tasks, /function\s+TaskActionMenu/);
  assert.match(tasks, /aria-haspopup=['"]menu['"]/);
  assert.match(tasks, /aria-expanded=\{open\}/);
  assert.match(tasks, /aria-controls=\{menuId\}/);
  assert.match(tasks, /role=['"]menu['"]/);
  assert.match(tasks, /role=['"]menuitem['"]/);
  assert.match(tasks, /event\.key\s*===\s*['"]Escape['"]/);
  assert.match(tasks, /setOpen\(false\)/);
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
  const toastStack = await readSource("components/ToastStack.tsx");

  assert.match(dashboard, /type\s+ToastMessage\s*=/);
  assert.match(dashboard, /const\s+showToast\s*=\s*useCallback/);
  assert.match(dashboard, /from\s+['"]\.\.\/components\/ToastStack['"]/);
  assert.match(toastStack, /export\s+function\s+ToastStack/);
  assert.match(toastStack, /aria-live=['"]polite['"]/);
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
  const tasks = await readSource("components/TasksPanel.tsx");
  const copyModule = await readSource("lib/dashboardCopy.ts");

  assert.match(tasks, /key:\s*['"]radio-request['"]/);
  assert.match(tasks, /\/api\/radio\/send/);
  assert.match(tasks, /thread:\s*id/);
  assert.match(tasks, /replyTo:\s*id/);
  assert.match(tasks, /copy\.sendRadioRequest/);
  assert.match(copyModule, /sendRadioRequest/);
});

test("Dashboard visual contract keeps the light shell hierarchy and readable labels", async () => {
  const sidebar = await readSource("components/Sidebar.tsx");
  const header = await readSource("components/DashboardHeader.tsx");
  const css = await readSource("pages/Dashboard.css");

  assert.match(sidebar, /sidebar-nav-label/);
  assert.match(sidebar, /AI Memory Hub/);
  assert.match(header, /AI MEMORY HUB \/ CONSOLE/);

  assert.match(css, /\.dashboard-grid\b/);
  assert.match(css, /\.empty-state\b/);
  assert.match(css, /\.status-badge\b/);
  const cssWithAccentToken = css.replaceAll("var(--accent)", "--accent:");
  assert.match(cssWithAccentToken, /(^|[\s;{])--accent\s*:/);

  const uppercaseFieldOrHeaderRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector, declarations]) =>
      /(?:\.field\b|\bth\b)/.test(selector) && /text-transform\s*:\s*uppercase/.test(declarations)
    );
  assert.deepEqual(uppercaseFieldOrHeaderRules, []);
});

test("Dashboard keeps the overview-first section order", async () => {
  const dashboard = await readSource("pages/Dashboard.tsx");

  assert.match(dashboard, /overview-section/);
  assert.match(dashboard, /dashboard-grid/);
  assert.match(dashboard, /metric-card/);
  assert.match(dashboard, /panel-grid two/);
  assert.ok(dashboard.indexOf("overview-section") < dashboard.indexOf("panel-grid two"));
});

test("Dashboard overview empty states retain an actionable recovery path", async () => {
  const dashboard = await readSource("pages/Dashboard.tsx");

  assert.match(dashboard, /className="empty-state overview-empty-state"/);
  for (const emptyState of [
    "overviewNoFailures",
    "overviewNoMessages",
    "overviewNoTasks",
    "overviewNoWorkflows",
    "overviewNoTools"
  ]) {
    assert.match(
      dashboard,
      new RegExp(`OverviewEmptyState[\\s\\S]{0,180}text=\\{copy\\.${emptyState}\\}[\\s\\S]{0,160}actionLabel=\\{copy\\.refresh\\}[\\s\\S]{0,120}onAction=\\{onRefresh\\}`)
    );
  }
});

test("task and workflow cards expose readable operational hierarchy", async () => {
  const tasks = await readSource("components/TasksPanel.tsx");
  const workflows = await readSource("components/WorkflowsPanel.tsx");
  const css = await readSource("pages/Dashboard.css");
  const copy = await readSource("lib/dashboardCopy.ts");

  assert.match(tasks, /task-card-top/);
  assert.match(tasks, /task-meta-grid/);
  assert.match(workflows, /workflow-card-header/);
  assert.match(tasks, /status-badge/);
  assert.match(workflows, /status-badge/);
  assert.match(tasks, /task-action-menu/);
  assert.match(css, /\.task-card:hover/);
  assert.match(css, /\.workflow-card/);
  assert.match(copy, /statusLabels/);

  assert.match(
    tasks,
    /className="task-card-top"[\s\S]{0,220}className="task-card-title"[\s\S]{0,180}<StatusBadge\s+status=\{status\}/
  );
});

test("task actions protect terminal states and keep dialog feedback visible", async () => {
  const tasks = await readSource("components/TasksPanel.tsx");
  const css = await readSource("pages/Dashboard.css");

  assert.match(tasks, /const\s+canReview\s*=\s*!\['cancelled',\s*'done'\]\.includes\(status\)/);
  assert.match(tasks, /if\s*\(canReview\)\s*\{[\s\S]{0,260}key:\s*'rejected'/);
  assert.match(tasks, /DialogContent[\s\S]{0,1600}\{error\s*\?\s*<div\s+role="alert"/);
  assert.match(css, /\.status-badge\.priority-high/);
  assert.match(css, /\.status-badge\.priority-urgent/);
});

test("cancelled task cards do not offer reopen actions", async () => {
  const tasks = await readSource("components/TasksPanel.tsx");

  assert.match(tasks, /\{status === 'done'\s*\?\s*<Button[\s\S]{0,180}\{copy\.reopen\}/);
  assert.doesNotMatch(tasks, /\['done', 'cancelled'\]\.includes\(status\)[\s\S]{0,180}\{copy\.reopen\}/);
  assert.match(tasks, /\{status === 'cancelled'\s*\?\s*<p className="task-terminal-note">\{copy\.cancelledTerminal\}<\/p>\s*:\s*<TaskActionMenu/);
});

test("Dashboard keeps responsive grids and compact actions on narrow screens", async () => {
  const dashboardCss = await readSource("pages/Dashboard.css");
  const sidebarCss = await readSource("components/Sidebar.css");
  const sidebar = await readSource("components/Sidebar.tsx");
  const mobileDashboard = extractCssBlock(dashboardCss, "@media (max-width: 720px)");

  assert.match(dashboardCss, /@media\s*\(\s*max-width:\s*720px\s*\)/);
  assert.match(mobileDashboard, /\.header-actions\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(mobileDashboard, /\.btn\s*\{[\s\S]*?flex:\s*0\s+1\s+auto;/);
  assert.match(mobileDashboard, /\.dashboard-grid,[\s\S]*?\.panel-grid,[\s\S]*?\.form-grid,[\s\S]*?\.filter-strip,[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.doesNotMatch(mobileDashboard, /\.form-actions\s+\.btn\s*\{[\s\S]*?width:\s*100%/);
  assert.doesNotMatch(mobileDashboard, /\.workflow-actions\s+\.btn[\s\S]*?width:\s*100%/);

  const mobileSidebar = extractCssBlock(sidebarCss, "@media (max-width: 768px)");
  assert.match(mobileSidebar, /\.sidebar-desktop-nav\s*\{\s*display:\s*none;/);
  assert.match(mobileSidebar, /\.sidebar-mobile-more-menu\s*\{[\s\S]*?max-height:[\s\S]*?overflow:\s*auto;/);
  assert.match(mobileSidebar, /height:\s*calc\(64px\s*\+\s*env\(safe-area-inset-bottom\)\)/);
  assert.match(mobileSidebar, /padding:\s*0\s+8px\s+env\(safe-area-inset-bottom\)/);
  assert.match(mobileSidebar, /\.sidebar\s*~\s*\.main-content\s*\{[\s\S]*?padding-bottom:\s*calc\(64px\s*\+\s*env\(safe-area-inset-bottom\)\)/);
  assert.match(sidebar, /const\s+primaryItems\s*=\s*navGroups\[0\]\.items/);
  assert.match(sidebar, /primaryItems\.map\(/);
  assert.match(sidebar, /aria-expanded=\{isMoreOpen\}/);
  assert.match(sidebar, /<nav id="sidebar-more-menu"[\s\S]*?aria-label="More navigation"/);
});
