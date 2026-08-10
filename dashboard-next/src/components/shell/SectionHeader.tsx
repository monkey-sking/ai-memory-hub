import * as React from 'react'
import { cn } from '@/lib/utils'

export type SectionHeaderSize = 'sm' | 'md' | 'lg'

export interface SectionHeaderProps {
  /** Small uppercase label above the title — step numbers, group names… */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  /** Inline count chip rendered right after the title. `0` is rendered. */
  count?: number | string
  description?: React.ReactNode
  /** Right-aligned controls. */
  actions?: React.ReactNode
  size?: SectionHeaderSize
  /** Heading level. Defaults to `h2`. */
  as?: 'h2' | 'h3' | 'h4'
  /** Draw a hairline under the header. */
  divider?: boolean
  className?: string
  titleClassName?: string
  id?: string
}

const titleSizes: Record<SectionHeaderSize, string> = {
  sm: 'text-sm font-semibold',
  md: 'text-base font-semibold',
  lg: 'text-lg font-semibold',
}

/**
 * Heading for a section inside a page (numbered overview sections, card
 * headers, dialog sub-sections). Never renders literal copy of its own — all
 * strings arrive via props.
 */
const SectionHeader = React.forwardRef<HTMLDivElement, SectionHeaderProps>(
  (
    {
      eyebrow,
      title,
      count,
      description,
      actions,
      size = 'md',
      as = 'h2',
      divider = false,
      className,
      titleClassName,
      id,
    },
    ref
  ) => {
    const Heading = as
    return (
      <div
        ref={ref}
        data-slot="section-header"
        className={cn(
          'flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
          divider && 'border-b border-line pb-3',
          className
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow ? (
            <div className="text-xs font-medium uppercase tracking-wide text-ink-3">
              {eyebrow}
            </div>
          ) : null}
          <div className="flex min-w-0 items-center gap-2">
            <Heading
              id={id}
              className={cn('min-w-0 truncate text-ink', titleSizes[size], titleClassName)}
            >
              {title}
            </Heading>
            {count !== undefined && count !== null ? (
              <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-surface-sunk px-2 text-xs font-medium tabular-nums text-ink-2">
                {count}
              </span>
            ) : null}
          </div>
          {description ? <p className="text-sm text-ink-3">{description}</p> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    )
  }
)
SectionHeader.displayName = 'SectionHeader'

export { SectionHeader }
