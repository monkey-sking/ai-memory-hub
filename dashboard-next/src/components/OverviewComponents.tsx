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
    <Card className="dashboard-metric-card">
      <CardHeader className="dashboard-metric-header">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="dashboard-metric-content">
        <div className="dashboard-metric-value-row">
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
    <Card className={cn('dashboard-panel-card', className)}>
      <CardHeader className="dashboard-panel-header">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="dashboard-panel-content">
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
    <div className="overview-task-cards">
      {tasks.map((task, idx) => {
        const status = String(task.status || 'open')
        const title = String(task.title || '-')
        const project = String(task.project || '-')
        const assignee = String(task.assignee || task.createdBy || '-')

        return (
          
          <article key={idx} className="overview-task-card">
            <div className="overview-task-card-top">
              <StatusBadge status={status} />
              <span className="overview-card-index">{String(idx + 1).padStart(2, '0')}</span>
            </div>
            <div className="overview-task-card-body">
              <p className="overview-task-card-title">{title}</p>
              <div className="overview-task-card-meta"><span>{project}</span><span>{assignee}</span></div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

interface RadioListProps {
  messages: AnyRecord[]
  emptyText: string
  onSelect?: (message: AnyRecord) => void
}

export function RadioList({ messages, emptyText, onSelect }: RadioListProps) {
  if (!messages.length) {
    return <div className="text-center text-muted-foreground py-8">{emptyText}</div>
  }

  return (
    <div className="overview-radio-cards">
      {messages.map((message, idx) => {
        const type = String(message.type || 'note')
        const from = String(message.from || '-')
        const to = String(message.to || '-')
        const text = String(message.text || '-')

        return (
          <article key={idx} className="overview-radio-card" role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined} onClick={() => onSelect?.(message)} onKeyDown={event => { if (onSelect && (event.key === "Enter" || event.key === " ")) onSelect(message) }}>
            <div className="overview-radio-card-header">
              <StatusBadge status={type} />
              <span className="overview-radio-route"><strong>{from}</strong><span>→</span><strong>{to}</strong></span>
            </div>
            <p className="overview-radio-text">{text}</p>
            <span className="overview-card-index">{String(idx + 1).padStart(2, '0')}</span>
          </article>        )
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
    <div className="overview-tool-cards">
      {tools.map((tool, idx) => {
        const name = String(tool.name || '-')
        const status = String(tool.connectionStatus || 'missing')

        return (
          <article key={idx} className="overview-tool-card">
            <div className="overview-tool-icon">{name.slice(0, 1).toUpperCase()}</div>
            <div className="overview-tool-copy"><strong>{name}</strong><span>{String(tool.mode || tool.kind || 'runtime')}</span></div>
            <StatusBadge status={status} />
          </article>        )
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




