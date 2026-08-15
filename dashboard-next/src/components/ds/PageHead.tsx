import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface PageHeadProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Right-aligned controls (refresh / add / segmented control). */
  actions?: ReactNode
  className?: string
}

/**
 * Proto `.page-head` — large 700/22px title + 13px subtitle, controls aligned
 * to the baseline on the right. Sits at the top of every console page.
 */
export function PageHead({ title, subtitle, actions, className }: PageHeadProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-4',
        className
      )}
    >
      <div className="flex min-w-0 flex-col">
        <h1 className="font-bold text-ink text-[22px] leading-[1.3] tracking-[-0.01em]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
