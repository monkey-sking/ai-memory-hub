/**
 * Sessions — Plan A route for the AMH agent-session browser.
 *
 * Real endpoint only:
 *   GET /api/agent-sessions  → { agentSessions: AgentSessionProjection[], timeline: TimelineItem[] }
 *   (handler: src/index.js → dashboardAgentSessions.getDashboardAgentSessions)
 *
 * Projection shape (src/dashboard/agent-sessions.js → buildAgentSessionProjection):
 *   { id, sessionId, agent, project, title, threadKey, state, lastActivity,
 *     attempt, error, progress: { percent, status }, recentOutput,
 *     task: { id, title, status, project } | null,
 *     workflow: { id, title, status, project } | null,
 *     worktree, updatedAt }
 *
 * The projection intentionally omits a start timestamp, so the list shows the
 * last activity time instead of a fabricated "duration". Render is strictly
 * defensive (asArray / asRecord) against the live payload.
 *
 * This revision keeps 100% of the data logic above but re-skins the page onto
 * the shared ds "bone": PageHead → (AlertBanner on real error/empty) →
 * MetricGrid (5 KPIs derived from loaded data) → SplitRow (live event stream
 * + state-distribution card) → Card-wrapped filterable session list.
 */

import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Activity, AlertTriangle, Bot, CheckCircle2, Clock, GitBranch, ListTodo, RefreshCw } from 'lucide-react'
import { apiGet, asArray, asRecord, formatDate, formatRelativeTime, numberOf, textOf } from '../lib/api'
import type { AnyRecord } from '../lib/api'
import { dashboardLabels } from '../lib/dashboardCopy'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import type { BadgeVariant } from '../components/ui/badge'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { statusBadgeVariant } from '@/lib/statusBadge'
import { cn } from '@/lib/utils'
import { EmptyState, FilterBar, LoadingState } from '../components/shell'
import type { LogLevel } from '@/components/ds/SplitRow'
import {
  AlertBanner,
  Card,
  EventStream,
  MetricCard,
  MetricGrid,
  PageHead,
  SplitRow
} from '@/components/ds'

/** Canonical order for the status strip (active first, then terminal/quiet). */
const SESSION_STATE_ORDER = [
  'working',
  'waiting_review',
  'blocked',
  'failed',
  'stale',
  'done',
  'idle'
] as const

type SessionState = (typeof SESSION_STATE_ORDER)[number]

const SESSION_STATE_META: Record<SessionState, { label: { zh: string; en: string }; variant: BadgeVariant; dot: string; tone: 'accent' | 'warning' | 'danger' | 'success' | 'neutral' }> = {
  working:        { label: { zh: '进行中', en: 'Working' },       variant: 'accent',  dot: 'bg-accent-base', tone: 'accent' },
  waiting_review: { label: { zh: '待审核', en: 'Waiting review' }, variant: 'warning', dot: 'bg-warning',    tone: 'warning' },
  blocked:        { label: { zh: '阻塞',   en: 'Blocked' },        variant: 'danger',  dot: 'bg-danger',     tone: 'danger' },
  failed:         { label: { zh: '失败',   en: 'Failed' },         variant: 'danger',  dot: 'bg-danger',     tone: 'danger' },
  stale:          { label: { zh: '停滞',   en: 'Stale' },          variant: 'warning', dot: 'bg-warning',    tone: 'warning' },
  done:           { label: { zh: '完成',   en: 'Done' },           variant: 'success', dot: 'bg-success',    tone: 'success' },
  idle:           { label: { zh: '空闲',   en: 'Idle' },           variant: 'neutral', dot: 'bg-ink-3',      tone: 'neutral' }
}

const ACTIVE_STATES: ReadonlySet<string> = new Set(['working', 'waiting_review', 'blocked'])

const STATE_ORDER_SET: ReadonlySet<string> = new Set(SESSION_STATE_ORDER as readonly string[])

function sessionState(value: unknown): SessionState {
  const key = String(value ?? '')
  return STATE_ORDER_SET.has(key) ? (key as SessionState) : 'idle'
}

function stateLabel(state: string, language: AppLanguage): string {
  return SESSION_STATE_META[sessionState(state)]?.label[language] ?? state
}

function progressPercent(value: unknown): number | undefined {
  const raw = asRecord(value).percent
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined
}

function uniqueSorted(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean))).sort()
}

function linkedRecord(value: unknown): { id: string; title: string; status: string; project: string } | null {
  const rec = asRecord(value)
  const id = textOf(rec.id)
  if (!id) return null
  return { id, title: textOf(rec.title), status: textOf(rec.status), project: textOf(rec.project) }
}

