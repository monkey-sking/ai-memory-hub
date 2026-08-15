import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Bot, Brain, HeartPulse, ListTodo, RefreshCw, Wrench } from 'lucide-react'
import { apiGet, asArray, asRecord, numberOf, textOf, type AnyRecord } from '../lib/api'
import { dashboardLabels, dashboardSubtitles, dashboardTitles } from '../lib/dashboardCopy'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '../components/ui/button'
import { EmptyState, ErrorState, LoadingState } from '../components/shell'
import {
  AlertBanner,
  ChartRow,
  EventStream,
  MetricCard,
  MetricGrid,
  PageHead,
  SplitRow,
  ToolConnectionList
} from '@/components/ds'
import type { DonutSegment, LogLevel } from '@/components/ds'

type ToolStatus = 'ok' | 'warning' | 'danger' | 'info'

/** Map an arbitrary tool status string onto the four semantic buckets the donut uses. */
function normalizeToolStatus(raw: string): ToolStatus {
  const value = raw.toLowerCase()
  if (['error', 'fail', 'failed', 'down', 'critical', 'unreachable'].some(token => value.includes(token))) return 'danger'
  if (['warn', 'warning', 'degraded', 'degrade', 'timeout', 'timedout', 'slow', 'throttled'].some(token => value.includes(token))) return 'warning'
  if (['idle', 'offline', 'inactive', 'paused', 'standby'].some(token => value.includes(token))) return 'info'
  return 'ok'
}

const ACTIVE_TASK_STATUSES = ['open', 'active', 'in_progress', 'claimed', 'waiting_review', 'running']

type ActivityItem = {
  id: string
  title: string
  subtitle: string
  status: string
  timestamp: string
}

type OverviewSnapshot = {
  memory?: AnyRecord
  radio?: AnyRecord
  tasks?: AnyRecord
  workflows?: AnyRecord
  tools?: AnyRecord
  agentSessions?: AnyRecord
  status?: AnyRecord
  metrics?: AnyRecord
  collaboration?: AnyRecord
}

/** Map a combined activity status onto the EventStream log level (info/warn/error). */
function mapActivityLevel(status: string): LogLevel {
  const value = status.toLowerCase()
  if (['failed', 'error', 'blocked', 'cancelled', 'dead'].some(token => value.includes(token))) return 'error'
  if (['warn', 'warning', 'degraded', 'waiting_review', 'review', 'pending'].some(token => value.includes(token))) return 'warn'
  return 'info'
}

/** Real clock time (HH:MM:SS) from an ISO-ish timestamp; falls back to the raw value. */
function clockTime(value: string, language: AppLanguage): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || '-'
  return date.toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

/**
 * Real 24h event-volume histogram derived from the loaded activity timestamps.
 * Each activity is bucketed into one of 24 hourly slots counting back from now.
 * No fabricated numbers — empty buckets stay 0, which is a truthful "no events".
 */
function buildEventSeries(items: ActivityItem[], buckets = 24): number[] {
  const counts = new Array<number>(buckets).fill(0)
  const now = Date.now()
  const windowMs = 24 * 60 * 60 * 1000
  for (const item of items) {
    if (!item.timestamp) continue
    const t = new Date(item.timestamp).getTime()
    if (Number.isNaN(t)) continue
    const diff = now - t
    if (diff < 0 || diff > windowMs) continue
    let idx = buckets - 1 - Math.floor((diff / windowMs) * buckets)
    if (idx < 0) idx = 0
    if (idx >= buckets) idx = buckets - 1
    counts[idx] += 1
  }
  return counts
}

/** Seven 4-hour-spaced clock labels for the line-chart x-axis, rooted at the current hour. */
function buildHourLabels(): string[] {
  const cur = new Date().getHours()
  const fmt = (h: number) => `${String((h + 24) % 24).padStart(2, '0')}:00`
  return [0, 1, 2, 3, 4, 5, 6].map(i => fmt(cur - (6 - i) * 4))
}

