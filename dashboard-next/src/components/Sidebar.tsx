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
  ChevronLeft,
  ChevronRight,
  Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  collapsed: boolean
  language: AppLanguage
  onToggle: () => void
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: { zh: '概览', en: 'Overview' } },
  { to: '/memory', icon: Brain, label: { zh: '记忆', en: 'Memory' } },
  { to: '/tasks', icon: ListTodo, label: { zh: '任务', en: 'Tasks' } },
  { to: '/radio', icon: Radio, label: { zh: 'Radio', en: 'Radio' } },
  { to: '/dispatch', icon: Zap, label: { zh: '调度', en: 'Dispatch' } },
  { to: '/workflows', icon: Workflow, label: { zh: '工作流', en: 'Workflows' } },
  { to: '/analytics', icon: BarChart3, label: { zh: '分析', en: 'Analytics' } },
  { to: '/backups', icon: Database, label: { zh: '备份', en: 'Backups' } },
  { to: '/search', icon: Search, label: { zh: '搜索', en: 'Search' } },
  { to: '/tools', icon: Wrench, label: { zh: '工具', en: 'Tools' } },
  { to: '/projects', icon: FolderKanban, label: { zh: '项目', en: 'Projects' } },
  { to: '/health', icon: Activity, label: { zh: '健康', en: 'Health' } },
  { to: '/settings', icon: Settings, label: { zh: '设置', en: 'Settings' } },
  { to: '/chat', icon: MessageSquare, label: { zh: '对话', en: 'Chat' } }
]

const toggleLabel: Record<AppLanguage, { collapse: string; expand: string }> = {
  zh: { collapse: '收起侧边栏', expand: '展开侧边栏' },
  en: { collapse: 'Collapse sidebar', expand: 'Expand sidebar' }
}

export default function Sidebar({ collapsed, language, onToggle }: SidebarProps) {
  const sidebarToggleLabel = collapsed ? toggleLabel[language].expand : toggleLabel[language].collapse

  return (
    <aside className={cn(
      'flex flex-col h-screen border-r bg-card transition-all duration-300',
      collapsed ? 'w-16' : 'w-64'
    )}>
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            AI
          </div>
          {!collapsed && (
            <h1 className="text-lg font-semibold truncate">AI Memory Hub</h1>
          )}
        </div>
      </div>

      {/* Toggle Button */}
      <button
        className={cn(
          'absolute top-20 flex items-center justify-center w-6 h-6 rounded-full border bg-card shadow-sm hover:bg-accent transition-colors',
          collapsed ? 'left-12' : 'left-60'
        )}
        type="button"
        onClick={onToggle}
        aria-label={sidebarToggleLabel}
        title={sidebarToggleLabel}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2" aria-label="Dashboard navigation">
        <div className="space-y-1">
          {navItems.map(item => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
                )}
                title={collapsed ? item.label[language] : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="truncate">{item.label[language]}</span>}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </aside>
  )
}
