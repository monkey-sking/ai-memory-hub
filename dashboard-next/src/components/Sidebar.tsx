import { NavLink } from 'react-router-dom'
import type { AppLanguage } from '../lib/i18n'
import {
  LayoutDashboard,
  Brain,
  ListTodo,
  Radio,
  Workflow,
  BarChart3,
  Database,
  Search,
  Wrench,
  FolderKanban,
  Activity,
  Settings,
  MessageSquare,
  Zap,
  SeparatorHorizontal
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  language: AppLanguage
}

interface NavGroup {
  items: {
    to: string
    icon: React.ComponentType<{ className?: string }>
    label: { zh: string; en: string }
  }[]
}

const navGroups: NavGroup[] = [
  {
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: { zh: '概览', en: 'Overview' } },
      { to: '/tasks', icon: ListTodo, label: { zh: '任务', en: 'Tasks' } },
      { to: '/workflows', icon: Workflow, label: { zh: '工作流', en: 'Workflows' } },
      { to: '/memory', icon: Brain, label: { zh: '记忆', en: 'Memory' } },
    ]
  },
  {
    items: [
      { to: '/radio', icon: Radio, label: { zh: 'Radio', en: 'Radio' } },
      { to: '/dispatch', icon: Zap, label: { zh: '调度', en: 'Dispatch' } },
      { to: '/tools', icon: Wrench, label: { zh: '工具', en: 'Tools' } },
      { to: '/chat', icon: MessageSquare, label: { zh: '对话', en: 'Chat' } },
    ]
  },
  {
    items: [
      { to: '/analytics', icon: BarChart3, label: { zh: '分析', en: 'Analytics' } },
      { to: '/search', icon: Search, label: { zh: '搜索', en: 'Search' } },
      { to: '/backups', icon: Database, label: { zh: '备份', en: 'Backups' } },
      { to: '/projects', icon: FolderKanban, label: { zh: '项目', en: 'Projects' } },
      { to: '/health', icon: Activity, label: { zh: '健康', en: 'Health' } },
      { to: '/settings', icon: Settings, label: { zh: '设置', en: 'Settings' } },
    ]
  }
]

export default function Sidebar({ language }: SidebarProps) {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">AI</div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav" aria-label="Dashboard navigation">
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="sidebar-nav-group">
            {groupIdx > 0 && <div className="sidebar-separator" />}
            <div className="sidebar-nav-items">
              {group.items.map(item => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => cn(
                      'sidebar-nav-item',
                      isActive && 'active'
                    )}
                    title={item.label[language]}
                  >
                    <Icon className="sidebar-nav-icon" />
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
