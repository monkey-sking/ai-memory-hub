import type { ComponentType } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { cn } from '@/lib/utils'
import type { AppLanguage } from '../lib/i18n'
import { APP_VERSION } from '../lib/version'
import './Sidebar.css'

export type NavLabel = { zh: string; en: string }

export type NavItem = {
  to: string
  icon: ComponentType<{ className?: string }>
  label: NavLabel
}

export type NavGroup = {
  id: string
  label: NavLabel
  items: NavItem[]
}

interface SidebarProps {
  groups: NavGroup[]
  language: AppLanguage
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

const GROUPS_KEY = 'hub-sidebar-groups'

const copy = {
  zh: {
    nav: '控制台导航',
    expand: '展开导航',
    collapse: '收起导航',
    close: '关闭导航',
    version: '当前版本',
    kicker: '协作控制台'
  },
  en: {
    nav: 'Console navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    close: 'Close navigation',
    version: 'Current version',
    kicker: 'Collaboration Console'
  }
} as const

function readCollapsedGroups(): string[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

interface SidebarBodyProps {
  groups: NavGroup[]
  language: AppLanguage
  collapsed: boolean
  collapsedGroups: string[]
  onToggleGroup: (id: string) => void
  onNavigate?: () => void
  onToggleCollapse?: () => void
}

function SidebarBody({
  groups,
  language,
  collapsed,
  collapsedGroups,
  onToggleGroup,
  onNavigate,
  onToggleCollapse
}: SidebarBodyProps) {
  const text = copy[language]
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose
  const collapseLabel = collapsed ? text.expand : text.collapse

  return (
    <>
      {/* Brand — height = topbar (--bar-h) so the two align on one line. */}
      <div
        className={cn(
          'flex h-[var(--bar-h)] shrink-0 items-center gap-2 border-b border-line',
          collapsed ? 'justify-center px-2' : 'px-3'
        )}
      >
        <span
          className="grid size-[22px] shrink-0 place-items-center rounded-sm bg-accent-base text-[11px] font-bold text-white"
          aria-hidden="true"
        >
          AI
        </span>
        {!collapsed && (
          <span className="grid min-w-0">
            <strong className="truncate text-[13px] font-semibold leading-[1.15] text-ink-1">AI Memory Hub</strong>
            <span className="truncate text-[10px] uppercase tracking-[0.02em] text-ink-4">{text.kicker}</span>
          </span>
        )}
      </div>

      <nav className="app-sidebar-nav flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-0 py-1" aria-label={text.nav}>
        {groups.map(group => {
          const groupCollapsed = !collapsed && collapsedGroups.includes(group.id)
          return (
            <div key={group.id} className="flex flex-col">
              {collapsed ? (
                <span className="mx-auto mb-1 mt-1 h-px w-5 shrink-0 bg-line-strong" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  onClick={() => onToggleGroup(group.id)}
                  aria-expanded={!groupCollapsed}
                  className="flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 transition-colors hover:bg-surface-sunk hover:text-ink-2"
                >
                  <span className="truncate">{group.label[language]}</span>
                  <ChevronDown
                    className={cn('ml-auto size-3 shrink-0 text-ink-4 transition-transform', groupCollapsed && '-rotate-90')}
                    aria-hidden="true"
                  />
                </button>
              )}

              {!groupCollapsed &&
                group.items.map(item => {
                  const Icon = item.icon
                  const label = item.label[language]
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={onNavigate}
                      aria-label={collapsed ? label : undefined}
                      title={collapsed ? label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'relative flex h-[var(--row-h)] shrink-0 items-center rounded-sm text-[13px] font-medium text-ink-2 transition-colors',
                          collapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
                          !collapsed && 'mx-[var(--space-3)]',
                          isActive
                            ? 'bg-surface text-ink-1'
                            : 'hover:bg-surface-sunk hover:text-ink-1'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive ? (
                            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent-base" aria-hidden="true" />
                          ) : null}
                          <Icon className={cn('size-4 shrink-0', isActive ? 'text-accent-base' : 'text-ink-3')} />
                          {!collapsed && <span className="truncate">{label}</span>}
                        </>
                      )}
                    </NavLink>
                  )
                })}
            </div>
          )
        })}
      </nav>

      <div
        className={cn(
          'flex h-10 shrink-0 items-center gap-2 border-t border-line px-2',
          collapsed && 'justify-center'
        )}
      >
        {!collapsed && (
          <span className="truncate font-mono text-[11px] font-medium text-ink-3" aria-label={text.version} title={`v${APP_VERSION}`}>
            v{APP_VERSION}
          </span>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            className={cn('hub-icon-btn grid', !collapsed && 'ml-auto')}
            onClick={onToggleCollapse}
            aria-label={collapseLabel}
            aria-pressed={collapsed}
            title={collapseLabel}
          >
            <CollapseIcon className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </>
  )
}

export default function Sidebar({
  groups,
  language,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile
}: SidebarProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>(readCollapsedGroups)
  const text = copy[language]

  useEffect(() => {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(collapsedGroups))
  }, [collapsedGroups])

  const toggleGroup = useCallback((id: string) => {
    setCollapsedGroups(current =>
      current.includes(id) ? current.filter(value => value !== id) : [...current, id]
    )
  }, [])

  return (
    <>
      {/* Desktop rail — flat, border-defined (proto `.sidebar`). */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col overflow-hidden border-r border-line bg-canvas transition-[width] duration-200 ease-out md:flex',
          collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]'
        )}
      >
        <SidebarBody
          groups={groups}
          language={language}
          collapsed={collapsed}
          collapsedGroups={collapsedGroups}
          onToggleGroup={toggleGroup}
          onToggleCollapse={onToggleCollapse}
        />
      </aside>

      {/* Below md the rail becomes a modal off-canvas sheet. */}
      <Dialog.Root open={mobileOpen} onOpenChange={open => { if (!open) onCloseMobile() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="app-sidebar-overlay" />
          <Dialog.Content id="app-sidebar-sheet" className="app-sidebar-sheet" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">{text.nav}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="hub-icon-btn absolute right-2 top-3 grid" aria-label={text.close}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </Dialog.Close>
            <SidebarBody
              groups={groups}
              language={language}
              collapsed={false}
              collapsedGroups={collapsedGroups}
              onToggleGroup={toggleGroup}
              onNavigate={onCloseMobile}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
