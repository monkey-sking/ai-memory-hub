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
  LayoutDashboard,
  ListTodo,
  Menu,
  MessageSquare,
  Puzzle,
  Radio,
  Search,
  Settings,
  Workflow,
  Wrench,
  Zap
} from 'lucide-react'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import Sidebar, { type NavGroup } from './Sidebar'
import { TopbarSlotOutlet, TopbarSlotProvider } from './DashboardHeader'
import './Layout.css'

const LANGUAGE_KEY = 'hub-language'
const SIDEBAR_KEY = 'hub-sidebar-collapsed'
const DESKTOP_QUERY = '(min-width: 768px)'
/** Tailwind `xl`. Below this the 256px rail eats too much of the content column. */
const ROOMY_RAIL_QUERY = '(min-width: 1280px)'

/**
 * The rail has three states, not two.
 *
 * `null` means "the user has never expressed a preference", and only then does
 * the viewport decide (§9.4: icon rail between 1024px and 1280px). The moment
 * the user clicks the toggle we store an explicit choice, and from then on it
 * wins at every width, in both directions.
 */
type SidebarPreference = 'collapsed' | 'expanded' | null

function readSidebarPreference(): SidebarPreference {
  const stored = localStorage.getItem(SIDEBAR_KEY)
  if (stored === 'collapsed' || stored === '1') return 'collapsed'
  if (stored === 'expanded') return 'expanded'
  // Legacy '0' is NOT read back as an explicit "expanded". The previous build
  // wrote it on every mount whether or not the user ever clicked the toggle, so
  // every existing install carries one; honouring it would pin the rail open
  // and the responsive default below would never fire for anybody.
  return null
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
/**
 * The one route table for the whole console. The sidebar renders it and the
 * topbar breadcrumb derives its label from it, so the highlighted nav item and
 * the breadcrumb can never disagree.
 *
 * The breadcrumb is a `<span>` in a `<nav>`, not a heading: the chrome never
 * renders an `<h1>`. Each page owns its own heading via `<PageShell title>`.
 */
const navGroups: NavGroup[] = [
  {
    id: 'collaboration',
    label: { zh: '协作', en: 'Collaboration' },
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: { zh: '概览', en: 'Overview' } },
      { to: '/tasks', icon: ListTodo, label: { zh: '任务', en: 'Tasks' } },
      { to: '/workflows', icon: Workflow, label: { zh: '工作流', en: 'Workflows' } },
      { to: '/memory', icon: Brain, label: { zh: '记忆', en: 'Memory' } }
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
      { to: '/settings', icon: Settings, label: { zh: '设置', en: 'Settings' } }
    ]
  }
]

const copy = {
  zh: {
    skip: '跳到主要内容',
    openNav: '打开导航',
    fallbackTitle: '概览'
  },
  en: {
    skip: 'Skip to main content',
    openNav: 'Open navigation',
    fallbackTitle: 'Overview'
  }
} as const

export default function Layout() {
  const { pathname } = useLocation()
  const [language, setLanguage] = useState<AppLanguage>(
    () => (localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'zh')
  )
  const [sidebarPreference, setSidebarPreference] = useState<SidebarPreference>(readSidebarPreference)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const roomyRail = useMediaQuery(ROOMY_RAIL_QUERY)
  // One value drives the rail width, the label visibility and the tooltips, so
  // a 56px rail can never end up rendering clipped text instead of icons.
  const sidebarCollapsed = sidebarPreference ? sidebarPreference === 'collapsed' : !roomyRail

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language)
    document.documentElement.lang = language
  }, [language])

  // Deliberately never writes when the preference is null: persisting a default
  // the user never chose is what silently disabled the responsive rule before.
  useEffect(() => {
    if (!sidebarPreference) return
    // Write the unambiguous encoding, never legacy '1'/'0'. The reader discards
    // a legacy '0', so round-tripping "expanded" through it would silently drop
    // the one choice §9.4 most needs to survive: expanded at 1024-1280px.
    localStorage.setItem(SIDEBAR_KEY, sidebarPreference)
  }, [sidebarPreference])

  // Growing past the md breakpoint must not leave a modal sheet trapping focus.
  // (Route changes close the sheet through the nav items' own click handler.)
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileNavOpen(false)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const toggleLanguage = useCallback(() => setLanguage(value => (value === 'zh' ? 'en' : 'zh')), [])
  const toggleSidebar = useCallback(
    () => setSidebarPreference(sidebarCollapsed ? 'expanded' : 'collapsed'),
    [sidebarCollapsed]
  )
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), [])

  const text = copy[language]
  const pageTitle = useMemo(() => {
    const match = navGroups.flatMap(group => group.items).find(item => item.to === pathname)
    return match ? match.label[language] : text.fallbackTitle
  }, [pathname, language, text.fallbackTitle])

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
      <div className="flex h-svh overflow-hidden bg-canvas-deep p-3 text-ink gap-3 lg:gap-4 lg:p-4">
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
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 px-4 lg:px-6">
              <button
                type="button"
                className="hub-icon-btn grid md:hidden"
                aria-label={text.openNav}
                aria-controls="app-sidebar-sheet"
                aria-expanded={mobileNavOpen}
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="size-4" aria-hidden="true" />
              </button>

              <nav aria-label={text.openNav} className="flex min-w-0 items-center gap-2 text-sm">
                {pageGroup ? (
                  <span className="shrink-0 text-ink-3">{pageGroup}</span>
                ) : null}
                {pageGroup ? (
                  <ChevronRight className="size-3.5 shrink-0 text-ink-4" aria-hidden="true" />
                ) : null}
                <span className="min-w-0 truncate font-medium text-ink-2">{pageTitle}</span>
              </nav>

              <TopbarSlotOutlet className="ml-auto flex shrink-0 items-center gap-2" />
            </header>

            <main id="main-content" className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 lg:px-6 lg:py-8">
                <Outlet context={outletContext} />
              </div>
            </main>
          </div>
        </div>
      </div>
    </TopbarSlotProvider>
  )
}
