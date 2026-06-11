import { NavLink } from 'react-router-dom'
import './Sidebar.css'

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="app-logo">
        <div className="icon">AI</div>
        <h1>AI Memory Hub</h1>
      </div>
      <nav>
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
          <span>📊</span> Dashboard
        </NavLink>
      </nav>
    </aside>
  )
}
