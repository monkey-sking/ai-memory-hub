# Project Root Cleanup Plan

## Verified Problems

| Problem | Action |
| --- | --- |
| `public/` tracked built dashboard assets | Remove from git and serve `dashboard-next/dist/` when `public/` is absent |
| Root `verify-*.js` scripts | Move to `tests/` |
| Root `screenshots/` review artifacts | Move to `docs/screenshots/` |
| Root `ISSUES.md` documentation | Move to `docs/ISSUES.md` |
| `fix-i18n.txt` temporary file | Delete |
| `dashboard-next/test-results/` tracked test output | Remove from git and ignore |

`logs/`, `dashboard-next/node_modules/`, and `dashboard-next/dist/` were checked; they were not tracked in the current index.

## Implementation Notes

- `ai-memory-hub app` now reads dashboard HTML and assets from `public/` when present, otherwise from `dashboard-next/dist/`.
- Static asset requests reject decoded `..` path segments, and unknown file-like GET paths return `404` instead of the SPA fallback.
- Dashboard builds should be created with `npm run build:dashboard`.
- `public/`, `logs/`, `dashboard-next/dist/`, and `dashboard-next/test-results/` are ignored.

## Verification

Run:

```bash
node --test tests/project-cleanup-structure.test.mjs
node --test --test-name-pattern "dashboard serves (externalized virtual-scroll assets|SPA assets)" tests/dashboard-api.test.mjs
```
