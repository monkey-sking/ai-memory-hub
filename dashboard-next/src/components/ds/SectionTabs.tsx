import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SectionTab {
  id: string
  label: ReactNode
  badge?: ReactNode
}

export interface SectionTabsProps {
  tabs: SectionTab[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/**
 * Proto `.tabs` — underlined text tabs, active one gets the accent 2px rule.
 * Used for in-page sections (e.g. overview / memory detail) beneath PageHead.
 */
export function SectionTabs({ tabs, active, onChange, className }: SectionTabsProps) {
  return (
    <div className={cn('flex gap-0.5 border-b border-line px-1', className)}>
      {tabs.map(tab => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex h-[38px] items-center gap-1.5 border-b-2 px-3.5 text-[13px] font-medium transition-colors',
              isActive ? 'border-accent-base text-ink-1' : 'border-transparent text-ink-3 hover:text-ink-1'
            )}
          >
            {tab.label}
            {tab.badge !== undefined ? (
              <span
                className={cn(
                  'grid h-[18px] min-w-[18px] place-items-center rounded-full border px-1.5 font-mono text-[11px] font-semibold',
                  isActive ? 'border-transparent bg-accent-tint text-accent-hover' : 'border-line bg-surface text-ink-4'
                )}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
