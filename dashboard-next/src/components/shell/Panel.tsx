import * as React from 'react'
import { cn } from '@/lib/utils'

export interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Panel title. `text-sm font-semibold` — a panel head, not a page head. */
  title?: React.ReactNode
  /** Count pill next to the title. Rendered `tabular-nums` in a sunk chip. */
  count?: React.ReactNode
  /** Header right side. Buttons here MUST be `size="sm"` (32px). */
  actions?: React.ReactNode
  /** Status strip under the header — a `<StatusTabs />`. Same 48px rhythm. */
  tabs?: React.ReactNode
  /** Toolbar row under the tabs — a `<FilterBar />` or a row of chips. */
  toolbar?: React.ReactNode
  /** Footer row: pagination, totals, secondary actions. */
  footer?: React.ReactNode
  /** Drop the body's `p-4` — for tables and virtualized lists that bleed edge to edge. */
  flushBody?: boolean
  bodyClassName?: string
  headerClassName?: string
  toolbarClassName?: string
  footerClassName?: string
}

/**
 * The L1 panel surface — the bordered box that holds a list, a table or a
 * form. Distinct from `PageShell`, which is the chrome-less *page* skeleton
 * that stacks panels; a page has exactly one title (the sticky topbar owns
 * it), and every panel below it is a `Panel`.
 *
 * Elevation L1: border on `bg-surface`, NO shadow at rest. Radius 14px
 * (`rounded-xl`), a visible step above the 8px controls inside it — anything
 * nested on this surface must step down to `rounded-md` or `rounded-sm`.
 *
 * The invariants that actually produce the aligned look:
 *  - `px-4` on EVERY slot, so all left edges land on the same 16px line.
 *  - header / toolbar / footer are `shrink-0`; the body is the panel's ONLY
 *    scroll container (`min-h-0 flex-1 overflow-y-auto`).
 *  - `overflow-hidden` on the shell so the body scrollbar respects the corner.
 *  - `min-w-0` on the shell and on every truncating child, or grid columns
 *    blow out.
 *  - Slot separators are a 1px `border-line` — never a shadow, never a
 *    background change.
 *
 * Fixed heights, not padding: header `min-h-14`, toolbar `h-12`, footer `h-12`.
 */
const Panel = React.forwardRef<HTMLElement, PanelProps>(
  (
    {
      title,
      count,
      actions,
      tabs,
      toolbar,
      footer,
      flushBody = false,
      className,
      bodyClassName,
      headerClassName,
      toolbarClassName,
      footerClassName,
      children,
      ...rest
    },
    ref
  ) => {
    const hasHeader = Boolean(title || count !== undefined || actions)
    return (
      <section
        ref={ref}
        data-slot="panel"
        className={cn(
          'flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface',
          className
        )}
        {...rest}
      >
        {hasHeader ? (
          <header
            data-slot="panel-header"
            className={cn(
              'flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4',
              headerClassName
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              {title ? (
                <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
              ) : null}
              {count !== undefined && count !== null ? (
                <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-surface-sunk px-2 text-xs leading-4 tabular-nums text-ink-3">
                  {count}
                </span>
              ) : null}
            </div>
            {actions ? (
              <div className="flex shrink-0 items-center gap-2">{actions}</div>
            ) : null}
          </header>
        ) : null}

        {tabs ? (
          <div
            data-slot="panel-tabs"
            data-shell-rail=""
            className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-line px-4"
          >
            {tabs}
          </div>
        ) : null}

        {toolbar ? (
          <div
            data-slot="panel-toolbar"
            className={cn(
              'flex h-12 shrink-0 items-center gap-2 border-b border-line bg-fill px-4',
              toolbarClassName
            )}
          >
            {toolbar}
          </div>
        ) : null}

        <div
          data-slot="panel-body"
          className={cn('min-h-0 min-w-0 flex-1 overflow-y-auto', flushBody ? 'p-0' : 'p-4', bodyClassName)}
        >
          {children}
        </div>

        {footer ? (
          <footer
            data-slot="panel-footer"
            className={cn(
              'flex h-12 shrink-0 items-center justify-between gap-3 border-t border-line px-4 text-sm text-ink-3',
              footerClassName
            )}
          >
            {footer}
          </footer>
        ) : null}
      </section>
    )
  }
)
Panel.displayName = 'Panel'

export { Panel }
