import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AnyRecord } from '../lib/api'
import { apiGet, apiPost, asArray, asRecord, boolOf, numberOf, textOf } from '../lib/api'
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
import { WorkflowsPanel as NewWorkflowsPanel } from '../components/WorkflowsPanel'
import { AgentExecutionPanel } from '../components/AgentExecutionPanel'
import {
  MetricCard as NewMetricCard,
  Panel as NewPanel,
  TaskList as NewTaskList,
  RadioList as NewRadioList,
  ToolList as NewToolList,
  StatusBadge as NewStatusBadge
} from '../components/OverviewComponents'
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

export default function Dashboard({ section }: DashboardProps) {
  const { language, toggleLanguage } = useOutletContext<AppOutletContext>()
  const [data, setData] = useState<DashboardSnapshot | null>(null)
  const [health, setHealth] = useState<AnyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])

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
      setData(snapshot)
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

    void fetchDashboardData(section)
      .then(({ snapshot, health: nextHealth }) => {
        if (!active) return
        setData(snapshot)
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
    }
  }, [section])

  const viewModel = useMemo(() => buildViewModel(data), [data])

  return (
    <div className={`dashboard-page dashboard-section-${section}`}>
      <DashboardHeader
        title={dashboardTitles[language][section]}
        subtitle={dashboardSubtitles[language][section]}
        loading={loading}
        busyAction={busyAction}
        copy={copy}
        onRefresh={refresh}
        onPull={() => void runHubAction('/api/pull', 'pull')}
        onSync={() => void runHubAction('/api/sync', 'sync')}
        onToggleLanguage={toggleLanguage}
      />

      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="m-6 p-4 rounded-lg border border-destructive/20 bg-destructive/10">
            <p className="font-semibold text-destructive">{copy.connectionError}</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="m-6 p-4 rounded-lg border bg-card text-center">
            <span className="loading-state"><span className="loading-spinner" aria-hidden="true" /> <span>{copy.refreshing}</span></span>
          </div>
        ) : (
          <div className="p-6">
            {section === 'overview' && <CommandCenter copy={copy} model={viewModel} language={language} onRefresh={refresh} />}
            {section === 'memory' && <NewMemoryPanel memory={viewModel.memory} copy={copy} onRefresh={refresh} />}
            {section === 'tasks' && <NewTasksPanel tasks={viewModel.tasks} visibleProjects={viewModel.visibleProjects} copy={copy} onMutate={async (_action, path, body) => {
              await apiPost<AnyRecord>(path, body)
              await refresh()
              return true
            }} />}
            {section === 'radio' && <NewRadioPanel radio={viewModel.radio} visibleProjects={viewModel.visibleProjects} copy={copy} onRefresh={refresh} />}
            {section === 'dispatch' && <DispatchPanel copy={copy} model={viewModel} onRefresh={refresh} />}
            {section === 'workflows' && <NewWorkflowsPanel workflows={viewModel.workflows} visibleProjects={viewModel.visibleProjects} copy={copy} onRefresh={refresh} />}
            {section === 'analytics' && <AnalyticsPanel copy={copy} model={viewModel} />}
            {section === 'backups' && <BackupsPanel copy={copy} model={viewModel} onRefresh={refresh} />}
            {section === 'search' && <SearchPanel copy={copy} />}
            {section === 'tools' && <ToolsPanel copy={copy} language={language} model={viewModel} onRefresh={refresh} />}
            {section === 'projects' && <ProjectsPanel copy={copy} model={viewModel} onRefresh={refresh} />}
            {section === 'health' && <HealthPanel copy={copy} model={viewModel} health={health} onRefresh={refresh} />}
            {section === 'settings' && <SettingsPanel copy={copy} model={viewModel} onRefresh={refresh} />}
          </div>
        )}
      </div>

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
    radio: asArray<AnyRecord>(radio.messages),
    tasks: asArray<AnyRecord>(tasks.tasks),
    workflows: asArray<AnyRecord>(workflows.workflows),
    projects: asArray<AnyRecord>(projects.projects),
    visibleProjects: asArray<AnyRecord>(projects.visibleProjects),
    unregisteredProjects: asArray<string>(projects.unregisteredProjects),
    dispatchLogs: asArray<AnyRecord>(dispatch.logs),
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

function humanStatus(value: unknown, language: AppLanguage): string {
  const status = textOf(value).toLowerCase()
  const zh: Record<string, string> = { open: '待处理', active: '进行中', in_progress: '进行中', claimed: '已领取', waiting_review: '待确认', blocked: '已阻塞', failed: '失败', completed: '已完成', done: '已完成', cancelled: '已取消', idle: '空闲', running: '运行中', success: '成功', pending: '待处理' }
  const en: Record<string, string> = { open: 'Open', active: 'Active', in_progress: 'In progress', claimed: 'Claimed', waiting_review: 'Waiting for review', blocked: 'Blocked', failed: 'Failed', completed: 'Completed', done: 'Done', cancelled: 'Cancelled', idle: 'Idle', running: 'Running', success: 'Succeeded', pending: 'Pending' }
  return (language === 'zh' ? zh : en)[status] || (status ? status.replace(/_/g, ' ') : '—')
}

