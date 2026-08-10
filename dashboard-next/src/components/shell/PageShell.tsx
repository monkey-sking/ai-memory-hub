import * as React from 'react'
import { cn } from '@/lib/utils'
import './shell.css'

export interface PageShellProps {
  /** Page heading. Omit when the global header already owns the title (§4.4). */
  title?: React.ReactNode
  /** One-line supporting copy under the title. */
  description?: React.ReactNode
  /** Top-right actions (primary create button, refresh, exports…). */
  actions?: React.ReactNode
  /** Filter row. Render a `<FilterBar />` here. */
  toolbar?: React.ReactNode
  /** Lightweight status tabs rendered above the toolbar. */
  tabs?: React.ReactNode
  /** Main content region. */
  children?: React.ReactNode
  /** Optional footer, separated by a hairline. */
  footer?: React.ReactNode
  /** Vertical rhythm between regions. `default` = 24px, `tight` = 16px. */
  density?: 'default' | 'tight'
  className?: string
  headerClassName?: string
  contentClassName?: string
  footerClassName?: string
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

/**
 * The single page skeleton for every console panel.
 *
 * Regions are always laid out in this order: header → tabs → toolbar →
 * content → footer, separated by a consistent 24px rhythm. Safe to drop inside
 * the existing `.dashboard-section-*` wrappers — it adds no background,
 * border or horizontal padding of its own.
 */
const PageShell = React.forwardRef<HTMLElement, PageShellProps>(
  (
    {
      title,
      description,
      actions,
      toolbar,
      tabs,
      children,
      footer,
      density = 'default',
      className,
      headerClassName,
      contentClassName,
      footerClassName,
      ...rest
    },
    ref
  ) => {
    const hasHeader = Boolean(title || description || actions)
    return (
      <section
        ref={ref}
        data-slot="page-shell"
        className={cn(
          'flex min-w-0 flex-col',
          density === 'tight' ? 'gap-4' : 'gap-6',
          className
        )}
        {...rest}
      >
        {hasHeader ? (
          <header
            data-slot="page-shell-header"
            className={cn(
              'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
              headerClassName
            )}
          >
            {title || description ? (
              <div className="flex min-w-0 flex-col gap-1">
                {title ? (
                  <h1 className="truncate text-2xl font-normal text-ink">{title}</h1>
                ) : null}
                {description ? (
                  <p className="text-sm text-ink-3">{description}</p>
                ) : null}
              </div>
            ) : (
              <div className="min-w-0" />
            )}
            {actions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </header>
        ) : null}

        {tabs ? <div data-slot="page-shell-tabs">{tabs}</div> : null}

        {toolbar ? <div data-slot="page-shell-toolbar">{toolbar}</div> : null}

        <div
          data-slot="page-shell-content"
          className={cn('min-w-0 flex-1', contentClassName)}
        >
          {children}
        </div>

        {footer ? (
          <footer
            data-slot="page-shell-footer"
            className={cn(
              'flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm text-ink-3',
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
PageShell.displayName = 'PageShell'

export { PageShell }
