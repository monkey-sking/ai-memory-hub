import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AnyRecord } from '../lib/api'
import { apiGet, apiPost, asArray, asRecord, boolOf, formatDate, numberOf, textOf } from '../lib/api'
import { createDashboardRealtimeClient } from '../lib/realtime'
import { mergeDashboardPage } from '../lib/dashboardPagination'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import { dashboardLabels, dashboardSubtitles, dashboardTitles } from '../lib/dashboardCopy'
import type { DashboardCopy, DashboardSection } from '../lib/dashboardCopy'
import { toolDisplayNames, toolIconAssetVersion, toolIconFiles, toolKindBadges, toolKinds } from '../lib/toolMetadata'
import { ProjectsPanel } from '../components/ProjectsPanel'
import { DashboardHeader } from '../components/DashboardHeader'
import { ToastStack } from '../components/ToastStack'
import { TasksPanel as NewTasksPanel } from '../components/TasksPanel'
import { MemoryPanel as NewMemoryPanel } from '../components/MemoryPanel'
import { RadioPanel as NewRadioPanel } from '../components/RadioPanel'
import { WorkflowsPanel } from '../components/WorkflowsPanel'
import {
  MetricCard as NewMetricCard,
  Panel as NewPanel,
  StatusBadge as NewStatusBadge
} from '../components/OverviewComponents'
import {
  Callout,
  EmptyState,
  ErrorState,
  LoadingState,
  PageShell,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetDetailList,
  SheetHeader,
  SheetRawBlock,
  SheetTitle
} from '@/components/shell'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import './Dashboard.css'

type Language = AppLanguage

interface DashboardProps {
  section: DashboardSection
}

interface DashboardSnapshot {
  status?: AnyRecord
  metrics?: AnyRecord
  memory?: AnyRecord
  radio?: AnyRecord
  tasks?: AnyRecord
  workflows?: AnyRecord
  projects?: AnyRecord
  dispatch?: AnyRecord
  agentSessions?: AnyRecord
  worktrees?: AnyRecord
  collaboration?: AnyRecord
  tools?: AnyRecord
  backups?: AnyRecord
  settings?: AnyRecord
}

type ToastMessage = {
  id: string
  tone: 'success' | 'error'
  message: string
}

type PagedCollection = 'memory' | 'tasks' | 'radio'

