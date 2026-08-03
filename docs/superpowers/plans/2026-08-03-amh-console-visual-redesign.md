# AMH Console Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the AMH dashboard’s visual hierarchy around a light, airy, overview-first collaboration console without changing backend contracts.

**Architecture:** Keep the current React Router and Tailwind/Radix stack. Consolidate visual primitives in the existing dashboard stylesheet and shell components, then tune the Dashboard, Tasks, and Workflows views to consume those primitives. Preserve API/data-loading logic and make only presentation/copy mapping changes.

**Tech Stack:** React 19, TypeScript, React Router, Tailwind CSS 4, Radix UI, Lucide React, Vite, Node test runner.

---

### Task 1: Add regression checks for the approved visual contract

**Files:**
- Modify: `tests/dashboard-next-structure.test.mjs`
- Test: `dashboard-next/src/components/Sidebar.tsx`, `dashboard-next/src/components/DashboardHeader.tsx`, `dashboard-next/src/pages/Dashboard.css`

- [ ] **Step 1: Write failing source-contract tests**

Add a test that reads the three files and asserts the approved visual contract:

```js
test("dashboard shell exposes the approved airy admin visual contract", async () => {
  const sidebar = await readSource("components/Sidebar.tsx");
  const header = await readSource("components/DashboardHeader.tsx");
  const css = await readSource("pages/Dashboard.css");

  assert.match(sidebar, /sidebar-nav-label/);
  assert.match(sidebar, /AI Memory Hub/);
  assert.match(header, /AI MEMORY HUB \/ CONSOLE/);
  assert.match(css, /\.dashboard-grid/);
  assert.match(css, /\.empty-state/);
  assert.match(css, /\.status-badge/);
  assert.match(css, /--accent/);
  assert.doesNotMatch(css, /\.field span[\s\S]{0,260}text-transform:\s*uppercase/);
  assert.doesNotMatch(css, /th[\s\S]{0,180}text-transform:\s*uppercase/);
});
```

- [ ] **Step 2: Run the focused test and verify the baseline result**

Run: `node --test tests/dashboard-next-structure.test.mjs`

Expected: the existing tests pass; the new contract test fails only if the current source has regressed from the approved shell contract.

- [ ] **Step 3: Commit the regression test**

Run:

```bash
git add tests/dashboard-next-structure.test.mjs
git commit -m "test: lock AMH dashboard visual contract"
```

### Task 2: Refine the global shell and design tokens

**Files:**
- Modify: `dashboard-next/src/index.css`
- Modify: `dashboard-next/src/components/Layout.css`
- Modify: `dashboard-next/src/components/Sidebar.tsx`
- Modify: `dashboard-next/src/components/Sidebar.css`
- Modify: `dashboard-next/src/components/DashboardHeader.tsx`
- Modify: `dashboard-next/src/pages/Dashboard.css`

- [ ] **Step 1: Define one token layer for page, surface, line, text, accent, radius, and shadow values**

Use the approved light palette:

```css
:root {
  --bg: #f4f7fb;
  --bg-panel: #ffffff;
  --bg-panel-strong: #fbfcfe;
  --bg-soft: #eef3f8;
  --border: #e5eaf0;
  --border-soft: #d5dde7;
  --text: #172033;
  --text-muted: #667085;
  --text-subtle: #98a2b3;
  --accent: #2eb7a5;
  --accent-strong: #1d9d8c;
  --accent-soft: rgba(46, 183, 165, 0.12);
  --accent-blue: #4676e8;
  --radius: 12px;
  --shadow: 0 1px 2px rgba(16, 24, 40, 0.03), 0 6px 18px rgba(16, 24, 40, 0.04);
}
```

- [ ] **Step 2: Make the desktop shell readable without hover-only discovery**

Keep visible sidebar labels, use three visual groups (`协作`, `数据`, `系统`), give the active route a teal left marker and soft teal background, and keep the desktop content offset equal to the expanded sidebar width.

- [ ] **Step 3: Make the page header a consistent hierarchy**

Use an eyebrow, one `h2`, one subtitle, and one primary action. Give secondary actions the ghost treatment and make header action icons use the shared `header-button-icon` class.

- [ ] **Step 4: Run the shell tests and build**

Run: `node --test tests/dashboard-next-structure.test.mjs`

Expected: all tests pass.

Run: `npm run build:dashboard`

Expected: TypeScript and Vite both exit with code 0.

- [ ] **Step 5: Commit the shell pass**

Run:

```bash
git add dashboard-next/src/index.css dashboard-next/src/components/Layout.css dashboard-next/src/components/Sidebar.tsx dashboard-next/src/components/Sidebar.css dashboard-next/src/components/DashboardHeader.tsx dashboard-next/src/pages/Dashboard.css
git commit -m "feat: establish AMH airy admin shell"
```

### Task 3: Recompose the Dashboard overview-first page

**Files:**
- Modify: `dashboard-next/src/pages/Dashboard.tsx`
- Modify: `dashboard-next/src/pages/Dashboard.css`
- Modify: `dashboard-next/src/lib/dashboardCopy.ts`

- [ ] **Step 1: Add a stable overview section contract test**

Extend `tests/dashboard-next-structure.test.mjs` with assertions that Dashboard renders the overview sections in order:

```js
test("Dashboard keeps the overview-first section order", async () => {
  const dashboard = await readSource("pages/Dashboard.tsx");
  assert.match(dashboard, /overview-section/);
  assert.match(dashboard, /metric-card/);
  assert.match(dashboard, /panel-grid two/);
  assert.ok(dashboard.indexOf("dashboard-grid") < dashboard.indexOf("panel-grid two"));
});
```

- [ ] **Step 2: Run the new test and verify it fails if the order is absent**

