import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ErrorStateProps {
  /** Custom icon node. Defaults to a warning triangle; pass `null` to hide. */
  icon?: React.ReactNode
  /** Human-readable summary — not the raw exception (§6). */
  title: string
  description?: string
  /** Raw error text, tucked into a collapsed technical-details block. */
  detail?: string
  /** Summary copy for the technical-details block. Required to show `detail`. */
  detailLabel?: string
  /** Retry / recover action node — usually a `<Button>`. */
  action?: React.ReactNode
  /** `block` = full-width panel state, `inline` = one-line banner above a list. */
  variant?: 'block' | 'inline'
  className?: string
}

/**
 * "This failed" state (§1.5). Always danger-tinted so it can never be mistaken
 * for an empty list.
 */
const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  (
    {
      icon,
      title,
      description,
      detail,
      detailLabel,
      action,
      variant = 'block',
      className,
    },
    ref
  ) => {
    const glyph =
      icon === null ? null : (icon ?? <AlertTriangle className="h-4 w-4" aria-hidden="true" />)

    if (variant === 'inline') {
      return (
        <div
          ref={ref}
          data-slot="error-state"
          role="alert"
          className={cn(
            'flex items-start gap-2 rounded-md border border-danger-line bg-danger-tint px-3 py-2 text-sm text-danger-text',
            className
          )}
        >
          {glyph ? <span className="flex h-5 shrink-0 items-center">{glyph}</span> : null}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-medium">{title}</p>
            {description ? <p className="text-danger-text/90">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )
    }

    return (
      <div
        ref={ref}
        data-slot="error-state"
        role="alert"
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-sm border border-danger-line bg-danger-tint px-6 py-8 text-center',
            className
          )}
        >
          {glyph ? (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-danger"
              aria-hidden="true"
            >
              {glyph}
            </div>
          ) : null}
          <p className="text-base font-medium text-danger-text">{title}</p>
        {description ? (
          <p className="max-w-md text-sm text-ink-2">{description}</p>
        ) : null}
        {action ? <div className="flex items-center gap-2">{action}</div> : null}
        {detail && detailLabel ? (
          <details className="w-full max-w-xl text-left">
            <summary className="cursor-pointer text-xs font-medium text-ink-3 hover:text-ink-2">
              {detailLabel}
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-sm bg-surface p-3 font-mono text-xs whitespace-pre-wrap text-ink-2">
              {detail}
            </pre>
          </details>
        ) : null}
      </div>
    )
  }
)
ErrorState.displayName = 'ErrorState'

export { ErrorState }
