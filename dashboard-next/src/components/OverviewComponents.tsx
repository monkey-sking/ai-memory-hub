import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { cn } from '@/lib/utils'
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
    warning: 'text-warning',
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




