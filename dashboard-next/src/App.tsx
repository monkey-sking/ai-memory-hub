import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard section="overview" />} />
          <Route path="memory" element={<Dashboard section="memory" />} />
          <Route path="tasks" element={<Dashboard section="tasks" />} />
          <Route path="radio" element={<Dashboard section="radio" />} />
          <Route path="dispatch" element={<Dashboard section="dispatch" />} />
          <Route path="workflows" element={<Dashboard section="workflows" />} />
          <Route path="analytics" element={<Dashboard section="analytics" />} />
          <Route path="backups" element={<Dashboard section="backups" />} />
          <Route path="search" element={<Dashboard section="search" />} />
          <Route path="tools" element={<Dashboard section="tools" />} />
          <Route path="projects" element={<Dashboard section="projects" />} />
          <Route path="health" element={<Dashboard section="health" />} />
          <Route path="settings" element={<Dashboard section="settings" />} />
          <Route path="chat" element={<Chat />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
