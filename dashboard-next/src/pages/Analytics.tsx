import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Activity, Gauge, ListTodo, Radio, RefreshCw, Workflow } from 'lucide-react'
import { apiGet, asRecord, numberOf, textOf } from '../lib/api'
import { dashboardLabels, dashboardSubtitles, dashboardTitles } from '../lib/dashboardCopy'
import type { AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '../components/ui/button'
import { EmptyState, LoadingState } from '../components/shell'
import {
  AlertBanner,
  Card,
  ChartRow,
  MetricCard,
  MetricGrid,
  PageHead,
  type DonutSegment,
  type DonutTone
} from '@/components/ds'

/** Server-computed `/api/metrics` payload. Every field is optional + defensively
 *  read via `asRecord`/`numberOf` because a partial or empty response must never
 *  throw — we render whatever the server actually returns. */
type MetricsPayload = {
  tasks?: { total?: number; byStatus?: Record<string, number>; byTool?: Record<string, number> }
  workflows?: { total?: number; byStatus?: Record<string, number> }
  radio?: { byType?: Record<string, number> }
  relay?: { successRate?: number | string; total?: number; byStatus?: Record<string, number> }
  projects?: { byActivity?: Record<string, number> }
}
type MetricsResponse = { metrics?: MetricsPayload }

type BarDatum = { key: string; count: number }

/** Statuses that count as "active" work — mirrors the Dashboard.tsx definition. */
const ACTIVE_TASK_STATUSES = ['open', 'claimed', 'in_progress']

/** Turn a `{ key: count }` aggregate into a sorted bar-list dataset. */
function countEntries(value: unknown, limit = 8): BarDatum[] {
  return Object.entries(asRecord(value))
    .map(([key, count]) => ({ key: key.trim(), count: numberOf(count) }))
    .filter(item => item.key && item.count > 0)
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit)
}

function formatNumber(value: unknown): string {
  return numberOf(value).toLocaleString()
}

/** Map a task/workflow status token to a donut segment tone (token-driven, no hardcoding). */
function statusDonutTone(status: string): DonutTone {
  const s = status.toLowerCase()
  if (s === 'done' || s === 'completed' || s === 'success') return 'success'
  if (s === 'blocked' || s === 'failed' || s === 'error' || s === 'cancelled') return 'danger'
  if (s === 'needs_verification' || s === 'review' || s === 'planned' || s === 'pending') return 'warning'
  if (s === 'in_progress' || s === 'active' || s === 'claimed' || s === 'open') return 'accent'
  return 'neutral'
}

/**
 * Lightweight inline-SVG horizontal bar chart, drawn from real metrics only —
 * no external chart lib. Bars use the accent token; the track uses the sunk
 * surface token.
 */
