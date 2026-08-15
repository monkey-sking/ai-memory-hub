import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export type Tone = 'success' | 'info' | 'neutral' | 'warning' | 'danger'

const DOT: Record<Tone, string> = {
  success: 'bg-success',
  info: 'bg-info',
  neutral: 'bg-ink-4',
  warning: 'bg-warning',
  danger: 'bg-destructive'
}

export interface ToolCardProps {
  name: string
  displayName?: string
  tone?: Tone
  badgeText?: string
  version?: string
  lastRun?: string
  enabled?: boolean
  onView?: () => void
}

/**
 * Proto-next `.tool-card` — 状态点 + 名称 + 状态徽章 + 版本/最近运行 + 启用开关 + 查看。
 * 颜色全部走 token 类，零硬编码。
 */
export function ToolCard({
  name,
  displayName,
  tone = 'neutral',
  badgeText,
  version,
  lastRun,
  enabled = false,
  onView
}: ToolCardProps) {
  return (
    <article className="group flex flex-col gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-line-strong">
      <div className="flex items-center gap-2.5">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[tone])} />
        <span className="truncate font-medium text-ink">{displayName ?? name}</span>
        <Badge variant={tone} dot className="ml-auto">
          {badgeText ?? name}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        {version ? (
          <span>
            版本 <span className="font-mono text-ink-2">{version}</span>
          </span>
        ) : null}
        {lastRun ? (
          <span>
            最近运行 <span className="text-ink-2">{lastRun}</span>
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-xs text-ink-2">
          <span
            className={cn(
              'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
              enabled ? 'bg-accent-base' : 'bg-line-strong'
            )}
          >
            <span
              className={cn(
                'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                enabled ? 'translate-x-3.5' : 'translate-x-0.5'
              )}
            />
          </span>
          {enabled ? '已启用' : '已停用'}
        </span>
        <Button variant="ghost" size="sm" onClick={onView}>
          查看
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </article>
  )
}