export default function Dashboard({ section }: DashboardProps) {
  const { language, toggleLanguage } = useOutletContext<AppOutletContext>()
  const [data, setData] = useState<DashboardSnapshot | null>(null)
  const [health, setHealth] = useState<AnyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  // Mirrors `data` so loadMoreCollection can read the current page depth without
  // being re-created (and re-subscribing every list observer) on every snapshot.
  const dataRef = useRef<DashboardSnapshot | null>(null)
  useEffect(() => {
    dataRef.current = data
  }, [data])

  const copy = dashboardLabels[language]
  const showToast = useCallback((message: string, tone: ToastMessage['tone'] = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts(value => [...value.slice(-3), { id, tone, message }])
    window.setTimeout(() => {
      setToasts(value => value.filter(toast => toast.id !== id))
    }, 4200)
  }, [])
  const dismissToast = useCallback((id: string) => {
    setToasts(value => value.filter(toast => toast.id !== id))
  }, [])
  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { snapshot, health: nextHealth } = await fetchDashboardData(section)
      setData(previous => mergeDashboardSnapshot(previous, snapshot))
      setHealth(nextHealth)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [section])

  const runHubAction = useCallback(async (path: string, action: string) => {
    setBusyAction(action)
    setError('')
    try {
      await apiPost<AnyRecord>(path, {})
      await refresh()
      showToast(`${copy.actionSucceeded}: ${action}`)
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError)
      setError(message)
      showToast(`${copy.actionFailed}: ${message}`, 'error')
    } finally {
      setBusyAction('')
    }
  }, [copy.actionFailed, copy.actionSucceeded, refresh, showToast])

  useEffect(() => {
    let active = true
    let realtimeReceived = false

    const realtime = createDashboardRealtimeClient({
      onSnapshot: snapshot => {
        if (!active) return
        realtimeReceived = true
        setData(previous => mergeDashboardSnapshot(previous, snapshot as DashboardSnapshot))
        setError('')
        setLoading(false)
      }
    })

    void fetchDashboardData(section)
      .then(({ snapshot, health: nextHealth }) => {
        if (!active || realtimeReceived) return
        setData(previous => mergeDashboardSnapshot(previous, snapshot))
        setHealth(nextHealth)
      })
      .catch(nextError => {
        if (!active) return
        setError(nextError instanceof Error ? nextError.message : String(nextError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      realtime.close()
    }
  }, [section])

  const viewModel = useMemo(() => buildViewModel(data), [data])
  const loadMoreCollection = useCallback(async (collection: PagedCollection) => {
    const itemKey = pagedCollections[collection]
    const currentItems = asArray<AnyRecord>(asRecord(dataRef.current?.[collection])[itemKey])
    const payload = await apiGet<AnyRecord>(`${pagedCollectionPaths[collection]}?offset=${currentItems.length}&limit=200`)
    const nextItems = asArray<AnyRecord>(payload[itemKey])
    setData(previous => {
      const previousSection = asRecord(previous?.[collection])
      const previousItems = asArray<AnyRecord>(previousSection[itemKey])
      return {
        ...(previous || {}),
        [collection]: {
          ...previousSection,
          [itemKey]: mergeDashboardPage(collection, previousItems, nextItems, pageItemKey),
          total: payload.total,
          offset: payload.offset,
          limit: payload.limit,
          hasMore: payload.hasMore
        }
      }
    })
  }, [])

  // `CommandCenter` opens the overview with its own hero `<h1>`, so the overview
  // is the one section that must not ask `PageShell` for a heading — every other
  // section gets its `<h1>` and description from the shell.
  const isOverview = section === 'overview'

  return (
    <div className={`dashboard-page dashboard-section-${section}`}>
      <DashboardHeader
        title={dashboardTitles[language][section]}
        loading={loading}
        busyAction={busyAction}
        copy={copy}
        onRefresh={refresh}
        onPull={() => void runHubAction('/api/pull', 'pull')}
        onSync={() => void runHubAction('/api/sync', 'sync')}
        onToggleLanguage={toggleLanguage}
      />

      <PageShell
        title={isOverview ? undefined : dashboardTitles[language][section]}
        description={isOverview ? undefined : dashboardSubtitles[language][section]}
      >
        {error ? (
          <ErrorState variant="inline" title={copy.connectionError} description={error} />
        ) : null}

        {loading && !data ? (
          <LoadingState label={copy.refreshing} />
        ) : (
          <div>
            {section === 'overview' && <CommandCenter model={viewModel} language={language} />}
            {section === 'memory' && <NewMemoryPanel memory={viewModel.memory} copy={copy} onRefresh={refresh} hasMore={viewModel.memoryHasMore} onLoadMore={() => loadMoreCollection('memory')} />}
            {section === 'tasks' && <NewTasksPanel tasks={viewModel.tasks} visibleProjects={viewModel.visibleProjects} copy={copy} onMutate={async (_action, path, body) => {
              await apiPost<AnyRecord>(path, body)
              await refresh()
              return true
            }} hasMore={viewModel.tasksHasMore} onLoadMore={() => loadMoreCollection('tasks')} />}
            {section === 'radio' && <NewRadioPanel radio={viewModel.radio} visibleProjects={viewModel.visibleProjects} copy={copy} onRefresh={refresh} hasMore={viewModel.radioHasMore} onLoadMore={() => loadMoreCollection('radio')} />}
            {section === 'dispatch' && <DispatchPanel copy={copy} model={viewModel} onRefresh={refresh} />}
            {section === 'workflows' && <WorkflowsPanel workflows={viewModel.workflows} visibleProjects={viewModel.visibleProjects} copy={copy} onRefresh={refresh} />}
            {section === 'analytics' && <AnalyticsPanel copy={copy} model={viewModel} />}
            {section === 'backups' && <BackupsPanel copy={copy} model={viewModel} onRefresh={refresh} />}
            {section === 'search' && <SearchPanel copy={copy} />}
            {section === 'tools' && <ToolsPanel copy={copy} language={language} model={viewModel} onRefresh={refresh} />}
            {section === 'projects' && <ProjectsPanel copy={copy} model={viewModel} onRefresh={refresh} />}
            {section === 'health' && <HealthPanel copy={copy} model={viewModel} health={health} onRefresh={refresh} />}
            {section === 'settings' && <SettingsPanel copy={copy} model={viewModel} onRefresh={refresh} />}
          </div>
        )}
      </PageShell>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

async function fetchDashboardData(section: DashboardSection): Promise<{ snapshot: DashboardSnapshot; health: AnyRecord | null }> {
  if (section === 'overview') {
    const snapshot = await apiGet<DashboardSnapshot>('/api/dashboard/overview')
    return { snapshot, health: null }
  }

  const sectionRequest: Partial<Record<DashboardSection, { path: string; key: keyof DashboardSnapshot }>> = {
    memory: { path: '/api/memory', key: 'memory' },
    tasks: { path: '/api/tasks', key: 'tasks' },
    radio: { path: '/api/radio', key: 'radio' },
    workflows: { path: '/api/workflows', key: 'workflows' },
    dispatch: { path: '/api/dispatch', key: 'dispatch' },
    tools: { path: '/api/tools', key: 'tools' },
    backups: { path: '/api/backups', key: 'backups' },
    projects: { path: '/api/projects', key: 'projects' },
    analytics: { path: '/api/metrics', key: 'metrics' },
    settings: { path: '/api/settings', key: 'settings' },
    health: { path: '/api/health', key: 'status' }
  }
  const request = sectionRequest[section]
  if (!request) {
    const snapshot = await apiGet<DashboardSnapshot>('/api/dashboard')
    return { snapshot, health: null }
  }

  const requests: Promise<AnyRecord>[] = [apiGet<AnyRecord>(request.path)]
  if (section === 'tasks' || section === 'workflows') requests.push(apiGet<AnyRecord>('/api/projects'))
  const [payload, projects] = await Promise.all(requests)
  const snapshot = { [request.key]: payload, ...(projects ? { projects } : {}) } as DashboardSnapshot
  return { snapshot, health: section === 'health' ? payload : null }
}

const pagedCollections = {
  memory: 'records',
  tasks: 'tasks',
  radio: 'messages'
} as const satisfies Record<PagedCollection, string>

const pagedCollectionPaths = {
  memory: '/api/memory',
  tasks: '/api/tasks',
  radio: '/api/radio'
} as const satisfies Record<PagedCollection, string>

function pageItemKey(item: AnyRecord): string {
  return textOf(item.localEventId || item.id)
}

/**
 * Reconcile one paginated collection against an incoming snapshot.
 *
 * Snapshots (websocket pushes and section refetches) always carry only the first
 * server page. Replacing state with them would discard every extra page the user
 * has already scrolled in, so instead we refresh the records we already hold in
 * place and splice in only the genuinely new ones. We must also drop records the
 * server stopped returning: a deletion (e.g. a cancelled task) is invisible unless
 * we remove it from state, otherwise it lingers as a stale row until a full reload.
 */
function mergeSnapshotCollection(
  collection: PagedCollection,
  previousSection: AnyRecord,
  incomingSection: AnyRecord
): AnyRecord {
  const itemKey = pagedCollections[collection]
  const previousItems = asArray<AnyRecord>(previousSection[itemKey])
  const incomingItems = asArray<AnyRecord>(incomingSection[itemKey])
  // No extra pages loaded beyond the first: the snapshot is the full section
  // state, so trust it wholesale. This is also what makes server deletions
  // (e.g. a cancelled task) disappear from the UI instead of lingering as a
  // stale row — a deleted record simply isn't in the snapshot.
  const pageCapacity = (previousSection.limit as number) ?? previousItems.length
  if (previousItems.length <= pageCapacity) return incomingSection

  const incomingByKey = new Map<string, AnyRecord>()
  for (const item of incomingItems) {
    const key = pageItemKey(item)
    if (key) incomingByKey.set(key, item)
  }
  // We have paged-in records the server never re-sent, so we must merge rather
  // than replace. The snapshot covers a contiguous range at one end of what we
  // hold: tasks/memory are newest-first (page 0 = head → prefix); radio is
  // ascending (page 0 = tail → suffix). Inside that range a record the server
  // no longer returns was deleted and must be dropped; outside it (records the
  // user scrolled in) keep the local copy as before.
  const knownKeys = new Set(previousItems.map(pageItemKey).filter(Boolean))
  const newItems = incomingItems.filter(item => {
    const key = pageItemKey(item)
    return key ? !knownKeys.has(key) : false
  })
  // Page 0 is capped at `limit`, so each new arrival pushes one previously-held
  // record out of the snapshot window. Those records are not deleted, so shrink
  // the covered range by the number of arrivals before judging absences.
  const coveredCount = Math.max(
    0,
    Math.min(incomingItems.length, previousItems.length) - newItems.length
  )
  const isRadio = collection === 'radio'
  const inCovered = (i: number) =>
    isRadio ? i >= previousItems.length - coveredCount : i < coveredCount
  const retained = previousItems.filter((item, i) => {
    const key = pageItemKey(item)
    if (!key) return true
    if (!inCovered(i)) return true
    return incomingByKey.has(key)
  })
  const refreshedItems = retained.map(item => {
    const key = pageItemKey(item)
    return key ? incomingByKey.get(key) ?? item : item
  })
  // memory/tasks are newest-first (page 0 is the head), radio is ascending
  // (page 0 is the tail), so new arrivals attach to opposite ends.
  const mergedItems = collection === 'radio'
    ? [...refreshedItems, ...newItems]
    : [...newItems, ...refreshedItems]

  return {
    ...incomingSection,
    [itemKey]: mergedItems,
    // The loaded window is ours, not the snapshot's: keep our paging cursors.
    offset: previousSection.offset ?? incomingSection.offset,
    limit: previousSection.limit ?? incomingSection.limit,
    hasMore: previousSection.hasMore ?? incomingSection.hasMore
  }
}

/**
 * Merge an incoming snapshot into existing state instead of replacing it.
 * Section refetches are partial payloads, so untouched sections are preserved.
 */
function mergeDashboardSnapshot(
  previous: DashboardSnapshot | null,
  incoming: DashboardSnapshot
): DashboardSnapshot {
  if (!previous) return incoming
  const merged: DashboardSnapshot = { ...previous, ...incoming }
  for (const collection of Object.keys(pagedCollections) as PagedCollection[]) {
    const incomingSection = incoming[collection]
    if (!incomingSection) continue
    merged[collection] = mergeSnapshotCollection(
      collection,
      asRecord(previous[collection]),
      asRecord(incomingSection)
    )
  }
  return merged
}

function buildViewModel(data: DashboardSnapshot | null) {
  const status = asRecord(data?.status)
  const metrics = asRecord(data?.metrics)
  const memory = asRecord(data?.memory)
  const radio = asRecord(data?.radio)
  const tasks = asRecord(data?.tasks)
  const workflows = asRecord(data?.workflows)
  const projects = asRecord(data?.projects)
  const dispatch = asRecord(data?.dispatch)
  const tools = asRecord(data?.tools)
  const agentSessions = asRecord(data?.agentSessions)
  const worktrees = asRecord(data?.worktrees)
  const collaboration = asRecord(data?.collaboration)
  const backups = asRecord(data?.backups)
  const settings = asRecord(data?.settings)

  return {
    status,
    metrics,
    memory,
    memoryHasMore: boolOf(memory.hasMore),
    radio: asArray<AnyRecord>(radio.messages),
    radioHasMore: boolOf(radio.hasMore),
    tasks: asArray<AnyRecord>(tasks.tasks),
    tasksHasMore: boolOf(tasks.hasMore),
    workflows: asArray<AnyRecord>(workflows.workflows),
    projects: asArray<AnyRecord>(projects.projects),
    visibleProjects: asArray<AnyRecord>(projects.visibleProjects),
    unregisteredProjects: asArray<string>(projects.unregisteredProjects),
    dispatchLogs: asArray<AnyRecord>(dispatch.logs),
    // `dispatch.logs` and `dispatch.relay` are server-side display windows capped at
    // 100 entries, so these server-computed counts are the only honest totals.
    dispatchLogsTotal: numberOf(dispatch.logsTotal),
    dispatchRelayActive: numberOf(dispatch.relayActive),
    relay: asArray<AnyRecord>(dispatch.relay),
    agentSessions: asArray<AnyRecord>(agentSessions.agentSessions),
    agentTimeline: asArray<AnyRecord>(agentSessions.timeline),
    worktrees: asArray<AnyRecord>(worktrees.worktrees),
    collaboration,
    tools: asArray<AnyRecord>(tools.tools),
    toolSummary: asRecord(tools.summary),
    backups,
    settings
  }
}

type ViewModel = ReturnType<typeof buildViewModel>
type Copy = DashboardCopy

/**
 * Keyboard activation for card-shaped `role="button"` containers.
 *
 * These cards hold flow content (<p>, <div>), so a real <button> would be invalid
 * nesting. Instead we mirror native button behaviour: Enter and Space both
 * activate, and Space is prevented from scrolling the page.
 */
function activateOnKey(handler: () => void) {
  return (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    handler()
  }
}

function humanStatus(value: unknown, language: AppLanguage): string {
  const status = textOf(value).toLowerCase()
  const zh: Record<string, string> = { open: '待处理', active: '进行中', in_progress: '进行中', claimed: '已领取', waiting_review: '待确认', blocked: '已阻塞', failed: '失败', completed: '已完成', done: '已完成', cancelled: '已取消', idle: '空闲', running: '运行中', success: '成功', pending: '待处理' }
  const en: Record<string, string> = { open: 'Open', active: 'Active', in_progress: 'In progress', claimed: 'Claimed', waiting_review: 'Waiting for review', blocked: 'Blocked', failed: 'Failed', completed: 'Completed', done: 'Done', cancelled: 'Cancelled', idle: 'Idle', running: 'Running', success: 'Succeeded', pending: 'Pending' }
  return (language === 'zh' ? zh : en)[status] || (status ? status.replace(/_/g, ' ') : '—')
}

function CommandCenter({ model, language }: { model: ViewModel; language: AppLanguage }) {
  const [selected, setSelected] = useState<{ kind: 'agent' | 'task' | 'radio'; item: AnyRecord } | null>(null)
  const activeAgents = model.agentSessions.slice(0, 6)
  const attentionTasks = model.tasks.filter(task => ['failed', 'blocked', 'waiting_review', 'in_progress', 'claimed'].includes(textOf(task.status))).slice(0, 6)
  const recentTasks = model.tasks.slice(0, 5)
  const recentMessages = model.radio.slice(0, 5)
  const selectedId = textOf(selected?.item.id)

  const choose = (kind: 'agent' | 'task' | 'radio', item: AnyRecord) => setSelected({ kind, item })

  return (
    <div className="command-center">
      <section className="command-center-hero">
        <div>
          <p className="command-center-kicker">{language === 'zh' ? '团队工作台' : 'Team workspace'}</p>
          <h1>{language === 'zh' ? '团队现在在推进什么？' : 'What is the team moving forward?'}</h1>
          <p>{language === 'zh' ? '查看正在运行的智能体、需要你关注的任务，以及最新协作进展。' : 'See active agents, tasks that need your attention, and the latest collaboration updates.'}</p>
        </div>
        <div className="command-center-hero-actions">
          <div className="command-center-live"><span />{language === 'zh' ? '实时同步' : 'Live updates'}</div>
        </div>
      </section>

      <div className="command-center-grid">
        <main className="command-center-main">
          <section className="command-section">
            <div className="command-section-heading">
              <div><div><h2>{language === 'zh' ? 'Agent 活动' : 'Agent activity'}</h2><p>{language === 'zh' ? '当前正在执行或保持上下文的智能体' : 'Agents currently executing or holding context'}</p></div></div>
              <strong className="command-section-count">{activeAgents.length}</strong>
            </div>
            {activeAgents.length ? (
              <div className="agent-work-grid">
                {activeAgents.map((agent, index) => (
                  <article className={'agent-work-card '+(selectedId === textOf(agent.id) ? 'is-selected' : '')} key={textOf(agent.id)+'-'+index} role="button" tabIndex={0} aria-label={`${textOf(agent.tool || agent.agent || agent.actor, 'Agent')}: ${humanStatus(agent.status, language)}`} onClick={() => choose('agent', agent)} onKeyDown={activateOnKey(() => choose('agent', agent))}>
                    <div className="agent-work-card-top"><span className={'agent-presence '+textOf(agent.status)}></span><strong>{textOf(agent.tool || agent.agent || agent.actor, 'Agent')}</strong><NewStatusBadge status={textOf(agent.status, 'idle')} /></div>
                    <h3>{textOf(agent.title || agent.taskTitle || agent.project, language === 'zh' ? '未命名工作' : 'Untitled work')}</h3>
                    <div className="agent-work-card-meta"><span>{textOf(agent.project, '—')}</span><span>{textOf(agent.updatedAt || agent.lastSeenAt, '—')}</span></div>
                    <div className="agent-work-card-footer"><span>{language === 'zh' ? '点击查看上下文' : 'Click to inspect'}</span><strong>{textOf(agent.sessionId || agent.threadKey, 'local')}</strong></div>
                  </article>
                ))}
              </div>
            ) : <div className="command-empty">{language === 'zh' ? '当前没有活跃 Agent' : 'No active agents right now'}</div>}
          </section>

          <section className="command-section command-attention-section">
            <div className="command-section-heading">
              <div><div><h2>{language === 'zh' ? '需要关注' : 'Needs attention'}</h2><p>{language === 'zh' ? '失败、阻塞或正在推进中的任务' : 'Failed, blocked, or currently moving tasks'}</p></div></div>
              <strong className="command-section-count danger">{attentionTasks.length}</strong>
            </div>
            <div className="attention-task-grid">
              {attentionTasks.length ? attentionTasks.map((task, index) => (
                <article className={'attention-task-card '+(selectedId === textOf(task.id) ? 'is-selected' : '')} key={textOf(task.id)+'-'+index} role="button" tabIndex={0} aria-label={`${textOf(task.title, '—')}: ${humanStatus(task.status, language)}`} onClick={() => choose('task', task)} onKeyDown={activateOnKey(() => choose('task', task))}>
                  <div className="attention-task-top"><NewStatusBadge status={textOf(task.status, 'open')} /><span>{textOf(task.priority, 'normal')}</span></div>
                  <h3>{textOf(task.title, '—')}</h3>
                  <div><span>{textOf(task.project, '—')}</span><span>{textOf(task.assignee || task.createdBy, 'unassigned')}</span></div>
                </article>
              )) : <div className="command-empty">{language === 'zh' ? '没有需要立即介入的任务' : 'Nothing needs intervention right now'}</div>}
            </div>
          </section>
        </main>

        <aside className="command-center-side">
          <section className="command-side-block command-next-block">
            <div className="command-side-heading"><h2>{language === 'zh' ? '最近任务' : 'Recent work'}</h2></div>
            <div className="command-recent-list">
              {recentTasks.length ? recentTasks.map((task, index) => <div className={'command-recent-item '+(selectedId === textOf(task.id) ? 'is-selected' : '')} key={textOf(task.id)+'-'+index} role="button" tabIndex={0} aria-label={`${textOf(task.title, '—')}: ${humanStatus(task.status, language)}`} onClick={() => choose('task', task)} onKeyDown={activateOnKey(() => choose('task', task))}><NewStatusBadge status={textOf(task.status, 'open')} /><div><strong>{textOf(task.title, '—')}</strong><span>{textOf(task.assignee || task.createdBy, 'unassigned')}</span></div></div>) : <div className="command-empty">{language === 'zh' ? '创建或认领任务后，近期进展会显示在这里' : 'Recent work appears here once tasks are created or claimed'}</div>}
            </div>
          </section>
          <section className="command-side-block command-radio-block">
            <div className="command-side-heading"><h2>{language === 'zh' ? '协作广播' : 'Handoffs'}</h2></div>
            <div className="command-radio-list">
              {recentMessages.length ? recentMessages.map((message, index) => <div className="command-radio-item" key={textOf(message.id)+'-'+index} role="button" tabIndex={0} aria-label={`${textOf(message.from, 'agent')} → ${textOf(message.to, 'all')}: ${textOf(message.text, '—')}`} onClick={() => choose('radio', message)} onKeyDown={activateOnKey(() => choose('radio', message))}><span className="command-radio-dot" /><div><strong>{textOf(message.from, 'agent')} → {textOf(message.to, 'all')}</strong><p>{textOf(message.text, '—')}</p></div></div>) : <div className="command-empty">{language === 'zh' ? '智能体发送协作消息后，会显示在这里' : 'Handoffs appear here once agents broadcast messages'}</div>}
            </div>
          </section>
        </aside>
      </div>
      <Sheet open={selected !== null} onOpenChange={open => { if (!open) setSelected(null) }}>
        <SheetContent side="right" closeLabel={language === 'zh' ? '关闭' : 'Close'}>
          <SheetHeader>
            <SheetTitle>
              {textOf(selected?.item.title || selected?.item.taskTitle || selected?.item.tool || selected?.item.agent || selected?.item.text, language === 'zh' ? '条目详情' : 'Item details')}
            </SheetTitle>
            <SheetDescription>
              {selected?.kind === 'agent' ? 'AGENT CONTEXT' : selected?.kind === 'radio' ? 'RADIO MESSAGE' : 'TASK CONTEXT'}
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4">
            {selected ? (
              <>
                <SheetDetailList>
                  <dt>{language === 'zh' ? '状态' : 'Status'}</dt>
                  <dd>{humanStatus(selected.item.status, language)}</dd>
                  <dt>{language === 'zh' ? '项目' : 'Project'}</dt>
                  <dd>{textOf(selected.item.project, '—')}</dd>
                  <dt>{language === 'zh' ? '负责人' : 'Owner'}</dt>
                  <dd>{textOf(selected.item.assignee || selected.item.actor || selected.item.tool, '—')}</dd>
                  <dt>{language === 'zh' ? '上下文 ID' : 'Context ID'}</dt>
                  <dd>{textOf(selected.item.sessionId || selected.item.threadKey || selected.item.id, '—')}</dd>
                </SheetDetailList>
                <SheetRawBlock label={language === 'zh' ? '技术详情' : 'Technical details'}>
                  {JSON.stringify(selected.item, null, 2)}
                </SheetRawBlock>
              </>
            ) : null}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function DispatchPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const [force, setForce] = useState(false)
  const [limit, setLimit] = useState(10)
  const [modelName, setModelName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const modelOptions = [...new Set(model.tools.flatMap(tool => asArray<string>(asRecord(tool.models).all)))].sort().slice(0, 500)

  const trigger = async () => {
    setBusy(true)
    setError('')
    try {
      await apiPost<AnyRecord>('/api/dispatch/run', { force, limit, model: modelName.trim() })
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy(false)
    }
  }

  return <div className="stack dispatch-workspace">
    <div className="dispatch-summary-line"><span><strong>{formatNumber(model.dispatchRelayActive)}</strong> {copy.dispatchActive}</span><span><strong>{formatNumber(model.dispatchLogs.length)}</strong> {copy.dispatchRecentRuns}</span><span><strong>{formatNumber(model.dispatchLogsTotal)}</strong> {copy.dispatchTotalRuns}</span><span className="dispatch-summary-note">{copy.dispatchSummaryNote}</span></div>
    <Panel title={copy.triggerDispatch} className="dispatch-control-panel">
      <div className="dispatch-control-intro"><div><strong>自动派发</strong><p>选择本次最多处理的数量和目标模型，执行结果会出现在运行记录中。</p></div><span className={force ? 'dispatch-risk-badge active' : 'dispatch-risk-badge'}>{force ? '强制执行已开启' : '普通模式'}</span></div>
      <div className="dispatch-control-grid">
        <label className="field"><span>{copy.limit}</span><input type="number" min={1} max={50} value={limit} onChange={event => setLimit(Number(event.target.value) || 10)} /></label>
        <label className="field"><span>{copy.model}</span><input type="text" list="amh-model-options" value={modelName} onChange={event => setModelName(event.target.value)} placeholder={copy.modelPlaceholder} /><datalist id="amh-model-options">{modelOptions.map(option => <option key={option} value={option} />)}</datalist></label>
        <label className="dispatch-force-toggle"><input type="checkbox" checked={force} onChange={event => setForce(event.target.checked)} /><span><strong>强制执行</strong><small>跳过常规条件，仅在确认风险后使用</small></span></label>
        <Button className="dispatch-trigger-button" onClick={() => void trigger()} disabled={busy}>{busy ? copy.running : copy.triggerDispatch}</Button>
      </div>
      {error ? <ErrorState variant="inline" title={error} /> : null}
    </Panel>
    <div className="dispatch-section-heading"><div><h3>运行队列</h3><p>当前工具和项目的派发状态</p></div></div>
    <Panel title={copy.dispatchThreads} className="dispatch-queue-panel"><div className="stack">{model.relay.length ? model.relay.map(entry => <div className="dispatch-card" key={textOf(entry.id || entry.threadKey || entry.sourceId)}><div className="dispatch-card-header"><div><strong>{textOf(entry.tool, '-')}</strong><span>{textOf(entry.project, '-')}</span></div><StatusBadge status={textOf(entry.state, 'pending')} /></div><p>{textOf(entry.threadKey || entry.thread || entry.sourceId, '-')}</p>{entry.progressPercent !== undefined && entry.progressPercent !== null ? <div className="progress-line"><span style={{ width: `${Math.min(100, Math.max(0, numberOf(entry.progressPercent)))}%` }} /></div> : null}{entry.progressStatus ? <p>{textOf(entry.progressStatus)}</p> : null}{entry.lastError ? <p className="error-text">{textOf(entry.lastError)}</p> : null}<span className="muted-text">{formatDate(textOf(entry.ts || entry.progressAt || entry.deliveryUpdatedAt))}</span></div>) : <EmptyState title={copy.noData} />}</div></Panel>
    <Panel title={copy.dispatchLogs} className="dispatch-history-panel"><DataTable emptyText={copy.noData} columns={[copy.status, copy.to, copy.project, copy.message]} rows={model.dispatchLogs.slice(0, 30).map(log => [<StatusBadge status={textOf(log.runStatus || log.status || log.exitCode, 'log')} />, textOf(log.tool, '-'), textOf(log.project, '-'), textOf(log.message || log.text || log.error || log.lastError, '-')])} /></Panel>
  </div>
}

/**
 * Task statuses that count as "active" work.
 *
 * `done` and `cancelled` are terminal, so active is everything the team is still
 * carrying: not yet picked up (`open`), picked up (`claimed`), or being worked
 * (`in_progress`). Statuses outside this list are deliberately excluded rather than
 * guessed at, so the figure can never exceed the real total.
 */
const ACTIVE_TASK_STATUSES = ['open', 'claimed', 'in_progress']

/**
 * Every figure on this page is read from `model.metrics` (`/api/metrics`), which the
 * server computes over the FULL dataset.
 *
 * It must not be derived from `model.tasks` / `model.radio` / `model.workflows`: those
 * arrays hold one paginated server page (200 tasks, 50 radio messages), and on a direct
 * load of /analytics they are not fetched at all. Charting them would either render a
 * truncated sample as if it were the whole picture, or render zeros next to a populated
 * API response.
 */
function AnalyticsPanel({ copy, model }: { copy: Copy; model: ViewModel }) {
  const metricsTasks = asRecord(model.metrics.tasks)
  const metricsWorkflows = asRecord(model.metrics.workflows)
  const metricsRadio = asRecord(model.metrics.radio)
  const metricsRelay = asRecord(model.metrics.relay)
  const metricsProjects = asRecord(model.metrics.projects)

  const tasksByStatus = asRecord(metricsTasks.byStatus)
  const activeTasks = ACTIVE_TASK_STATUSES.reduce((total, status) => total + numberOf(tasksByStatus[status]), 0)

  const taskStatusCounts = countEntries(tasksByStatus)
  const taskToolCounts = countEntries(metricsTasks.byTool)
  const workflowStatusCounts = countEntries(metricsWorkflows.byStatus)
  const radioTypeCounts = countEntries(metricsRadio.byType)
  const relayCounts = countEntries(metricsRelay.byStatus)
  const projectCounts = countEntries(metricsProjects.byActivity, 10)

  return (
    <div className="stack">
      <div className="dashboard-summary-line"><span><strong>{formatNumber(metricsTasks.total)}</strong>{copy.totalTasks}</span><span><strong>{formatNumber(activeTasks)}</strong>{copy.activeTasks}</span><span><strong>{formatNumber(metricsWorkflows.total)}</strong>{copy.workflows}</span><span><strong>{textOf(metricsRelay.successRate, '-')}</strong>{copy.relayRate}</span><span><strong>{formatNumber(metricsRelay.total)}</strong>{copy.relayThreads}</span></div>
      <div className="panel-grid two">
        <Panel title={copy.tasksByStatus}>
          <BarList items={taskStatusCounts} emptyText={copy.noData} />
        </Panel>
        <Panel title={copy.radioByType}>
          <BarList items={radioTypeCounts} emptyText={copy.noData} />
        </Panel>
        <Panel title={copy.relayByState}>
          <BarList items={relayCounts} emptyText={copy.noData} />
        </Panel>
        <Panel title={copy.topProjects}>
          <BarList items={projectCounts} emptyText={copy.noData} />
        </Panel>
        <Panel title={copy.workflowsByStatus}>
          <BarList items={workflowStatusCounts} emptyText={copy.noData} />
        </Panel>
        <Panel title={copy.tasksByTool}>
          <BarList items={taskToolCounts} emptyText={copy.noData} />
        </Panel>
      </div>
    </div>
  )
}

function createGitHubBackupForm(status: AnyRecord) {
  return {
    enabled: boolOf(status.enabled),
    remoteUrl: textOf(status.remoteUrl),
    repoDir: textOf(status.repoDir),
    branch: textOf(status.branch, 'main'),
    allowPlaintextSensitive: boolOf(status.allowPlaintextSensitive)
  }
}

function BackupsPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const [backups, setBackups] = useState<AnyRecord>(model.backups)
  const [selectedName, setSelectedName] = useState('')
  const [detail, setDetail] = useState<AnyRecord | null>(null)
  const [restorePlan, setRestorePlan] = useState<AnyRecord | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [reason, setReason] = useState('dashboard-manual')
  const [githubStatus, setGithubStatus] = useState<AnyRecord>({})
  const [githubForm, setGithubForm] = useState(() => createGitHubBackupForm({}))
  const [githubResult, setGithubResult] = useState<AnyRecord | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const backupList = asArray<AnyRecord>(backups.backups)

  const loadGitHubStatus = useCallback(async () => {
    setBusy('github:load')
    setError('')
    try {
      const result = await apiGet<AnyRecord>('/api/backups/github/status')
      const status = asRecord(result.github)
      setGithubStatus(status)
      setGithubForm(createGitHubBackupForm(status))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }, [])

  const loadBackups = useCallback(async () => {
    setBusy('load')
    setError('')
    try {
      const nextBackups = await apiGet<AnyRecord>('/api/backups')
      setBackups(nextBackups)
      if (!selectedName) {
        setSelectedName(textOf(asArray<AnyRecord>(nextBackups.backups)[0]?.name))
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }, [selectedName])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadGitHubStatus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadGitHubStatus])

  const activeBackupName = selectedName || textOf(backupList[0]?.name)

  const createBackup = async () => {
    const nextReason = reason.trim() || 'dashboard-manual'
    setBusy('create')
    setError('')
    try {
      const result = await apiPost<AnyRecord>('/api/backups/create', { reason: nextReason })
      setBackups(asRecord(result.backups))
      setReason(nextReason)
      setCreateOpen(false)
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const inspectBackup = async (name: string) => {
    if (!name) return
    setSelectedName(name)
    setBusy(`detail:${name}`)
    setError('')
    try {
      const nextDetail = await apiGet<AnyRecord>(`/api/backups/detail?name=${encodeURIComponent(name)}`)
      setDetail(nextDetail)
      setRestorePlan(asRecord(nextDetail.restore))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const previewRestore = async (name: string) => {
    if (!name) return
    setSelectedName(name)
    setBusy(`restore:${name}`)
    setError('')
    try {
      const result = await apiPost<AnyRecord>('/api/backups/restore', { name, apply: false })
      setRestorePlan(asRecord(result.plan))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const saveGitHubConfig = async () => {
    setBusy('github:save')
    setError('')
    setGithubResult(null)
    try {
      const result = await apiPost<AnyRecord>('/api/backups/github/configure', githubForm)
      const status = asRecord(result.status || result.github)
      setGithubStatus(status)
      setGithubForm(createGitHubBackupForm(status))
      setGithubResult(result)
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const runGitHubBackup = async (mode: 'dry-run' | 'local') => {
    setBusy(`github:${mode}`)
    setError('')
    setGithubResult(null)
    try {
      const result = await apiPost<AnyRecord>('/api/backups/github/run', {
        dryRun: mode === 'dry-run',
        push: false,
        reason: mode === 'dry-run' ? 'dashboard-preview' : 'dashboard-local',
        repoDir: githubForm.repoDir,
        remoteUrl: githubForm.remoteUrl,
        branch: githubForm.branch
      })
      setGithubResult(result)
      await loadGitHubStatus()
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const policy = asRecord(backups.policy)
  const retention = asRecord(backups.retention)
  const selectedFiles = asArray<AnyRecord>(detail?.files)
  const summary = asRecord(restorePlan?.summary)
  const githubRepo = asRecord(githubStatus.repo)
  const githubSchedule = asRecord(githubStatus.schedule)
  const githubScan = asRecord(githubResult?.scan)
  const githubIssues = asArray<AnyRecord>(githubScan.issues)
  const githubWarnings = asArray<string>(githubResult?.warnings)

  return (
    <div className="stack">
      <div className="dashboard-grid">
        <MetricCard label={copy.backupSets} value={formatNumber(backups.count ?? model.status.backups)} />
        <MetricCard label={copy.storageUsed} value={textOf(backups.totalDisplay, '-')} />
        <MetricCard label={copy.retained} value={formatNumber(retention.keep)} tone="success" />
        <MetricCard label={copy.pruneCandidates} value={formatNumber(retention.prune)} tone="warning" />
      </div>
      <Panel title={copy.backupPolicy}>
        <div className="section-actions">
          <Button variant="ghost" onClick={() => void loadBackups()} disabled={Boolean(busy)}>
            {busy === 'load' ? copy.running : copy.refresh}
          </Button>
          <Button onClick={() => { setError(''); setCreateOpen(true) }}>
            {copy.createBackup}
          </Button>
        </div>
        <div className="property-grid settings-grid">
          <Property label={copy.daily} value={formatNumber(policy.daily)} />
          <Property label={copy.weekly} value={formatNumber(policy.weekly)} />
          <Property label={copy.preSync} value={formatNumber(policy.preSync)} />
          <Property label={copy.pruneCandidates} value={textOf(retention.pruneDisplay, '-')} />
        </div>
        {error ? <ErrorState variant="inline" title={error} /> : null}
      </Panel>
      <Panel title={copy.githubBackup}>
        <Callout
          tone="warning"
          className="mb-4"
          title={copy.githubWarning}
          description={githubForm.remoteUrl ? textOf(githubForm.remoteUrl) : copy.githubNoRemote}
        />
        <div className="form-grid github-backup-grid">
          <label className="field">
            <span>{copy.githubEnabled}</span>
            <select value={githubForm.enabled ? 'yes' : 'no'} onChange={event => setGithubForm({ ...githubForm, enabled: event.target.value === 'yes' })}>
              <option value="yes">{copy.yes}</option>
              <option value="no">{copy.no}</option>
            </select>
          </label>
          <label className="field">
            <span>{copy.githubRemote}</span>
            <input value={githubForm.remoteUrl} onChange={event => setGithubForm({ ...githubForm, remoteUrl: event.target.value })} placeholder="https://github.com/<owner>/<repo>.git" />
          </label>
          <label className="field">
            <span>{copy.githubRepoDir}</span>
            <input value={githubForm.repoDir} onChange={event => setGithubForm({ ...githubForm, repoDir: event.target.value })} />
          </label>
          <label className="field">
            <span>{copy.githubBranch}</span>
            <input value={githubForm.branch} onChange={event => setGithubForm({ ...githubForm, branch: event.target.value })} />
          </label>
          <label className="field">
            <span>{copy.githubPlaintext}</span>
            <select value={githubForm.allowPlaintextSensitive ? 'yes' : 'no'} onChange={event => setGithubForm({ ...githubForm, allowPlaintextSensitive: event.target.value === 'yes' })}>
              <option value="no">{copy.no}</option>
              <option value="yes">{copy.yes}</option>
            </select>
          </label>
          <div className="form-actions span-all">
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void loadGitHubStatus()}>
              {busy === 'github:load' ? copy.refreshing : copy.refresh}
            </Button>
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void saveGitHubConfig()}>
              {busy === 'github:save' ? copy.running : copy.githubSave}
            </Button>
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void runGitHubBackup('dry-run')}>
              {busy === 'github:dry-run' ? copy.running : copy.githubDryRun}
            </Button>
            <Button disabled={Boolean(busy)} onClick={() => void runGitHubBackup('local')}>
              {busy === 'github:local' ? copy.running : copy.githubLocalRun}
            </Button>
          </div>
        </div>
        <div className="property-grid settings-grid">
          <Property label={copy.status} value={formatBool(boolOf(githubStatus.enabled), copy)} />
          <Property label={copy.githubPlaintext} value={formatBool(boolOf(githubStatus.allowPlaintextSensitive), copy)} />
          <Property label={copy.githubLastCommit} value={textOf(githubStatus.lastCommit, '-')} />
          <Property label={copy.githubLastError} value={textOf(githubStatus.lastError, '-')} />
          <Property label={copy.githubRepoDir} value={textOf(githubStatus.repoDir, '-')} />
          <Property label={copy.githubRemote} value={textOf(githubStatus.remoteUrl || githubRepo.remoteUrl, '-')} />
          <Property label={copy.githubBranch} value={textOf(githubRepo.currentBranch || githubStatus.branch, '-')} />
          <Property label={copy.changed} value={formatNumber(asArray(githubRepo.changes).length)} />
          <Property label={copy.githubSchedule} value={formatBool(boolOf(githubSchedule.installed), copy)} />
          <Property label={copy.githubNextRun} value={textOf(githubSchedule.nextRunTime, '-')} />
        </div>
        {githubResult ? (
          <div className="stack">
            {boolOf(githubResult.wouldBlockPush) ? <ErrorState variant="inline" title={copy.githubWouldBlock} /> : null}
            {githubWarnings.length ? (
              <Callout
                tone="warning"
                title={copy.warnings}
                description={
                  <span className="flex flex-col gap-1">
                    {githubWarnings.map((warning, indexValue) => (
                      <span key={`${warning}-${indexValue}`}>{warning}</span>
                    ))}
                  </span>
                }
              />
            ) : null}
            <div className="property-grid settings-grid">
              <Property label={copy.dryRun} value={formatBool(boolOf(githubResult.dryRun), copy)} />
              <Property label={copy.upload} value={formatBool(boolOf(githubResult.wouldPush || githubResult.push), copy)} />
              <Property label={copy.files} value={formatNumber(asArray(githubResult.files).length)} />
              <Property label={copy.issues} value={formatNumber(githubIssues.length)} />
            </div>
          </div>
        ) : null}
      </Panel>
      <div className="panel-grid two">
        <Panel title={copy.backupSets}>
          <div className="backup-list">
            {backupList.length ? backupList.map(backup => {
              const name = textOf(backup.name)
              const active = name === selectedName
              return (
                <article className={`backup-row ${active ? 'active' : ''}`} key={name}>
                  <div>
                    <strong>{name || '-'}</strong>
                    <p>{[formatDate(textOf(backup.createdAt)), textOf(backup.reason), textOf(backup.display)].filter(Boolean).join(' · ')}</p>
                    <p>{asArray<string>(backup.files).slice(0, 6).join(', ')}</p>
                  </div>
                  <div className="backup-row-actions">
                    <StatusBadge status={textOf(backup.retention, 'keep')} />
                    <Button variant="ghost" size="sm" disabled={busy === `detail:${name}`} onClick={() => void inspectBackup(name)}>
                      {copy.inspectBackup}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy === `restore:${name}`} onClick={() => void previewRestore(name)}>
                      {copy.previewRestore}
                    </Button>
                  </div>
                </article>
              )
            }) : <EmptyState title={copy.noData} />}
          </div>
        </Panel>
      <Panel title={copy.restoreSummary}>
          {restorePlan ? (
            <div className="property-grid">
              <Property label={copy.changed} value={formatNumber(summary.changed)} />
              <Property label={copy.different} value={formatNumber(summary.different)} />
              <Property label={copy.missingCurrent} value={formatNumber(summary.missingCurrent)} />
              <Property label={copy.unchanged} value={formatNumber(summary.unchanged)} />
              <Property label={copy.bytes} value={textOf(summary.display, '-')} />
              <Property label={copy.title} value={textOf(restorePlan.name, '-')} />
            </div>
          ) : (
            <EmptyState title={activeBackupName ? copy.previewRestore : copy.noData} />
          )}
        </Panel>
      </div>
      <Panel title={copy.backupFiles}>
        <DataTable
          emptyText={copy.noData}
          columns={[copy.status, copy.path, copy.type, copy.bytes]}
          rows={selectedFiles.map(file => [
            <StatusBadge status={textOf(file.status, 'file')} />,
            textOf(file.name, '-'),
            textOf(file.kind, '-'),
            textOf(file.display, '-')
          ])}
        />
      </Panel>
      <Dialog open={createOpen} onOpenChange={open => { if (!open) setCreateOpen(false) }}>
        <DialogContent className="sm:max-w-lg" closeLabel={copy.close}>
          <DialogHeader>
            <DialogTitle>{copy.createBackup}</DialogTitle>
            <DialogDescription>{copy.createBackupHint}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <label className="field">
              <span>{copy.backupReason}</span>
              <input value={reason} onChange={event => setReason(event.target.value)} />
            </label>
            {error ? <ErrorState variant="inline" title={error} /> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              {copy.cancel}
            </Button>
            <Button variant="primary" size="sm" disabled={busy === 'create'} onClick={() => void createBackup()}>
              {busy === 'create' ? copy.running : copy.createBackup}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SearchPanel({ copy }: { copy: Copy }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [range, setRange] = useState('all')
  const [sort, setSort] = useState('relevance')
  const [tag, setTag] = useState('')
  const [payload, setPayload] = useState<AnyRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedResult, setSelectedResult] = useState<AnyRecord | null>(null)

  const runSearch = useCallback(async (overrides: Partial<{ query: string; type: string; range: string; sort: string; tag: string }> = {}) => {
    const nextQuery = overrides.query ?? query
    const nextType = overrides.type ?? type
    const nextRange = overrides.range ?? range
    const nextSort = overrides.sort ?? sort
    const nextTag = overrides.tag ?? tag
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ q: nextQuery, type: nextType, range: nextRange, sort: nextSort, tag: nextTag, limit: '80' })
      setPayload(await apiGet<AnyRecord>(`/api/search?${params.toString()}`))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [query, range, sort, tag, type])

  useEffect(() => {
    let active = true
    void apiGet<AnyRecord>('/api/search?limit=0').then(nextPayload => { if (active) setPayload(nextPayload) }).catch(nextError => { if (active) setError(nextError instanceof Error ? nextError.message : String(nextError)) })
    return () => { active = false }
  }, [])

  const facets = asRecord(payload?.facets)
  const types = asArray<AnyRecord>(facets.types)
  const tags = asArray<AnyRecord>(facets.tags)
  const projects = asArray<AnyRecord>(facets.projects)
  const results = asArray<AnyRecord>(payload?.results)
  const clearSearch = () => { setQuery(''); setType('all'); setRange('all'); setSort('relevance'); setTag(''); void runSearch({ query: '', type: 'all', range: 'all', sort: 'relevance', tag: '' }) }

  return <div className="search-workspace stack">
    <Panel title={copy.globalSearch} className="search-command-panel">
      <div className="search-command-row"><div className="search-main-input"><input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} aria-label={copy.searchText} /></div><select value={type} onChange={event => setType(event.target.value)} aria-label={copy.type}><option value="all">{copy.allTypes}</option><option value="memory">memory</option><option value="task">task</option><option value="radio">radio</option><option value="workflow">workflow</option></select><select value={range} onChange={event => setRange(event.target.value)} aria-label={copy.range}><option value="all">{copy.allRanges}</option><option value="24h">{copy.last24h}</option><option value="7d">{copy.last7d}</option><option value="30d">{copy.last30d}</option><option value="90d">{copy.last90d}</option></select><select value={sort} onChange={event => setSort(event.target.value)} aria-label={copy.sort}><option value="relevance">{copy.relevance}</option><option value="newest">{copy.newest}</option><option value="oldest">{copy.oldest}</option></select><Button onClick={() => void runSearch()} disabled={loading}>{loading ? copy.running : copy.globalSearch}</Button></div>
      <div className="search-command-footer"><span>{query ? `“${query}”` : '搜索全部记忆、任务、消息和工作流'}</span><Button variant="ghost" size="sm" onClick={clearSearch}>{copy.clear}</Button></div>
      {error ? <ErrorState variant="inline" title={error} /> : null}
    </Panel>
    <div className="search-result-summary"><span><strong>{formatNumber(payload?.count)}</strong>{copy.resultCount}</span><span><strong>{formatNumber(payload?.elapsedMs)} ms</strong>{copy.elapsed}</span><span><strong>{type === 'all' ? copy.allTypes : type}</strong>{copy.type}</span><span><strong>{tag || '—'}</strong>{copy.tags}</span></div>
    <div className="search-content-grid"><Panel title={copy.facets} className="search-facets-panel"><div className="search-facet-group"><h3>{copy.type}</h3><div className="chip-list">{types.map(item => <button className={`chip button-chip ${type === textOf(item.key) ? 'active' : ''}`} type="button" key={textOf(item.key)} onClick={() => { setType(textOf(item.key, 'all')); void runSearch({ type: textOf(item.key, 'all') }) }}>{textOf(item.label || item.key)} {formatNumber(item.count)}</button>)}</div></div><div className="search-facet-group"><h3>{copy.tags}</h3><div className="chip-list">{tags.length ? tags.slice(0, 24).map(item => <button className={`chip button-chip ${tag === textOf(item.key) ? 'active' : ''}`} type="button" key={textOf(item.key)} onClick={() => { setTag(textOf(item.key)); void runSearch({ tag: textOf(item.key) }) }}>{textOf(item.key)} {formatNumber(item.count)}</button>) : <EmptyState title={copy.noData} size="sm" icon={null} />}</div></div><div className="search-facet-group"><h3>{copy.project}</h3><div className="chip-list">{projects.length ? projects.slice(0, 16).map(item => <span className="chip" key={textOf(item.key)}>{textOf(item.key)} {formatNumber(item.count)}</span>) : <EmptyState title={copy.noData} size="sm" icon={null} />}</div></div></Panel><Panel title={copy.results} className="search-results-panel"><div className="search-results">{results.length ? results.map((result, indexValue) => { const meta = asRecord(result.meta); const title = textOf(result.title, '-'); return <article className="search-result-card" role="button" tabIndex={0} aria-label={`${textOf(result.kind, 'result')}: ${title}`} key={`${textOf(result.kind)}-${textOf(meta.id)}-${indexValue}`} onClick={() => setSelectedResult(result)} onKeyDown={activateOnKey(() => setSelectedResult(result))}><div className="search-result-header"><StatusBadge status={textOf(result.kind, 'result')} /><strong>{title}</strong><span>{formatDate(textOf(result.ts))}</span></div><p>{textOf(result.preview || result.text, '-')}</p><div className="chip-list">{textOf(meta.project) ? <span className="chip">{textOf(meta.project)}</span> : null}{asArray<string>(result.tags).slice(0, 6).map(item => <span className="chip" key={item}>{item}</span>)}<span className="chip">{copy.score}: {formatNumber(result.score)}</span></div></article> }) : <EmptyState title={copy.noData} />}</div></Panel></div>
    <Sheet open={selectedResult !== null} onOpenChange={open => { if (!open) setSelectedResult(null) }}>
      <SheetContent side="right" closeLabel={copy.close}>
        <SheetHeader>
          <SheetTitle>{textOf(selectedResult?.title, copy.results)}</SheetTitle>
          <SheetDescription>{formatDate(textOf(selectedResult?.ts))}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          {selectedResult ? (
            <>
              <div className="chip-list">
                <StatusBadge status={textOf(selectedResult.kind, 'result')} />
                <span>{formatDate(textOf(selectedResult.ts))}</span>
              </div>
              <p className="m-0 break-words text-sm leading-relaxed text-ink-2">{textOf(selectedResult.text || selectedResult.preview, '-')}</p>
              <SheetDetailList>
                <dt>{copy.project}</dt>
                <dd>{textOf(asRecord(selectedResult.meta).project, '-')}</dd>
                <dt>{copy.score}</dt>
                <dd className="tabular-nums">{formatNumber(selectedResult.score)}</dd>
              </SheetDetailList>
            </>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  </div>
}
function ToolsPanel({
  copy,
  language,
  model,
  onRefresh
}: {
  copy: Copy
  language: Language
  model: ViewModel
  onRefresh: () => Promise<void>
}) {
  const [toolsOverride, setToolsOverride] = useState<AnyRecord[] | null>(null)
  const [summaryOverride, setSummaryOverride] = useState<AnyRecord | null>(null)
  const [capabilitiesOverride, setCapabilitiesOverride] = useState<AnyRecord | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedTool, setSelectedTool] = useState<AnyRecord | null>(null)
  const [localPreview, setLocalPreview] = useState<AnyRecord | null>(null)
  const [globalPreview, setGlobalPreview] = useState<AnyRecord | null>(null)
  const [lastInstallFile, setLastInstallFile] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const tools = toolsOverride ?? model.tools
  const summary = summaryOverride ?? model.toolSummary
  const capabilities = capabilitiesOverride ?? asRecord(model.toolSummary.capabilities || model.status.capabilitySummary)

  const filteredTools = tools.filter(tool => {
    if (!toolMatchesStatusFilter(tool, statusFilter)) return false
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return [
      tool.name,
      tool.kind,
      tool.connectionStatus,
      tool.runnerReason,
      tool.action,
      textOf(asRecord(tool.health).status),
      textOf(asRecord(tool.capability).integrationMode)
    ].map(value => textOf(value).toLowerCase()).join(' ').includes(needle)
  })

  const refreshTools = async (forceRefresh = false) => {
    setBusy(forceRefresh ? 'tools-refresh' : 'tools-load')
    setError('')
    try {
      const payload = await apiGet<AnyRecord>(`/api/tools${forceRefresh ? '?refresh=1' : ''}`)
      setToolsOverride(asArray<AnyRecord>(payload.tools))
      setSummaryOverride(asRecord(payload.summary))
      setCapabilitiesOverride(asRecord(payload.capabilities || asRecord(payload.summary).capabilities))
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const detectTools = async () => {
    setBusy('detect')
    setError('')
    try {
      const payload = await apiGet<AnyRecord>('/api/detect')
      setToolsOverride(asArray<AnyRecord>(payload.tools))
      setSummaryOverride(asRecord(payload.summary))
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const refreshCapabilities = async () => {
    setBusy('capabilities')
    setError('')
    try {
      const payload = await apiGet<AnyRecord>('/api/capabilities?refresh=1')
      setCapabilitiesOverride(payload)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const openToolSheet = async (tool: AnyRecord) => {
    setSelectedTool(tool)
    setLocalPreview(null)
    setGlobalPreview(null)
    setLastInstallFile('')
    setError('')
    setBusy('preview')
    const toolName = textOf(tool.name)
    try {
      const [localResult, globalResult] = await Promise.all([
        apiGet<AnyRecord>(`/api/install/preview?tool=${encodeURIComponent(toolName)}&scope=local`).catch(() => null),
        apiGet<AnyRecord>(`/api/install/preview?tool=${encodeURIComponent(toolName)}&scope=global`).catch(() => null)
      ])
      setLocalPreview(localResult)
      setGlobalPreview(globalResult)
    } finally {
      setBusy('')
    }
  }

  const applyToolRules = async (scope: 'local' | 'global') => {
    if (!selectedTool) return
    const toolName = textOf(selectedTool.name)
    setBusy(`install:${scope}`)
    setError('')
    setLastInstallFile('')
    try {
      const result = await apiPost<AnyRecord>('/api/install/apply', { tool: toolName, scope })
      await openToolSheet(selectedTool)
      setLastInstallFile(textOf(result.file, '-'))
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const activeSummary = summary.total ? summary : {
    total: tools.length,
    detected: tools.filter(tool => boolOf(tool.installed || tool.connected)).length,
    configured: tools.filter(tool => boolOf(tool.configured)).length,
    runnable: tools.filter(tool => boolOf(tool.runnable)).length,
    missing: tools.filter(tool => !boolOf(tool.installed)).length
  }
  const runs = asRecord(activeSummary.runs)
  const selectedCapability = asRecord(selectedTool?.capability)
  const selectedConfig = asRecord(selectedTool?.config)
  const selectedHealth = asRecord(selectedTool?.health)

  return (
    <div className="stack">
      <div className="dashboard-grid">
        <MetricCard label={copy.toolReadiness} value={`${formatNumber(activeSummary.runnable)}/${formatNumber(activeSummary.total || tools.length)}`} tone="success" />
        <MetricCard label={copy.installed} value={formatNumber(activeSummary.detected)} />
        <MetricCard label={copy.configured} value={formatNumber(activeSummary.configured)} />
        <MetricCard label={copy.missing} value={formatNumber(activeSummary.missing)} tone="warning" />
        <MetricCard label={copy.successRate} value={formatPercent(runs.successRate)} />
        <MetricCard label={copy.activeDispatches} value={formatNumber(activeSummary.activeDispatches)} />
      </div>

      <Panel title={copy.toolReadiness}>
        <div className="section-actions">
          <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void refreshTools(true)}>
            {busy === 'tools-refresh' ? copy.running : copy.refreshTools}
          </Button>
          <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void detectTools()}>
            {busy === 'detect' ? copy.running : copy.detectTools}
          </Button>
          <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void refreshCapabilities()}>
            {busy === 'capabilities' ? copy.running : copy.refreshCapabilities}
          </Button>
        </div>
        <div className="form-grid tool-filter-grid">
          <label className="field span-2">
            <span>{copy.searchText}</span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} />
          </label>
          <label className="field">
            <span>{copy.status}</span>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="all">{copy.toolFilterAll}</option>
              <option value="ready">{copy.toolFilterReady}</option>
              <option value="connected">{copy.toolFilterConnected}</option>
              <option value="runnable">{copy.toolFilterRunnable}</option>
              <option value="needs">{copy.toolFilterNeeds}</option>
              <option value="missing">{copy.toolFilterMissing}</option>
            </select>
          </label>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => { setQuery(''); setStatusFilter('all') }}>
              {copy.clear}
            </Button>
          </div>
        </div>
        <div className="property-grid settings-grid tool-capability-summary">
          <Property label={copy.directCli} value={formatNumber(capabilities.directCliProfiles)} />
          <Property label={copy.autoDispatchLabel} value={formatNumber(capabilities.autoDispatch)} />
          <Property label={copy.sharedState} value={formatNumber(capabilities.sharedState)} />
          <Property label={copy.capabilitySummary} value={formatNumber(capabilities.total)} />
        </div>
        {error ? <ErrorState variant="inline" title={error} /> : null}
      </Panel>

      <Panel title={copy.toolInventory}>
        <div className="table-wrap tools-table-wrap">
          {filteredTools.length ? (
            <table className="tools-table">
              <thead>
                <tr>
                  <th>{copy.toolName}</th>
                  <th>{copy.status}</th>
                  <th>{copy.mode}</th>
                  <th>{copy.declaredModels}</th>
                  <th>{copy.runnable}</th>
                  <th>{copy.totalRuns}</th>
                  <th>{copy.successRate}</th>
                  <th>{copy.lastRun}</th>
                  <th>{copy.toolDetail}</th>
                  <th>{copy.manageConfig}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTools.map(tool => {
                  const capability = asRecord(tool.capability)
                  const config = asRecord(tool.config)
                  const health = asRecord(tool.health)
                  const metrics = asRecord(tool.metrics)
                  const performance = asRecord(tool.performance)
                  const toolName = textOf(tool.name)
                  const kind = textOf(tool.kind || toolKinds[toolName.toLowerCase()])
                  const detail = textOf(config.action || tool.action || tool.runnerReason || asArray<string>(health.reasons)[0], '-')
                  const command = textOf(tool.runnerCommand || config.runnerCommand || tool.runnerProfile || config.runnerCommandKind)
                  const declaredModels = asArray<string>(asRecord(tool.declared).models)
                  const declaredStrengths = asArray<string>(asRecord(tool.strengths).all)
                  return (
                    <tr key={toolName}>
                      <td>
                        <div className="tool-cell">
                          <ToolIcon name={toolName} kind={kind} size={34} />
                          <div className="tool-cell-copy">
                            <strong>{getToolDisplayName(toolName, language)}</strong>
                            <span>{toolName}</span>
                          </div>
                        </div>
                      </td>
                      <td><StatusBadge status={getToolStatus(tool)} /></td>
                      <td>
                        <div className="tool-mode-cell">
                          <span className={`tool-kind-badge ${getToolKindClass(kind)}`}>{getToolKindLabel(kind, language)}</span>
                          <span>{textOf(capability.integrationMode, '-')}</span>
                        </div>
                      </td>
                      <td>
                        <div className="tool-model-cell">
                          {declaredModels.length ? <span className="tool-model-tags">{declaredModels.slice(0, 2).join(', ')}</span> : <span className="muted">-</span>}
                          {declaredStrengths.length ? <span className="tool-model-tags alt">{declaredStrengths.slice(0, 2).join(', ')}</span> : null}
                        </div>
                      </td>
                      <td>
                        <div className="tool-flags">
                          <ToolFlag label={copy.installed} value={boolOf(tool.installed || tool.connected)} />
                          <ToolFlag label={copy.configured} value={boolOf(tool.configured)} />
                          <ToolFlag label={copy.runnable} value={boolOf(tool.runnable || capability.autoDispatch)} />
                        </div>
                      </td>
                      <td className="number-cell">
                        <strong>{formatNumber(metrics.totalRuns)}</strong>
                        <span>{formatDurationMs(performance.avgDurationMs)}</span>
                      </td>
                      <td>{formatPercent(performance.successRate)}</td>
                      <td>{formatDate(textOf(performance.lastRunAt))}</td>
                      <td>
                        <div className="tool-detail-cell">
                          <span>{detail}</span>
                          {command ? <code>{command}</code> : null}
                        </div>
                      </td>
                      <td>
                        <Button variant="ghost" size="sm" className="whitespace-nowrap" onClick={() => void openToolSheet(tool)}>
                          {copy.manageConfig}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <EmptyState title={tools.length ? copy.noMatches : copy.noData} />}
        </div>
      </Panel>

      <Sheet open={selectedTool !== null} onOpenChange={open => { if (!open) setSelectedTool(null) }}>
        <SheetContent side="right" closeLabel={copy.close}>
          <SheetHeader>
            <SheetTitle>{`${copy.manageConfig}: ${textOf(selectedTool?.name, '-')}`}</SheetTitle>
            <SheetDescription>{textOf(selectedTool?.kind, '-')}</SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4">
            {selectedTool ? (
              <>
                <div className="workflow-action-summary">
                  <ToolIcon name={textOf(selectedTool.name)} kind={textOf(selectedTool.kind)} size={32} />
                  <StatusBadge status={getToolStatus(selectedTool)} />
                  <strong>{textOf(selectedTool.name, '-')}</strong>
                  <span>{textOf(selectedTool.kind, '-')}</span>
                </div>
                <SheetDetailList>
                  <dt>{copy.mode}</dt>
                  <dd>{textOf(selectedCapability.integrationMode, '-')}</dd>
                  <dt>{copy.runner}</dt>
                  <dd>{textOf(selectedTool.runnerProfile || selectedConfig.runnerCommandKind, '-')}</dd>
                  <dt>{copy.command}</dt>
                  <dd>{textOf(selectedTool.runnerCommand || selectedConfig.runnerCommand, '-')}</dd>
                  <dt>{copy.path}</dt>
                  <dd>{textOf(selectedTool.dir || selectedConfig.instructionFile, '-')}</dd>
                  <dt>{copy.capability}</dt>
                  <dd>{asArray<string>(selectedCapability.capabilities).join(', ') || '-'}</dd>
                  <dt>{copy.healthReasons}</dt>
                  <dd>{asArray<string>(selectedHealth.reasons).join(' · ') || '-'}</dd>
                  <dt>{copy.declaredModels}</dt>
                  <dd>{asArray<string>(asRecord(selectedTool.declared).models).join(', ') || '-'}</dd>
                  <dt>{copy.availableModels}</dt>
                  <dd>{asArray<string>(asRecord(selectedTool.models).all).slice(0, 12).join(', ') || '-'}</dd>
                  <dt>{copy.strengths}</dt>
                  <dd>{asArray<string>(asRecord(selectedTool.strengths).all).join(', ') || '-'}</dd>
                </SheetDetailList>
                {lastInstallFile ? <Callout tone="info" title={`${copy.changed}: ${lastInstallFile}`} /> : null}
                {error ? <ErrorState variant="inline" title={error} /> : null}
                <div className="tool-preview-grid">
                  <ToolPreviewCard
                    busy={busy}
                    copy={copy}
                    disabled={!localPreview}
                    label={copy.localTarget}
                    onApply={() => void applyToolRules('local')}
                    preview={localPreview}
                    primaryLabel={copy.installLocal}
                  />
                  <ToolPreviewCard
                    busy={busy}
                    copy={copy}
                    disabled={!globalPreview}
                    label={copy.globalTarget}
                    onApply={() => void applyToolRules('global')}
                    preview={globalPreview}
                    primaryLabel={copy.installGlobal}
                  />
                </div>
              </>
            ) : null}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ToolPreviewCard({
  busy,
  copy,
  disabled,
  label,
  onApply,
  preview,
  primaryLabel
}: {
  busy: string
  copy: Copy
  disabled: boolean
  label: string
  onApply: () => void
  preview: AnyRecord | null
  primaryLabel: string
}) {
  return (
    <section className="tool-preview-card">
      <div className="tool-preview-header">
        <strong>{label}</strong>
        <Button size="sm" disabled={disabled || Boolean(busy)} onClick={onApply}>
          {busy.startsWith('install') ? copy.running : primaryLabel}
        </Button>
      </div>
      <p>{preview ? textOf(preview.file, '-') : copy.previewUnavailable}</p>
      <pre className="text-snapshot small">{preview ? textOf(preview.snippet, '-') : copy.previewUnavailable}</pre>
    </section>
  )
}

function ToolIcon({ name, kind, size = 32 }: { name: string; kind?: string; size?: number }) {
  const cleanName = name.toLowerCase().trim()
  const [failed, setFailed] = useState(false)
  const iconPath = toolIconFiles[cleanName]
  const iconSrc = iconPath && !failed ? `${iconPath}?v=${toolIconAssetVersion}` : ''
  const resolvedKind = kind || toolKinds[cleanName] || ''

  return (
    <span className="tool-icon-wrapper" style={{ width: size, height: size }}>
      {!iconSrc ? (
        <span className="tool-icon-fallback" style={{ background: getFallbackGradient(cleanName), fontSize: Math.round(size * 0.52) }}>
          {getFallbackChar(cleanName)}
        </span>
      ) : null}
      {iconSrc ? (
        <img
          src={iconSrc}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : null}
      {resolvedKind ? <ToolIconCornerBadge kind={resolvedKind} /> : null}
    </span>
  )
}

function ToolIconCornerBadge({ kind }: { kind: string }) {
  if (kind === 'cli-config') {
    return (
      <span className="tool-icon-corner-badge cli" title="CLI">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2.5 3.5l1.5 1.5-1.5 1.5M4.5 6.5h3" />
        </svg>
      </span>
    )
  }
  if (kind === 'editor-state') {
    return (
      <span className="tool-icon-corner-badge editor" title="Editor">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M3 2.5l-2 2.5 2 2.5M7 2.5l2 2.5-2 2.5" />
        </svg>
      </span>
    )
  }
  if (kind === 'extension-state') {
    return (
      <span className="tool-icon-corner-badge extension" title="Extension">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M5 2v6M2 5h6" />
        </svg>
      </span>
    )
  }
  if (kind === 'app-state' || kind === 'local-model-runtime') {
    return (
      <span className="tool-icon-corner-badge app" title="App">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <rect x="2" y="2" width="6" height="4.5" rx="0.8" />
          <path d="M3.5 6.5h3M5 6.3V8" />
        </svg>
      </span>
    )
  }
  return null
}

function ToolFlag({ label, value }: { label: string; value: boolean }) {
  return (
    <span className={`tool-flag ${value ? 'on' : 'off'}`}>
      <span aria-hidden="true" />
      {label}
    </span>
  )
}

function getToolDisplayName(toolName: string, language: Language): string {
  const cleanName = toolName.toLowerCase().trim()
  return toolDisplayNames[language]?.[cleanName] || toolName || '-'
}

function getToolKindLabel(kind: string, language: Language): string {
  const cleanKind = kind.toLowerCase().trim()
  return toolKindBadges[language]?.[cleanKind] || kind || '-'
}

function getToolKindClass(kind: string): string {
  return `kind-${kind.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'unknown'}`
}

function getFallbackChar(name: string): string {
  return (name || '?').charAt(0).toUpperCase()
}

function getFallbackGradient(name: string): string {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash)
  }
  const gradients = [
    'linear-gradient(135deg, #388bfd, #bc8cff)',
    'linear-gradient(135deg, #10a37f, #0e7f62)',
    'linear-gradient(135deg, #ea7a50, #d9531e)',
    'linear-gradient(135deg, #00a7c8, #4f7cff)',
    'linear-gradient(135deg, #e5534b, #8f1f1f)',
    'linear-gradient(135deg, #cf3d73, #7d2f99)',
    'linear-gradient(135deg, #c98518, #8c4f12)',
    'linear-gradient(135deg, #7b61ff, #d65db1)'
  ]
  return gradients[Math.abs(hash) % gradients.length]
}

interface SettingsFormState {
  snapshotLimit: string
  coreLimit: string
  recentLimit: string
  lockStaleMs: string
  autoRefresh: boolean
  refreshIntervalMs: string
  language: string
  theme: string
  notifications: boolean
  shortcutsEnabled: boolean
  daily: string
  weekly: string
  preSync: string
  pruneAfterSync: boolean
}

function HealthPanel({
  copy,
  model,
  health,
  onRefresh
}: {
  copy: Copy
  model: ViewModel
  health: AnyRecord | null
  onRefresh: () => Promise<void>
}) {
  const [localReport, setLocalReport] = useState<AnyRecord | null>(null)
  const [repairPreview, setRepairPreview] = useState<AnyRecord | null>(null)
  const [repairLimit, setRepairLimit] = useState('10')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const report = localReport ?? health
  const analysis = asRecord(report?.analysis)
  const storage = asRecord(analysis.storage)
  const issues = asArray<AnyRecord>(analysis.issues)
  const suggestions = asArray<AnyRecord>(analysis.repairSuggestions)
  const duplicateGroups = asArray<AnyRecord>(analysis.duplicateGroups)
  const corruptedRecords = asArray<AnyRecord>(analysis.corruptedRecords)
  const storageItems = asArray<AnyRecord>(storage.items)
  const includeDiagnostics = asRecord(analysis.includeDiagnostics)
  const daemon = asRecord(model.status.daemon)
  const index = asRecord(model.status.index)
  const score = numberOf(analysis.score, 0)
  const hasRepairActions = getRepairTotalActions(repairPreview) > 0

  const getLimit = () => {
    const nextLimit = Number(repairLimit)
    if (!Number.isInteger(nextLimit) || nextLimit <= 0) {
      throw new Error(`${copy.repairLimit}: ${copy.invalidSettingsValue}`)
    }
    return nextLimit
  }

  const refreshHealth = async () => {
    setBusy('refresh')
    setError('')
    try {
      setLocalReport(await apiGet<AnyRecord>('/api/health'))
      setRepairPreview(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const previewRepair = async () => {
    setBusy('preview')
    setError('')
    try {
      setRepairPreview(await apiPost<AnyRecord>('/api/health/repair', { apply: false, limit: getLimit() }))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const applyRepair = async () => {
    setBusy('apply')
    setError('')
    try {
      const result = await apiPost<AnyRecord>('/api/health/repair', { apply: true, limit: getLimit() })
      setRepairPreview(result)
      setConfirmOpen(false)
      await refreshHealth()
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="stack">
      <div className="dashboard-summary-line health-summary-line"><span><strong>{formatNumber(score)}</strong>{copy.healthScore}</span><span><strong>{formatNumber(analysis.totalRecords)}</strong>{copy.totalRecords}</span><span className={numberOf(analysis.duplicateRecords) ? 'warning' : ''}><strong>{formatNumber(analysis.duplicateRecords)}</strong>{copy.duplicateRecords}</span><span className={numberOf(analysis.corruptedRecordsCount) ? 'warning' : ''}><strong>{formatNumber(analysis.corruptedRecordsCount)}</strong>{copy.corruptedRecords}</span><span><strong>{textOf(storage.totalDisplay, '-')}</strong>{copy.storageUsed}</span></div>

      <Panel title={copy.health}>
        <div className="section-actions">
          <label className="field compact-field">
            <span>{copy.repairLimit}</span>
            <input type="number" min="1" max="100" value={repairLimit} onChange={event => setRepairLimit(event.target.value)} />
          </label>
          <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void refreshHealth()}>
            {busy === 'refresh' ? copy.refreshing : copy.refreshHealth}
          </Button>
          <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void previewRepair()}>
            {busy === 'preview' ? copy.running : copy.previewRepair}
          </Button>
          <Button disabled={Boolean(busy) || !hasRepairActions} onClick={() => setConfirmOpen(true)}>
            {copy.applyRepair}
          </Button>
        </div>
        {error ? <ErrorState variant="inline" title={error} /> : null}
        <div className="property-grid settings-grid">
          <Property label="Daemon" value={textOf(daemon.state, '-')} />
          <Property label="Memory" value={formatNumber(index.records)} />
          <Property label="Radio" value={formatNumber(model.status.radioMessages)} />
          <Property label="Backups" value={formatNumber(model.status.backups)} />
          <Property label={copy.duplicateRate} value={textOf(analysis.duplicateRatePercent, '-')} />
          <Property label={copy.generatedAt} value={formatDate(textOf(analysis.generatedAt))} />
          <Property label={copy.filesScanned} value={formatNumber(includeDiagnostics.filesScanned)} />
          <Property label={copy.includesChecked} value={formatNumber(includeDiagnostics.includesChecked)} />
        </div>
      </Panel>

      <Panel title={copy.repairPlan}>
        {repairPreview ? <RepairPlanSummary copy={copy} result={repairPreview} /> : <EmptyState title={copy.repairPreviewEmpty} />}
      </Panel>

      <div className="panel-grid two">
        <Panel title={copy.healthIssues}>
          <HealthIssueRows copy={copy} issues={issues} />
        </Panel>
        <Panel title={copy.repairSuggestions}>
          <HealthSuggestionRows copy={copy} suggestions={suggestions} />
        </Panel>
      </div>

      <div className="panel-grid two">
        <Panel title={copy.duplicateExamples}>
          <DuplicateGroupRows copy={copy} groups={duplicateGroups} />
        </Panel>
        <Panel title={copy.corruptedExamples}>
          <CorruptedRecordRows copy={copy} records={corruptedRecords} />
        </Panel>
      </div>

      <div className="panel-grid two">
        <Panel title={copy.storageBreakdown}>
          <StorageRows copy={copy} items={storageItems} />
        </Panel>
        <Panel title={copy.healthRawReport}>
          <details className="health-raw-details">
            <summary>{copy.healthRawReport}</summary>
            <pre className="text-snapshot small">{textOf(report?.report || report?.stdout, copy.noData)}</pre>
          </details>
        </Panel>
      </div>

      <Dialog open={confirmOpen} onOpenChange={open => { if (!open) setConfirmOpen(false) }}>
        <DialogContent className="sm:max-w-md" closeLabel={copy.close}>
          <DialogHeader>
            <DialogTitle>{copy.applyRepair}</DialogTitle>
            <DialogDescription>{copy.confirmRepair}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <RepairPlanSummary copy={copy} result={repairPreview} />
            {error ? <ErrorState variant="inline" title={error} /> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" size="sm" disabled={Boolean(busy)} onClick={() => setConfirmOpen(false)}>
              {copy.cancel}
            </Button>
            <Button variant="primary" size="sm" disabled={busy === 'apply'} onClick={() => void applyRepair()}>
              {busy === 'apply' ? copy.running : copy.confirmApply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SettingsPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const [form, setForm] = useState<SettingsFormState>(() => createSettingsForm(model.settings))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const dashboard = asRecord(model.settings.dashboard)
  const sync = asRecord(model.settings.sync)
  const backupPolicy = asRecord(model.settings.backupPolicy)

  const updateForm = <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => {
    setForm(current => ({ ...current, [field]: value }))
  }

  const reloadSettings = async () => {
    setBusy('reload')
    setError('')
    setSuccess('')
    try {
      setForm(createSettingsForm(await apiGet<AnyRecord>('/api/settings')))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const saveSettings = async () => {
    setBusy('save')
    setError('')
    setSuccess('')
    try {
      const payload = buildSettingsPayload(form, model.settings, copy)
      const result = await apiPost<AnyRecord>('/api/settings', payload)
      const nextSettings = asRecord(result.settings)
      if (Object.keys(nextSettings).length) {
        setForm(createSettingsForm(nextSettings))
      }
      setSuccess(copy.settingsSaved)
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="stack">
      <Panel title={copy.settingsPanel}>
        <div className="property-grid settings-grid">
          <Property label={copy.memoryDir} value={textOf(model.settings.memoryDir, '-')} />
          <Property label={copy.autoRefresh} value={formatBool(boolSetting(dashboard.autoRefresh, true), copy)} />
          <Property label={copy.notifications} value={formatBool(boolSetting(dashboard.notifications, true), copy)} />
          <Property label={copy.refreshInterval} value={`${formatNumber(dashboard.refreshIntervalMs)} ms`} />
          <Property label={copy.snapshotLimit} value={formatNumber(sync.snapshotLimit)} />
          <Property label={copy.backupPolicy} value={`${copy.daily} ${formatNumber(backupPolicy.daily)} / ${copy.weekly} ${formatNumber(backupPolicy.weekly)}`} />
          <Property label={copy.pruneAfterSync} value={formatBool(boolSetting(backupPolicy.pruneAfterSync, false), copy)} />
        </div>
      </Panel>

      <Panel title={copy.saveSettings}>
        <div className="settings-form">
          <section className="settings-section">
            <h3>{copy.settingsSyncSection}</h3>
            <div className="form-grid">
              <label className="field">
                <span>{copy.snapshotLimit}</span>
                <input type="number" min="1" value={form.snapshotLimit} onChange={event => updateForm('snapshotLimit', event.target.value)} />
              </label>
              <label className="field">
                <span>{copy.coreLimit}</span>
                <input type="number" min="1" value={form.coreLimit} onChange={event => updateForm('coreLimit', event.target.value)} />
              </label>
              <label className="field">
                <span>{copy.recentLimit}</span>
                <input type="number" min="1" value={form.recentLimit} onChange={event => updateForm('recentLimit', event.target.value)} />
              </label>
              <label className="field">
                <span>{copy.lockStaleMs}</span>
                <input type="number" min="1" value={form.lockStaleMs} onChange={event => updateForm('lockStaleMs', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="settings-section">
            <h3>{copy.settingsDashboardSection}</h3>
            <div className="form-grid">
              <label className="field">
                <span>{copy.refreshInterval}</span>
                <input type="number" min="1000" max="60000" step="1000" value={form.refreshIntervalMs} onChange={event => updateForm('refreshIntervalMs', event.target.value)} />
              </label>
              <label className="field">
                <span>{copy.languageSetting}</span>
                <select value={form.language} onChange={event => updateForm('language', event.target.value)}>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="field checkbox-field">
                <input type="checkbox" checked={form.autoRefresh} onChange={event => updateForm('autoRefresh', event.target.checked)} />
                <span>{copy.autoRefresh}</span>
              </label>
              <label className="field checkbox-field">
                <input type="checkbox" checked={form.notifications} onChange={event => updateForm('notifications', event.target.checked)} />
                <span>{copy.notifications}</span>
              </label>
              <label className="field checkbox-field">
                <input type="checkbox" checked={form.shortcutsEnabled} onChange={event => updateForm('shortcutsEnabled', event.target.checked)} />
                <span>{copy.shortcuts}</span>
              </label>
            </div>
          </section>

          <section className="settings-section">
            <h3>{copy.settingsBackupSection}</h3>
            <div className="form-grid">
              <label className="field">
                <span>{copy.daily}</span>
                <input type="number" min="1" value={form.daily} onChange={event => updateForm('daily', event.target.value)} />
              </label>
              <label className="field">
                <span>{copy.weekly}</span>
                <input type="number" min="1" value={form.weekly} onChange={event => updateForm('weekly', event.target.value)} />
              </label>
              <label className="field">
                <span>{copy.preSync}</span>
                <input type="number" min="1" value={form.preSync} onChange={event => updateForm('preSync', event.target.value)} />
              </label>
              <label className="field checkbox-field">
                <input type="checkbox" checked={form.pruneAfterSync} onChange={event => updateForm('pruneAfterSync', event.target.checked)} />
                <span>{copy.pruneAfterSync}</span>
              </label>
            </div>
          </section>
        </div>
        {error ? <ErrorState variant="inline" title={error} /> : null}
        {success ? <Callout tone="success" title={success} /> : null}
        <div className="form-actions settings-actions">
          <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void reloadSettings()}>
            {busy === 'reload' ? copy.refreshing : copy.refreshSettings}
          </Button>
          <Button disabled={Boolean(busy)} onClick={() => void saveSettings()}>
            {busy === 'save' ? copy.running : copy.saveSettings}
          </Button>
        </div>
      </Panel>
    </div>
  )
}

function createSettingsForm(settings: AnyRecord): SettingsFormState {
  const sync = asRecord(settings.sync)
  const dashboard = asRecord(settings.dashboard)
  const shortcuts = asRecord(dashboard.shortcuts)
  const backupPolicy = asRecord(settings.backupPolicy)
  return {
    snapshotLimit: String(numberOf(sync.snapshotLimit, 120)),
    coreLimit: String(numberOf(sync.coreLimit, 80)),
    recentLimit: String(numberOf(sync.recentLimit, 40)),
    lockStaleMs: String(numberOf(sync.lockStaleMs, 30000)),
    autoRefresh: boolSetting(dashboard.autoRefresh, true),
    refreshIntervalMs: String(numberOf(dashboard.refreshIntervalMs, 5000)),
    language: ['zh', 'en'].includes(textOf(dashboard.language)) ? textOf(dashboard.language) : 'zh',
    // The dashboard ships a single light theme; the field is kept only to preserve the settings payload shape.
    theme: 'light',
    notifications: boolSetting(dashboard.notifications, true),
    shortcutsEnabled: boolSetting(shortcuts.enabled, true),
    daily: String(numberOf(backupPolicy.daily, 14)),
    weekly: String(numberOf(backupPolicy.weekly, 8)),
    preSync: String(numberOf(backupPolicy.preSync, 24)),
    pruneAfterSync: boolSetting(backupPolicy.pruneAfterSync, true)
  }
}

function buildSettingsPayload(form: SettingsFormState, currentSettings: AnyRecord, copy: Copy): AnyRecord {
  const refreshIntervalMs = parsePositiveInteger(form.refreshIntervalMs, copy.refreshInterval, copy)
  if (refreshIntervalMs < 1000 || refreshIntervalMs > 60000) {
    throw new Error(`${copy.refreshInterval}: 1000-60000`)
  }
  const dashboard = asRecord(currentSettings.dashboard)
  const shortcuts = asRecord(dashboard.shortcuts)
  return {
    sync: {
      snapshotLimit: parsePositiveInteger(form.snapshotLimit, copy.snapshotLimit, copy),
      coreLimit: parsePositiveInteger(form.coreLimit, copy.coreLimit, copy),
      recentLimit: parsePositiveInteger(form.recentLimit, copy.recentLimit, copy),
      lockStaleMs: parsePositiveInteger(form.lockStaleMs, copy.lockStaleMs, copy)
    },
    dashboard: {
      autoRefresh: form.autoRefresh,
      refreshIntervalMs,
      language: form.language,
      theme: form.theme,
      notifications: form.notifications,
      shortcuts: {
        ...shortcuts,
        enabled: form.shortcutsEnabled
      }
    },
    backupPolicy: {
      daily: parsePositiveInteger(form.daily, copy.daily, copy),
      weekly: parsePositiveInteger(form.weekly, copy.weekly, copy),
      preSync: parsePositiveInteger(form.preSync, copy.preSync, copy),
      pruneAfterSync: form.pruneAfterSync
    }
  }
}

function parsePositiveInteger(value: string, label: string, copy: Copy): number {
  const nextValue = Number(value)
  if (!Number.isInteger(nextValue) || nextValue <= 0) {
    throw new Error(`${label}: ${copy.invalidSettingsValue}`)
  }
  return nextValue
}

function boolSetting(value: unknown, fallback: boolean): boolean {
  return value === undefined || value === null ? fallback : Boolean(value)
}

function RepairPlanSummary({ copy, result }: { copy: Copy; result: AnyRecord | null }) {
  const plan = asRecord(result?.plan)
  const applied = asRecord(result?.applied)
  const duplicates = asArray<AnyRecord>(plan.duplicates)
  return (
    <div className="stack">
      <div className="property-grid settings-grid">
        <Property label={copy.mode} value={boolOf(result?.apply) ? copy.applied : copy.dryRun} />
        <Property label={copy.totalActions} value={formatNumber(plan.totalActions)} />
        <Property label={copy.duplicateGroups} value={formatNumber(plan.duplicateGroups)} />
        <Property label={copy.superseded} value={formatNumber(plan.duplicateRecordsToSupersede)} />
        <Property label={copy.ledgerRecordsUpdated} value={formatNumber(applied.ledgerRecordsUpdated)} />
        <Property label={copy.corruptedRecovered} value={formatNumber(applied.corruptedRecovered)} />
        <Property label={copy.corruptedArchived} value={formatNumber(applied.corruptedArchived)} />
        <Property label={copy.duplicateRecords} value={formatNumber(applied.duplicateSuperseded)} />
      </div>
      {duplicates.length ? (
        <div className="repair-plan-list">
          {duplicates.slice(0, 8).map((item, indexValue) => (
            <div className="health-example" key={`${textOf(item.example || item.id)}-${indexValue}`}>
              <strong>{textOf(item.example || item.key, '-')}</strong>
              <span>{formatNumber(item.count)} / {formatNumber(asArray(item.records).length)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function getRepairTotalActions(result: AnyRecord | null): number {
  return numberOf(asRecord(result?.plan).totalActions)
}

function HealthIssueRows({ copy, issues }: { copy: Copy; issues: AnyRecord[] }) {
  if (!issues.length) return <EmptyState title={copy.noHealthIssues} />
  return (
    <div className="stack">
      {issues.map((issue, indexValue) => {
        const action = asRecord(issue.action)
        return (
          <div className={`health-issue-row level-${textOf(issue.level, 'low')}`} key={`${textOf(issue.title)}-${indexValue}`}>
            <div>
              <div className="health-row-title">
                <StatusBadge status={textOf(issue.level, 'low')} />
                <strong>{textOf(issue.title, '-')}</strong>
              </div>
              <p>{textOf(issue.detail, '-')}</p>
              {action.command || action.endpoint ? <code className="health-command">{textOf(action.command || action.endpoint)}</code> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HealthSuggestionRows({ copy, suggestions }: { copy: Copy; suggestions: AnyRecord[] }) {
  if (!suggestions.length) return <EmptyState title={copy.noHealthIssues} />
  return (
    <div className="stack health-suggestion-list">
      {suggestions.map((suggestion, indexValue) => {
        const command = textOf(suggestion.command || suggestion.endpoint)
        return (
          <article className="health-action-row" key={`${textOf(suggestion.id || suggestion.label)}-${indexValue}`}>
            <div className="health-suggestion-main"><span className="health-suggestion-kicker">建议</span><strong>{textOf(suggestion.label || suggestion.id, copy.repairSuggestions)}</strong><p>{textOf(suggestion.detail || '建议检查并处理此项健康问题。', '-')}</p></div>
            {command ? <details className="health-suggestion-command"><summary>查看执行方式</summary><code className="health-command">{command}</code></details> : null}
          </article>
        )
      })}
    </div>
  )
}
function DuplicateGroupRows({ copy, groups }: { copy: Copy; groups: AnyRecord[] }) {
  if (!groups.length) return <EmptyState title={copy.noHealthExamples} />
  return (
    <div className="stack">
      {groups.map((group, indexValue) => (
        <div className="health-example" key={`${textOf(group.example)}-${indexValue}`}>
          <div className="health-row-title">
            <strong>{formatNumber(group.count)}x</strong>
            <span>{textOf(group.example, '-')}</span>
          </div>
          <p>{asArray<AnyRecord>(group.records).map(record => textOf(record.pointer || record.id)).filter(Boolean).join(' | ')}</p>
        </div>
      ))}
    </div>
  )
}

function CorruptedRecordRows({ copy, records }: { copy: Copy; records: AnyRecord[] }) {
  if (!records.length) return <EmptyState title={copy.noHealthExamples} />
  return (
    <div className="stack">
      {records.map((record, indexValue) => (
        <div className="health-example" key={`${textOf(record.pointer)}-${indexValue}`}>
          <strong>{textOf(record.pointer, '-')}</strong>
          <p>{textOf(record.text, '-')}</p>
        </div>
      ))}
    </div>
  )
}

function StorageRows({ copy, items }: { copy: Copy; items: AnyRecord[] }) {
  if (!items.length) return <EmptyState title={copy.noData} />
  return (
    <div className="health-storage-list">
      {items.map(item => (
        <div className="health-storage-row" key={textOf(item.label)}>
          <span>{textOf(item.label, '-')}</span>
          <strong>{textOf(item.display || item.bytes, '-')}</strong>
        </div>
      ))}
    </div>
  )
}

function MetricCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warning' }) {
  // Use NewMetricCard for consistency
  return <NewMetricCard label={label} value={value} tone={tone} />
}

function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  // Use NewPanel (shadcn/ui Card) for consistency
  return <NewPanel title={title} className={className}>{children}</NewPanel>
}

function DataTable({ columns, rows, emptyText }: { columns: string[]; rows: ReactNode[][]; emptyText: string }) {
  if (!rows.length) return <EmptyState title={emptyText} />
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map(column => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BarList({ items, emptyText }: { items: Array<{ key: string; count: number }>; emptyText: string }) {
  const visibleItems = items.filter(item => item.key && item.count > 0)
  const maxValue = Math.max(1, ...visibleItems.map(item => item.count))
  if (!visibleItems.length) return <EmptyState title={emptyText} />
  return (
    <div className="bar-list">
      {visibleItems.map(item => (
        <div className="bar-row" key={item.key}>
          <div className="bar-row-label">
            <span>{item.key}</span>
            <strong>{formatNumber(item.count)}</strong>
          </div>
          <div className="bar-track">
            <span style={{ width: `${Math.max(4, Math.round((item.count / maxValue) * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Property({ label, value }: { label: string; value: string }) {
  return (
    <div className="property">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  // Use NewStatusBadge for consistency
  return <NewStatusBadge status={status} />
}

function formatNumber(value: unknown): string {
  return numberOf(value).toLocaleString()
}

function formatBool(value: boolean, copy: Copy): string {
  return value ? copy.yes : copy.no
}

function formatPercent(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  const nextValue = Number(value)
  if (!Number.isFinite(nextValue)) return '-'
  return `${Math.round(nextValue * 100)}%`
}

function formatDurationMs(value: unknown): string {
  const nextValue = Number(value)
  if (!Number.isFinite(nextValue) || nextValue <= 0) return '-'
  if (nextValue < 1000) return `${Math.round(nextValue)} ms`
  if (nextValue < 60000) return `${Math.round(nextValue / 1000)} s`
  const minutes = Math.floor(nextValue / 60000)
  const seconds = Math.round((nextValue % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

function getToolStatus(tool: AnyRecord): string {
  const health = asRecord(tool.health)
  return textOf(health.status || tool.connectionStatus || (tool.installed ? 'installed' : 'missing'), 'missing')
}

function toolMatchesStatusFilter(tool: AnyRecord, filter: string): boolean {
  const status = getToolStatus(tool)
  if (filter === 'all') return true
  if (filter === 'ready') return status.startsWith('ready')
  if (filter === 'connected') return boolOf(tool.connected) || textOf(tool.connectionStatus).startsWith('connected')
  if (filter === 'runnable') return boolOf(tool.runnable || asRecord(tool.capability).autoDispatch)
  if (filter === 'missing') return !boolOf(tool.installed) || status.includes('missing')
  if (filter === 'needs') return status.includes('needs') || status.includes('unconfigured') || (boolOf(tool.installed) && !boolOf(tool.configured))
  return true
}

/** Turn a server-computed `{ key: count }` aggregate into a sorted BarList dataset. */
function countEntries(value: unknown, limit = 8): Array<{ key: string; count: number }> {
  return Object.entries(asRecord(value))
    .map(([key, count]) => ({ key: key.trim(), count: numberOf(count) }))
    .filter(item => item.key && item.count > 0)
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit)
}
