import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { AppLanguage } from '../lib/i18n'
import './Sidebar.css'
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
  MoreHorizontal,
  Puzzle
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  language: AppLanguage
}

interface NavGroup {
  label: { zh: string; en: string }
  items: {
    to: string
    icon: React.ComponentType<{ className?: string }>
    label: { zh: string; en: string }
  }[]
}

const navGroups: NavGroup[] = [
  {
    label: { zh: '协作', en: 'Collaboration' },
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: { zh: '概览', en: 'Overview' } },
      { to: '/tasks', icon: ListTodo, label: { zh: '任务', en: 'Tasks' } },
      { to: '/workflows', icon: Workflow, label: { zh: '工作流', en: 'Workflows' } },
      { to: '/memory', icon: Brain, label: { zh: '记忆', en: 'Memory' } },
    ]
  },
  {
    label: { zh: '数据', en: 'Data' },
    items: [
      { to: '/radio', icon: Radio, label: { zh: 'Radio', en: 'Radio' } },
      { to: '/dispatch', icon: Zap, label: { zh: '调度', en: 'Dispatch' } },
      { to: '/tools', icon: Wrench, label: { zh: '工具', en: 'Tools' } },
      { to: '/skills', icon: Puzzle, label: { zh: 'Skills', en: 'Skills' } },
      { to: '/chat', icon: MessageSquare, label: { zh: '对话', en: 'Chat' } },
    ]
  },
  {
    label: { zh: '系统', en: 'System' },
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
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const { pathname } = useLocation()
  const primaryItems = navGroups[0].items
  const overflowGroups = navGroups.slice(1)
  const hasOverflowRoute = overflowGroups.some(group => group.items.some(item => item.to === pathname))

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">AI</div>
        <div className="sidebar-logo-copy">
          <strong>AI Memory Hub</strong>
          <span>{language === 'zh' ? '协作控制台' : 'Collaboration Console'}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav sidebar-desktop-nav" aria-label="Dashboard navigation">
        {navGroups.map(group => (
          <div key={group.label.en} className="sidebar-nav-group">
            <p className="sidebar-nav-group-label">{group.label[language]}</p>
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
                  >
                    <Icon className="sidebar-nav-icon" />
                    <span className="sidebar-nav-label">{item.label[language]}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <nav className="sidebar-mobile-nav" aria-label="Mobile dashboard navigation">
        {primaryItems.map(item => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn('sidebar-mobile-nav-item', isActive && 'active')}
              onClick={() => setIsMoreOpen(false)}
            >
              <Icon className="sidebar-nav-icon" />
              <span>{item.label[language]}</span>
            </NavLink>
          )
        })}
        <button
          className={cn('sidebar-mobile-nav-item sidebar-more-trigger', (isMoreOpen || hasOverflowRoute) && 'active')}
          type="button"
          aria-expanded={isMoreOpen}
          aria-controls={isMoreOpen ? 'sidebar-more-menu' : undefined}
          onClick={() => setIsMoreOpen(open => !open)}
        >
          <MoreHorizontal className="sidebar-nav-icon" />
          <span>{language === 'zh' ? '更多' : 'More'}</span>
        </button>
      </nav>

      {isMoreOpen && (
        <nav id="sidebar-more-menu" className="sidebar-mobile-more-menu" aria-label="More navigation">
          {overflowGroups.map(group => (
            <section key={group.label.en} className="sidebar-mobile-more-group">
              <p>{group.label[language]}</p>
              <div>
                {group.items.map(item => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => cn('sidebar-mobile-more-item', isActive && 'active')}
                      onClick={() => setIsMoreOpen(false)}
                    >
                      <Icon className="sidebar-nav-icon" />
                      <span>{item.label[language]}</span>
                    </NavLink>
                  )
                })}
              </div>
            </section>
          ))}
        </nav>
      )}
    </aside>
  )
}
