import { Outlet, useLocation } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  Activity,
  BarChart3,
  Blocks,
  Brain,
  ChevronRight,
  Database,
  FolderKanban,
  Gauge,
  GitPullRequest,
  LayoutDashboard,
  ListTodo,
  Menu,
  MessageSquare,
  Moon,
  Puzzle,
  Radio,
  Search,
  Server,
  Settings,
  Sun,
  Users,
  Workflow,
  Wrench,
  Zap
} from 'lucide-react'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import Sidebar, { type NavGroup } from './Sidebar'
import { TopbarSlotOutlet, TopbarSlotProvider } from './DashboardHeader'
import { ErrorBoundary } from './ErrorBoundary'
import { apiGet } from '../lib/api'
import { cn } from '@/lib/utils'
import './Layout.css'

const LANGUAGE_KEY = 'hub-language'
const SIDEBAR_KEY = 'hub-sidebar-collapsed'
const DENSITY_KEY = 'hub-density'
const DESKTOP_QUERY = '(min-width: 768px)'
const ROOMY_RAIL_QUERY = '(min-width: 1280px)'

type SidebarPreference = 'collapsed' | 'expanded' | null
type Density = 'compact' | 'comfortable'

function readSidebarPreference(): SidebarPreference {
  const stored = localStorage.getItem(SIDEBAR_KEY)
  if (stored === 'collapsed' || stored === '1') return 'collapsed'
  if (stored === 'expanded') return 'expanded'
  return null
}
function readDensity(): Density {
  return localStorage.getItem(DENSITY_KEY) === 'comfortable' ? 'comfortable' : 'compact'
}

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onStoreChange)
      return () => list.removeEventListener('change', onStoreChange)
    },
    [query]
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

const navGroups: NavGroup[] = [
  {
    id: 'collaboration',
    label: { zh: '协作', en: 'Collaboration' },
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: { zh: '概览', en: 'Overview' } },
      { to: '/tasks', icon: ListTodo, label: { zh: '任务', en: 'Tasks' } },
      { to: '/workflows', icon: Workflow, label: { zh: '工作流', en: 'Workflows' } },
      { to: '/memory', icon: Brain, label: { zh: '记忆', en: 'Memory' } },
      { to: '/sessions', icon: Users, label: { zh: '会话', en: 'Sessions' } },
      { to: '/reviews', icon: GitPullRequest, label: { zh: '评审', en: 'Reviews' } }
    ]
  },
  {
    id: 'data',
    label: { zh: '数据', en: 'Data' },
    items: [
      { to: '/radio', icon: Radio, label: { zh: 'Radio', en: 'Radio' } },
      { to: '/dispatch', icon: Zap, label: { zh: '调度', en: 'Dispatch' } },
      { to: '/tools', icon: Wrench, label: { zh: '工具', en: 'Tools' } },
      { to: '/skills', icon: Puzzle, label: { zh: 'Skills', en: 'Skills' } },
      { to: '/extensions', icon: Blocks, label: { zh: '扩展', en: 'Extensions' } },
      { to: '/chat', icon: MessageSquare, label: { zh: '对话', en: 'Chat' } }
    ]
  },
  {
    id: 'system',
    label: { zh: '系统', en: 'System' },
    items: [
      { to: '/analytics', icon: BarChart3, label: { zh: '分析', en: 'Analytics' } },
      { to: '/search', icon: Search, label: { zh: '搜索', en: 'Search' } },
      { to: '/backups', icon: Database, label: { zh: '备份', en: 'Backups' } },
      { to: '/projects', icon: FolderKanban, label: { zh: '项目', en: 'Projects' } },
      { to: '/health', icon: Activity, label: { zh: '健康', en: 'Health' } },
      { to: '/runners', icon: Server, label: { zh: '调度器', en: 'Runners' } },
      { to: '/settings', icon: Settings, label: { zh: '设置', en: 'Settings' } }
    ]
  }
]

const copy = {
  zh: { skip: '跳到主要内容', openNav: '打开导航', search: '搜索记忆、工具、任务…', health: '系统状态' },
  en: { skip: 'Skip to main content', openNav: 'Open navigation', search: 'Search memory, tools, tasks…', health: 'System status' }
} as const

type HealthTone = 'success' | 'warning' | 'error' | 'unknown'
const HEALTH_DOT: Record<HealthTone, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-danger)',
  unknown: 'var(--color-ink-4)'
}

