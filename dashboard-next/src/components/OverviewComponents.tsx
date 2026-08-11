import { Panel as ShellPanel, StatTile } from '@/components/shell'
import { Badge } from './ui/badge'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { dashboardLabels } from '@/lib/dashboardCopy'
import type { AppOutletContext } from '@/lib/i18n'
import { statusBadgeVariant } from '@/lib/statusBadge'

  interface MetricCardProps {
    label: string
    value: string
    tone?: 'default' | 'success' | 'warning' | 'error'
    trend?: 'up' | 'down' | 'neutral'
    className?: string
  }

  export function MetricCard({ label, value, tone = 'default', trend, className }: MetricCardProps) {
    const toneColors = {
      default: 'text-foreground',
      success: 'text-primary',
      warning: 'text-warning',
      error: 'text-destructive'
    }

    const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

    return (
      <StatTile
        label={label}
        value={value}
        valueClassName={toneColors[tone]}
        trend={trend ? (trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→') : undefined}
        trendIcon={trend ? <TrendIcon /> : undefined}
        className={className}
      />
    )
  }

interface PanelProps {
  title: string
  children: React.ReactNode
  className?: string
}

  export function Panel({ title, children, className }: PanelProps) {
    return (
      <ShellPanel title={title} className={cn('dashboard-panel-card', className)} bodyClassName="dashboard-panel-content">
        {children}
      </ShellPanel>
    )
  }


interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { language } = useOutletContext<AppOutletContext>()
  const statusLabels = dashboardLabels[language].statusLabels

  const key = String(status || '').toLowerCase()
  const variant = statusBadgeVariant(status)
  const label = statusLabels[key as keyof typeof statusLabels] || status

  return (
    <Badge variant={variant} className="shrink-0">
      {label}
    </Badge>
  )
}




