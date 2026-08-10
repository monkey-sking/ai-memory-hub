import * as React from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export type EmptyStateSize = 'sm' | 'md'

export interface EmptyStateProps {
  /** Custom icon node. Defaults to an inbox glyph; pass `null` to hide it. */
  icon?: React.ReactNode
  title: string
  /** Should explain the next step (console standard §6). */
  description?: string
  /** Primary action node — usually a `<Button>`. */
  action?: React.ReactNode
  size?: EmptyStateSize
  className?: string
}

/**
 * "There is nothing here yet" state (§1.5). No frame and no fill: this always
 * renders inside a panel body, and the panel already supplies the border. The
 * previous dashed outline drew a white dashed box on a white panel, which read
 * as a stray artifact rather than structure.
 *
 * Vertical padding is fixed (`py-8` at `md`, `py-6` at `sm`): an empty state
 * must never be taller than the filled state it replaces, or the layout jumps
 * when the first record arrives. 32px is also the top of the allowed spacing
 * set — 48px would make an empty panel read as a different design system than
 * a populated one. Structure is strictly
 * icon → title → one sentence → at most one action.
 */
const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, size = 'md', className }, ref) => (
    <div
      ref={ref}
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'sm' ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-8',
        className
      )}
    >
      {icon === null ? null : (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-surface-sunk text-ink-3',
            size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
          )}
          aria-hidden="true"
        >
          {icon ?? <Inbox className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />}
        </div>
      )}
      <p className={cn('font-medium text-ink', size === 'sm' ? 'text-sm' : 'text-base')}>{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-ink-3">{description}</p>
      ) : null}
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  )
)
EmptyState.displayName = 'EmptyState'

export { EmptyState }
