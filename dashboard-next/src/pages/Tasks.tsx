/**
 * Tasks — standalone Plan A route for the shared task queue.
 *
 * Ported from the `TasksPanel` inside `Dashboard.tsx`. Real endpoints only:
 *   GET /api/tasks?includeCancelled=1  → { tasks: Task[], kanban: Record<status, Task[]> }
 *   GET /api/projects                  → { visibleProjects: Project[] }  (names for the filter)
 * Mutations POST to /api/task/{claim,status,review,add} and re-pull the list.
 *
 * v1 SIMPLIFICATIONS (noted per LANDING-CONTRACT §v1):
 *  - The Dashboard panel renders a virtualized kanban with drag-and-drop. Here we
 *    use a filterable list (status strip + search + project/priority filters) and
 *    keep the data + core lifecycle actions (claim → start → complete, reopen,
 *    approve & complete, request verification) plus create / refresh / filter.
 *  - The per-task detail drawer, the "more actions" menu, Radio request and the
 *    cancel-with-confirm flow are omitted from v1 to stay within one file.
 *
 * Composition follows the proto-next "bone": PageHead → (AlertBanner if problem
 * state) → MetricGrid (5 MetricCards derived from real data) → Card (filters +
 * list/board). No numbers are invented; every KPI comes from the loaded tasks.
 */

import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Inbox,
  ListTodo,
  Play,
  PlayCircle,
  Plus,
  RefreshCw
} from 'lucide-react'
import { apiGet, apiPost, asArray, asRecord, formatRelativeTime, numberOf, textOf, type AnyRecord } from '../lib/api'
import { dashboardLabels, dashboardSubtitles, dashboardTitles } from '../lib/dashboardCopy'
import type { AppOutletContext } from '../lib/i18n'
import { statusBadgeVariant, priorityBadgeVariant } from '@/lib/statusBadge'
import { cn } from '@/lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input, fieldBaseStyles } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose
} from '../components/ui/dialog'
import { EmptyState, ErrorState, FilterBar, LoadingState } from '../components/shell'
import { AlertBanner, Card, MetricCard, MetricGrid, PageHead } from '@/components/ds'

/* Canonical status order for the status strip (mirrors TasksPanel). */
const TASK_STATUS_ORDER = [
  'open',
  'claimed',
  'in_progress',
  'needs_verification',
  'blocked',
  'failed',
  'done',
  'cancelled'
] as const

const STATUS_DOT: Record<string, string> = {
  open: 'bg-ink-3',
  claimed: 'bg-info',
  in_progress: 'bg-accent-base',
  needs_verification: 'bg-warning',
  blocked: 'bg-danger',
  failed: 'bg-danger',
  done: 'bg-success',
  cancelled: 'bg-line-strong'
}

function statusDot(status: string): string {
  return STATUS_DOT[status] ?? 'bg-ink-3'
}

/* Board-only view: backend enum (7 values), NO `failed`, NO 4-col zh names. */
const KANBAN_COLUMNS = [
  { value: 'open', dot: 'bg-ink-3' },
  { value: 'claimed', dot: 'bg-info' },
  { value: 'in_progress', dot: 'bg-accent-base' },
  { value: 'blocked', dot: 'bg-danger' },
  { value: 'needs_verification', dot: 'bg-warning' },
  { value: 'done', dot: 'bg-success' },
  { value: 'cancelled', dot: 'bg-line-strong' }
] as const

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-danger',
  high: 'bg-warning',
  normal: 'bg-ink-3',
  low: 'bg-line-strong'
}

function priorityDot(priority: string): string {
  return PRIORITY_DOT[priority] ?? 'bg-ink-3'
}

type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

function statusTabTone(status: string): StatusTone {
  if (status === 'done') return 'success'
  if (status === 'blocked' || status === 'failed' || status === 'cancelled') return 'danger'
  if (status === 'needs_verification') return 'warning'
  if (status === 'in_progress') return 'accent'
  if (status === 'claimed') return 'info'
  return 'neutral'
}

