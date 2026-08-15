import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Tone } from './ToolCard'

const DOT: Record<Tone, string> = {
  success: 'bg-success',
  info: 'bg-info',
  neutral: 'bg-ink-4',
  warning: 'bg-warning',
  danger: 'bg-destructive'
}

export interface SummaryItem {
  label: string
  value: ReactNode
  tone?: Tone
}

/**
 * Proto-next 顶部摘要条 — 已连接/总数/离线 + 右侧"最近同步"。
 * 颜色走 token 类，零硬编码。
 */
export function SummaryStrip({ items, note }: { items: SummaryItem[]; note?: ReactNode }) {
  return (
    <section className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border border-line bg-surface px-4 py-3">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', DOT[item.tone ?? 'neutral'])} />
          <span className="text-xs text-ink-3">{item.label}</span>
          <b className="font-mono text-[15px] leading-none text-ink-1">{item.value}</b>
        </div>
      ))}
      {note ? <span className="ml-auto font-mono text-xs text-ink-4">{note}</span> : null}
    </section>
  )
}