function eventLevel(state: SessionState): LogLevel {
  if (state === 'failed' || state === 'blocked') return 'error'
  if (state === 'waiting_review' || state === 'stale') return 'warn'
  if (state === 'idle') return 'debug'
  return 'info'
}

/** Inline copy (language-local strings not present in dashboardCopy.ts). */
const localCopy = {
  zh: {
    description: '浏览 AMH 的 agent 会话：活跃与历史。按状态、项目或 agent 筛选。',
    sessions: 'Agent 会话',
    loadError: '加载失败',
    search: '搜索',
    searchPlaceholder: '搜索 agent / 项目 / 标题…',
    statusLabel: '状态',
    project: '项目',
    allProjects: '所有项目',
    searchProjects: '搜索项目…',
    noProjects: '无匹配项目',
    agent: 'Agent',
    allAgents: '所有 Agent',
    searchAgents: '搜索 agent…',
    noAgents: '无匹配 agent',
    loading: '加载中…',
    noSessions: '暂无会话',
    noSessionsHint: '当前筛选条件下没有 agent 会话。',
    total: '总会话',
    allStates: '所有状态',
    active: '活跃',
    activeHint: '进行中 / 待审核 / 阻塞',
    completed: '已完成',
    stale: '停滞',
    states: '状态分布'
  },
  en: {
    description: 'Browse AMH agent sessions: active and historical. Filter by status, project, or agent.',
    sessions: 'Sessions',
    loadError: 'Failed to load',
    search: 'Search',
    searchPlaceholder: 'Search agent / project / title…',
    statusLabel: 'Status',
    project: 'Project',
    allProjects: 'All projects',
    searchProjects: 'Search projects…',
    noProjects: 'No projects',
    agent: 'Agent',
    allAgents: 'All agents',
    searchAgents: 'Search agents…',
    noAgents: 'No agents',
    loading: 'Loading…',
    noSessions: 'No sessions',
    noSessionsHint: 'No agent sessions match the current filters.',
    total: 'Total sessions',
    allStates: 'All states',
    active: 'Active',
    activeHint: 'Working / review / blocked',
    completed: 'Completed',
    stale: 'Stale',
    states: 'State breakdown'
  }
} as const satisfies Record<AppLanguage, Record<string, string>>

