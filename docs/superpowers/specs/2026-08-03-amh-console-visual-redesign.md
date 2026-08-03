# AMH Console Visual Redesign

## 1. Goal

Refresh the AMH React dashboard so it feels like a calm, mature collaboration console rather than a collection of utility panels.

Approved visual direction:

- B: light professional admin console
- A: overview-first dashboard
- A: airy information density

## 2. Visual system

- Use a warm light-gray page background and white surfaces.
- Use deep navy text, muted gray secondary text, teal primary actions, and blue only for auxiliary information.
- Use a restrained border system and soft elevation; avoid nested bordered boxes where spacing can provide hierarchy.
- Keep the existing React, Tailwind, Radix, and Lucide stack. Do not change API contracts or backend behavior.

## 3. Shell and navigation

- Keep a full-width expanded desktop sidebar with product identity and visible labels.
- Group navigation into collaboration, data, and system sections.
- Make the active route obvious with a teal accent and quiet surface treatment.
- Keep the mobile navigation to four primary destinations plus a More entry.
- Use one consistent page header with title, description, one primary action, and secondary actions grouped behind a compact control where practical.

## 4. Dashboard composition

- First row: three core metric cards for health, tasks, and workflows.
- Second row: a wide system/activity overview panel and a narrower collaboration/messages panel.
- Following sections: task, workflow, tool, and health summaries with clear section headers and deliberate whitespace.
- Empty states must explain what is missing and offer the next useful action.
- Loading and error states must use the same surface, spacing, and typography rules as the loaded state.

## 5. Detail pages

- Tasks and workflows get the first detail pass: clearer title/status/owner/time hierarchy, less visual noise, and predictable primary/secondary actions.
- Radio, tools, health, backup, and settings retain their behavior but inherit the common shell and component tokens.
- Status values remain machine-compatible internally but render through friendly localized labels.

## 6. Acceptance criteria

- Dashboard has a clear visual hierarchy within the first viewport at desktop width.
- The primary action is visually distinct without overpowering the page.
- Cards, panels, buttons, forms, status badges, tables, empty states, and responsive behavior share one coherent token system.
- Mobile layout remains usable at 375px and does not turn every action into a full-width button.
- Existing dashboard structure tests pass and `npm run build:dashboard` succeeds.
- No backend files, API payloads, or concurrent agent changes are modified.

## 7. Out of scope

- Replacing React with Vue or another frontend framework.
- Redesigning backend APIs or data models.
- Changing the product information architecture beyond the shell grouping described above.
- Deploying or pushing to a remote server as part of this visual pass.
