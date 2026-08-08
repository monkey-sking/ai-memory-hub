import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { AnyRecord } from '@/lib/api'
import { dashboardLabels } from '@/lib/dashboardCopy'
import type { AppOutletContext } from '@/lib/i18n'

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
    return <p className="text-center text-muted-foreground py-8">{emptyText}</p>
  }

  return (
    <ul className="overview-list" aria-label={emptyText}>
      {tasks.map((task, idx) => {
        const status = String(task.status || 'open')
        const title = String(task.title || '-')
        const project = String(task.project || '-')
        const assignee = String(task.assignee || task.createdBy || '-')

        return (
          <li key={idx} className="overview-list-item">
            <StatusBadge status={status} />
            <span className="overview-list-title">{title}</span>
            <span className="overview-list-meta">{project} · {assignee}</span>
          </li>
        )
      })}
    </ul>
  )
}

interface RadioListProps {
  messages: AnyRecord[]
  emptyText: string
  onSelect?: (message: AnyRecord) => void
}

export function RadioList({ messages, emptyText, onSelect }: RadioListProps) {
  if (!messages.length) {
    return <p className="text-center text-muted-foreground py-8">{emptyText}</p>
  }

  return (
    <ul className="overview-list">
      {messages.map((message, idx) => {
        const type = String(message.type || 'note')
        const from = String(message.from || '-')
        const to = String(message.to || '-')
        const text = String(message.text || '-')

        return (
          <li
            key={idx}
            className="overview-list-item overview-radio-item"
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onClick={() => onSelect?.(message)}
            onKeyDown={event => { if (onSelect && (event.key === "Enter" || event.key === " ")) onSelect(message) }}
          >
            <StatusBadge status={type} />
            <span className="overview-radio-route"><strong>{from}</strong><span aria-hidden="true">→</span><strong>{to}</strong></span>
            <span className="overview-list-meta overview-radio-text">{text}</span>
          </li>
        )
      })}
    </ul>
  )
}

interface ToolListProps {
  tools: AnyRecord[]
  emptyText: string
}

export function ToolList({ tools, emptyText }: ToolListProps) {
  if (!tools.length) {
    return <p className="text-center text-muted-foreground py-8">{emptyText}</p>
  }

  return (
    <ul className="overview-list">
      {tools.map((tool, idx) => {
        const name = String(tool.name || '-')
        const status = String(tool.connectionStatus || 'missing')
        const detail = String(tool.mode || tool.kind || 'runtime')

        return (
          <li key={idx} className="overview-list-item">
            <span className="overview-tool-icon" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
            <span className="overview-list-title">{name}</span>
            <span className="overview-list-meta">{detail}</span>
            <StatusBadge status={status} />
          </li>
        )
      })}
    </ul>
  )
}

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { language } = useOutletContext<AppOutletContext>()
  const statusLabels = dashboardLabels[language].statusLabels

  const statusVariants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    // Task statuses
    open: { variant: 'secondary' },
    claimed: { variant: 'default' },
    active: { variant: 'default' },
    completed: { variant: 'outline' },
    failed: { variant: 'destructive' },

    // Connection statuses
    connected: { variant: 'default' },
    ready: { variant: 'default' },
    missing: { variant: 'outline' },
    error: { variant: 'destructive' },

    // Message types
    note: { variant: 'secondary' },
    request: { variant: 'default' },
    response: { variant: 'outline' },
    handoff: { variant: 'default' },
  }

  const key = String(status || '').toLowerCase()
  const config = statusVariants[key] || { variant: 'outline' as const }
  const label = statusLabels[key as keyof typeof statusLabels] || status

  return (
    <Badge variant={config.variant} className="shrink-0">
      {label}
    </Badge>
  )
}




