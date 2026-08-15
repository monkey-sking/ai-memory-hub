import * as React from 'react'
import { cn } from '@/lib/utils'

export interface StatTileProps {
  /** Short uppercase label. Always renders ABOVE the value. */
  label: React.ReactNode
  /** The number. Rendered `text-2xl tabular-nums`. */
  value: React.ReactNode
  /** Extra classes for the value `<span>` — e.g. a `tone` colour. */
  valueClassName?: string
  /** One line of supporting context under the value. */
  context?: React.ReactNode
  /** Trend text, e.g. `+12%`. Rendered as a neutral bordered chip, not colour. */
  trend?: React.ReactNode
  /** Small glyph inside the trend chip. */
  trendIcon?: React.ReactNode
  /** Optional glyph rendered in a tinted badge above the label. */
  icon?: React.ReactNode
  /**
   * Turns the whole tile into a link target. A tile either IS the action or
   * has none — never put a button inside one, it makes the hit area ambiguous
   * and breaks the uniform height.
   */
  onClick?: () => void
  className?: string
}

/**
 * A single metric tile. Replaces the old `.dashboard-metric-card`, which was
 * `flex: 1 1 150px` and therefore wrapped into ragged rows at arbitrary
 * breakpoints.
 *
 * The slot order is fixed — label → value → context, exactly three lines —
 * which is what gives a row of tiles a uniform height with no `min-h` hack.
 * Render them inside `StatTileGrid`, never a flex-wrap container.
 *
 * The trend is a NEUTRAL bordered chip on purpose. Colour in this console
 * means status (danger, warning, success); spending it on "number went up"
 * leaves nothing left to signal a real problem with.
 *
 * L1 surface: border, no shadow at rest. `rounded-xl` container, `rounded-full`
 * chip — the radius steps, so the chip reads as nested.
 */
const StatTile = React.forwardRef<HTMLDivElement, StatTileProps>(
  ({ label, value, valueClassName, context, trend, trendIcon, icon, onClick, className }, ref) => {
    const interactive = typeof onClick === 'function'
    return (
      <div
        ref={ref}
        data-slot="stat-tile"
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          interactive
            ? event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onClick()
                }
              }
            : undefined
        }
        className={cn(
          'flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-gradient-to-br from-accent-tint/60 to-surface p-4 shadow-xs',
          interactive &&
            'cursor-pointer transition-colors duration-[var(--dur-fast)] hover:border-line-strong hover:bg-gradient-to-br hover:from-accent-tint hover:to-surface focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
          className
        )}
      >
        {icon ? (
          <div className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-tint text-accent-base">
            {icon}
          </div>
        ) : null}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <span className="truncate text-xs font-medium uppercase tracking-wide text-ink-3">
            {label}
          </span>
          {trend ? (
            <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-line px-2 text-xs leading-4 tabular-nums text-ink-3">
              {trendIcon}
              {trend}
            </span>
          ) : null}
        </div>
        <span className={cn('truncate text-2xl font-semibold leading-none tabular-nums text-ink', valueClassName)}>
          {value}
        </span>
        <span className="min-h-4 truncate text-xs text-ink-3">{context}</span>
      </div>
    )
  }
)
StatTile.displayName = 'StatTile'

export interface StatTileGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Columns at `lg`. 2 columns below that, always. Defaults to 4. */
  columns?: 2 | 3 | 4
}

const gridColumns: Record<2 | 3 | 4, string> = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
}

/** Grid, not flex-wrap — a fixed column count is why tiles stay aligned. */
const StatTileGrid = React.forwardRef<HTMLDivElement, StatTileGridProps>(
  ({ className, columns = 4, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="stat-tile-grid"
      className={cn('grid grid-cols-2 gap-4', gridColumns[columns], className)}
      {...props}
    />
  )
)
StatTileGrid.displayName = 'StatTileGrid'

export { StatTile, StatTileGrid }