export default function Layout() {
  const { pathname } = useLocation()
  const [language, setLanguage] = useState<AppLanguage>(
    () => (localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'zh')
  )
  const [sidebarPreference, setSidebarPreference] = useState<SidebarPreference>(readSidebarPreference)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('hub-theme') === 'light' ? 'light' : 'dark')
  )
  const [density, setDensity] = useState<Density>(readDensity)
  const [health, setHealth] = useState<{ tone: HealthTone; label: string }>({ tone: 'unknown', label: '—' })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('hub-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.density = density
    localStorage.setItem(DENSITY_KEY, density)
  }, [density])

  const roomyRail = useMediaQuery(ROOMY_RAIL_QUERY)
  const sidebarCollapsed = sidebarPreference ? sidebarPreference === 'collapsed' : !roomyRail

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language)
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    if (!sidebarPreference) return
    localStorage.setItem(SIDEBAR_KEY, sidebarPreference)
  }, [sidebarPreference])

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileNavOpen(false)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // Real system health → topbar light (no fabricated status).
  const loadHealth = useCallback(() => {
    apiGet<{ status?: string; ok?: boolean }>('/api/health')
      .then(payload => {
        const s = String(payload.status ?? '').toLowerCase()
        if (s.includes('degraded') || s.includes('warn')) setHealth({ tone: 'warning', label: '降级' })
        else if (s.includes('down') || s.includes('error') || s.includes('fail')) setHealth({ tone: 'error', label: '异常' })
        else if (s.includes('ok') || s.includes('healthy') || payload.ok) setHealth({ tone: 'success', label: '运行中' })
        else setHealth({ tone: 'unknown', label: '未知' })
      })
      .catch(() => setHealth({ tone: 'unknown', label: '未知' }))
  }, [])
  useEffect(() => {
    loadHealth()
    const t = window.setInterval(loadHealth, 15000)
    return () => window.clearInterval(t)
  }, [loadHealth])

  const toggleLanguage = useCallback(() => setLanguage(value => (value === 'zh' ? 'en' : 'zh')), [])
  const toggleSidebar = useCallback(
    () => setSidebarPreference(sidebarCollapsed ? 'expanded' : 'collapsed'),
    [sidebarCollapsed]
  )
  const toggleDensity = useCallback(
    () => setDensity(value => (value === 'compact' ? 'comfortable' : 'compact')),
    []
  )
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), [])

  const text = copy[language]
  const pageTitle = useMemo(() => {
    const match = navGroups.flatMap(group => group.items).find(item => item.to === pathname)
    return match ? match.label[language] : text.skip
  }, [pathname, language, text.skip])
  const pageGroup = useMemo(() => {
    for (const group of navGroups) {
      if (group.items.some(item => item.to === pathname)) return group.label[language]
    }
    return ''
  }, [pathname, language])

  const outletContext: AppOutletContext = useMemo(
    () => ({ language, toggleLanguage }),
    [language, toggleLanguage]
  )

  return (
    <TopbarSlotProvider>
      <div className="flex min-h-svh bg-canvas text-ink">
        <a className="skip-to-main" href="#main-content">{text.skip}</a>

        <Sidebar
          groups={navGroups}
          language={language}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          mobileOpen={mobileNavOpen}
          onCloseMobile={closeMobileNav}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Proto topbar: collapse(mobile) · breadcrumb · global search · health · density · theme · slot */}
          <header className="sticky top-0 z-30 flex h-[var(--bar-h)] shrink-0 items-center gap-3 border-b border-line bg-canvas px-3 lg:px-4">
            <button
              type="button"
              className="hub-icon-btn grid md:hidden"
              aria-label={text.openNav}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="size-4" aria-hidden="true" />
            </button>

            <nav aria-label={text.openNav} className="flex min-w-0 items-center gap-1.5 text-[13px]">
              {pageGroup ? <span className="shrink-0 text-ink-3">{pageGroup}</span> : null}
              {pageGroup ? <ChevronRight className="size-3.5 shrink-0 text-ink-4" aria-hidden="true" /> : null}
              <span className="min-w-0 truncate font-medium text-ink-1">{pageTitle}</span>
            </nav>

            <div className="relative mx-auto hidden w-[min(420px,38vw)] md:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden="true" />
              <input
                type="search"
                placeholder={text.search}
                aria-label={text.search}
                className="h-[var(--control-h)] w-full rounded-sm border border-line bg-surface-sunk pl-8 pr-16 text-[13px] text-ink-1 placeholder:text-ink-4 focus:border-accent-base focus:shadow-focus"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-xs border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-5">⌘K</kbd>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-2" title={`${text.health}：${health.label}`}>
                <span className="relative flex size-2">
                  <span
                    className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping"
                    style={{ background: HEALTH_DOT[health.tone] }}
                  />
                  <span className="relative inline-flex size-2 rounded-full" style={{ background: HEALTH_DOT[health.tone] }} />
                </span>
                <span className="hidden text-[13px] text-ink-2 lg:inline">{health.label}</span>
              </div>

              <span className="hidden h-5 w-px bg-line md:inline-block" />

              <button
                type="button"
                className="hub-icon-btn grid"
                aria-label="切换密度"
                aria-pressed={density === 'comfortable'}
                title={density === 'comfortable' ? '紧凑' : '宽松'}
                onClick={toggleDensity}
              >
                <Gauge className="size-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                className="hub-icon-btn grid"
                aria-label={theme === 'dark' ? '切换到浅色' : '切换到深色'}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
              </button>

              <TopbarSlotOutlet className={cn('flex shrink-0 items-center gap-2')} />
            </div>
          </header>

          <main id="main-content" className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[var(--section-gap)] p-[var(--section-gap)] lg:px-6">
              <ErrorBoundary>
                <Outlet context={outletContext} />
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>
    </TopbarSlotProvider>
  )
}
