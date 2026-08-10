import * as React from 'react'
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger'

export interface CalloutProps {
  /** Which semantic tint to use. Drives colour, icon and ARIA role. */
  tone?: CalloutTone
  /** Custom icon node. Defaults to the tone's glyph; pass `null` to hide. */
  icon?: React.ReactNode
  /** One-line summary. */
  title: React.ReactNode
  /** Optional supporting copy under the title. */
  description?: React.ReactNode
  /** Trailing action node — usually a `size="sm"` `<Button>`. */
  action?: React.ReactNode
  className?: string
}

const toneStyles: Record<CalloutTone, string> = {
  info: 'border-info-line bg-info-tint text-info-text',
  success: 'border-success-line bg-success-tint text-success-text',
  warning: 'border-warning-line bg-warning-tint text-warning-text',
  danger: 'border-danger-line bg-danger-tint text-danger-text',
}

const toneIcons: Record<CalloutTone, React.ReactNode> = {
  info: <Info className="h-4 w-4" aria-hidden="true" />,
  success: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
  warning: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
  danger: <OctagonAlert className="h-4 w-4" aria-hidden="true" />,
}

/**
 * A one-line tinted notice: "saved", "this will be written to X", "plaintext
 * token warning".
 *
 * This is the non-failure sibling of `<ErrorState variant="inline" />` and
 * deliberately shares its geometry (`rounded-md`, `px-3 py-2`, `text-sm`,
 * 16px icon) so a success and a failure banner in the same slot never jump.
 * Reach for `ErrorState` when an operation *failed* and the user has lost
 * something; reach for `Callout` for everything else. Rendering a success
 * message through `ErrorState` paints it danger-red, which is what this
 * component exists to prevent.
 *
 * `info`/`success` announce politely via `role="status"`; `warning`/`danger`
 * interrupt via `role="alert"`.
 */
const Callout = React.forwardRef<HTMLDivElement, CalloutProps>(
  ({ tone = 'info', icon, title, description, action, className }, ref) => {
    const glyph = icon === null ? null : (icon ?? toneIcons[tone])
    const assertive = tone === 'warning' || tone === 'danger'

    return (
      <div
        ref={ref}
        data-slot="callout"
        data-tone={tone}
        role={assertive ? 'alert' : 'status'}
        className={cn(
          'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
          toneStyles[tone],
          className
        )}
      >
        {glyph ? <span className="flex h-5 shrink-0 items-center">{glyph}</span> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-medium">{title}</p>
          {description ? <p className="opacity-90">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    )
  }
)
Callout.displayName = 'Callout'

export { Callout }
