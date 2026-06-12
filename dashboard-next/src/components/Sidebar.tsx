import { NavLink } from 'react-router-dom'
import type { AppLanguage } from '../lib/i18n'
import './Sidebar.css'

interface SidebarProps {
  collapsed: boolean
  language: AppLanguage
  onToggle: () => void
}

const navItems = [
  { to: '/dashboard', icon: 'OV', label: { zh: '概览', en: 'Overview' } },
  { to: '/memory', icon: 'MM', label: { zh: '记忆', en: 'Memory' } },
  { to: '/tasks', icon: 'TK', label: { zh: '任务', en: 'Tasks' } },
  { to: '/radio', icon: 'RD', label: { zh: 'Radio', en: 'Radio' } },
  { to: '/dispatch', icon: 'DP', label: { zh: '调度', en: 'Dispatch' } },
  { to: '/workflows', icon: 'WF', label: { zh: '工作流', en: 'Workflows' } },
  { to: '/analytics', icon: 'AN', label: { zh: '分析', en: 'Analytics' } },
  { to: '/backups', icon: 'BK', label: { zh: '备份', en: 'Backups' } },
  { to: '/search', icon: 'SE', label: { zh: '搜索', en: 'Search' } },
  { to: '/tools', icon: 'TL', label: { zh: '工具', en: 'Tools' } },
  { to: '/projects', icon: 'PJ', label: { zh: '项目', en: 'Projects' } },
  { to: '/health', icon: 'HT', label: { zh: '健康', en: 'Health' } },
  { to: '/settings', icon: 'ST', label: { zh: '设置', en: 'Settings' } },
  { to: '/chat', icon: 'AI', label: { zh: '对话', en: 'Chat' } }
]

const toggleLabel: Record<AppLanguage, { collapse: string; expand: string }> = {
  zh: { collapse: '收起侧边栏', expand: '展开侧边栏' },
  en: { collapse: 'Collapse sidebar', expand: 'Expand sidebar' }
}

export default function Sidebar({ collapsed, language, onToggle }: SidebarProps) {
  const sidebarToggleLabel = collapsed ? toggleLabel[language].expand : toggleLabel[language].collapse

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="app-logo">
        <div className="brand-mark">AI</div>
        <h1>AI Memory Hub</h1>
      </div>

      <button
        className="sidebar-toggle"
        type="button"
        onClick={onToggle}
        aria-label={sidebarToggleLabel}
        title={sidebarToggleLabel}
      >
        <span>{collapsed ? '>' : '<'}</span>
      </button>

      <nav className="sidebar-nav" aria-label="Dashboard navigation">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => isActive ? 'active' : ''}
            title={collapsed ? item.label[language] : undefined}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label[language]}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
