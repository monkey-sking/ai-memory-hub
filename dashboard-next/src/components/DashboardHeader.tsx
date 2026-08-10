import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Download, Languages, MoreHorizontal, RefreshCw, Upload } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { cn } from '@/lib/utils'
import type { AppLanguage } from '../lib/i18n'

/**
 * Topbar slot
 * ---------------------------------------------------------------------------
 * The app chrome owns the sticky 56px topbar; pages own their data operations.
 * `TopbarSlotOutlet` marks the action region inside `Layout`'s `<header>` and
 * `DashboardHeader` portals into it, so a page can put controls in the chrome
 * without the chrome having to know anything about the page.
 */
const TopbarSlotContext = createContext<HTMLElement | null>(null)
const TopbarSlotSetterContext = createContext<(element: HTMLElement | null) => void>(() => {})

export function TopbarSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <TopbarSlotSetterContext.Provider value={setSlot}>
      <TopbarSlotContext.Provider value={slot}>{children}</TopbarSlotContext.Provider>
    </TopbarSlotSetterContext.Provider>
  )
}

export function TopbarSlotOutlet({ className }: { className?: string }) {
  const setSlot = useContext(TopbarSlotSetterContext)
  return <div ref={setSlot} className={className} />
}

const menuCopy = {
  zh: { more: '更多操作' },
  en: { more: 'More actions' }
} as const

interface DashboardHeaderProps {
  /**
   * Drives `document.title` only.
   *
   * This component renders no heading and no body copy — the visible `<h1>` and
   * its description belong to the page's own `<PageShell>`. Passing a title here
   * does not put anything on screen, so a page that omits `PageShell` will have
   * no heading at all (dashboard-console-standard §4.4).
   */
  title: string
  loading?: boolean
  busyAction?: string
  /** Localises the overflow-menu trigger. Defaults to `zh`, matching the app default. */
  language?: AppLanguage
  copy: {
    rebuildSnapshot: string
    syncInbox: string
    language: string
    refresh: string
    refreshing: string
    running: string
  }
  onRefresh: () => void
  onPull: () => void
  onSync: () => void
  onToggleLanguage: () => void
}

export function DashboardHeader({
  title,
  loading,
  busyAction,
  language = 'zh',
  copy,
  onRefresh,
  onPull,
  onSync,
  onToggleLanguage
}: DashboardHeaderProps) {
  const slot = useContext(TopbarSlotContext)
  const isBusy = Boolean(loading) || Boolean(busyAction)

  useEffect(() => {
    if (title) document.title = `${title} · AI Memory Hub`
  }, [title])

  const pullLabel = busyAction === 'pull' ? copy.running : copy.rebuildSnapshot
  const syncLabel = busyAction === 'sync' ? copy.running : copy.syncInbox
  const refreshLabel = loading ? copy.refreshing : copy.refresh

  const actions = (
    <>
      <button
        type="button"
        className="hub-icon-btn grid"
        onClick={onRefresh}
        disabled={loading}
        aria-label={refreshLabel}
        title={refreshLabel}
      >
        <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" />
      </button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="hub-icon-btn grid"
            aria-label={menuCopy[language].more}
            title={menuCopy[language].more}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content className="hub-menu" align="end" sideOffset={8} collisionPadding={8}>
            <DropdownMenu.Item className="hub-menu-item" disabled={isBusy} onSelect={onPull}>
              <Download className="size-4 shrink-0" aria-hidden="true" />
              <span>{pullLabel}</span>
            </DropdownMenu.Item>

            <DropdownMenu.Item className="hub-menu-item" disabled={isBusy} onSelect={onSync}>
              <Upload className="size-4 shrink-0" aria-hidden="true" />
              <span>{syncLabel}</span>
            </DropdownMenu.Item>

            <DropdownMenu.Separator className="hub-menu-sep" />

            <DropdownMenu.Item className="hub-menu-item" onSelect={onToggleLanguage}>
              <Languages className="size-4 shrink-0" aria-hidden="true" />
              <span>{copy.language}</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  )

  // Renders nothing in place: the actions are portalled into the topbar and the
  // title is only used for `document.title`.
  return slot ? createPortal(actions, slot) : null
}
