import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import './App.css'

const Chat = lazy(() => import('./pages/Chat'))
const Skills = lazy(() => import('./pages/Skills'))
const Extensions = lazy(() => import('./pages/Extensions'))

// Plan A standalone route pages (landed from the monolithic Dashboard.tsx).
// Each owns its own data fetching + renders through the shared shell/Plan A tokens.
const Overview = lazy(() => import('./pages/Overview'))
const Memory = lazy(() => import('./pages/Memory'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Radio = lazy(() => import('./pages/Radio'))
const Dispatch = lazy(() => import('./pages/Dispatch'))
const Workflows = lazy(() => import('./pages/Workflows'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Backups = lazy(() => import('./pages/Backups'))
const Search = lazy(() => import('./pages/Search'))
const Tools = lazy(() => import('./pages/Tools'))
const Projects = lazy(() => import('./pages/Projects'))
const Health = lazy(() => import('./pages/Health'))
const Settings = lazy(() => import('./pages/Settings'))
const Runners = lazy(() => import('./pages/Runners'))
const Sessions = lazy(() => import('./pages/Sessions'))
const Reviews = lazy(() => import('./pages/Reviews'))
const Roles = lazy(() => import('./pages/Roles'))
const TasksCenter = lazy(() => import('./pages/TasksCenter'))
const Observability = lazy(() => import('./pages/Observability'))
const DataPort = lazy(() => import('./pages/DataPort'))

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      Loading
    </div>
  )
}

function App() {
  return (
    <Router>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Overview />} />
            <Route path="memory" element={<Memory />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="radio" element={<Radio />} />
            <Route path="dispatch" element={<Dispatch />} />
            <Route path="workflows" element={<Workflows />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="backups" element={<Backups />} />
            <Route path="search" element={<Search />} />
            <Route path="tools" element={<Tools />} />
            <Route path="skills" element={<Skills />} />
            <Route path="extensions" element={<Extensions />} />
            <Route path="projects" element={<Projects />} />
            <Route path="health" element={<Health />} />
            <Route path="settings" element={<Settings />} />
            <Route path="runners" element={<Runners />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="reviews" element={<Reviews />} />
            <Route path="roles" element={<Roles />} />
            <Route path="tasks-center" element={<TasksCenter />} />
            <Route path="observability" element={<Observability />} />
            <Route path="data-migration" element={<DataPort />} />
            <Route path="chat" element={<Chat />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  )
}

export default App
