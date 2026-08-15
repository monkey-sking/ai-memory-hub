import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card } from './Card'

/* ------------------------------------------------------------- EventStream */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogEvent {
  time: ReactNode
  level: LogLevel
  message: ReactNode
  /** Optional inline code chip inside the message. */
  code?: ReactNode
}

const LEVEL: Record<LogLevel, { dot: string; text: string; label: string }> = {
  info: { dot: 'bg-info', text: 'text-info', label: 'INFO' },
  warn: { dot: 'bg-warning', text: 'text-warning', label: 'WARN' },
  error: { dot: 'bg-danger', text: 'text-danger', label: 'ERROR' },
  debug: { dot: 'bg-ink-4', text: 'text-ink-3', label: 'DEBUG' }
}

export function EventStream({ events, controls }: { events: LogEvent[]; controls?: ReactNode }) {
  return (
    <Card
      title="实时事件"
      toolbar={controls}
      flushBody
    >
      <div className="max-h-[340px] min-h-[260px] flex-1 overflow-y-auto px-[var(--card-pad)] py-1 font-mono text-[12.5px]">
        {events.length === 0 ? (
          <div className="py-10 text-center text-ink-4">暂无事件</div>
        ) : (
          events.map((e, i) => {
            const lv = LEVEL[e.level]
            return (
              <div key={i} className="grid grid-cols-[62px_58px_1fr] items-baseline gap-2.5 rounded-sm px-1.5 py-1 hover:bg-surface-sunk">
                <span className="text-ink-4 text-[11.5px]">{e.time}</span>
                <span className={cn('inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold', lv.text)}>
                  <span className={cn('size-1.5 rounded-full', lv.dot)} />
                  {lv.label}
                </span>
                <span className="text-ink-2">
                  {e.message}
                  {e.code ? <code className="ml-1 rounded-xs bg-surface-sunk px-1.5 py-0.5 text-link text-[11.5px]">{e.code}</code> : null}
                </span>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}

/* -------------------------------------------------------- ToolConnectionList */
export interface ToolConnectionItem {
  name: ReactNode
  version?: ReactNode
  latency?: ReactNode
  meta?: ReactNode
}

export function ToolConnectionList({
  items,
  title = '工具连接',
  onMore
}: {
  items: ToolConnectionItem[]
  title?: ReactNode
  onMore?: () => void
}) {
  return (
    <Card title={title} flushBody>
      <ul className="px-[var(--card-pad)] py-1.5">
        {items.length === 0 ? (
          <li className="py-10 text-center text-ink-4">暂无连接</li>
        ) : (
          items.map((it, i) => (
            <li
              key={i}
              className="grid grid-cols-[14px_1fr_auto_auto] items-center gap-2.5 border-b border-line py-2 last:border-b-0"
            >
              <span className="size-2 rounded-full bg-success" />
              <span className="truncate font-mono text-[13px] text-ink-1">{it.name}</span>
              {it.latency ? <span className="text-[11.5px] text-ink-3">{it.latency}</span> : null}
              {it.version ? <span className="text-[11.5px] text-ink-4">{it.version}</span> : null}
              {it.meta ? <span className="text-[11.5px] text-ink-3">{it.meta}</span> : null}
            </li>
          ))
        )}
      </ul>
      {onMore ? (
        <button
          type="button"
          onClick={onMore}
          className="flex w-full items-center gap-1 border-t border-line px-[var(--card-pad)] py-2 text-[12.5px] font-medium text-link transition-colors hover:bg-surface-sunk"
        >
          查看全部
        </button>
      ) : null}
    </Card>
  )
}

/* --------------------------------------------------------------- SplitRow */
export interface SplitRowProps {
  stream: ReactNode
  side: ReactNode
  className?: string
}

/**
 * Proto `.split` — 2.2fr event stream + 1fr tool-connection list. Collapses to
 * one column on narrow viewports.
 */
export function SplitRow({ stream, side, className }: SplitRowProps) {
  return (
    <div className={cn('grid gap-[var(--section-gap)] xl:grid-cols-[2.2fr_1fr]', className)}>
      {stream}
      {side}
    </div>
  )
}

export type { ComponentType }
