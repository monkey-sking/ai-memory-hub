import { RefreshCw, Download, Upload, Languages } from 'lucide-react'
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
    <div className="page-header">
      <div className="page-title-group">
        <p className="eyebrow">AI Memory Hub</p>
        <h2>{title}</h2>
        {subtitle && (
          <p className="page-subtitle">{subtitle}</p>
        )}
      </div>

      <div className="header-actions">
        <button
          className="btn ghost small"
          onClick={onPull}
          disabled={isDisabled}
          type="button"
        >
          <Download className="w-4 h-4" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />
          {busyAction === 'pull' ? copy.running : copy.rebuildSnapshot}
        </button>

        <button
          className="btn ghost small"
          onClick={onSync}
          disabled={isDisabled}
          type="button"
        >
          <Upload className="w-4 h-4" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />
          {busyAction === 'sync' ? copy.running : copy.syncInbox}
        </button>

        <button
          className="btn ghost small"
          onClick={onToggleLanguage}
          type="button"
        >
          <Languages className="w-4 h-4" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />
          {copy.language}
        </button>

        <button
          className="btn small"
          onClick={onRefresh}
          disabled={loading}
          type="button"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />
          {loading ? copy.refreshing : copy.refresh}
        </button>
      </div>
    </div>
  )
}