function BarChart({ items, emptyText }: { items: BarDatum[]; emptyText: string }) {
  const visible = items.filter(item => item.key && item.count > 0)
  const max = Math.max(1, ...visible.map(item => item.count))
  if (!visible.length) return <EmptyState size="sm" icon={null} title={emptyText} />
  return (
    <div className="flex flex-col gap-3">
      {visible.map(item => (
        <div key={item.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-ink-2">{item.key}</span>
            <span className="shrink-0 font-medium tabular-nums text-ink">{formatNumber(item.count)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunk">
            <div
              className="h-full rounded-full bg-accent-base"
              style={{ width: `${Math.max(3, Math.round((item.count / max) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Analytics() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]

  const [metrics, setMetrics] = useState<MetricsPayload>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    setBusy(true)
    try {
      const response = await apiGet<MetricsResponse>('/api/metrics')
      setMetrics(response.metrics ?? {})
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [])

  const tasks = useMemo(() => asRecord(metrics.tasks), [metrics.tasks])
  const workflows = useMemo(() => asRecord(metrics.workflows), [metrics.workflows])
  const radio = useMemo(() => asRecord(metrics.radio), [metrics.radio])
  const relay = useMemo(() => asRecord(metrics.relay), [metrics.relay])
  const projects = useMemo(() => asRecord(metrics.projects), [metrics.projects])

  const tasksByStatus = asRecord(tasks.byStatus)
  const activeTasks = ACTIVE_TASK_STATUSES.reduce((total, status) => total + numberOf(tasksByStatus[status]), 0)

  const taskStatusCounts = countEntries(tasks.byStatus)
  const taskToolCounts = countEntries(tasks.byTool)
  const workflowStatusCounts = countEntries(workflows.byStatus)
  const radioTypeCounts = countEntries(radio.byType)
  const relayCounts = countEntries(relay.byStatus)
  const projectCounts = countEntries(projects.byActivity, 10)

  const hasData =
    numberOf(tasks.total) > 0 ||
    numberOf(workflows.total) > 0 ||
    numberOf(relay.total) > 0 ||
    taskStatusCounts.length > 0 ||
    taskToolCounts.length > 0 ||
    workflowStatusCounts.length > 0 ||
    radioTypeCounts.length > 0 ||
    relayCounts.length > 0 ||
    projectCounts.length > 0

  // Real data only — a magnitude profile of radio message types (the closest
  // real "event volume" signal the metrics endpoint exposes). No fabricated trend.
  const radioPoints = radioTypeCounts.map(item => item.count)
  const radioLabels = radioTypeCounts.map(item => item.key)
  const radioSeries = radioPoints.length >= 2 ? [{ label: copy.radioByType, points: radioPoints }] : []

  // Real part-to-whole: task status split, centred on the total task count.
  const taskStatusSegments: DonutSegment[] = taskStatusCounts.map(item => ({
    label: item.key,
    value: item.count,
    tone: statusDonutTone(item.key)
  }))

  return (
    <>
      <PageHead
        title={dashboardTitles[language]['analytics']}
        subtitle={dashboardSubtitles[language]['analytics']}
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={busy}>
            <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
            {copy.refresh}
          </Button>
        }
      />

      {message ? (
        <AlertBanner
          tone="error"
          title={copy.error}
          description={message}
          onDismiss={() => setMessage('')}
        />
      ) : null}

      {busy && !hasData ? (
        <LoadingState variant="skeleton" label={copy.refreshing} rows={4} />
      ) : hasData ? (
        <>
          <MetricGrid>
            <MetricCard
              label={copy.totalTasks}
              value={formatNumber(tasks.total)}
              icon={ListTodo}
            />
            <MetricCard
              label={copy.activeTasks}
              value={formatNumber(activeTasks)}
              icon={Activity}
            />
            <MetricCard
              label={copy.workflows}
              value={formatNumber(workflows.total)}
              icon={Workflow}
            />
            <MetricCard
              label={copy.relayRate}
              value={<span>{textOf(relay.successRate, '-')}</span>}
              icon={Gauge}
            />
            <MetricCard
              label={copy.relayThreads}
              value={formatNumber(relay.total)}
              icon={Radio}
            />
          </MetricGrid>

          <ChartRow
            title={copy.radioByType}
            subtitle={language === 'zh' ? 'Radio 事件类型量级' : 'Radio event-type magnitude'}
            series={radioSeries}
            xLabels={radioLabels.length ? radioLabels : undefined}
            donutTitle={copy.tasksByStatus}
            donutCenter={formatNumber(tasks.total)}
            donutCenterLabel={copy.totalTasks}
            segments={taskStatusSegments}
          />

          <div className="grid grid-cols-1 gap-[var(--section-gap)] lg:grid-cols-2">
            <Card title={copy.tasksByTool} count={taskToolCounts.length}>
              <BarChart items={taskToolCounts} emptyText={copy.noData} />
            </Card>
            <Card title={copy.workflowsByStatus} count={workflowStatusCounts.length}>
              <BarChart items={workflowStatusCounts} emptyText={copy.noData} />
            </Card>
            <Card title={copy.relayByState} count={relayCounts.length}>
              <BarChart items={relayCounts} emptyText={copy.noData} />
            </Card>
            <Card title={copy.topProjects} count={projectCounts.length}>
              <BarChart items={projectCounts} emptyText={copy.noData} />
            </Card>
          </div>
        </>
      ) : message ? null : (
        <EmptyState title={copy.noData} description={dashboardSubtitles[language]['analytics']} />
      )}
    </>
  )
}
