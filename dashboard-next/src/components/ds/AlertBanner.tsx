import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type BannerTone = 'info' | 'success' | 'warning' | 'error'

const TONE: Record<BannerTone, { wrap: string; icon: typeof Info }> = {
  info: { wrap: 'border-l-info bg-info-tint text-info-text', icon: Info },
  success: { wrap: 'border-l-success bg-success-tint text-success-text', icon: CheckCircle2 },
  warning: { wrap: 'border-l-warning bg-warning-tint text-warning-text', icon: AlertTriangle },
  error: { wrap: 'border-l-danger bg-danger-tint text-danger-text', icon: XCircle }
}

export interface AlertBannerProps {
  tone?: BannerTone
  title: ReactNode
  description?: ReactNode
  /** Optional dismiss handler — renders a close button. */
  onDismiss?: () => void
  className?: string
}

/**
 * Proto `.banner` — 3px left accent edge + icon dual-encoding + title/desc.
 * Tone drives both the edge colour and the icon, so the alert reads at a
 * glance without relying on text alone.
 */
export function AlertBanner({ tone = 'info', title, description, onDismiss, className }: AlertBannerProps) {
  const t = TONE[tone]
  const Icon = t.icon
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-md border-l-[3px] px-3.5 py-2.5',
        t.wrap,
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink-1">{title}</p>
        {description ? <p className="mt-0.5 text-[12.5px] text-ink-2">{description}</p> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="关闭"
          className="grid size-6 shrink-0 place-items-center rounded-sm text-ink-3 transition-colors hover:bg-ink-1/10 hover:text-ink-1"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
