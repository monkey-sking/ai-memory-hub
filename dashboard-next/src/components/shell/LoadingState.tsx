import * as React from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import './shell.css'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Turn the shimmer off (e.g. for a static placeholder). */
  animate?: boolean
}

/**
 * Shimmer block.
 *
 * The animation is the `amh-skeleton` background-colour cycle in shell.css,
 * NOT Tailwind's built-in opacity pulse — see that rule for why an opacity
 * swing makes a near-white skeleton vanish at the trough.
 * `prefers-reduced-motion` is handled globally in index.css.
 */
const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, animate = true, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="skeleton"
      data-animate={animate ? 'true' : undefined}
      className={cn('rounded-sm bg-surface-sunk', className)}
      {...props}
    />
  )
)
Skeleton.displayName = 'Skeleton'

export type LoadingStateVariant = 'spinner' | 'skeleton' | 'rows'

export interface LoadingStateProps {
  /**
   * `spinner` — centred spinner + label (small regions, buttons-adjacent).
   * `skeleton` — stacked text-line placeholders.
   * `rows` — repeated list-row placeholders (avatar + two lines).
   */
  variant?: LoadingStateVariant
  /** Visible + `aria-label` copy. Comes from dashboardCopy. */
  label?: string
  /** Placeholder count for `skeleton` / `rows`. Defaults to 3. */
  rows?: number
  size?: 'sm' | 'md'
  className?: string
}

/**
 * "We are fetching this" state (§1.5, §5.2 — never blank space).
 */
const LoadingState = React.forwardRef<HTMLDivElement, LoadingStateProps>(
  ({ variant = 'spinner', label, rows = 3, size = 'md', className }, ref) => {
    const count = Math.max(1, rows)

    if (variant === 'spinner') {
      return (
        <div
          ref={ref}
          data-slot="loading-state"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={label}
          className={cn(
            'flex flex-col items-center justify-center gap-2 text-ink-3',
            size === 'sm' ? 'py-4' : 'py-8',
            className
          )}
        >
          <LoaderCircle
            className={cn('animate-spin', size === 'sm' ? 'h-4 w-4' : 'h-5 w-5')}
            aria-hidden="true"
          />
          {label ? <span className="text-sm">{label}</span> : null}
        </div>
      )
    }

    return (
      <div
        ref={ref}
        data-slot="loading-state"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={label}
        className={cn('flex flex-col gap-3', className)}
      >
        {label ? <span className="sr-only">{label}</span> : null}
        {Array.from({ length: count }, (_, index) =>
          variant === 'rows' ? (
            <div
              key={index}
              className="flex items-center gap-3 rounded-sm border border-line bg-surface p-3"
            >
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
            </div>
          ) : (
            <div key={index} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          )
        )}
      </div>
    )
  }
)
LoadingState.displayName = 'LoadingState'

export { LoadingState, Skeleton }
