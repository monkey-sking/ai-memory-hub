import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Loaded globally so the standalone Plan A route pages (Overview, Memory, Tasks,
// Tools, Search, Health, Workflows, …) can reuse the legacy component classes
// (`.panel-grid`, `.tool-*`, `.search-*`, `.workflow-*`, `.dashboard-page`, …)
// that live in Dashboard.css. These classes resolve to Plan A tokens via the
// legacy-alias block in index.css. Dashboard.tsx also imports this file, but
// Vite dedupes the module so it is injected exactly once.
import './pages/Dashboard.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
