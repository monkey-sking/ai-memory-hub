import type { ReactNode, KeyboardEvent, MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import { formatDate, formatRelativeTime } from '@/lib/api'

export const LIST_ROW_HEIGHT = 56

interface ListRowProps {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  timestamp?: string
  actions?: ReactNode
  /** Keep trailing actions visible instead of revealing them on hover/focus. */
  actionsVisible?: boolean
  onOpen: () => void
  ariaLabel?: string
  className?: string
}

const isInteractive = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest('button, a, input, textarea, select, [role="menuitem"]'))

export function ListRow({ leading, title, subtitle, meta, timestamp, actions, actionsVisible = false, onOpen, ariaLabel, className }: ListRowProps) {
  return (
    <div
      /*
       * NOT `role="button"`. The `actions` slot renders real `<button>`s inside
       * this element (see MemoryPanel's supersede action); `button` has a
       * presentational-children contract, so AT flattens those controls into
       * the row's own accessible name and they stop being reachable.
       * `group` permits interactive descendants, still accepts `aria-label`,
       * and keeps the row a single tab stop with the Enter/Space handler below.
       *
       * `role="listitem"` would be the better label, but `VirtualizedList`
       * renders no `role="list"` ancestor, and an orphan `listitem` is just a
       * different invalid tree. If that container ever gains `role="list"`,
       * swap this to `listitem`.
       */
      role="group"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={(event: MouseEvent<HTMLDivElement>) => { if (!isInteractive(event.target)) onOpen() }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'group flex h-full w-full cursor-pointer items-center gap-3 border-b border-border px-3 transition-colors',
        'hover:bg-surface-sunk focus-visible:bg-surface-sunk focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--color-focus),inset_2px_0_0_0_var(--color-accent-solid)]',
        className,
      )}
    >
      {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-sm font-medium text-foreground">{title}</span>
        {subtitle ? <span className="truncate text-xs text-muted-foreground">{subtitle}</span> : null}
      </div>
      {meta ? <div className="hidden shrink-0 items-center gap-2 lg:flex">{meta}</div> : null}
      {actions ? (
        <div
          className={cn(
            'flex shrink-0 items-center gap-1',
            !actionsVisible && 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
          )}
        >
          {actions}
        </div>
      ) : null}
      {timestamp ? (
        <time
          className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
          dateTime={timestamp}
          title={formatDate(timestamp, 'full')}
        >
          {formatRelativeTime(timestamp)}
        </time>
      ) : null}
    </div>
  )
}