function CommandCenter({ copy, model, language, onRefresh }: { copy: Copy; model: ViewModel; language: AppLanguage; onRefresh: () => Promise<void> }) {
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
          <button className="btn" type="button" onClick={() => void onRefresh()}>{copy.refresh}</button>
        </div>
      </section>

      <div className="command-center-grid">
        <main className="command-center-main">
          <section className="command-section">
            <div className="command-section-heading">
              <div><span className="command-section-index">01</span><div><h2>{language === 'zh' ? 'Agent 活动' : 'Agent activity'}</h2><p>{language === 'zh' ? '当前正在执行或保持上下文的智能体' : 'Agents currently executing or holding context'}</p></div></div>
              <strong className="command-section-count">{activeAgents.length}</strong>
            </div>
            {activeAgents.length ? (
              <div className="agent-work-grid">
                {activeAgents.map((agent, index) => (
                  <article className={'agent-work-card '+(selectedId === textOf(agent.id) ? 'is-selected' : '')} key={textOf(agent.id)+'-'+index} role="button" tabIndex={0} onClick={() => choose('agent', agent)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') choose('agent', agent) }}>
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
              <div><span className="command-section-index">02</span><div><h2>{language === 'zh' ? '需要关注' : 'Needs attention'}</h2><p>{language === 'zh' ? '失败、阻塞或正在推进中的任务' : 'Failed, blocked, or currently moving tasks'}</p></div></div>
              <strong className="command-section-count danger">{attentionTasks.length}</strong>
            </div>
            <div className="attention-task-grid">
              {attentionTasks.length ? attentionTasks.map((task, index) => (
                <article className={'attention-task-card '+(selectedId === textOf(task.id) ? 'is-selected' : '')} key={textOf(task.id)+'-'+index} role="button" tabIndex={0} onClick={() => choose('task', task)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') choose('task', task) }}>
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
            <div className="command-side-heading"><span className="command-section-index">04</span><h2>{language === 'zh' ? '最近任务' : 'Recent work'}</h2></div>
            <div className="command-recent-list">
              {recentTasks.map((task, index) => <div className={'command-recent-item '+(selectedId === textOf(task.id) ? 'is-selected' : '')} key={textOf(task.id)+'-'+index} role="button" tabIndex={0} onClick={() => choose('task', task)}><NewStatusBadge status={textOf(task.status, 'open')} /><div><strong>{textOf(task.title, '—')}</strong><span>{textOf(task.assignee || task.createdBy, 'unassigned')}</span></div></div>)}
            </div>
          </section>
          <section className="command-side-block command-radio-block">
            <div className="command-side-heading"><span className="command-section-index">05</span><h2>{language === 'zh' ? '协作广播' : 'Handoffs'}</h2></div>
            <div className="command-radio-list">
              {recentMessages.map((message, index) => <div className="command-radio-item" key={textOf(message.id)+'-'+index} role="button" tabIndex={0} onClick={() => choose('radio', message)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') choose('radio', message) }}><span className="command-radio-dot" /><div><strong>{textOf(message.from, 'agent')} → {textOf(message.to, 'all')}</strong><p>{textOf(message.text, '—')}</p></div></div>)}
            </div>
          </section>
        </aside>
      </div>
      {selected ? (
        <Modal title={textOf(selected.item.title || selected.item.taskTitle || selected.item.tool || selected.item.agent || selected.item.text, language === 'zh' ? '条目详情' : 'Item details')} onClose={() => setSelected(null)}>
          <div className="command-modal-detail">
            <div className="command-modal-type">{selected.kind === 'agent' ? 'AGENT CONTEXT' : selected.kind === 'radio' ? 'RADIO MESSAGE' : 'TASK CONTEXT'}</div>
            <h3>{textOf(selected.item.title || selected.item.taskTitle || selected.item.tool || selected.item.agent || selected.item.text, '—')}</h3>
            <div className="command-modal-grid">
              <Property label={language === 'zh' ? '状态' : 'Status'} value={humanStatus(selected.item.status, language)} />
              <Property label={language === 'zh' ? '项目' : 'Project'} value={textOf(selected.item.project, '—')} />
              <Property label={language === 'zh' ? '负责人' : 'Owner'} value={textOf(selected.item.assignee || selected.item.actor || selected.item.tool, '—')} />
              <Property label={language === 'zh' ? '上下文 ID' : 'Context ID'} value={textOf(selected.item.sessionId || selected.item.threadKey || selected.item.id, '—')} />
            </div>
            <div className="command-modal-copy"><strong>{language === 'zh' ? '技术详情' : 'Technical details'}</strong><pre>{JSON.stringify(selected.item, null, 2)}</pre></div>
          </div>
        </Modal>
      ) : null}    </div>
  )
}
void Overview

function Overview({ copy, model, language, onRefresh }: { copy: Copy; model: ViewModel; language: AppLanguage; onRefresh: () => Promise<void> }) {
  const statusTasks = asRecord(model.status.tasks)
  const statusWorkflows = asRecord(model.status.workflows)
  const index = asRecord(model.status.index)
  const relay = asRecord(model.metrics.relay)
  const capabilitySummary = asRecord(model.status.capabilitySummary)
  const recentFailures = asArray<AnyRecord>(model.metrics.recentFailures).slice(0, 4)

  return (
    <div className="overview">
      <AgentExecutionPanel agentSessions={model.agentSessions} worktrees={model.worktrees} timeline={model.agentTimeline} collaboration={model.collaboration} language={language} onMarkRead={async (id) => { await apiPost<AnyRecord>('/api/unread/read', { itemId: id, actor: 'dashboard' }); await onRefresh() }} />
      <section className="overview-section" aria-label={copy.health}>
        <div className="dashboard-grid overview-metric-grid">
          <div className="metric-card">
            <NewMetricCard label={copy.health} value={textOf(relay.successRate, copy.noData)} tone="success" />
          </div>
          <div className="metric-card">
            <NewMetricCard label={copy.totalTasks} value={formatNumber(statusTasks.total)} />
          </div>
          <div className="metric-card">
            <NewMetricCard label={copy.workflows} value={formatNumber(statusWorkflows.total)} />
          </div>
        </div>
      </section>

      <div className="panel-grid two overview-primary-grid">
        <NewPanel title={copy.overviewSystemActivity} className="overview-panel overview-system-panel">
          <div className="overview-property-grid">
            <Property label={copy.activeTasks} value={formatNumber(statusTasks.active)} />
            <Property label={copy.toolsReady} value={formatNumber(capabilitySummary.autoDispatch)} />
            <Property label={copy.memoryRecords} value={formatNumber(index.records)} />
          </div>
          <div className="overview-activity">
            <h4>{copy.recentFailures}</h4>
            {recentFailures.length ? (
              <div className="overview-failure-list">
                {recentFailures.map((failure, indexValue) => (
                  <div className="overview-failure-row" key={`${textOf(failure.id)}-${indexValue}`}>
                    <NewStatusBadge status="failed" />
                    <span>{textOf(failure.error, copy.noData)}</span>
                  </div>
                ))}
              </div>
            ) : <OverviewEmptyState text={copy.overviewNoFailures} actionLabel={copy.refresh} onAction={onRefresh} />}
          </div>
        </NewPanel>

        <NewPanel title={copy.overviewCollaboration} className="overview-panel overview-collaboration-panel">
          {model.radio.length ? (
            <NewRadioList messages={model.radio.slice(-4).reverse()} emptyText={copy.overviewNoMessages} />
          ) : <OverviewEmptyState text={copy.overviewNoMessages} actionLabel={copy.refresh} onAction={onRefresh} />}
        </NewPanel>
      </div>

      <section className="overview-section overview-summary-section" aria-labelledby="overview-work-heading">
        <div className="overview-section-heading">
          <div>
            <h3 id="overview-work-heading">{copy.overviewWork}</h3>
            <p>{copy.overviewWorkDescription}</p>
          </div>
        </div>
        <div className="panel-grid two">
          <NewPanel title={copy.recentTasks} className="overview-panel">
            {model.tasks.length ? (
              <NewTaskList tasks={model.tasks.slice(0, 6)} emptyText={copy.overviewNoTasks} />
            ) : <OverviewEmptyState text={copy.overviewNoTasks} actionLabel={copy.refresh} onAction={onRefresh} />}
          </NewPanel>
          <NewPanel title={copy.overviewWorkflows} className="overview-panel">
            {model.workflows.length ? (
              <NewTaskList tasks={model.workflows.slice(0, 6)} emptyText={copy.overviewNoWorkflows} />
            ) : <OverviewEmptyState text={copy.overviewNoWorkflows} actionLabel={copy.refresh} onAction={onRefresh} />}
          </NewPanel>
        </div>
      </section>

      <section className="overview-section overview-summary-section" aria-labelledby="overview-system-heading">
        <div className="overview-section-heading">
          <div>
            <h3 id="overview-system-heading">{copy.overviewSystem}</h3>
            <p>{copy.overviewSystemDescription}</p>
          </div>
        </div>
        <div className="panel-grid two">
          <NewPanel title={copy.toolReadiness} className="overview-panel">
            {model.tools.length ? (
              <NewToolList tools={model.tools.slice(0, 7)} emptyText={copy.overviewNoTools} />
            ) : <OverviewEmptyState text={copy.overviewNoTools} actionLabel={copy.refresh} onAction={onRefresh} />}
          </NewPanel>
          <NewPanel title={copy.overviewHealth} className="overview-panel">
            <div className="overview-property-grid">
              <Property label={copy.relayRate} value={textOf(relay.successRate, copy.noData)} />
              <Property label={copy.pendingEvents} value={formatNumber(asArray<AnyRecord>(model.memory.pending).length)} />
              <Property label={copy.memoryRecords} value={formatNumber(index.records)} />
            </div>
          </NewPanel>
        </div>
      </section>
    </div>
  )
}

function OverviewEmptyState({ text, actionLabel, onAction }: { text: string; actionLabel?: string; onAction?: () => Promise<void> }) {
  return (
    <div className="empty-state overview-empty-state">
      <p>{text}</p>
      {actionLabel && onAction ? (
        <button className="btn small ghost" type="button" onClick={() => void onAction()}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

// Old MemoryPanel commented out - using new component from MemoryPanel.tsx
/*
function MemoryPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const pending = asArray<AnyRecord>(model.memory.pending)
  const memoryRecords = asArray<AnyRecord>(model.memory.records)
  const [text, setText] = useState('')
  const [kind, setKind] = useState('note')
  const [source, setSource] = useState('dashboard-next')
  const [recordOpen, setRecordOpen] = useState(false)
  const [supersedeTarget, setSupersedeTarget] = useState<AnyRecord | null>(null)
  const [supersedeText, setSupersedeText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submitMemory = async () => {
    const nextText = text.trim()
    if (!nextText || saving) return
    setSaving(true)
    setError('')
    try {
      await apiPost<AnyRecord>('/api/record', { text: nextText, kind, source })
      setText('')
      await onRefresh()
      setRecordOpen(false)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setSaving(false)
    }
  }

  const openSupersede = (record: AnyRecord) => {
    setError('')
    setSupersedeTarget(record)
    setSupersedeText(textOf(record.text))
  }

  const supersedeMemory = async () => {
    const target = asRecord(supersedeTarget)
    const metadata = asRecord(target.metadata)
    const nextText = supersedeText.trim()
    const targetId = textOf(target.localEventId || target.id)
    if (!targetId || !nextText || saving) return
    setSaving(true)
    setError('')
    try {
      await apiPost<AnyRecord>('/api/memory/supersede', {
        id: targetId,
        text: nextText,
        kind: textOf(target.kind || metadata.kind, 'note'),
        project: textOf(target.project || metadata.project),
        source,
        supersedes: textOf(metadata.supersedes)
      })
      setSupersedeTarget(null)
      setSupersedeText('')
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel-grid two">
      <Panel title={copy.memorySnapshot}>
        <pre className="text-snapshot">{textOf(model.memory.memory, copy.noData)}</pre>
      </Panel>
      <div className="stack">
        <Panel title={copy.recordMemory}>
          <div className="section-actions compact">
            <button className="btn full-width" type="button" onClick={() => { setError(''); setRecordOpen(true) }}>
            {copy.recordMemory}
            </button>
          </div>
        </Panel>
        <MetricCard label={copy.pendingEvents} value={formatNumber(pending.length)} tone="warning" />
        <Panel title={copy.profile}>
          <pre className="text-snapshot small">{textOf(model.memory.profile, copy.noData)}</pre>
        </Panel>
      </div>
      <Panel title={copy.memoryRecords} className="span-2">
        {memoryRecords.length ? (
          <div className="memory-record-list">
            {memoryRecords.slice(0, 12).map(record => {
              const metadata = asRecord(record.metadata)
              const recordId = textOf(record.localEventId || record.id)
              return (
                <article className="memory-record-card" key={recordId || textOf(record.ts)}>
                  <div className="memory-record-header">
                    <div className="message-meta">
                      <StatusBadge status={textOf(record.kind || metadata.kind, 'note')} />
                      <span>{textOf(record.source, '-')} · {formatDate(textOf(record.ts || record.indexedAt))}</span>
                    </div>
                    <button className="btn small ghost" type="button" onClick={() => openSupersede(record)}>
                      {copy.supersedeMemory}
                    </button>
                  </div>
                  <p>{textOf(record.text, '-')}</p>
                  <div className="radio-card-footer">
                    {record.project || metadata.project ? <span className="chip">{textOf(record.project || metadata.project)}</span> : null}
                    {metadata.supersedes ? <span className="chip">{textOf(metadata.supersedes)}</span> : null}
                  </div>
                </article>
              )
            })}
          </div>
        ) : <EmptyState text={copy.noData} />}
      </Panel>
      {recordOpen ? (
        <Modal title={copy.recordMemory} onClose={() => setRecordOpen(false)}>
          <div className="form-grid">
            <label className="field span-all">
              <span>{copy.memoryText}</span>
              <textarea value={text} onChange={event => setText(event.target.value)} rows={5} />
            </label>
            <label className="field">
              <span>{copy.kind}</span>
              <select value={kind} onChange={event => setKind(event.target.value)}>
                <option value="preference">preference</option>
                <option value="workflow">workflow</option>
                <option value="project">project</option>
                <option value="correction">correction</option>
                <option value="note">note</option>
              </select>
            </label>
            <label className="field">
              <span>{copy.source}</span>
              <input value={source} onChange={event => setSource(event.target.value)} />
            </label>
            {error ? <div className="inline-error span-all">{error}</div> : null}
            <div className="form-actions span-all">
              <button className="btn ghost" type="button" onClick={() => setRecordOpen(false)}>
                {copy.cancel}
              </button>
              <button className="btn" type="button" onClick={() => void submitMemory()} disabled={saving || !text.trim()}>
                {saving ? copy.running : copy.save}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {supersedeTarget ? (
        <Modal title={copy.supersedeMemory} onClose={() => setSupersedeTarget(null)}>
          <div className="form-grid">
            <label className="field span-all">
              <span>{copy.memoryText}</span>
              <textarea value={supersedeText} onChange={event => setSupersedeText(event.target.value)} rows={6} />
            </label>
            <label className="field">
              <span>{copy.source}</span>
              <input value={source} onChange={event => setSource(event.target.value)} />
            </label>
            <Property label="id" value={textOf(supersedeTarget.localEventId || supersedeTarget.id, '-')} />
            {error ? <div className="inline-error span-all">{error}</div> : null}
            <div className="form-actions span-all">
              <button className="btn ghost" type="button" onClick={() => setSupersedeTarget(null)}>
                {copy.cancel}
              </button>
              <button className="btn" type="button" onClick={() => void supersedeMemory()} disabled={saving || !supersedeText.trim()}>
                {saving ? copy.running : copy.supersedeMemory}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
*/

// Old TasksPanel commented out - using new component from TasksPanel.tsx
/*
function TasksPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const [projectFilter, setProjectFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [query, setQuery] = useState('')
  const [newTask, setNewTask] = useState({ title: '', project: 'ai-memory-hub', priority: 'normal', description: '', handoff: '' })
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const projectOptions = useMemo(() => uniqueSorted(model.tasks.map(task => textOf(task.project)).filter(Boolean)), [model.tasks])
  const formProjectOptions = useMemo(() => uniqueSorted([
    ...model.visibleProjects.map(project => textOf(project.id || project.name || project.displayName)).filter(Boolean),
    ...projectOptions
  ]), [model.visibleProjects, projectOptions])
  const priorityOptions = useMemo(() => uniqueSorted(model.tasks.map(task => textOf(task.priority)).filter(Boolean)), [model.tasks])
  const cleanQuery = query.trim().toLowerCase()
  const activeProjectFilter = projectOptions.includes(projectFilter) ? projectFilter : ''
  const activePriorityFilter = priorityOptions.includes(priorityFilter) ? priorityFilter : ''

  const filteredTasks = model.tasks.filter(task => {
    if (activeProjectFilter && textOf(task.project) !== activeProjectFilter) return false
    if (activePriorityFilter && textOf(task.priority) !== activePriorityFilter) return false
    if (!cleanQuery) return true
    return [
      task.title,
      task.description,
      task.handoff,
      task.assignee,
      task.createdBy,
      task.status,
      task.project
    ].some(value => textOf(value).toLowerCase().includes(cleanQuery))
  })
  const columns = {
    open: filteredTasks.filter(task => textOf(task.status, 'open') === 'open'),
    active: filteredTasks.filter(task => ['claimed', 'in_progress', 'blocked'].includes(textOf(task.status))),
    verification: filteredTasks.filter(task => textOf(task.status) === 'needs_verification'),
    completed: filteredTasks.filter(task => ['done', 'cancelled'].includes(textOf(task.status)))
  }

  const mutateTask = async (action: string, path: string, body: AnyRecord) => {
    setBusy(action)
    setError('')
    try {
      await apiPost<AnyRecord>(path, body)
      await onRefresh()
      return true
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
      return false
    } finally {
      setBusy('')
    }
  }

  const submitTask = async () => {
    const title = newTask.title.trim()
    if (!title) return
    const succeeded = await mutateTask('add-task', '/api/task/add', {
      ...newTask,
      title,
      from: 'dashboard-next'
    })
    if (succeeded) {
      setNewTask({ title: '', project: newTask.project, priority: 'normal', description: '', handoff: '' })
      setCreateOpen(false)
    }
  }

  return (
    <div className="stack">
      <Panel title={copy.recentTasks}>
        <div className="section-actions">
          <button className="btn" type="button" onClick={() => { setError(''); setCreateOpen(true) }}>
            {copy.addTask}
          </button>
        </div>
        <div className="filter-strip">
          <label className="field">
            <span>{copy.searchText}</span>
            <input value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <FilterSelect label={copy.project} value={activeProjectFilter} onChange={setProjectFilter} allLabel={copy.allProjects} options={projectOptions} />
          <FilterSelect label={copy.priority} value={activePriorityFilter} onChange={setPriorityFilter} allLabel={copy.allPriorities} options={priorityOptions} />
          <button className="btn ghost" type="button" onClick={() => { setQuery(''); setProjectFilter(''); setPriorityFilter('') }}>
            {copy.clear}
          </button>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="kanban-grid kanban-grid-4">
          <TaskColumn title={copy.open} count={columns.open.length} tasks={columns.open} copy={copy} busy={busy} onMutate={mutateTask} />
          <TaskColumn title={copy.active} count={columns.active.length} tasks={columns.active} copy={copy} busy={busy} onMutate={mutateTask} />
          <TaskColumn title={copy.needsVerification} count={columns.verification.length} tasks={columns.verification} copy={copy} busy={busy} onMutate={mutateTask} />
          <TaskColumn title={copy.completed} count={columns.completed.length} tasks={columns.completed} copy={copy} busy={busy} onMutate={mutateTask} />
        </div>
      </Panel>
      {createOpen ? (
        <Modal title={copy.addTask} onClose={() => setCreateOpen(false)}>
          <div className="form-grid task-form-grid">
            <label className="field span-2">
              <span>{copy.title}</span>
              <input value={newTask.title} onChange={event => setNewTask(value => ({ ...value, title: event.target.value }))} />
            </label>
            <label className="field">
              <span>{copy.project}</span>
              <input value={newTask.project} onChange={event => setNewTask(value => ({ ...value, project: event.target.value }))} list="task-project-options" />
            </label>
            <label className="field">
              <span>{copy.priority}</span>
              <select value={newTask.priority} onChange={event => setNewTask(value => ({ ...value, priority: event.target.value }))}>
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
            </label>
            <label className="field span-2">
              <span>{copy.description}</span>
              <textarea value={newTask.description} onChange={event => setNewTask(value => ({ ...value, description: event.target.value }))} rows={3} />
            </label>
            <label className="field span-2">
              <span>{copy.handoff}</span>
              <textarea value={newTask.handoff} onChange={event => setNewTask(value => ({ ...value, handoff: event.target.value }))} rows={3} />
            </label>
            <datalist id="task-project-options">
              {formProjectOptions.map(project => <option value={project} key={project} />)}
            </datalist>
            {error ? <div className="inline-error span-all">{error}</div> : null}
            <div className="form-actions span-all">
              <button className="btn ghost" type="button" onClick={() => setCreateOpen(false)}>
                {copy.cancel}
              </button>
              <button className="btn" type="button" onClick={() => void submitTask()} disabled={busy === 'add-task' || !newTask.title.trim()}>
                {busy === 'add-task' ? copy.running : copy.addTask}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
*/

/*
type TaskMutator = (action: string, path: string, body: AnyRecord) => Promise<boolean>
type TaskMenuAction = {
  key: string
  label: string
  disabled?: boolean
  onSelect: () => void
}
*/

// Old Task-related components commented out
/*
function TaskColumn({ title, count, tasks, copy, busy, onMutate }: {
  title: string
  count: number
  tasks: AnyRecord[]
  copy: Copy
  busy: string
  onMutate: TaskMutator
}) {
  return (
    <section className="kanban-column">
      <header className="kanban-header">
        <h4>{title}</h4>
        <span className="count-pill">{formatNumber(count)}</span>
      </header>
      <div className="kanban-list">
        {tasks.length ? tasks.map(task => (
          <TaskCard key={textOf(task.id)} task={task} copy={copy} busy={busy} onMutate={onMutate} />
        )) : <EmptyState text={copy.noData} />}
      </div>
    </section>
  )
}

function TaskCard({ task, copy, busy, onMutate }: { task: AnyRecord; copy: Copy; busy: string; onMutate: TaskMutator }) {
  const [note, setNote] = useState('')
  const [issueReportOpen, setIssueReportOpen] = useState(false)
  const [issueNote, setIssueNote] = useState('')
  const [shouldReopen, setShouldReopen] = useState(true)
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false)
  const [purgeConfirmText, setPurgeConfirmText] = useState('')
  const id = textOf(task.id)
  const status = textOf(task.status, 'open')
  const actionBase = `${id}:`
  const isBusy = busy.startsWith(actionBase)
  const notes = asArray<AnyRecord>(task.notes).slice(-3)

  const setStatus = async (nextStatus: string, fallbackNote = '') => {
    const nextNote = note.trim() || fallbackNote
    const succeeded = await onMutate(`${actionBase}${nextStatus}`, '/api/task/status', {
      id,
      status: nextStatus,
      by: 'dashboard-next',
      note: nextNote
    })
    if (succeeded) setNote('')
  }

  const review = async (decision: 'approved' | 'rejected') => {
    await onMutate(`${actionBase}${decision}`, '/api/task/review', {
      id,
      decision,
      by: 'dashboard-next',
      note: note.trim()
    })
    setNote('')
  }

  const sendRadioRequest = async () => {
    const taskTitle = textOf(task.title, id)
    const message = note.trim() || `Task request: ${taskTitle}`
    const succeeded = await onMutate(`${actionBase}radio-request`, '/api/radio/send', {
      from: 'dashboard-next',
      to: textOf(task.assignee, 'all') || 'all',
      type: 'request',
      project: textOf(task.project),
      thread: id,
      replyTo: id,
      text: message
    })
    if (succeeded) setNote('')
  }

  const reportIssue = () => {
    setIssueNote('')
    setShouldReopen(true)
    setIssueReportOpen(true)
  }

  const submitIssueReport = async () => {
    const succeeded = await onMutate(
      `${actionBase}report-issue`,
      '/api/task/review',
      {
        id,
        decision: 'rejected',
        by: 'dashboard-next',
        note: issueNote.trim() || 'Issue reported',
        reopen: shouldReopen
      }
    )
    if (succeeded) {
      setIssueReportOpen(false)
      setIssueNote('')
    }
  }

  const openPurgeConfirm = () => {
    setPurgeConfirmText('')
    setPurgeConfirmOpen(true)
  }

  const submitPurge = async () => {
    const taskTitle = textOf(task.title, '')
    if (purgeConfirmText !== taskTitle) {
      alert(copy.purgeWarning)
      return
    }
    const succeeded = await onMutate(
      `${actionBase}purge`,
      '/api/task/purge',
      {
        id,
        confirm: taskTitle
      }
    )
    if (succeeded) {
      setPurgeConfirmOpen(false)
      setPurgeConfirmText('')
    }
  }

  const secondaryActions: TaskMenuAction[] = [
    {
      key: 'note',
      label: copy.addNote,
      disabled: isBusy || !note.trim(),
      onSelect: () => void setStatus(status)
    },
    {
      key: 'radio-request',
      label: copy.sendRadioRequest,
      disabled: isBusy,
      onSelect: () => void sendRadioRequest()
    }
  ]

  // Add cancel option for active tasks (not already cancelled or done)
  if (!['cancelled', 'done'].includes(status)) {
    secondaryActions.push({
      key: 'cancel',
      label: copy.cancel,
      disabled: isBusy,
      onSelect: () => void setStatus('cancelled')
    })
  }

  if (status !== 'cancelled') {
    secondaryActions.push(
      {
        key: 'approved',
        label: copy.approve,
        disabled: isBusy,
        onSelect: () => void review('approved')
      },
      {
        key: 'rejected',
        label: copy.reject,
        disabled: isBusy,
        onSelect: () => void review('rejected')
      }
    )
  }

  return (
    <article className="task-card">
      <div className="task-card-top">
        <StatusBadge status={status} />
        <StatusBadge status={textOf(task.priority, 'normal')} />
      </div>
      <h4>{textOf(task.title, '-')}</h4>
      {task.description ? <p className="task-description">{textOf(task.description)}</p> : null}
      {task.handoff ? <p className="task-handoff"><strong>{copy.handoff}:</strong> {textOf(task.handoff)}</p> : null}
      <div className="task-meta-grid">
        <Property label={copy.project} value={textOf(task.project, '-')} />
        <Property label={copy.assignee} value={textOf(task.assignee || task.createdBy, '-')} />
        <Property label={copy.created} value={formatDate(textOf(task.createdAt))} />
        <Property label={copy.updated} value={formatDate(textOf(task.updatedAt || task.createdAt))} />
      </div>
      {task.reviewStatus ? (
        <div className="task-review">
          <strong>{copy.review}: {textOf(task.reviewStatus)}</strong>
          <span>{textOf(task.reviewedBy, '-')} · {formatDate(textOf(task.reviewedAt))}</span>
          {task.reviewNote ? <p>{textOf(task.reviewNote)}</p> : null}
        </div>
      ) : null}
      {notes.length ? (
        <div className="task-notes">
          <strong>{copy.notes}</strong>
          {notes.map((item, indexValue) => (
            <p key={`${textOf(item.ts)}-${indexValue}`}>
              <span>{textOf(item.by, '-')} · {formatDate(textOf(item.ts))}</span>
              {textOf(item.text, '-')}
            </p>
          ))}
        </div>
      ) : null}
      <label className="field note-field">
        <span>{copy.addNote}</span>
        <input value={note} onChange={event => setNote(event.target.value)} placeholder={copy.notePlaceholder} />
      </label>
      <div className="task-actions">
        {status === 'open' ? (
          <button className="btn small" type="button" disabled={isBusy} onClick={() => onMutate(`${actionBase}claim`, '/api/task/claim', { id, by: 'dashboard-next' })}>
            {copy.claim}
          </button>
        ) : null}
        {['claimed', 'blocked'].includes(status) ? (
          <button className="btn small" type="button" disabled={isBusy} onClick={() => void setStatus('in_progress')}>
            {status === 'blocked' ? copy.unblock : copy.start}
          </button>
        ) : null}
        {['claimed', 'in_progress'].includes(status) ? (
          <button className="btn small ghost" type="button" disabled={isBusy} onClick={() => void setStatus('blocked', 'Blocked from dashboard-next')}>
            {copy.block}
          </button>
        ) : null}
        {status === 'in_progress' ? (
          <>
            <button className="btn small" type="button" disabled={isBusy} onClick={() => void setStatus('done', 'Completed directly')}>
              {copy.completeDirectly}
            </button>
            <button className="btn small ghost" type="button" disabled={isBusy} onClick={() => void setStatus('needs_verification', 'Requested verification')}>
              {copy.requestVerification}
            </button>
          </>
        ) : null}
        {status === 'needs_verification' ? (
          <>
            <button className="btn small" type="button" disabled={isBusy} onClick={() => void review('approved')}>
              {copy.approveAndComplete}
            </button>
            <button className="btn small ghost" type="button" disabled={isBusy} onClick={() => reportIssue()}>
              {copy.reportIssue}
            </button>
          </>
        ) : null}
        {status === 'done' ? (
          <>
            <button className="btn small ghost" type="button" disabled={isBusy} onClick={() => void setStatus('open')}>
              {copy.reopen}
            </button>
            <button className="btn small ghost" type="button" disabled={isBusy} onClick={() => reportIssue()}>
              {copy.reportIssue}
            </button>
          </>
        ) : null}
        {status === 'cancelled' ? (
          <>
            <button className="btn small ghost" type="button" disabled={isBusy} onClick={() => void setStatus('open')}>
              {copy.reopen}
            </button>
            <button className="btn small danger" type="button" disabled={isBusy} onClick={() => openPurgeConfirm()}>
              {copy.purge}
            </button>
          </>
        ) : null}
        <TaskActionMenu label={copy.moreActions} actions={secondaryActions} />
      </div>
      {issueReportOpen ? (
        <Modal title={copy.reportIssue} onClose={() => setIssueReportOpen(false)}>
          <div className="form-grid">
            <label className="field span-all">
              <span>{copy.issueDescription}</span>
              <textarea
                value={issueNote}
                onChange={e => setIssueNote(e.target.value)}
                rows={4}
                placeholder={copy.issueDescriptionPlaceholder}
              />
            </label>
            <label className="field checkbox-field span-all">
              <input
                type="checkbox"
                checked={shouldReopen}
                onChange={e => setShouldReopen(e.target.checked)}
              />
              <span>{copy.reopenTask}</span>
            </label>
            <div className="form-actions span-all">
              <button
                className="btn ghost"
                type="button"
                onClick={() => setIssueReportOpen(false)}
              >
                {copy.cancel}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => void submitIssueReport()}
                disabled={isBusy}
              >
                {isBusy ? copy.running : copy.save}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {purgeConfirmOpen ? (
        <Modal title={copy.purgeTask} onClose={() => setPurgeConfirmOpen(false)}>
          <div className="form-grid">
            <div className="field span-all">
              <p style={{ marginBottom: '1rem', color: 'var(--text-danger)' }}>
                ⚠️ {copy.purgeWarning}
              </p>
              <p style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>
                {textOf(task.title)}
              </p>
            </div>
            <label className="field span-all">
              <span>{copy.purgeConfirm}</span>
              <input
                type="text"
                value={purgeConfirmText}
                onChange={e => setPurgeConfirmText(e.target.value)}
                placeholder={textOf(task.title)}
              />
            </label>
            <div className="form-actions span-all">
              <button
                className="btn ghost"
                type="button"
                onClick={() => setPurgeConfirmOpen(false)}
              >
                {copy.cancel}
              </button>
              <button
                className="btn danger"
                type="button"
                onClick={() => void submitPurge()}
                disabled={isBusy || purgeConfirmText !== textOf(task.title)}
              >
                {isBusy ? copy.running : copy.purge}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </article>
  )
}

function TaskActionMenu({ label, actions }: { label: string; actions: TaskMenuAction[] }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="task-action-menu" ref={menuRef}>
      <button
        className="btn small ghost"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(value => !value)}
      >
        {label}
      </button>
      {open ? (
        <div className="task-action-menu-items" id={menuId} role="menu">
          {actions.map(action => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false)
                action.onSelect()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
*/

// Old RadioPanel commented out - using new component from RadioPanel.tsx
/*
function RadioPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const [form, setForm] = useState({ text: '', from: 'dashboard-next', to: 'all', type: 'note', project: 'ai-memory-hub', thread: '', replyTo: '' })
  const [query, setQuery] = useState('')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const senderOptions = useMemo(() => uniqueSorted(model.radio.map(message => textOf(message.from)).filter(Boolean)), [model.radio])
  const recipientOptions = useMemo(() => uniqueSorted(model.radio.map(message => textOf(message.to)).filter(Boolean)), [model.radio])
  const typeOptions = useMemo(() => uniqueSorted(model.radio.map(message => textOf(message.type)).filter(Boolean)), [model.radio])
  const projectOptions = useMemo(() => uniqueSorted(model.radio.map(message => textOf(message.project)).filter(Boolean)), [model.radio])
  const formProjectOptions = useMemo(() => uniqueSorted([
    ...model.visibleProjects.map(project => textOf(project.id || project.name || project.displayName)).filter(Boolean),
    ...projectOptions
  ]), [model.visibleProjects, projectOptions])
  const cleanQuery = query.trim().toLowerCase()
  const activeFromFilter = senderOptions.includes(fromFilter) ? fromFilter : ''
  const activeToFilter = recipientOptions.includes(toFilter) ? toFilter : ''
  const activeTypeFilter = typeOptions.includes(typeFilter) ? typeFilter : ''
  const activeProjectFilter = projectOptions.includes(projectFilter) ? projectFilter : ''

  const filteredMessages = model.radio.filter(message => {
    if (activeFromFilter && textOf(message.from) !== activeFromFilter) return false
    if (activeToFilter && textOf(message.to) !== activeToFilter) return false
    if (activeTypeFilter && textOf(message.type) !== activeTypeFilter) return false
    if (activeProjectFilter && textOf(message.project) !== activeProjectFilter) return false
    if (!cleanQuery) return true
    return [message.text, message.thread, message.project, message.from, message.to, message.type]
      .some(value => textOf(value).toLowerCase().includes(cleanQuery))
  }).slice().reverse()

  const submitRadio = async () => {
    const text = form.text.trim()
    if (!text || busy) return
    setBusy('send')
    setError('')
    try {
      await apiPost<AnyRecord>('/api/radio/send', { ...form, text })
      setForm(value => ({ ...value, text: '', thread: '', replyTo: '' }))
      setComposeOpen(false)
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const promote = async (id: string) => {
    if (!id) return
    setBusy(`promote:${id}`)
    setError('')
    try {
      await apiPost<AnyRecord>('/api/radio/promote', { id })
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const startReply = (message: AnyRecord) => {
    setError('')
    setForm(value => ({
      ...value,
      text: '',
      to: textOf(message.from, 'all'),
      type: 'reply',
      project: textOf(message.project, value.project),
      thread: textOf(message.thread || message.id),
      replyTo: textOf(message.id)
    }))
    setComposeOpen(true)
  }

  return (
    <div className="stack">
      <Panel title={copy.recentRadio}>
        <div className="section-actions">
          <button className="btn" type="button" onClick={() => { setError(''); setComposeOpen(true) }}>
            {copy.broadcastMessage}
          </button>
        </div>
        <div className="filter-strip">
          <label className="field">
            <span>{copy.searchText}</span>
            <input value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <FilterSelect label={copy.from} value={activeFromFilter} onChange={setFromFilter} allLabel={copy.allSenders} options={senderOptions} />
          <FilterSelect label={copy.to} value={activeToFilter} onChange={setToFilter} allLabel={copy.allRecipients} options={recipientOptions} />
          <FilterSelect label={copy.type} value={activeTypeFilter} onChange={setTypeFilter} allLabel={copy.allTypes} options={typeOptions} />
          <FilterSelect label={copy.project} value={activeProjectFilter} onChange={setProjectFilter} allLabel={copy.allProjects} options={projectOptions} />
          <button className="btn ghost" type="button" onClick={() => { setQuery(''); setFromFilter(''); setToFilter(''); setTypeFilter(''); setProjectFilter('') }}>
            {copy.clear}
          </button>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="radio-stream">
          {filteredMessages.length ? filteredMessages.map(message => (
            <article className="radio-card" key={textOf(message.id) || `${textOf(message.ts)}-${textOf(message.from)}`}>
              <div className="radio-card-header">
                <div className="message-meta">
                  <StatusBadge status={textOf(message.type, 'note')} />
                  <span>{textOf(message.from, '-')} {'->'} {textOf(message.to, '-')}</span>
                </div>
                <span className="muted-text">{formatDate(textOf(message.ts || message.createdAt))}</span>
              </div>
              <p>{textOf(message.text, '-')}</p>
              <div className="radio-card-footer">
                <span className="chip">{textOf(message.project, '-')}</span>
                {message.thread ? <span className="chip">{textOf(message.thread)}</span> : null}
                <button className="btn small ghost" type="button" onClick={() => startReply(message)}>
                  {copy.reply}
                </button>
                <button className="btn small ghost" type="button" disabled={busy === `promote:${textOf(message.id)}`} onClick={() => void promote(textOf(message.id))}>
                  {copy.promoteToMemory}
                </button>
              </div>
            </article>
          )) : <EmptyState text={copy.noData} />}
        </div>
      </Panel>
      {composeOpen ? (
        <Modal title={copy.broadcastMessage} onClose={() => setComposeOpen(false)}>
          <div className="form-grid">
            <label className="field span-all">
              <span>{copy.message}</span>
              <textarea value={form.text} onChange={event => setForm(value => ({ ...value, text: event.target.value }))} rows={4} />
            </label>
            <label className="field">
              <span>{copy.from}</span>
              <input value={form.from} onChange={event => setForm(value => ({ ...value, from: event.target.value }))} />
            </label>
            <label className="field">
              <span>{copy.to}</span>
              <input value={form.to} onChange={event => setForm(value => ({ ...value, to: event.target.value }))} list="radio-recipient-options" />
            </label>
            <label className="field">
              <span>{copy.type}</span>
              <select value={form.type} onChange={event => setForm(value => ({ ...value, type: event.target.value }))}>
                <option value="note">note</option>
                <option value="reply">reply</option>
                <option value="review">review</option>
                <option value="handoff">handoff</option>
                <option value="risk">risk</option>
                <option value="request">request</option>
                <option value="done">done</option>
              </select>
            </label>
            <label className="field">
              <span>{copy.project}</span>
              <input value={form.project} onChange={event => setForm(value => ({ ...value, project: event.target.value }))} list="radio-project-options" />
            </label>
            {form.thread || form.replyTo ? (
              <div className="property-grid span-all">
                <Property label={copy.thread} value={form.thread || '-'} />
                <Property label={copy.replyTo} value={form.replyTo || '-'} />
              </div>
            ) : null}
            <datalist id="radio-recipient-options">
              {recipientOptions.map(to => <option value={to} key={to} />)}
            </datalist>
            <datalist id="radio-project-options">
              {formProjectOptions.map(project => <option value={project} key={project} />)}
            </datalist>
            {error ? <div className="inline-error span-all">{error}</div> : null}
            <div className="form-actions span-all">
              <button className="btn ghost" type="button" onClick={() => setComposeOpen(false)}>
                {copy.cancel}
              </button>
              <button className="btn" type="button" onClick={() => void submitRadio()} disabled={busy === 'send' || !form.text.trim()}>
                {busy === 'send' ? copy.running : copy.broadcastMessage}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
*/

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
    <div className="dispatch-summary-line"><span><strong>{formatNumber(model.relay.length)}</strong> 活跃调度</span><span><strong>{formatNumber(model.dispatchLogs.length)}</strong> 运行记录</span><span className="dispatch-summary-note">调度只处理当前待处理事项</span></div>
    <Panel title={copy.triggerDispatch} className="dispatch-control-panel">
      <div className="dispatch-control-intro"><div><strong>自动派发</strong><p>选择本次最多处理的数量和目标模型，执行结果会出现在运行记录中。</p></div><span className={force ? 'dispatch-risk-badge active' : 'dispatch-risk-badge'}>{force ? '强制执行已开启' : '普通模式'}</span></div>
      <div className="dispatch-control-grid">
        <label className="field"><span>{copy.limit}</span><input type="number" min={1} max={50} value={limit} onChange={event => setLimit(Number(event.target.value) || 10)} /></label>
        <label className="field"><span>{copy.model}</span><input type="text" list="amh-model-options" value={modelName} onChange={event => setModelName(event.target.value)} placeholder={copy.modelPlaceholder} /><datalist id="amh-model-options">{modelOptions.map(option => <option key={option} value={option} />)}</datalist></label>
        <label className="dispatch-force-toggle"><input type="checkbox" checked={force} onChange={event => setForce(event.target.checked)} /><span><strong>强制执行</strong><small>跳过常规条件，仅在确认风险后使用</small></span></label>
        <button className="btn dispatch-trigger-button" type="button" onClick={() => void trigger()} disabled={busy}>{busy ? copy.running : copy.triggerDispatch}</button>
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
    </Panel>
    <div className="dispatch-section-heading"><div><h3>运行队列</h3><p>当前工具和项目的派发状态</p></div></div>
    <Panel title={copy.dispatchThreads} className="dispatch-queue-panel"><div className="stack">{model.relay.length ? model.relay.map(entry => <div className="dispatch-card" key={textOf(entry.id || entry.threadKey || entry.sourceId)}><div className="dispatch-card-header"><div><strong>{textOf(entry.tool, '-')}</strong><span>{textOf(entry.project, '-')}</span></div><StatusBadge status={textOf(entry.state, 'pending')} /></div><p>{textOf(entry.threadKey || entry.thread || entry.sourceId, '-')}</p>{entry.progressPercent !== undefined && entry.progressPercent !== null ? <div className="progress-line"><span style={{ width: `${Math.min(100, Math.max(0, numberOf(entry.progressPercent)))}%` }} /></div> : null}{entry.progressStatus ? <p>{textOf(entry.progressStatus)}</p> : null}{entry.lastError ? <p className="error-text">{textOf(entry.lastError)}</p> : null}<span className="muted-text">{formatDate(textOf(entry.ts || entry.progressAt || entry.deliveryUpdatedAt))}</span></div>) : <EmptyState text={copy.noData} />}</div></Panel>
    <Panel title={copy.dispatchLogs} className="dispatch-history-panel"><DataTable emptyText={copy.noData} columns={[copy.status, copy.to, copy.project, copy.message]} rows={model.dispatchLogs.slice(0, 30).map(log => [<StatusBadge status={textOf(log.runStatus || log.status || log.exitCode, 'log')} />, textOf(log.tool, '-'), textOf(log.project, '-'), textOf(log.message || log.text || log.error || log.lastError, '-')])} /></Panel>
  </div>
}
/* OLD workflow helpers - commented out, kept for reference
const workflowStatusOptions = ['open', 'planned', 'in_progress', 'review', 'blocked', 'done', 'cancelled']
const workflowPriorityOptions = ['low', 'normal', 'high', 'urgent']

interface WorkflowFormState {
  id: string
  title: string
  by: string
  project: string
  priority: string
  status: string
  planner: string
  executor: string
  reviewer: string
  observer: string
  plan: string
  acceptance: string
  risks: string
}

type WorkflowEntryAction = 'result' | 'review' | 'note' | 'signal' | 'delete'

interface WorkflowActionState {
  action: WorkflowEntryAction
  workflow: AnyRecord
}
*/

/* OLD WorkflowsPanel - replaced by NewWorkflowsPanel component
function WorkflowsPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const workflows = model.workflows
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<WorkflowFormState>(() => createWorkflowForm())
  const [actionState, setActionState] = useState<WorkflowActionState | null>(null)
  const [actionText, setActionText] = useState('')
  const [signalTo, setSignalTo] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const projectOptions = useMemo(() => uniqueSorted(workflows.map(workflow => textOf(workflow.project)).filter(Boolean)), [workflows])
  const formProjectOptions = useMemo(() => uniqueSorted([
    ...model.visibleProjects.map(project => textOf(project.id || project.name || project.displayName)).filter(Boolean),
    ...projectOptions,
    ...model.tasks.map(task => textOf(task.project)).filter(Boolean)
  ]), [model.tasks, model.visibleProjects, projectOptions])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredWorkflows = workflows.filter(workflow => {
    if (statusFilter !== 'all' && textOf(workflow.status, 'open') !== statusFilter) return false
    if (projectFilter !== 'all' && textOf(workflow.project) !== projectFilter) return false
    return !normalizedQuery || getWorkflowSearchText(workflow).includes(normalizedQuery)
  })

  const stageCounts = workflowStatusOptions.map(status => ({
    status,
    count: workflows.filter(workflow => textOf(workflow.status, 'open') === status).length
  }))

  const defaultProject = projectFilter !== 'all'
    ? projectFilter
    : formProjectOptions[0] || textOf(workflows[0]?.project, 'default')

  const openWorkflowForm = (workflow?: AnyRecord) => {
    setError('')
    setForm(createWorkflowForm(workflow, defaultProject))
    setFormOpen(true)
  }

  const updateFormField = (field: keyof WorkflowFormState, value: string) => {
    setForm(current => ({ ...current, [field]: value }))
  }

  const saveWorkflow = async () => {
    if (!form.title.trim()) {
      setError(`${copy.workflowTitle} ${copy.missing}`)
      return
    }
    setBusy('save')
    setError('')
    const body = {
      title: form.title.trim(),
      by: form.by.trim() || 'dashboard',
      from: form.by.trim() || 'dashboard',
      project: form.project.trim() || 'default',
      priority: form.priority || 'normal',
      status: form.status || 'open',
      planner: form.planner,
      executor: form.executor,
      reviewer: form.reviewer,
      observer: form.observer,
      plan: form.plan,
      acceptance: form.acceptance,
      risks: form.risks
    }
    try {
      if (form.id) {
        await apiPatch<AnyRecord>(`/api/workflows/${encodeURIComponent(form.id)}`, body)
      } else {
        await apiPost<AnyRecord>('/api/workflows', body)
      }
      setFormOpen(false)
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const setWorkflowStatus = async (workflow: AnyRecord, status: string) => {
    const id = textOf(workflow.id)
    if (!id) return
    setBusy(`status:${id}:${status}`)
    setError('')
    try {
      await apiPost<AnyRecord>(`/api/workflows/${encodeURIComponent(id)}/status`, { status, by: 'dashboard' })
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const openWorkflowAction = (workflow: AnyRecord, action: WorkflowEntryAction) => {
    setError('')
    setActionText('')
    setSignalTo(action === 'signal' ? getWorkflowRoleValues(workflow, 'reviewer')[0] || getWorkflowRoleValues(workflow, 'executor')[0] || 'all' : '')
    setActionState({ workflow, action })
  }

  const submitWorkflowAction = async () => {
    if (!actionState) return
    const id = textOf(actionState.workflow.id)
    if (!id) return
    setBusy(`action:${id}:${actionState.action}`)
    setError('')
    try {
      if (actionState.action === 'delete') {
        await apiDelete<AnyRecord>(`/api/workflows/${encodeURIComponent(id)}`, { by: 'dashboard' })
      } else if (actionState.action === 'signal') {
        if (!signalTo.trim() || !actionText.trim()) {
          setError(`${copy.signalTo} / ${copy.actionText} ${copy.missing}`)
          return
        }
        await apiPost<AnyRecord>(`/api/workflows/${encodeURIComponent(id)}/signal`, {
          to: signalTo.trim(),
          text: actionText.trim(),
          type: 'handoff',
          by: 'dashboard'
        })
      } else {
        if (!actionText.trim()) {
          setError(`${copy.actionText} ${copy.missing}`)
          return
        }
        await apiPost<AnyRecord>(`/api/workflows/${encodeURIComponent(id)}/${actionState.action}`, {
          text: actionText.trim(),
          role: actionState.action === 'review' ? 'reviewer' : actionState.action === 'result' ? 'executor' : '',
          by: 'dashboard'
        })
      }
      setActionState(null)
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="stack">
      <div className="dashboard-grid">
        <MetricCard label={copy.workflowTotal} value={formatNumber(workflows.length)} />
        <MetricCard label={copy.workflowActive} value={formatNumber(workflows.filter(workflow => ['open', 'planned', 'in_progress'].includes(textOf(workflow.status, 'open'))).length)} tone="success" />
        <MetricCard label={copy.workflowReview} value={formatNumber(workflows.filter(workflow => textOf(workflow.status) === 'review').length)} tone="warning" />
        <MetricCard label={copy.workflowBlocked} value={formatNumber(workflows.filter(workflow => textOf(workflow.status) === 'blocked').length)} />
      </div>

      <Panel title={copy.workflows}>
        <div className="section-actions">
          <button className="btn" type="button" onClick={() => openWorkflowForm()}>
            {copy.createWorkflow}
          </button>
        </div>
        <div className="workflow-stage-strip">
          <button className={`chip button-chip ${statusFilter === 'all' ? 'active' : ''}`} type="button" onClick={() => setStatusFilter('all')}>
            {copy.allStatuses} {formatNumber(workflows.length)}
          </button>
          {stageCounts.map(item => (
            <button className={`chip button-chip ${statusFilter === item.status ? 'active' : ''}`} type="button" key={item.status} onClick={() => setStatusFilter(item.status)}>
              {item.status} {formatNumber(item.count)}
            </button>
          ))}
        </div>
        <div className="form-grid workflow-filter-grid">
          <label className="field span-2">
            <span>{copy.searchText}</span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} />
          </label>
          <label className="field">
            <span>{copy.status}</span>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="all">{copy.allStatuses}</option>
              {workflowStatusOptions.map(status => <option value={status} key={status}>{status}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{copy.project}</span>
            <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}>
              <option value="all">{copy.allProjects}</option>
              {projectOptions.map(project => <option value={project} key={project}>{project}</option>)}
            </select>
          </label>
          <div className="form-actions">
            <button className="btn ghost" type="button" onClick={() => { setQuery(''); setStatusFilter('all'); setProjectFilter('all') }}>
              {copy.clear}
            </button>
          </div>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="workflow-list">
          {filteredWorkflows.length ? filteredWorkflows.map(workflow => (
            <WorkflowCard
              busy={busy}
              copy={copy}
              key={textOf(workflow.id)}
              workflow={workflow}
              onAction={openWorkflowAction}
              onEdit={openWorkflowForm}
              onStatus={setWorkflowStatus}
            />
          )) : <EmptyState text={workflows.length ? copy.noMatches : copy.noData} />}
        </div>
      </Panel>

      {formOpen ? (
        <Modal title={form.id ? copy.editWorkflow : copy.createWorkflow} onClose={() => setFormOpen(false)}>
          <div className="form-grid task-form-grid">
            <label className="field span-2">
              <span>{copy.workflowTitle}</span>
              <input value={form.title} onChange={event => updateFormField('title', event.target.value)} />
            </label>
            <label className="field">
              <span>{copy.createdBy}</span>
              <input value={form.by} onChange={event => updateFormField('by', event.target.value)} />
            </label>
            <label className="field">
              <span>{copy.project}</span>
              <input value={form.project} onChange={event => updateFormField('project', event.target.value)} list="workflow-project-options" />
            </label>
            <label className="field">
              <span>{copy.priority}</span>
              <select value={form.priority} onChange={event => updateFormField('priority', event.target.value)}>
                {workflowPriorityOptions.map(priority => <option value={priority} key={priority}>{priority}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{copy.status}</span>
              <select value={form.status} onChange={event => updateFormField('status', event.target.value)}>
                {workflowStatusOptions.map(status => <option value={status} key={status}>{status}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{copy.planner}</span>
              <input value={form.planner} onChange={event => updateFormField('planner', event.target.value)} />
            </label>
            <label className="field">
              <span>{copy.executor}</span>
              <input value={form.executor} onChange={event => updateFormField('executor', event.target.value)} />
            </label>
            <label className="field">
              <span>{copy.reviewer}</span>
              <input value={form.reviewer} onChange={event => updateFormField('reviewer', event.target.value)} />
            </label>
            <label className="field">
              <span>{copy.observer}</span>
              <input value={form.observer} onChange={event => updateFormField('observer', event.target.value)} />
            </label>
            <label className="field span-2">
              <span>{copy.workflowPlan}</span>
              <textarea value={form.plan} onChange={event => updateFormField('plan', event.target.value)} />
            </label>
            <label className="field span-2">
              <span>{copy.workflowAcceptance}</span>
              <textarea value={form.acceptance} onChange={event => updateFormField('acceptance', event.target.value)} />
            </label>
            <label className="field span-all">
              <span>{copy.workflowRisks}</span>
              <textarea value={form.risks} onChange={event => updateFormField('risks', event.target.value)} />
            </label>
            <datalist id="workflow-project-options">
              {formProjectOptions.map(project => <option value={project} key={project} />)}
            </datalist>
            {error ? <div className="inline-error span-all">{error}</div> : null}
            <div className="form-actions span-all">
              <button className="btn ghost" type="button" onClick={() => setFormOpen(false)}>
                {copy.cancel}
              </button>
              <button className="btn" type="button" disabled={busy === 'save'} onClick={() => void saveWorkflow()}>
                {busy === 'save' ? copy.running : copy.save}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {actionState ? (
        <Modal title={getWorkflowActionTitle(actionState.action, copy)} onClose={() => setActionState(null)}>
          <div className="form-grid">
            <div className="workflow-action-summary span-all">
              <StatusBadge status={textOf(actionState.workflow.status, 'open')} />
              <strong>{textOf(actionState.workflow.title, '-')}</strong>
              <span>{textOf(actionState.workflow.project, '-')}</span>
            </div>
            {actionState.action === 'delete' ? (
              <p className="task-description span-all">{copy.confirmDeleteWorkflow}</p>
            ) : null}
            {actionState.action === 'signal' ? (
              <label className="field span-all">
                <span>{copy.signalTo}</span>
                <input value={signalTo} onChange={event => setSignalTo(event.target.value)} />
              </label>
            ) : null}
            {actionState.action !== 'delete' ? (
              <label className="field span-all">
                <span>{copy.actionText}</span>
                <textarea value={actionText} onChange={event => setActionText(event.target.value)} />
              </label>
            ) : null}
            {error ? <div className="inline-error span-all">{error}</div> : null}
            <div className="form-actions span-all">
              <button className="btn ghost" type="button" onClick={() => setActionState(null)}>
                {copy.cancel}
              </button>
              <button className={`btn ${actionState.action === 'delete' ? 'danger' : ''}`} type="button" disabled={Boolean(busy)} onClick={() => void submitWorkflowAction()}>
                {busy ? copy.running : getWorkflowActionTitle(actionState.action, copy)}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function WorkflowCard({
  busy,
  copy,
  workflow,
  onAction,
  onEdit,
  onStatus
}: {
  busy: string
  copy: Copy
  workflow: AnyRecord
  onAction: (workflow: AnyRecord, action: WorkflowEntryAction) => void
  onEdit: (workflow: AnyRecord) => void
  onStatus: (workflow: AnyRecord, status: string) => Promise<void>
}) {
  const status = textOf(workflow.status, 'open')
  const priority = textOf(workflow.priority, 'normal')
  const roles = [
    [copy.planner, getWorkflowRoleValues(workflow, 'planner')],
    [copy.executor, getWorkflowRoleValues(workflow, 'executor')],
    [copy.reviewer, getWorkflowRoleValues(workflow, 'reviewer')],
    [copy.observer, getWorkflowRoleValues(workflow, 'observer')]
  ].filter(([, values]) => Array.isArray(values) && values.length > 0) as Array<[string, string[]]>
  const logs = collectWorkflowLogs(workflow, copy).slice(0, 8)
  const linkedItems = [
    ...asArray<string>(workflow.linkedTasks).map(item => `task:${item}`),
    ...asArray<string>(workflow.linkedRadio).map(item => `radio:${item}`)
  ]
  const canStart = !['in_progress', 'review', 'done', 'cancelled'].includes(status)
  const canReview = !['review', 'done', 'cancelled'].includes(status)
  const canDone = !['done', 'cancelled'].includes(status)
  const disabled = Boolean(busy)

  return (
    <article className="workflow-card">
      <header className="workflow-card-header">
        <div className="workflow-title-block">
          <h4>{textOf(workflow.title, '-')}</h4>
          <p>
            {copy.project}: {textOf(workflow.project, '-')} · {copy.priority}: {priority} · {copy.createdBy}: {textOf(workflow.createdBy, '-')}
          </p>
          <p>{copy.updated}: {formatDate(textOf(workflow.updatedAt || workflow.createdAt))}</p>
        </div>
        <div className="workflow-badges">
          <StatusBadge status={status} />
          <StatusBadge status={priority} />
        </div>
      </header>

      {roles.length ? (
        <div className="chip-list">
          {roles.map(([label, values]) => <span className="chip" key={label}>{label}: {values.join(', ')}</span>)}
        </div>
      ) : null}

      <WorkflowTextBlock label={copy.workflowPlan} value={workflow.plan} />
      <WorkflowTextBlock label={copy.workflowAcceptance} value={workflow.acceptance} />
      <WorkflowTextBlock label={copy.workflowRisks} value={workflow.risks} />

      {linkedItems.length ? (
        <div className="workflow-linked">
          <span>{copy.linkedItems}</span>
          <div className="chip-list">
            {linkedItems.map(item => <span className="chip" key={item}>{item}</span>)}
          </div>
        </div>
      ) : null}

      <details className="workflow-details">
        <summary>{copy.workflowLogs}</summary>
        <div className="task-notes">
          {logs.length ? logs.map((entry, indexValue) => (
            <p key={`${entry.type}-${entry.ts}-${indexValue}`}>
              <span>{[entry.type, entry.role, entry.by, formatDate(entry.ts)].filter(Boolean).join(' · ')}</span>
              <span>{entry.text}</span>
            </p>
          )) : <span>{copy.noData}</span>}
        </div>
      </details>

      <div className="workflow-actions">
        {canStart ? (
          <button className="btn small" type="button" disabled={disabled} onClick={() => void onStatus(workflow, 'in_progress')}>
            {copy.startWorkflow}
          </button>
        ) : null}
        {canReview ? (
          <button className="btn small ghost" type="button" disabled={disabled} onClick={() => void onStatus(workflow, 'review')}>
            {copy.markReview}
          </button>
        ) : null}
        {canDone ? (
          <button className="btn small" type="button" disabled={disabled} onClick={() => void onStatus(workflow, 'done')}>
            {copy.markDone}
          </button>
        ) : null}
        <button className="btn small ghost" type="button" disabled={disabled} onClick={() => onEdit(workflow)}>
          {copy.editWorkflow}
        </button>
        <button className="btn small ghost" type="button" disabled={disabled} onClick={() => onAction(workflow, 'result')}>
          {copy.workflowResult}
        </button>
        <button className="btn small ghost" type="button" disabled={disabled} onClick={() => onAction(workflow, 'review')}>
          {copy.workflowReview}
        </button>
        <button className="btn small ghost" type="button" disabled={disabled} onClick={() => onAction(workflow, 'note')}>
          {copy.workflowNote}
        </button>
        <button className="btn small ghost" type="button" disabled={disabled} onClick={() => onAction(workflow, 'signal')}>
          {copy.workflowSignal}
        </button>
        <button className="btn small danger" type="button" disabled={disabled} onClick={() => onAction(workflow, 'delete')}>
          {copy.deleteWorkflow}
        </button>
      </div>
    </article>
  )
}

function WorkflowTextBlock({ label, value }: { label: string; value: unknown }) {
  const text = Array.isArray(value)
    ? value.map(item => textOf(item)).filter(Boolean).join('\n')
    : textOf(value).trim()
  if (!text) return null
  return (
    <div className="workflow-text-block">
      <strong>{label}</strong>
      <p>{text}</p>
    </div>
  )
}

function createWorkflowForm(workflow?: AnyRecord, defaultProject = 'default'): WorkflowFormState {
  return {
    id: textOf(workflow?.id),
    title: textOf(workflow?.title),
    by: textOf(workflow?.createdBy, 'dashboard'),
    project: textOf(workflow?.project, defaultProject),
    priority: textOf(workflow?.priority, 'normal'),
    status: textOf(workflow?.status, 'open'),
    planner: getWorkflowRoleValues(workflow, 'planner').join(', '),
    executor: getWorkflowRoleValues(workflow, 'executor').join(', '),
    reviewer: getWorkflowRoleValues(workflow, 'reviewer').join(', '),
    observer: getWorkflowRoleValues(workflow, 'observer').join(', '),
    plan: textOf(workflow?.plan),
    acceptance: textOf(workflow?.acceptance),
    risks: Array.isArray(workflow?.risks)
      ? workflow.risks.map(item => textOf(item)).filter(Boolean).join('\n')
      : textOf(workflow?.risks)
  }
}

function getWorkflowActionTitle(action: WorkflowEntryAction, copy: Copy): string {
  if (action === 'result') return copy.workflowResult
  if (action === 'review') return copy.workflowReview
  if (action === 'note') return copy.workflowNote
  if (action === 'signal') return copy.workflowSignal
  return copy.confirmDelete
}

function getWorkflowRoleValues(workflow: AnyRecord | undefined, role: string): string[] {
  const value = workflow?.[role]
  if (Array.isArray(value)) {
    return value.map(item => textOf(item).trim()).filter(Boolean)
  }
  return textOf(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function getWorkflowSearchText(workflow: AnyRecord): string {
  const logs = ['results', 'reviews', 'notes']
    .flatMap(field => asArray<AnyRecord>(workflow[field]))
    .map(item => [item.by, item.from, item.role, item.text].map(value => textOf(value)).filter(Boolean).join(' '))
  return [
    workflow.id,
    workflow.title,
    workflow.project,
    workflow.status,
    workflow.priority,
    workflow.createdBy,
    workflow.plan,
    workflow.acceptance,
    summarizeRoles(workflow),
    ...asArray<string>(workflow.risks),
    ...logs
  ].map(value => textOf(value)).filter(Boolean).join(' ').toLowerCase()
}

function collectWorkflowLogs(workflow: AnyRecord, copy: Copy): Array<{ type: string; ts: string; by: string; role: string; text: string }> {
  const normalizeEntries = (items: unknown, type: string) => asArray<AnyRecord>(items)
    .map(item => ({
      type,
      ts: textOf(item.ts || item.createdAt || item.updatedAt),
      by: textOf(item.by || item.from),
      role: textOf(item.role),
      text: textOf(item.text)
    }))
    .filter(item => item.text || item.by || item.role)
  return [
    ...normalizeEntries(workflow.results, copy.workflowResult),
    ...normalizeEntries(workflow.reviews, copy.workflowReview),
    ...normalizeEntries(workflow.notes, copy.workflowNote)
  ].sort((left, right) => right.ts.localeCompare(left.ts))
}

/* ========== END OF OLD WorkflowsPanel ========== */

function AnalyticsPanel({ copy, model }: { copy: Copy; model: ViewModel }) {
  const statusTasks = asRecord(model.status.tasks)
  const relayStatus = asRecord(model.status.relay)
  const toolSummary = asRecord(model.status.toolSummary)
  const backupRetention = asRecord(model.backups.retention)
  const taskStatus = countValues(model.tasks.map(task => textOf(task.status, 'open')))
  const radioTypes = countValues(model.radio.map(message => textOf(message.type, 'note')))
  const projectCounts = countValues([
    ...model.tasks.map(task => textOf(task.project)),
    ...model.radio.map(message => textOf(message.project)),
    ...model.workflows.map(workflow => textOf(workflow.project))
  ], 10)
  const relayCounts = ['pending', 'dispatched', 'acked', 'progress', 'retrying', 'failed', 'completed', 'abandoned']
    .map(key => ({ key, count: numberOf(relayStatus[key]) }))
    .filter(item => item.count > 0)

  return (
    <div className="stack">
      <div className="dashboard-summary-line"><span><strong>{formatNumber(statusTasks.total)}</strong>{copy.totalTasks}</span><span><strong>{formatNumber(statusTasks.active)}</strong>{copy.activeTasks}</span><span><strong>{textOf(asRecord(model.metrics.relay).successRate, '0%')}</strong>{copy.relayRate}</span><span><strong>{formatNumber(toolSummary.runnable)}</strong>{copy.toolsReady}</span><span><strong>{formatNumber(model.backups.count ?? model.status.backups)}</strong>{copy.backupSets}</span></div>
      <div className="panel-grid two">
        <Panel title={copy.tasksByStatus}>
          <BarList items={taskStatus} emptyText={copy.noData} />
        </Panel>
        <Panel title={copy.radioByType}>
          <BarList items={radioTypes} emptyText={copy.noData} />
        </Panel>
        <Panel title={copy.relayByState}>
          <BarList items={relayCounts} emptyText={copy.noData} />
        </Panel>
        <Panel title={copy.topProjects}>
          <BarList items={projectCounts} emptyText={copy.noData} />
        </Panel>
        <Panel title={copy.toolAutomation}>
          <div className="property-grid">
            <Property label={copy.installed} value={formatNumber(toolSummary.detected)} />
            <Property label={copy.configured} value={formatNumber(toolSummary.configured)} />
            <Property label={copy.runnable} value={formatNumber(toolSummary.runnable)} />
            <Property label={copy.missing} value={formatNumber(toolSummary.missing)} />
          </div>
        </Panel>
        <Panel title={copy.backupStorage}>
          <div className="property-grid">
            <Property label={copy.retained} value={formatNumber(backupRetention.keep)} />
            <Property label={copy.pruneCandidates} value={formatNumber(backupRetention.prune)} />
            <Property label={copy.storageUsed} value={textOf(model.backups.totalDisplay, '-')} />
            <Property label={copy.backupSets} value={formatNumber(model.backups.count ?? model.status.backups)} />
          </div>
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
          <button className="btn ghost" type="button" onClick={() => void loadBackups()} disabled={Boolean(busy)}>
            {busy === 'load' ? copy.running : copy.refresh}
          </button>
          <button className="btn" type="button" onClick={() => { setError(''); setCreateOpen(true) }}>
            {copy.createBackup}
          </button>
        </div>
        <div className="property-grid settings-grid">
          <Property label={copy.daily} value={formatNumber(policy.daily)} />
          <Property label={copy.weekly} value={formatNumber(policy.weekly)} />
          <Property label={copy.preSync} value={formatNumber(policy.preSync)} />
          <Property label={copy.pruneCandidates} value={textOf(retention.pruneDisplay, '-')} />
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
      </Panel>
      <Panel title={copy.githubBackup}>
        <div className="notice">
          <strong>{copy.githubWarning}</strong>
          <span>{githubForm.remoteUrl ? textOf(githubForm.remoteUrl) : copy.githubNoRemote}</span>
        </div>
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
            <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void loadGitHubStatus()}>
              {busy === 'github:load' ? copy.refreshing : copy.refresh}
            </button>
            <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void saveGitHubConfig()}>
              {busy === 'github:save' ? copy.running : copy.githubSave}
            </button>
            <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void runGitHubBackup('dry-run')}>
              {busy === 'github:dry-run' ? copy.running : copy.githubDryRun}
            </button>
            <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => void runGitHubBackup('local')}>
              {busy === 'github:local' ? copy.running : copy.githubLocalRun}
            </button>
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
            {boolOf(githubResult.wouldBlockPush) ? <div className="notice error"><strong>{copy.githubWouldBlock}</strong></div> : null}
            {githubWarnings.length ? (
              <div className="notice">
                <strong>{copy.warnings}</strong>
                {githubWarnings.map((warning, indexValue) => <span key={`${warning}-${indexValue}`}>{warning}</span>)}
              </div>
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
                    <button className="btn small ghost" type="button" disabled={busy === `detail:${name}`} onClick={() => void inspectBackup(name)}>
                      {copy.inspectBackup}
                    </button>
                    <button className="btn small ghost" type="button" disabled={busy === `restore:${name}`} onClick={() => void previewRestore(name)}>
                      {copy.previewRestore}
                    </button>
                  </div>
                </article>
              )
            }) : <EmptyState text={copy.noData} />}
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
            <EmptyState text={activeBackupName ? copy.previewRestore : copy.noData} />
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
      {createOpen ? (
        <Modal title={copy.createBackup} onClose={() => setCreateOpen(false)}>
          <div className="form-grid">
            <label className="field span-all">
              <span>{copy.backupReason}</span>
              <input value={reason} onChange={event => setReason(event.target.value)} />
            </label>
            {error ? <div className="inline-error span-all">{error}</div> : null}
            <div className="form-actions span-all">
              <button className="btn ghost" type="button" onClick={() => setCreateOpen(false)}>
                {copy.cancel}
              </button>
              <button className="btn" type="button" disabled={busy === 'create'} onClick={() => void createBackup()}>
                {busy === 'create' ? copy.running : copy.createBackup}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
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
      <div className="search-command-row"><div className="search-main-input"><input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} aria-label={copy.searchText} /></div><select value={type} onChange={event => setType(event.target.value)} aria-label={copy.type}><option value="all">{copy.allTypes}</option><option value="memory">memory</option><option value="task">task</option><option value="radio">radio</option><option value="workflow">workflow</option></select><select value={range} onChange={event => setRange(event.target.value)} aria-label={copy.range}><option value="all">{copy.allRanges}</option><option value="24h">{copy.last24h}</option><option value="7d">{copy.last7d}</option><option value="30d">{copy.last30d}</option><option value="90d">{copy.last90d}</option></select><select value={sort} onChange={event => setSort(event.target.value)} aria-label={copy.sort}><option value="relevance">{copy.relevance}</option><option value="newest">{copy.newest}</option><option value="oldest">{copy.oldest}</option></select><button className="btn" type="button" onClick={() => void runSearch()} disabled={loading}>{loading ? copy.running : copy.globalSearch}</button></div>
      <div className="search-command-footer"><span>{query ? `“${query}”` : '搜索全部记忆、任务、消息和工作流'}</span><button className="btn ghost small" type="button" onClick={clearSearch}>{copy.clear}</button></div>
      {error ? <div className="inline-error">{error}</div> : null}
    </Panel>
    <div className="search-result-summary"><span><strong>{formatNumber(payload?.count)}</strong>{copy.resultCount}</span><span><strong>{formatNumber(payload?.elapsedMs)} ms</strong>{copy.elapsed}</span><span><strong>{type === 'all' ? copy.allTypes : type}</strong>{copy.type}</span><span><strong>{tag || '—'}</strong>{copy.tags}</span></div>
    <div className="search-content-grid"><Panel title={copy.facets} className="search-facets-panel"><div className="search-facet-group"><h4>{copy.type}</h4><div className="chip-list">{types.map(item => <button className={`chip button-chip ${type === textOf(item.key) ? 'active' : ''}`} type="button" key={textOf(item.key)} onClick={() => { setType(textOf(item.key, 'all')); void runSearch({ type: textOf(item.key, 'all') }) }}>{textOf(item.label || item.key)} {formatNumber(item.count)}</button>)}</div></div><div className="search-facet-group"><h4>{copy.tags}</h4><div className="chip-list">{tags.length ? tags.slice(0, 24).map(item => <button className={`chip button-chip ${tag === textOf(item.key) ? 'active' : ''}`} type="button" key={textOf(item.key)} onClick={() => { setTag(textOf(item.key)); void runSearch({ tag: textOf(item.key) }) }}>{textOf(item.key)} {formatNumber(item.count)}</button>) : <EmptyState text={copy.noData} />}</div></div><div className="search-facet-group"><h4>{copy.project}</h4><div className="chip-list">{projects.length ? projects.slice(0, 16).map(item => <span className="chip" key={textOf(item.key)}>{textOf(item.key)} {formatNumber(item.count)}</span>) : <EmptyState text={copy.noData} />}</div></div></Panel><Panel title={copy.results} className="search-results-panel"><div className="search-results">{results.length ? results.map((result, indexValue) => { const meta = asRecord(result.meta); const title = textOf(result.title, '-'); return <article className="search-result-card" role="button" tabIndex={0} key={`${textOf(result.kind)}-${textOf(meta.id)}-${indexValue}`} onClick={() => setSelectedResult(result)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setSelectedResult(result) }}><div className="search-result-header"><StatusBadge status={textOf(result.kind, 'result')} /><strong>{title}</strong><span>{formatDate(textOf(result.ts))}</span></div><p>{textOf(result.preview || result.text, '-')}</p><div className="chip-list">{textOf(meta.project) ? <span className="chip">{textOf(meta.project)}</span> : null}{asArray<string>(result.tags).slice(0, 6).map(item => <span className="chip" key={item}>{item}</span>)}<span className="chip">{copy.score}: {formatNumber(result.score)}</span></div></article> }) : <EmptyState text={copy.noData} />}</div></Panel></div>
    {selectedResult ? <Modal title={textOf(selectedResult.title, copy.results)} onClose={() => setSelectedResult(null)}><div className="search-result-detail"><div className="chip-list"><StatusBadge status={textOf(selectedResult.kind, 'result')} /><span>{formatDate(textOf(selectedResult.ts))}</span></div><p className="search-result-detail-text">{textOf(selectedResult.text || selectedResult.preview, '-')}</p><Property label={copy.project} value={textOf(asRecord(selectedResult.meta).project, '-')} /><Property label={copy.score} value={formatNumber(selectedResult.score)} /></div></Modal> : null}
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

  const openToolModal = async (tool: AnyRecord) => {
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
      await openToolModal(selectedTool)
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
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void refreshTools(true)}>
            {busy === 'tools-refresh' ? copy.running : copy.refreshTools}
          </button>
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void detectTools()}>
            {busy === 'detect' ? copy.running : copy.detectTools}
          </button>
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void refreshCapabilities()}>
            {busy === 'capabilities' ? copy.running : copy.refreshCapabilities}
          </button>
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
            <button className="btn ghost" type="button" onClick={() => { setQuery(''); setStatusFilter('all') }}>
              {copy.clear}
            </button>
          </div>
        </div>
        <div className="property-grid settings-grid tool-capability-summary">
          <Property label={copy.directCli} value={formatNumber(capabilities.directCliProfiles)} />
          <Property label={copy.autoDispatchLabel} value={formatNumber(capabilities.autoDispatch)} />
          <Property label={copy.sharedState} value={formatNumber(capabilities.sharedState)} />
          <Property label={copy.capabilitySummary} value={formatNumber(capabilities.total)} />
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
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
                        <button className="btn small ghost" type="button" onClick={() => void openToolModal(tool)}>
                          {copy.manageConfig}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <EmptyState text={tools.length ? copy.noMatches : copy.noData} />}
        </div>
      </Panel>

      {selectedTool ? (
        <Modal title={`${copy.manageConfig}: ${textOf(selectedTool.name, '-')}`} onClose={() => setSelectedTool(null)}>
          <div className="stack">
            <div className="workflow-action-summary">
              <ToolIcon name={textOf(selectedTool.name)} kind={textOf(selectedTool.kind)} size={32} />
              <StatusBadge status={getToolStatus(selectedTool)} />
              <strong>{textOf(selectedTool.name, '-')}</strong>
              <span>{textOf(selectedTool.kind, '-')}</span>
            </div>
            <div className="property-grid">
              <Property label={copy.mode} value={textOf(selectedCapability.integrationMode, '-')} />
              <Property label={copy.runner} value={textOf(selectedTool.runnerProfile || selectedConfig.runnerCommandKind, '-')} />
              <Property label={copy.command} value={textOf(selectedTool.runnerCommand || selectedConfig.runnerCommand, '-')} />
              <Property label={copy.path} value={textOf(selectedTool.dir || selectedConfig.instructionFile, '-')} />
              <Property label={copy.capability} value={asArray<string>(selectedCapability.capabilities).join(', ') || '-'} />
              <Property label={copy.healthReasons} value={asArray<string>(selectedHealth.reasons).join(' · ') || '-'} />
              <Property label={copy.declaredModels} value={asArray<string>(asRecord(selectedTool.declared).models).join(', ') || '-'} />
              <Property label={copy.availableModels} value={asArray<string>(asRecord(selectedTool.models).all).slice(0, 12).join(', ') || '-'} />
              <Property label={copy.strengths} value={asArray<string>(asRecord(selectedTool.strengths).all).join(', ') || '-'} />
            </div>
            {lastInstallFile ? <div className="notice"><span>{copy.changed}: {lastInstallFile}</span></div> : null}
            {error ? <div className="inline-error">{error}</div> : null}
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
          </div>
        </Modal>
      ) : null}
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
        <button className="btn small" type="button" disabled={disabled || Boolean(busy)} onClick={onApply}>
          {busy.startsWith('install') ? copy.running : primaryLabel}
        </button>
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
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void refreshHealth()}>
            {busy === 'refresh' ? copy.refreshing : copy.refreshHealth}
          </button>
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void previewRepair()}>
            {busy === 'preview' ? copy.running : copy.previewRepair}
          </button>
          <button className="btn" type="button" disabled={Boolean(busy) || !hasRepairActions} onClick={() => setConfirmOpen(true)}>
            {copy.applyRepair}
          </button>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
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
        {repairPreview ? <RepairPlanSummary copy={copy} result={repairPreview} /> : <EmptyState text={copy.repairPreviewEmpty} />}
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

      {confirmOpen ? (
        <Modal title={copy.applyRepair} onClose={() => setConfirmOpen(false)}>
          <div className="stack">
            <p className="modal-copy">{copy.confirmRepair}</p>
            <RepairPlanSummary copy={copy} result={repairPreview} />
            {error ? <div className="inline-error">{error}</div> : null}
            <div className="form-actions">
              <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => setConfirmOpen(false)}>
                {copy.cancel}
              </button>
              <button className="btn" type="button" disabled={busy === 'apply'} onClick={() => void applyRepair()}>
                {busy === 'apply' ? copy.running : copy.confirmApply}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
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
          <Property label={copy.theme} value={textOf(dashboard.theme, '-')} />
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
            <h4>{copy.settingsSyncSection}</h4>
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
            <h4>{copy.settingsDashboardSection}</h4>
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
              <label className="field">
                <span>{copy.theme}</span>
                <select value={form.theme} onChange={event => updateForm('theme', event.target.value)}>
                  <option value="dark">{copy.darkMode}</option>
                  <option value="light">{copy.lightMode}</option>
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
            <h4>{copy.settingsBackupSection}</h4>
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
        {error ? <div className="inline-error">{error}</div> : null}
        {success ? <div className="notice success"><span>{success}</span></div> : null}
        <div className="form-actions settings-actions">
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void reloadSettings()}>
            {busy === 'reload' ? copy.refreshing : copy.refreshSettings}
          </button>
          <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => void saveSettings()}>
            {busy === 'save' ? copy.running : copy.saveSettings}
          </button>
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
    theme: ['dark', 'light'].includes(textOf(dashboard.theme)) ? textOf(dashboard.theme) : 'dark',
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
  if (!issues.length) return <EmptyState text={copy.noHealthIssues} />
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
  if (!suggestions.length) return <EmptyState text={copy.noHealthIssues} />
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
  if (!groups.length) return <EmptyState text={copy.noHealthExamples} />
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
  if (!records.length) return <EmptyState text={copy.noHealthExamples} />
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
  if (!items.length) return <EmptyState text={copy.noData} />
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

// Old FilterSelect commented out - using inline select elements in new components
/*
function FilterSelect({ label, value, onChange, allLabel, options }: {
  label: string
  value: string
  onChange: (value: string) => void
  allLabel: string
  options: string[]
}) {
  if (!options.length) return null

  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map(option => <option value={option} key={option}>{option}</option>)}
      </select>
    </label>
  )
}
*/

const focusableSelectors = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

function getModalFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(focusableSelectors))
    .filter(element => element.offsetParent !== null || element === document.activeElement)
}

function trapModalFocus(event: KeyboardEvent, panel: HTMLElement) {
  if (event.key !== 'Tab') return

  const focusable = getModalFocusableElements(panel)
  if (!focusable.length) {
    event.preventDefault()
    panel.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const panelRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'Tab' && panelRef.current) {
        trapModalFocus(event, panelRef.current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const first = getModalFocusableElements(panel)[0]
    ;(first || panel).focus()
  }, [])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button className="btn small ghost" type="button" onClick={onClose} aria-label={`Close ${title}`}>
            x
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  // Use NewPanel (shadcn/ui Card) for consistency
  return <NewPanel title={title} className={className}>{children}</NewPanel>
}

function DataTable({ columns, rows, emptyText }: { columns: string[]; rows: ReactNode[][]; emptyText: string }) {
  if (!rows.length) return <EmptyState text={emptyText} />
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
  if (!visibleItems.length) return <EmptyState text={emptyText} />
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

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>
}

/* OLD workflow helper - commented out
function summarizeRoles(workflow: AnyRecord): string {
  const roles = ['planner', 'executor', 'reviewer', 'observer']
    .flatMap(role => asArray<string>(workflow[role]).map(value => `${role}:${value}`))
  return roles.join(', ') || '-'
}
*/

function formatDate(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
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

/* OLD helper - commented out, used in component files now
function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right))
}
*/

function countValues(values: string[], limit = 8): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>()
  values
    .map(value => value.trim())
    .filter(Boolean)
    .forEach(value => counts.set(value, (counts.get(value) || 0) + 1))
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit)
}







