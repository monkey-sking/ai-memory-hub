import { RefreshCw, Download, Upload, Languages } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

interface DashboardHeaderProps {
  title: string
  subtitle?: string
  loading?: boolean
  busyAction?: string
  copy: {
    rebuildSnapshot: string
    syncInbox: string
    language: string
    refresh: string
    refreshing: string
    running: string
  }
  onRefresh: () => void
  onPull: () => void
  onSync: () => void
  onToggleLanguage: () => void
}

export function DashboardHeader({
  title,
  subtitle,
  loading,
  busyAction,
  copy,
  onRefresh,
  onPull,
  onSync,
  onToggleLanguage
}: DashboardHeaderProps) {
  const isDisabled = loading || Boolean(busyAction)

  return (
    <div className="border-b bg-card">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-primary uppercase tracking-wide">
              AI Memory Hub
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPull}
            disabled={isDisabled}
          >
            <Download className="w-4 h-4 mr-2" />
            {busyAction === 'pull' ? copy.running : copy.rebuildSnapshot}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onSync}
            disabled={isDisabled}
          >
            <Upload className="w-4 h-4 mr-2" />
            {busyAction === 'sync' ? copy.running : copy.syncInbox}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleLanguage}
          >
            <Languages className="w-4 h-4 mr-2" />
            {copy.language}
          </Button>

          <Button
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
            {loading ? copy.refreshing : copy.refresh}
          </Button>
        </div>
      </div>
    </div>
  )
}