function uniqueSorted(items: string[]): string[] {
  return Array.from(new Set(items)).sort()
}

function numericProgress(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined
}

/* Multi-select status chips that ride in the Card toolbar (replaces old StatusTabs). */
interface StatusChipItem {
  value: string
  label: string
  count: number
  tone: StatusTone
}

function StatusChips({
  items,
  values,
  total,
  allLabel,
  onToggle,
  onClear
}: {
  items: StatusChipItem[]
  values: string[]
  total: number
  allLabel: string
  onToggle: (value: string) => void
  onClear: () => void
}) {
  const allActive = values.length === 0
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onClear}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
          allActive ? 'border-accent-base bg-accent-tint text-accent-base' : 'border-line bg-surface-sunk text-ink-3 hover:text-ink'
        )}
      >
        {allLabel}
        <span className="font-mono text-[11px] opacity-80">{total}</span>
      </button>
      {items.map(item => {
        const on = values.includes(item.value)
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onToggle(item.value)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
              on ? 'border-accent-base bg-accent-tint text-accent-base' : 'border-line bg-surface-sunk text-ink-3 hover:text-ink'
            )}
          >
            <span className={cn('size-1.5 rounded-full', statusDot(item.value))} aria-hidden="true" />
            {item.label}
            <span className="font-mono text-[11px] opacity-80">{item.count}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function Tasks() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const locale = language === 'zh' ? 'zh-CN' : 'en'

  const [tasks, setTasks] = useState<AnyRecord[]>([])
  const [kanban, setKanban] = useState<AnyRecord>({})
  const [projects, setProjects] = useState<AnyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState('')

  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [projectFilter, setProjectFilter] = useState<string[]>([])
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [view, setView] = useState<'list' | 'board'>('board')
  const [newTask, setNewTask] = useState<{ title: string; project: string; priority: string; description: string; handoff: string }>({
    title: '',
    project: 'ai-memory-hub',
    priority: 'normal',
    description: '',
    handoff: ''
  })

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [tasksPayload, projectsPayload] = await Promise.all([
        apiGet<AnyRecord>('/api/tasks?includeCancelled=1'),
        apiGet<AnyRecord>('/api/projects')
      ])
      setTasks(asArray<AnyRecord>(tasksPayload.tasks))
      setKanban(asRecord(tasksPayload.kanban))
      setProjects(asArray<AnyRecord>(projectsPayload.visibleProjects))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [])

  const statusLabel = (status: string) => copy.statusLabels[status as keyof typeof copy.statusLabels] || status
  const priorityLabel = (priority: string) => copy.priorityLabels[priority as keyof typeof copy.priorityLabels] || priority

  const projectOptions = useMemo(
    () => uniqueSorted(tasks.map(task => textOf(task.project)).filter(Boolean)),
    [tasks]
  )
  const formProjectOptions = useMemo(
    () => uniqueSorted([
      ...projects.map(project => textOf(project.id || project.name || project.displayName)).filter(Boolean),
      ...projectOptions
    ]),
    [projects, projectOptions]
  )
  const priorityOptions = useMemo(
    () => uniqueSorted(tasks.map(task => textOf(task.priority)).filter(Boolean)),
    [tasks]
  )
  const statusOptions = useMemo(
    () => uniqueSorted(tasks.map(task => textOf(task.status)).filter(Boolean)),
    [tasks]
  )

  const kanbanCounts = useMemo(() => {
    if (!Object.keys(kanban).length) return null
    const result: Record<string, number> = {}
    for (const [status, value] of Object.entries(kanban)) {
      result[status] = Array.isArray(value) ? value.length : numberOf(value)
    }
    return result
  }, [kanban])
  const statusCounts = useMemo(
    () => tasks.reduce<Record<string, number>>((counts, task) => {
      const status = textOf(task.status, 'open')
      counts[status] = (counts[status] || 0) + 1
      return counts
    }, {}),
    [tasks]
  )
  const displayCounts = kanbanCounts ?? statusCounts
  const totalTaskCount = TASK_STATUS_ORDER.reduce((sum, status) => sum + (displayCounts[status] || 0), 0)

  const statusTabItems = useMemo(() => {
    const source = kanbanCounts ? TASK_STATUS_ORDER : statusOptions
    return source
      .map(status => ({ value: status, label: statusLabel(status), count: displayCounts[status] || 0, tone: statusTabTone(status) }))
      .filter(item => item.count > 0)
  }, [kanbanCounts, statusOptions, displayCounts, copy])

  const activeStatusFilter = statusFilter.filter(value => statusOptions.includes(value))
  const activeProjectFilter = projectFilter.filter(value => projectOptions.includes(value))
  const activePriorityFilter = priorityFilter.filter(value => priorityOptions.includes(value))
  const cleanQuery = query.trim().toLowerCase()

  const filteredTasks = useMemo(
    () => tasks.filter(task => {
      if (activeStatusFilter.length && !activeStatusFilter.includes(textOf(task.status))) return false
      if (activeProjectFilter.length && !activeProjectFilter.includes(textOf(task.project))) return false
      if (activePriorityFilter.length && !activePriorityFilter.includes(textOf(task.priority))) return false
      return !cleanQuery || [task.title, task.description, task.handoff, task.assignee, task.createdBy, task.status, task.project]
        .some(field => textOf(field).toLowerCase().includes(cleanQuery))
    }),
    [tasks, activeStatusFilter, activeProjectFilter, activePriorityFilter, cleanQuery]
  )

  /* Group the already-fetched tasks client-side into the 7 board columns. */
  const groupedByStatus = useMemo(() => {
    const groups: Record<string, AnyRecord[]> = {}
    for (const col of KANBAN_COLUMNS) groups[col.value] = []
    for (const task of filteredTasks) {
      const status = textOf(task.status, 'open')
      if (groups[status]) groups[status].push(task)
    }
    return groups
  }, [filteredTasks])

  const mutate = async (path: string, body: AnyRecord) => {
    setBusyAction(path)
    setError('')
    try {
      await apiPost<AnyRecord>(path, body)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusyAction('')
    }
  }

  const claim = (id: string) => void mutate('/api/task/claim', { id, by: 'dashboard-next' })
  const runStatus = (id: string, status: string) => void mutate('/api/task/status', { id, status, by: 'dashboard-next' })
  const review = (id: string, decision: 'approved' | 'rejected') => void mutate('/api/task/review', { id, decision, by: 'dashboard-next' })

  const submitTask = async () => {
    const title = newTask.title.trim()
    if (!title) return
    await mutate('/api/task/add', { ...newTask, title, from: 'dashboard-next' })
    if (!error) {
      setNewTask({ title: '', project: newTask.project, priority: 'normal', description: '', handoff: '' })
      setCreateOpen(false)
    }
  }

  const showFullError = Boolean(error) && tasks.length === 0 && !loading

  const toggleStatusFilter = (value: string) => {
    setStatusFilter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]))
  }
  const clearStatusFilter = () => setStatusFilter([])

  const renderBoard = () => {
    if (!filteredTasks.length) {
      return (
        <EmptyState
          title={copy.noData}
          description={language === 'zh' ? '没有符合当前筛选条件的任务。' : 'No tasks match the current filters.'}
        />
      )
    }
    return (
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-4 pb-2">
          {KANBAN_COLUMNS.map(col => {
            const colTasks = groupedByStatus[col.value] ?? []
            return (
              <div
                key={col.value}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/plain')
                  if (id) runStatus(id, col.value)
                }}
                className="flex w-64 shrink-0 flex-col rounded-xl border border-line bg-surface-sunk"
              >
                <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <span className={cn('size-2 shrink-0 rounded-full', col.dot)} aria-hidden="true" />
                  <span className="truncate text-sm font-medium text-ink">{copy.statusLabels[col.value]}</span>
                  <span className="ml-auto inline-flex h-5 items-center rounded-full bg-surface-sunk px-2 text-xs tabular-nums text-ink-3">
                    {colTasks.length}
                  </span>
                </div>
                <div className="flex min-h-[120px] flex-col gap-2 p-2">
                  {colTasks.map(task => {
                    const id = textOf(task.id)
                    const priority = textOf(task.priority, 'normal')
                    const title = textOf(task.title, id || '-')
                    const project = textOf(task.project)
                    const who = textOf(task.assignee || task.createdBy)
                    const progress = numericProgress(task.progressPercent)
                    const showProgress = col.value === 'in_progress' && progress !== undefined
                    return (
                      <div
                        key={id || title}
                        draggable
                        onDragStart={e => e.dataTransfer.setData('text/plain', id)}
                        className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
                      >
                        <div className="flex items-start gap-2">
                          <span className={cn('mt-1 size-2 shrink-0 rounded-full', priorityDot(priority))} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            {project ? (
                              <span className="inline-flex max-w-full truncate rounded-full bg-surface-sunk px-2 py-0.5 text-xs text-ink-3">
                                {project}
                              </span>
                            ) : null}
                            <p className="mt-0.5 break-words text-sm font-medium text-ink">{title}</p>
                          </div>
                        </div>
                        {showProgress ? (
                          <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-sunk">
                            <span className="block h-full rounded-full bg-accent-base" style={{ width: `${progress}%` }} />
                          </span>
                        ) : null}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {who ? (
                              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-tint text-[10px] font-medium uppercase text-accent-base">
                                {who.slice(0, 2)}
                              </span>
                            ) : null}
                            <span className="truncate text-xs text-ink-3">{who}</span>
                          </div>
                          <label className="sr-only" htmlFor={`status-${id}`}>{copy.status}</label>
                          <select
                            id={`status-${id}`}
                            value={col.value}
                            disabled={Boolean(busyAction)}
                            onChange={e => runStatus(id, e.target.value)}
                            className={cn(fieldBaseStyles, 'h-7 w-auto flex-none px-2 py-0 text-xs')}
                          >
                            {KANBAN_COLUMNS.map(opt => (
                              <option value={opt.value} key={opt.value}>{copy.statusLabels[opt.value]}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )
                  })}
                  {colTasks.length === 0 ? (
                    <div className="flex min-h-[60px] items-center justify-center rounded-md border border-dashed border-line text-xs text-ink-3">
                      {language === 'zh' ? '空' : 'Empty'}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const blockedCount = displayCounts.blocked || 0

  return (
    <>
      <PageHead
        title={dashboardTitles[language]['tasks']}
        subtitle={dashboardSubtitles[language]['tasks']}
        actions={
          <>
            <div className="flex items-center rounded-md border border-line bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setView('list')}
                className={cn('rounded px-3 py-1 text-sm', view === 'list' ? 'bg-surface-sunk font-medium text-ink' : 'text-ink-3')}
              >
                {copy.listView}
              </button>
              <button
                type="button"
                onClick={() => setView('board')}
                className={cn('rounded px-3 py-1 text-sm', view === 'board' ? 'bg-surface-sunk font-medium text-ink' : 'text-ink-3')}
              >
                {copy.boardView}
              </button>
            </div>
            <Button variant="secondary" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              {copy.refresh}
            </Button>
            <Button onClick={() => { setError(''); setCreateOpen(true) }} disabled={loading}>
              <Plus className="h-4 w-4" />
              {copy.addTask}
            </Button>
          </>
        }
      />

      {showFullError ? (
        <ErrorState
          variant="block"
          title={copy.connectionError}
          description={error}
          action={
            <Button onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
              {language === 'zh' ? '重试' : 'Retry'}
            </Button>
          }
        />
      ) : (
        <>
          {error ? (
            <AlertBanner tone="error" title={copy.connectionError} description={error} />
          ) : blockedCount > 0 ? (
            <AlertBanner
              tone="warning"
              title={language === 'zh' ? `${blockedCount} 个任务阻塞` : `${blockedCount} tasks blocked`}
              description={
                language === 'zh'
                  ? '这些任务需要关注，请尽快处理或解除阻塞。'
                  : 'These tasks need attention — unblock or resolve them soon.'
              }
            />
          ) : null}

          <MetricGrid>
            <MetricCard label={copy.totalTasks} value={totalTaskCount} icon={ListTodo} note={language === 'zh' ? `跨 ${projectOptions.length} 个项目` : `across ${projectOptions.length} projects`} />
            <MetricCard label={statusLabel('in_progress')} value={displayCounts.in_progress || 0} icon={PlayCircle} />
            <MetricCard
              label={statusLabel('blocked')}
              value={blockedCount}
              icon={AlertTriangle}
              note={<Badge variant="danger" dot>{language === 'zh' ? '需关注' : 'Needs attention'}</Badge>}
            />
            <MetricCard label={statusLabel('done')} value={displayCounts.done || 0} icon={CheckCircle2} />
            <MetricCard label={statusLabel('open')} value={displayCounts.open || 0} icon={Inbox} />
          </MetricGrid>

          <Card
            title={copy.recentTasks}
            count={filteredTasks.length}
            toolbar={
              <StatusChips
                items={statusTabItems}
                values={statusFilter}
                total={totalTaskCount}
                allLabel={copy.allStatuses}
                onToggle={toggleStatusFilter}
                onClear={clearStatusFilter}
              />
            }
            bodyClassName="flex flex-col gap-4"
          >
            <FilterBar
              search={{
                id: 'task-search',
                value: query,
                onChange: setQuery,
                placeholder: copy.searchText,
                label: copy.searchText
              }}
              filters={[
                {
                  type: 'multi',
                  id: 'task-project',
                  label: copy.project,
                  options: projectOptions.map(value => ({ value, label: value })),
                  allLabel: copy.allProjects,
                  values: activeProjectFilter,
                  onChange: setProjectFilter,
                  searchable: true,
                  searchPlaceholder: copy.searchProjectPlaceholder,
                  noMatchesLabel: copy.noMatchesProject
                },
                {
                  type: 'multi',
                  id: 'task-priority',
                  label: copy.priority,
                  options: priorityOptions.map(value => ({ value, label: priorityLabel(value) })),
                  allLabel: copy.allPriorities,
                  values: activePriorityFilter,
                  onChange: setPriorityFilter,
                  selectedLabel: count => `${count} ${copy.itemsSelected}`
                }
              ]}
              onClear={() => { setQuery(''); setProjectFilter([]); setPriorityFilter([]); setStatusFilter([]) }}
              clearLabel={copy.clear}
              activeCount={(cleanQuery ? 1 : 0) + activeProjectFilter.length + activePriorityFilter.length + activeStatusFilter.length}
              activeLabel={count => `${count} ${copy.itemsSelected}`}
            />

            {loading && tasks.length === 0 ? (
              <LoadingState variant="rows" label={copy.refreshing} className="p-4" />
            ) : view === 'board' ? (
              renderBoard()
            ) : filteredTasks.length ? (
              <ul className="flex flex-col border-t border-line">
                {filteredTasks.map(task => {
                  const id = textOf(task.id)
                  const status = textOf(task.status, 'open')
                  const priority = textOf(task.priority, 'normal')
                  const isBusy = busyAction.startsWith(`${id}:`) || busyAction === '/api/task/status'
                  const title = textOf(task.title, id || '-')
                  const who = textOf(task.assignee || task.createdBy)
                  const rawTimestamp = textOf(task.updatedAt || task.createdAt)
                  const timeNode = rawTimestamp ? formatRelativeTime(rawTimestamp, locale) : ''
                  const subtitleParts = [textOf(task.project), who, timeNode].filter(Boolean)
                  const subtitle = subtitleParts.join(' · ')
                  const progress = numericProgress(task.progressPercent)
                  return (
                    <li key={id || title} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                      <span className={cn('size-2 shrink-0 rounded-full', statusDot(status))} aria-hidden="true" />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium text-ink">{title}</span>
                        {subtitle ? <span className="truncate text-xs text-ink-3">{subtitle}</span> : null}
                      </div>
                      <Badge variant={statusBadgeVariant(status)} className="max-w-[180px] truncate">{statusLabel(status)}</Badge>
                      {priority !== 'normal' ? (
                        <Badge variant={priorityBadgeVariant(priority)} className="max-w-[180px] truncate">{priorityLabel(priority)}</Badge>
                      ) : null}
                      {progress !== undefined ? (
                        <span className="inline-flex w-28 items-center gap-2">
                          <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunk">
                            <span className="block h-full rounded-full bg-accent-base" style={{ width: `${progress}%` }} />
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-ink-3">{progress}%</span>
                        </span>
                      ) : null}
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {status === 'open' ? (
                          <Button size="sm" disabled={isBusy} onClick={() => claim(id)}>{copy.claim}</Button>
                        ) : null}
                        {['claimed', 'blocked'].includes(status) ? (
                          <Button size="sm" disabled={isBusy} onClick={() => runStatus(id, 'in_progress')}>
                            <Play className="h-3.5 w-3.5" />
                            {status === 'blocked' ? copy.unblock : copy.start}
                          </Button>
                        ) : null}
                        {status === 'in_progress' ? (
                          <>
                            <Button size="sm" disabled={isBusy} onClick={() => runStatus(id, 'done')}>
                              <Check className="h-3.5 w-3.5" />
                              {copy.completeDirectly}
                            </Button>
                            <Button size="sm" variant="secondary" disabled={isBusy} onClick={() => runStatus(id, 'needs_verification')}>
                              {copy.requestVerification}
                            </Button>
                          </>
                        ) : null}
                        {status === 'needs_verification' ? (
                          <Button size="sm" disabled={isBusy} onClick={() => review(id, 'approved')}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {copy.approveAndComplete}
                          </Button>
                        ) : null}
                        {status === 'done' ? (
                          <Button size="sm" variant="outline" disabled={isBusy} onClick={() => runStatus(id, 'open')}>{copy.reopen}</Button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState title={copy.noData} description={language === 'zh' ? '没有符合当前筛选条件的任务。' : 'No tasks match the current filters.'} />
            )}
          </Card>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{copy.addTask}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            {error ? (
              <div role="alert" className="rounded-sm border border-danger-line bg-danger-tint p-3 text-sm text-danger-text">{error}</div>
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 grid gap-2">
                <Label htmlFor="task-title">{copy.title}</Label>
                <Input
                  id="task-title"
                  value={newTask.title}
                  onChange={event => setNewTask(value => ({ ...value, title: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="task-project">{copy.project}</Label>
                <Input
                  id="task-project"
                  list="task-project-options"
                  value={newTask.project}
                  onChange={event => setNewTask(value => ({ ...value, project: event.target.value }))}
                />
                <datalist id="task-project-options">
                  {formProjectOptions.map(project => <option value={project} key={project} />)}
                </datalist>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="task-priority">{copy.priority}</Label>
                <select
                  id="task-priority"
                  value={newTask.priority}
                  onChange={event => setNewTask(value => ({ ...value, priority: event.target.value }))}
                  className={cn(fieldBaseStyles, 'flex h-9 px-3 py-0')}
                >
                  {['low', 'normal', 'high', 'urgent'].map(priority => (
                    <option value={priority} key={priority}>{priorityLabel(priority)}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 grid gap-2">
                <Label htmlFor="task-description">{copy.description}</Label>
                <Textarea
                  id="task-description"
                  value={newTask.description}
                  onChange={event => setNewTask(value => ({ ...value, description: event.target.value }))}
                  rows={3}
                />
              </div>
              <div className="col-span-2 grid gap-2">
                <Label htmlFor="task-handoff">{copy.handoff}</Label>
                <Textarea
                  id="task-handoff"
                  value={newTask.handoff}
                  onChange={event => setNewTask(value => ({ ...value, handoff: event.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">{copy.cancel}</Button></DialogClose>
            <Button onClick={() => void submitTask()} disabled={busyAction === '/api/task/add' || !newTask.title.trim()}>
              {busyAction === '/api/task/add' ? copy.running : copy.addTask}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
