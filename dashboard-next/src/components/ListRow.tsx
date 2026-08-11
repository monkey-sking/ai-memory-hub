import type { ReactNode, KeyboardEvent, MouseEvent } from 'react'
import { cn } from '@/lib/utils'

export const LIST_ROW_HEIGHT = 56

interface ListRowProps {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  /** Keep trailing actions visible instead of revealing them on hover/focus. */
  actionsVisible?: boolean
  onOpen: () => void
  ariaLabel?: string
  className?: string
}

const isInteractive = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest('button, a, input, textarea, select, [role="menuitem"]'))

export function ListRow({ leading, title, subtitle, meta, actions, actionsVisible = false, onOpen, ariaLabel, className }: ListRowProps) {
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
       * List semantics live on `VirtualizedList` (its content is `role="list"`,
       * each item wrapper `role="listitem"`). This row stays a labelled `group`
       * inside that item — a listitem may legitimately contain a group. Keeping
       * the role here as `group` also covers the one place ListRow is used
       * OUTSIDE VirtualizedList (Dashboard's CommandCenter), where there is no
       * `role="list"` ancestor and a bare `listitem` would be an invalid tree.
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
      aria-haspopup="dialog"
    >
      {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-sm font-medium text-foreground">{title}</span>
        {subtitle ? <span className="truncate text-xs text-muted-foreground">{subtitle}</span> : null}
      </div>
      {meta ? (
        // Width-capped and breakpoint-gated: a 56px single-line row on a phone
        // cannot hold title + status/priority badges + action buttons at once.
        // Below `sm` the badges hide and status is still conveyed by the leading
        // status dot + the subtitle (project/assignee/time); from `sm` up there
        // is room. `max-w` + `overflow-hidden` + `whitespace-nowrap` keep the
        // meta on a single line and prevent a long meta (e.g. six comma-joined
        // filenames) from wrapping (which would grow the row past 56px and break
        // the virtualization math) or pushing the trailing actions past the
        // list viewport's `overflow-x: hidden` and making them unreachable.
        <div className="hidden min-w-0 max-w-[40%] items-center gap-2 overflow-hidden whitespace-nowrap sm:flex">{meta}</div>
      ) : null}
      {actions ? (
        <div
          className={cn(
            'flex shrink-0 items-center gap-1',
            // Hidden until hover/focus: opacity AND pointer-events must both
            // return on hover/focus, otherwise the buttons are revealed but
            // permanently unclickable (a regression from a too-aggressive
            // touch-mistap guard that left pointer-events:none with no reversal).
            !actionsVisible && 'opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto',
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  )
}
