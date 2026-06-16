import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AnyRecord } from '@/lib/api'

interface MetricCardProps {
  label: string
  value: string
  tone?: 'default' | 'success' | 'warning' | 'error'
  trend?: 'up' | 'down' | 'neutral'
}

export function MetricCard({ label, value, tone = 'default', trend }: MetricCardProps) {
  const toneColors = {
    default: 'text-foreground',
    success: 'text-primary',
    warning: 'text-yellow-500',
    error: 'text-destructive'
  }

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <div className={cn('text-3xl font-bold', toneColors[tone])}>
            {value}
          </div>
          {trend && (
            <TrendIcon className={cn(
              'w-4 h-4',
              trend === 'up' && 'text-primary',
              trend === 'down' && 'text-destructive',
              trend === 'neutral' && 'text-muted-foreground'
            )} />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface PanelProps {
  title: string
  children: React.ReactNode
  className?: string
}

export function Panel({ title, children, className }: PanelProps) {
  return (
    <Card className={className}>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        {children}
      </CardContent>
    </Card>
  )
}

interface TaskListProps {
  tasks: AnyRecord[]
  emptyText: string
}

export function TaskList({ tasks, emptyText }: TaskListProps) {
  if (!tasks.length) {
    return <div className="text-center text-muted-foreground py-8">{emptyText}</div>
  }

  return (
    <div className="space-y-3">
      {tasks.map((task, idx) => {
        const status = String(task.status || 'open')
        const title = String(task.title || '-')
        const project = String(task.project || '-')
        const assignee = String(task.assignee || task.createdBy || '-')

        return (
          <div key={idx} className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors">
            <StatusBadge status={status} />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{title}</p>
              <p className="text-sm text-muted-foreground">
                {project} · {assignee}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface RadioListProps {
  messages: AnyRecord[]
  emptyText: string
}

export function RadioList({ messages, emptyText }: RadioListProps) {
  if (!messages.length) {
    return <div className="text-center text-muted-foreground py-8">{emptyText}</div>
  }

  return (
    <div className="space-y-4">
      {messages.map((message, idx) => {
        const type = String(message.type || 'note')
        const from = String(message.from || '-')
        const to = String(message.to || '-')
        const text = String(message.text || '-')

        return (
          <div key={idx} className="p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status={type} />
              <span className="text-sm text-muted-foreground">
                {from} → {to}
              </span>
            </div>
            <p className="text-sm">{text}</p>
          </div>
        )
      })}
    </div>
  )
}

interface ToolListProps {
  tools: AnyRecord[]
  emptyText: string
}

export function ToolList({ tools, emptyText }: ToolListProps) {
  if (!tools.length) {
    return <div className="text-center text-muted-foreground py-8">{emptyText}</div>
  }

  return (
    <div className="space-y-2">
      {tools.map((tool, idx) => {
        const name = String(tool.name || '-')
        const status = String(tool.connectionStatus || 'missing')

        return (
          <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
            <StatusBadge status={status} />
            <span className="truncate flex-1">{name}</span>
          </div>
        )
      })}
    </div>
  )
}

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const statusVariants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label?: string }> = {
    // Task statuses
    open: { variant: 'secondary', label: 'Open' },
    claimed: { variant: 'default', label: 'Claimed' },
    active: { variant: 'default', label: 'Active' },
    completed: { variant: 'outline', label: 'Done' },
    failed: { variant: 'destructive', label: 'Failed' },

    // Connection statuses
    connected: { variant: 'default', label: 'Connected' },
    ready: { variant: 'default', label: 'Ready' },
    missing: { variant: 'outline', label: 'Missing' },
    error: { variant: 'destructive', label: 'Error' },

    // Message types
    note: { variant: 'secondary', label: 'Note' },
    request: { variant: 'default', label: 'Request' },
    response: { variant: 'outline', label: 'Response' },
    handoff: { variant: 'default', label: 'Handoff' },
  }

  const config = statusVariants[status.toLowerCase()] || { variant: 'outline' as const }
  const label = config.label || status

  return (
    <Badge variant={config.variant} className="shrink-0">
      {label}
    </Badge>
  )
}