export default function Overview() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]

  const [data, setData] = useState<AnyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const load = async () => {
    setLoading(true)
    setBannerDismissed(false)
    try {
      const snapshot = await apiGet<OverviewSnapshot>('/api/dashboard/overview')
      setData(snapshot as AnyRecord)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const memory = asRecord(data?.memory)
  const radio = asRecord(data?.radio)
  const tasksRecord = asRecord(data?.tasks)
  const workflowsRecord = asRecord(data?.workflows)
  const toolsRecord = asRecord(data?.tools)
  const agentRecord = asRecord(data?.agentSessions)
  const statusRecord = asRecord(data?.status)
  const metricsRecord = asRecord(data?.metrics)

  const tasks = asArray<AnyRecord>(tasksRecord.tasks)
  const workflows = asArray<AnyRecord>(workflowsRecord.workflows)
  const tools = asArray<AnyRecord>(toolsRecord.tools)
  const radios = asArray<AnyRecord>(radio.messages)
  const agents = asArray<AnyRecord>(agentRecord.agentSessions)
  const agentTimeline = asArray<AnyRecord>(agentRecord.timeline)

  // All KPIs below are derived strictly from the loaded snapshot — nothing fabricated.
  const metrics = useMemo(() => {
    const memoryTotal = numberOf(memory.total)
    const taskTotal = numberOf(tasksRecord.total) || tasks.length
    const activeTasks = tasks.filter(task => ACTIVE_TASK_STATUSES.includes(textOf(task.status).toLowerCase())).length
    const toolsOnline = tools.filter(tool => normalizeToolStatus(textOf(tool.status)) === 'ok').length
    const agentsOnline = agents.length
    const workflowTotal = workflows.length
    const healthScore = numberOf(statusRecord.healthScore ?? metricsRecord.healthScore ?? statusRecord.score)
    return { memoryTotal, taskTotal, activeTasks, toolsOnline, agentsOnline, workflowTotal, healthScore }
  }, [memory, tasksRecord, tasks, tools, agents, workflows, statusRecord, metricsRecord])

  const activities = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = []
    for (const message of radios) {
      items.push({
        id: `radio-${textOf(message.id)}`,
        title: textOf(message.text, '—'),
        subtitle: `${textOf(message.from, 'agent')} → ${textOf(message.to, 'all')}`,
        status: textOf(message.type, 'radio'),
        timestamp: textOf(message.ts || message.createdAt)
      })
    }
    for (const task of tasks) {
      items.push({
        id: `task-${textOf(task.id)}`,
        title: textOf(task.title, '—'),
        subtitle: textOf(task.assignee || task.createdBy, 'unassigned'),
        status: textOf(task.status, 'open'),
        timestamp: textOf(task.updatedAt || task.createdAt)
      })
    }
    for (const workflow of workflows) {
      items.push({
        id: `workflow-${textOf(workflow.id)}`,
        title: textOf(workflow.name || workflow.title, '—'),
        subtitle: textOf(workflow.status, ''),
        status: textOf(workflow.status, 'workflow'),
        timestamp: textOf(workflow.updatedAt || workflow.createdAt)
      })
    }
    for (const event of agentTimeline) {
      items.push({
        id: `agent-${textOf(event.id)}`,
        title: textOf(event.text || event.title || event.message, '—'),
        subtitle: textOf(event.actor || event.tool || event.agent, ''),
        status: textOf(event.status, 'agent'),
        timestamp: textOf(event.ts || event.timestamp || event.createdAt)
      })
    }
    const withTime = items.filter(item => item.timestamp)
    const withoutTime = items.filter(item => !item.timestamp)
    withTime.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return [...withTime, ...withoutTime].slice(0, 24)
  }, [radios, tasks, workflows, agentTimeline])

  const toolStatusCounts = useMemo(() => {
    const counts: Record<ToolStatus, number> = { ok: 0, warning: 0, danger: 0, info: 0 }
    for (const tool of tools) counts[normalizeToolStatus(textOf(tool.status))] += 1
    return counts
  }, [tools])

  const statusLabels = language === 'zh'
    ? { ok: '正常', warning: '降级', danger: '错误', info: '空闲' }
    : { ok: 'Healthy', warning: 'Degraded', danger: 'Error', info: 'Idle' }

  const donutSegments = useMemo<DonutSegment[]>(
    () => {
      const all: DonutSegment[] = [
        { label: statusLabels.ok, value: toolStatusCounts.ok, tone: 'success' },
        { label: statusLabels.warning, value: toolStatusCounts.warning, tone: 'warning' },
        { label: statusLabels.danger, value: toolStatusCounts.danger, tone: 'danger' },
        { label: statusLabels.info, value: toolStatusCounts.info, tone: 'info' }
      ]
      return all.filter(segment => segment.value > 0)
    },
    [toolStatusCounts, statusLabels]
  )

  // Real 24h event-volume series for the ChartRow line chart.
  const eventSeries = useMemo(() => buildEventSeries(activities), [activities])
  const eventPeak = useMemo(() => {
    const max = Math.max(...eventSeries)
    return max > 0 ? { at: eventSeries.indexOf(max), value: max } : null
  }, [eventSeries])
  const hourLabels = useMemo(() => buildHourLabels(), [])

  const degradedTools = useMemo(
    () => tools.filter(tool => normalizeToolStatus(textOf(tool.status)) !== 'ok').slice(0, 4).map(tool => textOf(tool.name || tool.id, '—')),
    [tools]
  )

  const hasAnyData =
    metrics.memoryTotal > 0 ||
    metrics.taskTotal > 0 ||
    tools.length > 0 ||
    agents.length > 0 ||
    radios.length > 0 ||
    workflows.length > 0

  const isEmpty = !loading && !error && data !== null && !hasAnyData

  const labels = language === 'zh'
    ? {
        memory: '记忆条目',
        tasks: '任务总数',
        active: '活跃任务',
        tools: '工具在线',
        agents: '智能体在线',
        health: '健康分',
        activity: '实时事件流',
        distribution: '工具状态分布',
        events: '事件',
        online: '在线',
        allNominal: '系统运行正常',
        allNominalDesc: '所有已注册工具均健康运行。',
        needsAttention: (n: number) => `${n} 个工具需要关注`,
        needsAttentionDesc: (names: string) => `以下工具状态异常，已触发降级或需排查：${names}`,
        refresh: '刷新',
        retry: '重试',
        loading: '正在加载总览数据'
      }
    : {
        memory: 'Memories',
        tasks: 'Total tasks',
        active: 'Active tasks',
        tools: 'Tools online',
        agents: 'Agents online',
        health: 'Health score',
        activity: 'Live activity',
        distribution: 'Tool status',
        events: 'Events',
        online: 'Online',
        allNominal: 'All systems nominal',
        allNominalDesc: 'Every registered tool is reporting healthy.',
        needsAttention: (n: number) => `${n} tool${n > 1 ? 's' : ''} need attention`,
        needsAttentionDesc: (names: string) => `These tools are degraded or failing: ${names}`,
        refresh: 'Refresh',
        retry: 'Retry',
        loading: 'Loading overview'
      }

  const healthTier =
    language === 'zh'
      ? metrics.healthScore < 70
        ? '需关注'
        : metrics.healthScore < 90
          ? '良好'
          : '优秀'
      : metrics.healthScore < 70
        ? 'Needs attention'
        : metrics.healthScore < 90
          ? 'Good'
          : 'Excellent'

  const streamEvents = useMemo(
    () =>
      activities.map(item => ({
        time: clockTime(item.timestamp, language),
        level: mapActivityLevel(item.status),
        message: item.subtitle ? `${item.title} · ${item.subtitle}` : item.title
      })),
    [activities, language]
  )

  return (
    <>
      <PageHead
        title={dashboardTitles[language].overview}
        subtitle={dashboardSubtitles[language].overview}
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {labels.refresh}
          </Button>
        }
      />

      {error && !data ? (
        <ErrorState
          variant="block"
          title={copy.error}
          description={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
              {labels.retry}
            </Button>
          }
        />
      ) : loading && !data ? (
        <LoadingState label={labels.loading} />
      ) : isEmpty ? (
        <EmptyState title={copy.noData} description={copy.overviewNoTools} />
      ) : (
        <>
          {!bannerDismissed && tools.length ? (
            degradedTools.length ? (
              <AlertBanner
                tone="warning"
                title={labels.needsAttention(degradedTools.length)}
                description={labels.needsAttentionDesc(degradedTools.join('、'))}
                onDismiss={() => setBannerDismissed(true)}
              />
            ) : (
              <AlertBanner
                tone="success"
                title={labels.allNominal}
                description={labels.allNominalDesc}
                onDismiss={() => setBannerDismissed(true)}
              />
            )
          ) : null}

          <MetricGrid>
            <MetricCard
              label={labels.tools}
              value={metrics.toolsOnline}
              unit={`/ ${tools.length}`}
              icon={Wrench}
              note={`${tools.length} ${language === 'zh' ? '已注册' : 'registered'}`}
            />
            <MetricCard label={labels.memory} value={metrics.memoryTotal} icon={Brain} note={language === 'zh' ? '共享记忆' : 'shared memory'} />
            <MetricCard
              label={labels.active}
              value={metrics.activeTasks}
              icon={ListTodo}
              note={`${metrics.taskTotal} ${language === 'zh' ? '总数' : 'total'}`}
            />
            <MetricCard label={labels.agents} value={metrics.agentsOnline} icon={Bot} note={language === 'zh' ? '当前活动智能体' : 'active agents'} />
            <MetricCard label={labels.health} value={metrics.healthScore} unit="/ 100" icon={HeartPulse} note={healthTier} />
          </MetricGrid>

          <ChartRow
            title={language === 'zh' ? '24 小时事件量' : '24h event volume'}
            subtitle={language === 'zh' ? '实时聚合 · 按小时' : 'Aggregated · hourly'}
            series={[{ label: labels.events, points: eventSeries }]}
            xLabels={hourLabels}
            peakAt={eventPeak?.at}
            peakLabel={eventPeak ? `${eventPeak.value}` : undefined}
            legend={
              <span className="flex items-center gap-1.5 text-xs text-ink-3">
                <span className="h-0.5 w-3.5 rounded bg-accent-base" />
                {labels.events}
              </span>
            }
            donutTitle={labels.distribution}
            donutCenter={metrics.toolsOnline}
            donutCenterLabel={labels.online}
            segments={donutSegments}
          />

          <SplitRow
            stream={
              <EventStream
                events={streamEvents}
                controls={
                  <span className="rounded-full border border-line bg-surface-sunk px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-4">
                    {language === 'zh' ? '实时' : 'LIVE'}
                  </span>
                }
              />
            }
            side={
              <ToolConnectionList
                title={labels.tools}
                items={tools.slice(0, 12).map(tool => ({
                  name: textOf(tool.name || tool.id, '—'),
                  version: textOf(tool.version, ''),
                  latency: textOf(tool.latency || tool.status, '—')
                }))}
              />
            }
          />
        </>
      )}
    </>
  )
}
