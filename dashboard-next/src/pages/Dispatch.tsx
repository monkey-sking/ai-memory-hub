import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Play, RefreshCw, AlertTriangle } from 'lucide-react'
import {
  apiGet,
  apiPost,
  asArray,
  asRecord,
  formatDate,
  numberOf,
  textOf
} from '../lib/api'
import type { AnyRecord } from '../lib/api'
import { dashboardLabels, dashboardSubtitles, dashboardTitles } from '../lib/dashboardCopy'
import type { DashboardCopy } from '../lib/dashboardCopy'
import type { AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '../components/ui/badge'
import type { BadgeVariant } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageShell,
  Panel
} from '../components/shell'
import {
  AlertBanner,
  ChartRow,
  EventStream,
  MetricCard,
  MetricGrid,
  SectionTabs,
  SplitRow,
  ToolConnectionList
} from '@/components/ds'
import type { DonutSegment, LogEvent, LogLevel, SectionTab, ToolConnectionItem } from '@/components/ds'

type RelayEntry = AnyRecord
type DispatchLog = AnyRecord

interface DispatchModel {
  relayActive: number
  logs: DispatchLog[]
  logsTotal: number
  relay: RelayEntry[]
}

type DispatchPhase = 'loading' | 'ready' | 'error'

const RELAY_LIST_LIMIT = 50
const LOG_LIST_LIMIT = 30

/** Maps a raw dispatch state to a semantic badge variant. */
function statusVariant(state: string): BadgeVariant {
  const normalized = state.toLowerCase()
  if (normalized === 'running' || normalized === 'in_progress' || normalized === 'active') return 'info'
  if (normalized === 'pending' || normalized === 'queued' || normalized === 'planned') return 'neutral'
  if (normalized === 'completed' || normalized === 'done') return 'success'
  if (normalized === 'failed' || normalized === 'error') return 'danger'
  return 'neutral'
}

/** Resolves a human label for a dispatch state, falling back to the raw value. */
function statusLabel(copy: DashboardCopy, state: string): string {
  const normalized = state.toLowerCase()
  if (normalized === 'running') return copy.running
  const known = textOf(asRecord(copy.statusLabels)[state])
  return known || textOf(state)
}

/** Maps a run/log state to an event-stream log level. */
function logLevel(state: string): LogLevel {
  const normalized = state.toLowerCase()
  if (normalized.includes('fail') || normalized.includes('error')) return 'error'
  if (normalized.includes('warn')) return 'warn'
  if (normalized.includes('success') || normalized.includes('complete') || normalized.includes('done')) return 'info'
  return 'info'
}