Run: `node --test tests/dashboard-next-structure.test.mjs`

Expected: the new assertion identifies the current ordering gap before implementation.

- [ ] **Step 3: Reorder existing presentation blocks without changing data fetching**

Keep the current model/API hooks intact. Render the first viewport as:

1. Three metric cards: health, tasks, workflows.
2. A two-column panel row: system/activity overview at `1.4fr`, collaboration/messages at `0.8fr`.
3. Existing task, workflow, tool, and health sections below.

Use existing records and status values; only change wrappers, headings, and localized copy. Do not add new API calls.

- [ ] **Step 4: Remove visual noise from nested content**

Use whitespace and section headers before adding borders. Keep inner borders only for actionable rows, tables, or warning states. Add an explanatory empty-state sentence and a contextual action button to empty overview sections where an existing action already exists.

- [ ] **Step 5: Run the focused test and build**

Run: `node --test tests/dashboard-next-structure.test.mjs`

Expected: all tests pass.

Run: `npm run build:dashboard`

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit the overview pass**

Run:

```bash
git add tests/dashboard-next-structure.test.mjs dashboard-next/src/pages/Dashboard.tsx dashboard-next/src/pages/Dashboard.css dashboard-next/src/lib/dashboardCopy.ts
git commit -m "feat: make dashboard overview-first"
```

### Task 4: Tune Tasks and Workflows for airy operational reading

**Files:**
- Modify: `dashboard-next/src/pages/Dashboard.tsx`
- Modify: `dashboard-next/src/pages/Dashboard.css`
- Modify: `dashboard-next/src/lib/dashboardCopy.ts`
- Test: `tests/dashboard-next-structure.test.mjs`

- [ ] **Step 1: Add presentation assertions for task/workflow hierarchy**

Add assertions for visible title, status, owner/time metadata, and the existing action menu:

```js
test("task and workflow cards expose readable hierarchy", async () => {
  const dashboard = await readSource("pages/Dashboard.tsx");
  const css = await readSource("pages/Dashboard.css");
  assert.match(dashboard, /task-card-top/);
  assert.match(dashboard, /task-meta-grid/);
  assert.match(dashboard, /workflow-card-header/);
  assert.match(dashboard, /status-badge/);
  assert.match(css, /\.task-card:hover/);
  assert.match(css, /\.workflow-card/);
});
```

- [ ] **Step 2: Run the focused test and verify the missing hierarchy is identified**

Run: `node --test tests/dashboard-next-structure.test.mjs`

Expected: the new test fails only for missing approved hierarchy selectors.

- [ ] **Step 3: Apply the hierarchy rules to task cards**

Keep the title at the strongest text weight, put status beside it, place owner/project/priority/time in a quieter two-column metadata grid, and keep only the primary actions visible. Preserve the existing action menu for low-frequency review and radio actions.

- [ ] **Step 4: Apply the same rhythm to workflow cards**

Use the same header, badges, description, linked-task details, and action-row spacing as task cards. Use teal for active/in-progress states, amber for review/pending, and red only for blocked/failed/danger states.

- [ ] **Step 5: Run tests and build**

Run: `node --test tests/dashboard-next-structure.test.mjs`

Expected: all tests pass.

Run: `npm run build:dashboard`

Expected: build succeeds.

- [ ] **Step 6: Commit the operational card pass**

Run:

```bash
git add tests/dashboard-next-structure.test.mjs dashboard-next/src/pages/Dashboard.tsx dashboard-next/src/pages/Dashboard.css dashboard-next/src/lib/dashboardCopy.ts
git commit -m "feat: clarify task and workflow hierarchy"
```

### Task 5: Verify responsive states and hand off safely

**Files:**
- Modify: `dashboard-next/src/pages/Dashboard.css`
- Modify: `dashboard-next/src/components/Sidebar.css`
- Test: `tests/dashboard-next-structure.test.mjs`

- [ ] **Step 1: Add responsive source assertions**

Assert that the stylesheet contains the mobile breakpoint, mobile bottom navigation, single-column grids, and non-full-width default buttons:

```js
test("dashboard keeps the airy layout usable on mobile", async () => {
  const css = await readSource("pages/Dashboard.css");
  const sidebarCss = await readSource("components/Sidebar.css");
  assert.match(css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(css, /grid-template-columns:\s*1fr/);
  assert.match(css, /flex:\s*0 1 auto/);
  assert.match(sidebarCss, /@media\s*\(max-width:\s*768px\)/);
});
```

- [ ] **Step 2: Run tests before the responsive adjustment**

Run: `node --test tests/dashboard-next-structure.test.mjs`

Expected: the test suite passes or reports only the responsive contract that still needs adjustment.

- [ ] **Step 3: Tune mobile layout**

At 720px and below, stack metric/panel/form grids, allow header actions to wrap naturally, keep buttons content-sized by default, and reserve bottom padding for the mobile navigation. At 768px and below, hide desktop sidebar labels and show the four-entry mobile navigation without clipping.

- [ ] **Step 4: Run the full frontend verification**

Run:

```bash
node --test tests/dashboard-next-structure.test.mjs
npm run build:dashboard
git diff --check
git status --short
```

Expected: all tests pass, build succeeds, diff check is clean, and only intended dashboard/test files are changed.

- [ ] **Step 5: Commit the responsive pass**

Run:

```bash
git add dashboard-next/src/pages/Dashboard.css dashboard-next/src/components/Sidebar.css tests/dashboard-next-structure.test.mjs
git commit -m "feat: finish responsive AMH dashboard polish"
```

- [ ] **Step 6: Report the isolated handoff**

Provide the final commit IDs, worktree path, verification results, and a note that the main branch was not changed until the user explicitly asks to merge. Do not push or deploy as part of this visual pass.