export default function Sessions() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const local = localCopy[language]
  const locale = language === 'zh' ? 'zh-CN' : 'en'

  const [sessions, setSessions] = useState<AnyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [projectFilter, setProjectFilter] = useState<string[]>([])
  const [agentFilter, setAgentFilter] = useState<string[]>([])
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const page = await apiGet<AnyRecord>('/api/agent-sessions')
      setSessions(asArray<AnyRecord>(page.agentSessions))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [])

  const projectOptions = useMemo(
    () => uniqueSorted(sessions.map(session => textOf(session.project)).filter(Boolean)),
    [sessions]
  )
  const agentOptions = useMemo(
    () => uniqueSorted(sessions.map(session => textOf(session.agent)).filter(Boolean)),
    [sessions]
  )
  const stateOptions = useMemo(
    () => uniqueSorted(sessions.map(session => textOf(session.state)).filter(Boolean)),
    [sessions]
  )

  const stateCounts = useMemo(
    () => sessions.reduce<Record<string, number>>((counts, session) => {
      const state = sessionState(session.state)
      counts[state] = (counts[state] || 0) + 1
      return counts
    }, {}),
    [sessions]
  )
  const totalCount = sessions.length
  const activeCount = sessions.filter(session => ACTIVE_STATES.has(sessionState(session.state))).length
  const doneCount = stateCounts.done || 0
  const failedCount = stateCounts.failed || 0
  const staleCount = stateCounts.stale || 0

  // Live activity feed derived strictly from loaded sessions, newest first.
  const events = useMemo(() => {
    return [...sessions]
      .map(session => {
        const raw = textOf(session.lastActivity || session.updatedAt)
        return { session, t: new Date(raw).getTime() }
      })
      .filter(item => !Number.isNaN(item.t))
      .sort((a, b) => b.t - a.t)
      .slice(0, 12)
      .map(({ session }) => {
        const state = sessionState(session.state)
        const rawActivity = textOf(session.lastActivity || session.updatedAt)
        const time = rawActivity ? formatRelativeTime(rawActivity, locale) : '-'
        const agent = textOf(session.agent, '-')
        const title = textOf(session.title)
        const project = textOf(session.project)
        const message = [agent, title, project].filter(Boolean).join(' · ')
        const code = textOf(session.sessionId) || undefined
        return { time, level: eventLevel(state), message, code }
      })
  }, [sessions, locale])

  // State distribution for the side card — real per-state counts only.
  const stateBreakdown = useMemo(
    () =>
      SESSION_STATE_ORDER.map(state => ({ state, count: stateCounts[state] || 0 })).filter(
        item => item.count > 0
      ),
    [stateCounts]
  )

  const activeStatusFilter = statusFilter.filter(value => stateOptions.includes(value))
  const activeProjectFilter = projectFilter.filter(value => projectOptions.includes(value))
  const activeAgentFilter = agentFilter.filter(value => agentOptions.includes(value))
  const cleanQuery = query.trim().toLowerCase()

  const filteredSessions = useMemo(
    () => sessions.filter(session => {
      if (activeStatusFilter.length && !activeStatusFilter.includes(textOf(session.state))) return false
      if (activeProjectFilter.length && !activeProjectFilter.includes(textOf(session.project))) return false
      if (activeAgentFilter.length && !activeAgentFilter.includes(textOf(session.agent))) return false
      return true
    }),
    [sessions, activeStatusFilter, activeProjectFilter, activeAgentFilter]
  )

  const visibleSessions = useMemo(
    () => filteredSessions.filter(session => {
      if (!cleanQuery) return true
      const task = linkedRecord(session.task)
      const workflow = linkedRecord(session.workflow)
      return [
        session.agent,
        session.project,
        session.title,
        session.sessionId,
        session.state,
        task?.title,
        task?.id,
        workflow?.title,
        workflow?.id
      ].some(field => textOf(field).toLowerCase().includes(cleanQuery))
    }),
    [filteredSessions, cleanQuery]
  )

  const activeFilterCount =
    (cleanQuery ? 1 : 0) + activeStatusFilter.length + activeProjectFilter.length + activeAgentFilter.length
  const selectedLabel = (count: number) => `${count} ${language === 'zh' ? '已选' : 'selected'}`

  // AlertBanner surfaces a real problem state only — never invented numbers.
  const banner = !loading
    ? error
      ? {
          tone: 'error' as const,
          title: local.loadError,
          description: error
        }
      : sessions.length === 0
        ? {
            tone: 'info' as const,
            title: local.noSessions,
            description: local.noSessionsHint
          }
        : null
    : null

  return (
    <div className="flex flex-col gap-[var(--section-gap)]">
      <PageHead
        title={local.sessions}
        subtitle={local.description}
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {copy.refresh}
          </Button>
        }
      />

      {banner ? (
        <AlertBanner tone={banner.tone} title={banner.title} description={banner.description} />
      ) : null}

      <MetricGrid>
        <MetricCard
          label={local.total}
          value={totalCount}
          icon={Bot}
        />
        <MetricCard
          label={local.active}
          value={activeCount}
          icon={Activity}
          note={local.activeHint}
        />
        <MetricCard
          label={local.completed}
          value={doneCount}
          icon={CheckCircle2}
        />
        <MetricCard
          label={stateLabel('failed', language)}
          value={failedCount}
          icon={AlertTriangle}
        />
        <MetricCard
          label={local.stale}
          value={staleCount}
          icon={Clock}
        />
      </MetricGrid>

      <SplitRow
        stream={
          <EventStream
            events={events}
            controls={
              <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                {copy.refresh}
              </Button>
            }
          />
        }
        side={
          <Card title={local.states} count={stateBreakdown.length} flushBody>
            <ul className="px-[var(--card-pad)] py-1.5">
              {stateBreakdown.length ? (
                stateBreakdown.map(({ state, count }) => {
                  const meta = SESSION_STATE_META[state]
                  return (
                    <li key={state} className="flex items-center gap-2 border-b border-line py-2 last:border-b-0">
                      <span className={cn('size-2 shrink-0 rounded-full', meta.dot)} aria-hidden="true" />
                      <span className="text-[13px] text-ink-2">{meta.label[language]}</span>
                      <span className="ml-auto font-mono text-[12px] font-semibold text-ink-1">{count}</span>
                    </li>
                  )
                })
              ) : (
                <li className="py-10 text-center text-ink-4">{copy.noData}</li>
              )}
            </ul>
          </Card>
        }
      />

      <Card
        title={local.sessions}
        count={visibleSessions.length}
        flushBody
        toolbar={
          <FilterBar
            search={{
              id: 'session-search',
              value: query,
              onChange: setQuery,
              placeholder: local.searchPlaceholder,
              label: local.search
            }}
            filters={[
              {
                type: 'multi',
                id: 'session-status',
                label: local.statusLabel,
                options: stateOptions.map(value => ({
                  value,
                  label: stateLabel(value, language),
                  count: stateCounts[value] || 0
                })),
                allLabel: copy.allStatuses,
                values: activeStatusFilter,
                onChange: setStatusFilter,
                searchable: true,
                searchPlaceholder: local.searchPlaceholder,
                noMatchesLabel: copy.noData
              },
              {
                type: 'multi',
                id: 'session-project',
                label: local.project,
                options: projectOptions.map(value => ({ value, label: value })),
                allLabel: local.allProjects,
                values: activeProjectFilter,
                onChange: setProjectFilter,
                searchable: true,
                searchPlaceholder: local.searchProjects,
                noMatchesLabel: local.noProjects
              },
              {
                type: 'multi',
                id: 'session-agent',
                label: local.agent,
                options: agentOptions.map(value => ({ value, label: value })),
                allLabel: local.allAgents,
                values: activeAgentFilter,
                onChange: setAgentFilter,
                searchable: true,
                searchPlaceholder: local.searchAgents,
                noMatchesLabel: local.noAgents
              }
            ]}
            onClear={() => { setQuery(''); setProjectFilter([]); setAgentFilter([]); setStatusFilter([]) }}
            clearLabel={copy.clear}
            activeCount={activeFilterCount}
            activeLabel={selectedLabel}
          />
        }
      >
        {loading && sessions.length === 0 ? (
          <LoadingState variant="rows" label={local.loading} className="p-4" />
        ) : visibleSessions.length ? (
          <ul className="-mx-4 border-t border-line">
            {visibleSessions.map(session => {
              const state = sessionState(session.state)
              const meta = SESSION_STATE_META[state]
              const sessionId = textOf(session.sessionId)
              const agent = textOf(session.agent, '-')
              const project = textOf(session.project)
              const title = textOf(session.title)
              const attempt = numberOf(session.attempt)
              const rawActivity = textOf(session.lastActivity || session.updatedAt)
              const timeNode = rawActivity ? formatRelativeTime(rawActivity, locale) : ''
              const progress = progressPercent(session.progress)
              const errorText = textOf(session.error)
              const task = linkedRecord(session.task)
              const workflow = linkedRecord(session.workflow)
              const subtitleParts = [project, timeNode].filter(Boolean)
              const subtitle = subtitleParts.join(' · ')
              return (
                <li key={sessionId || textOf(session.id) || title} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                  <span className={cn('size-2 shrink-0 rounded-full', meta.dot)} aria-hidden="true" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <Bot className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                      <span className="truncate text-sm font-medium text-ink">{agent}</span>
                      {title ? <span className="truncate text-xs text-ink-3">· {title}</span> : null}
                    </span>
                    {subtitle ? <span className="truncate pl-5 text-xs text-ink-3">{subtitle}</span> : null}
                    {(task || workflow || attempt > 0) ? (
                      <span className="flex flex-wrap items-center gap-1.5 pl-5">
                        {task ? (
                          <span className="inline-flex min-w-0 items-center gap-1 text-xs text-ink-2">
                            <ListTodo className="size-3 shrink-0 text-ink-3" aria-hidden="true" />
                            <span className="truncate">{task.title || task.id}</span>
                            {task.status ? <Badge variant={statusBadgeVariant(task.status)} className="max-w-[160px] truncate">{task.status}</Badge> : null}
                          </span>
                        ) : null}
                        {workflow ? (
                          <span className="inline-flex min-w-0 items-center gap-1 text-xs text-ink-2">
                            <GitBranch className="size-3 shrink-0 text-ink-3" aria-hidden="true" />
                            <span className="truncate">{workflow.title || workflow.id}</span>
                            {workflow.status ? <Badge variant={statusBadgeVariant(workflow.status)} className="max-w-[160px] truncate">{workflow.status}</Badge> : null}
                          </span>
                        ) : null}
                        {attempt > 0 ? <Badge variant="neutral">#{attempt}</Badge> : null}
                      </span>
                    ) : null}
                    {progress !== undefined ? (
                      <span className="inline-flex w-40 items-center gap-2 pl-5">
                        <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunk">
                          <span className="block h-full rounded-full bg-accent-base" style={{ width: `${progress}%` }} />
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-ink-3">{progress}%</span>
                      </span>
                    ) : null}
                    {errorText ? (
                      <span className="flex min-w-0 items-start gap-1 pl-5 text-xs text-danger-text">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 truncate" title={errorText}>{errorText}</span>
                      </span>
                    ) : null}
                  </div>
                  <Badge variant={meta.variant} className="max-w-[180px] truncate">
                    {meta.label[language]}
                  </Badge>
                  {rawActivity ? (
                    <time
                      dateTime={rawActivity}
                      title={formatDate(rawActivity, 'full')}
                      className="ml-auto shrink-0 font-mono text-xs text-ink-3"
                    >
                      {timeNode}
                    </time>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState title={local.noSessions} description={local.noSessionsHint} />
        )}
      </Card>
    </div>
  )
}