export default function Dispatch() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]

  const [model, setModel] = useState<DispatchModel>({ relayActive: 0, logs: [], logsTotal: 0, relay: [] })
  const [phase, setPhase] = useState<DispatchPhase>('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [triggerError, setTriggerError] = useState('')

  const [force, setForce] = useState(false)
  const [limit, setLimit] = useState(10)
  const [modelName, setModelName] = useState('')
  const [concurrency, setConcurrency] = useState(1)
  const [poolState, setPoolState] = useState<AnyRecord | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const poolTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async () => {
    setBusy(true)
    try {
      const data = await apiGet<AnyRecord>('/api/dispatch')
      const dispatch = asRecord(data)
      setModel({
        relayActive: numberOf(dispatch.relayActive),
        logs: asArray<DispatchLog>(dispatch.logs),
        logsTotal: numberOf(dispatch.logsTotal),
        relay: asArray<RelayEntry>(dispatch.relay)
      })
      setPhase('ready')
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [])

  // Pool status polling — only active when concurrency > 1
  // eslint-disable-next-line react-hooks/set-state-in-effect -- polling pool status
  useEffect(() => {
    if (concurrency <= 1) { setPoolState(null); return }
    let active = true
    const poll = async () => {
      if (!active) return
      try {
        const data = await apiGet<AnyRecord>('/api/dispatch/pool')
        if (active) setPoolState(asRecord(data))
      } catch { /* ignore poll errors */ }
      if (active && poolState?.active) {
        poolTimer.current = setTimeout(poll, 2000)
      }
    }
    void poll()
    return () => {
      active = false
      if (poolTimer.current) { clearTimeout(poolTimer.current); poolTimer.current = null }
    }
  }, [concurrency, poolState?.active])

  const runDispatch = async () => {
    setBusy(true)
    setTriggerError('')
    try {
      if (concurrency > 1) {
        // Background mode for concurrent dispatch
        const res = await apiPost<AnyRecord>('/api/dispatch/run?background=1', { force, limit, model: modelName.trim(), concurrency })
        const task = asRecord(res).task
        const taskId = textOf(asRecord(task).id)
        if (taskId) {
          // Poll background task until done
          for (let i = 0; i < 120; i++) {
            await new Promise(r => setTimeout(r, 1500))
            const taskData = await apiGet<AnyRecord>(`/api/background-tasks/${taskId}`)
            const taskState = asRecord(taskData)
            const status = textOf(taskState.status)
            if (status === 'done' || status === 'failed' || status === 'cancelled') break
          }
        }
      } else {
        await apiPost<AnyRecord>('/api/dispatch/run', { force, limit, model: modelName.trim() })
      }
      await load()
    } catch (caught) {
      setTriggerError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const hasData = phase === 'ready' && (model.relay.length > 0 || model.logs.length > 0)
  const isInitialLoading = phase === 'loading' && model.relay.length === 0 && model.logs.length === 0

  const relayByState = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of model.relay) {
      const state = textOf(entry.state, 'pending')
      counts.set(state, (counts.get(state) || 0) + 1)
    }
    return [...counts.entries()].map(([state, count]) => ({
      value: state,
      label: statusLabel(copy, state),
      count,
      tone: statusVariant(state) as 'neutral' | 'success' | 'warning' | 'danger' | 'info'
    }))
  }, [model.relay, copy])

  const threadTabs = useMemo<SectionTab[]>(
    () => [
      { id: 'all', label: language === 'zh' ? '全部' : 'All', badge: model.relay.length },
      ...relayByState.map(state => ({ id: state.value, label: state.label, badge: state.count }))
    ],
    [relayByState, language, model.relay.length]
  )

  const visibleRelay = useMemo(
    () =>
      (statusFilter === 'all'
        ? model.relay
        : model.relay.filter(entry => textOf(entry.state, 'pending') === statusFilter)
      ).slice(0, RELAY_LIST_LIMIT),
    [model.relay, statusFilter]
  )

  const visibleLogs = useMemo(() => model.logs.slice(0, LOG_LIST_LIMIT), [model.logs])

  /** Per-thread progress, sorted by timestamp — a real (non-invented) trend series. */
  const progressSeries = useMemo(
    () =>
      model.relay
        .map(entry => ({
          ts: textOf(entry.ts || entry.progressAt || entry.deliveryUpdatedAt),
          p: numberOf(entry.progressPercent)
        }))
        .filter(item => Number.isFinite(item.p))
        .sort((a, b) => a.ts.localeCompare(b.ts))
        .map(item => item.p),
    [model.relay]
  )

  /** Cumulative run count — derived directly from the real log sequence. */
  const runsSeries = useMemo(() => model.logs.map((_, index) => index + 1), [model.logs])

  const stateSegments = useMemo<DonutSegment[]>(
    () => relayByState.map(state => ({ label: state.label, value: state.count, tone: state.tone })),
    [relayByState]
  )

  const logEvents = useMemo<LogEvent[]>(
    () =>
      visibleLogs.map(log => {
        const state = textOf(log.runStatus || log.status || log.exitCode, 'log')
        return {
          time: formatDate(textOf(log.ts || log.at || log.createdAt)),
          level: logLevel(state),
          message: textOf(log.message || log.text || log.error || log.lastError, '-'),
          code: textOf(log.tool) || undefined
        }
      }),
    [visibleLogs]
  )

  const toolItems = useMemo<ToolConnectionItem[]>(() => {
    const seen = new Set<string>()
    const items: ToolConnectionItem[] = []
    for (const entry of model.relay) {
      const name = textOf(entry.tool, '-')
      if (seen.has(name)) continue
      seen.add(name)
      items.push({
        name,
        version: textOf(entry.version) || undefined,
        meta: statusLabel(copy, textOf(entry.state, 'pending'))
      })
    }
    return items.slice(0, 12)
  }, [model.relay, copy])

  /* ============================== render ============================== */

  if (phase === 'error' && !hasData) {
    return (
      <PageShell
        title={dashboardTitles[language].dispatch}
        description={dashboardSubtitles[language].dispatch}
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={busy}>
            <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
            {copy.refresh}
          </Button>
        }
      >
        <ErrorState
          variant="block"
          title={copy.connectionError}
          description={error}
          action={
            <Button onClick={() => void load()} disabled={busy}>
              <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
              {copy.refresh}
            </Button>
          }
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title={dashboardTitles[language].dispatch}
      description={dashboardSubtitles[language].dispatch}
      actions={
        <Button variant="secondary" onClick={() => void load()} disabled={busy}>
          <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
          {copy.refresh}
        </Button>
      }
    >
      {isInitialLoading ? (
        <LoadingState variant="spinner" label={copy.refreshing} className="py-16" />
      ) : (
        <>
          {triggerError ? (
            <AlertBanner tone="error" title={copy.error} description={triggerError} />
          ) : null}

          <MetricGrid>
            <MetricCard label={copy.dispatchActive} value={model.relayActive} spark={progressSeries} />
            <MetricCard label={copy.dispatchThreads} value={model.relay.length} spark={progressSeries} />
            <MetricCard label={copy.dispatchRecentRuns} value={model.logs.length} spark={runsSeries} />
            <MetricCard label={copy.dispatchTotalRuns} value={model.logsTotal} spark={runsSeries} />
          </MetricGrid>

          <ChartRow
            title="调度线程进度"
            subtitle="按时间排序的线程进度（%）"
            series={progressSeries.length >= 2 ? [{ label: '进度', points: progressSeries }] : []}
            segments={stateSegments}
            donutTitle="状态分布"
            donutCenter={model.relay.length}
            donutCenterLabel="线程"
          />

          <SplitRow
            stream={<EventStream events={logEvents} />}
            side={<ToolConnectionList items={toolItems} title="关联工具" />}
          />

          <Panel
            title={copy.triggerDispatch}
            toolbar={
              <span className={cn('text-xs font-medium', force ? 'text-warning-text' : 'text-ink-3')}>
                {force ? copy.forceDispatch : copy.running}
              </span>
            }
          >
            <div className="flex flex-col gap-4 p-4">
              <p className="text-xs text-ink-3">{copy.dispatchSummaryNote}</p>
              {poolState?.active ? (
                <div className="rounded-lg border border-accent-border bg-accent-surface p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-accent-text">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {language === 'zh' ? `并发池运行中 (${numberOf(poolState.completed)}/${numberOf(poolState.total)})` : `Pool active (${numberOf(poolState.completed)}/${numberOf(poolState.total)})`}
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunk">
                    <span className="block h-full rounded-full bg-accent-base transition-all" style={{ width: `${numberOf(poolState.total) > 0 ? (numberOf(poolState.completed) / numberOf(poolState.total)) * 100 : 0}%` }} />
                  </div>
                  {poolState.running && Array.isArray(poolState.running) && (poolState.running as AnyRecord[]).length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {(poolState.running as AnyRecord[]).map((r, i) => (
                        <li key={i} className="text-xs text-ink-3">
                          <span className="font-mono">{textOf(r.tool)}</span>
                          {textOf(r.project) ? <span className="ml-2 text-ink-4">{textOf(r.project)}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {poolState.lastError ? (
                    <p className="mt-1 text-xs text-danger-text">{textOf(poolState.lastError)}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex w-28 flex-col gap-1">
                  <span className="text-xs font-medium text-ink-2">{copy.limit}</span>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={limit}
                    onChange={event => setLimit(Number(event.target.value) || 10)}
                  />
                </label>
                <label className="flex min-w-48 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-ink-2">{copy.model}</span>
                  <Input
                    type="text"
                    value={modelName}
                    onChange={event => setModelName(event.target.value)}
                    placeholder={copy.modelPlaceholder}
                  />
                </label>
                <label className="flex w-28 flex-col gap-1">
                  <span className="text-xs font-medium text-ink-2">{language === 'zh' ? '并发' : 'Concurrency'}</span>
                  <Input
                    type="number"
                    min={1}
                    max={6}
                    value={concurrency}
                    onChange={event => setConcurrency(Math.max(1, Math.min(6, Number(event.target.value) || 1)))}
                  />
                </label>
                <label className="flex items-center gap-2 self-center">
                  <input
                    type="checkbox"
                    checked={force}
                    onChange={event => setForce(event.target.checked)}
                    className="h-4 w-4 accent-accent-base"
                  />
                  <span className="text-sm text-ink-2">{copy.forceDispatch}</span>
                </label>
                <Button onClick={() => void runDispatch()} disabled={busy} className="self-end">
                  <Play className="h-4 w-4" />
                  {busy ? copy.running : copy.triggerDispatch}
                </Button>
              </div>
            </div>
          </Panel>

          <Panel
            title={copy.dispatchThreads}
            count={model.relay.length}
            flushBody
            tabs={<SectionTabs tabs={threadTabs} active={statusFilter} onChange={setStatusFilter} />}
            footer={
              <span>
                {visibleRelay.length} / {model.relay.length}
              </span>
            }
          >
            {visibleRelay.length ? (
              visibleRelay.map((entry, index) => {
                const state = textOf(entry.state, 'pending')
                const key = textOf(entry.id || entry.threadKey || entry.sourceId) || `relay-${index}`
                const percent = numberOf(entry.progressPercent)
                return (
                  <div key={key} className="border-b border-line px-4 py-3 last:border-b-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium text-ink">{textOf(entry.tool, '-')}</span>
                        <span className="truncate text-xs text-ink-3">{textOf(entry.project, '-')}</span>
                      </div>
                      <Badge variant={statusVariant(state)}>{statusLabel(copy, state)}</Badge>
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-ink-3">
                      {textOf(entry.threadKey || entry.thread || entry.sourceId, '-')}
                    </p>
                    {Number.isFinite(percent) && percent > 0 ? (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunk">
                        <span
                          className="block h-full rounded-full bg-accent-base"
                          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                        />
                      </div>
                    ) : null}
                    {entry.progressStatus ? (
                      <p className="mt-1 text-xs text-ink-3">{textOf(entry.progressStatus)}</p>
                    ) : null}
                    {entry.lastError ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-danger-text">
                        <AlertTriangle className="h-3 w-3" />
                        {textOf(entry.lastError)}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-ink-4">
                      {formatDate(textOf(entry.ts || entry.progressAt || entry.deliveryUpdatedAt))}
                    </p>
                  </div>
                )
              })
            ) : (
              <EmptyState size="sm" icon={null} title={copy.noData} description={copy.dispatchSummaryNote} />
            )}
          </Panel>
        </>
      )}
    </PageShell>
  )
}
