import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  /** Right-aligned controls inside the card header. */
  toolbar?: ReactNode
  /** Small mono count chip rendered after the title. */
  count?: ReactNode
  /** Meta text on the far right of the header (mono, muted). */
  meta?: ReactNode
  /** When true, the body has no padding (caller owns it — tables, lists). */
  flushBody?: boolean
  className?: string
  bodyClassName?: string
  children?: ReactNode
}

/**
 * Proto `.card` — `bg-surface` + `border-line` + `rounded-lg`, header with
 * title / subtitle / toolbar. Body padding follows the density token
 * (`--card-pad`). All colour comes from design tokens; zero hardcoding.
 */
export function Card({
  title,
  subtitle,
  toolbar,
  count,
  meta,
  flushBody,
  className,
  bodyClassName,
  children
}: CardProps) {
  const hasHead = Boolean(title || subtitle || toolbar || count || meta)
  return (
    <section
      className={cn(
        'flex flex-col rounded-lg border border-line bg-surface',
        className
      )}
    >
      {hasHead ? (
        <header className="flex items-start justify-between gap-3 px-[var(--card-pad)] pt-[var(--card-pad)]">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              {title ? (
                <h2 className="truncate font-semibold text-ink text-[14px] leading-[1.4]">{title}</h2>
              ) : null}
              {count !== undefined ? (
                <span className="font-mono text-xs font-medium text-ink-4">{count}</span>
              ) : null}
            </div>
            {subtitle ? <p className="text-xs text-ink-3">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {toolbar}
            {meta ? <span className="font-mono text-xs font-medium text-ink-4">{meta}</span> : null}
          </div>
        </header>
      ) : null}
      <div className={cn('min-w-0', !flushBody && 'p-[var(--card-pad)]', bodyClassName)}>
        {children}
      </div>
    </section>
  )
}
