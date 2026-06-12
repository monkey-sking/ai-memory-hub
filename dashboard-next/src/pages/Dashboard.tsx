import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AnyRecord } from '../lib/api'
import { apiGet, apiPost, asArray, asRecord, boolOf, numberOf, textOf } from '../lib/api'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import './Dashboard.css'

export type DashboardSection =
  | 'overview'
  | 'memory'
  | 'tasks'
  | 'radio'
  | 'dispatch'
  | 'workflows'
  | 'tools'
  | 'projects'
  | 'health'
  | 'settings'

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
  tools?: AnyRecord
  settings?: AnyRecord
}

const titles: Record<Language, Record<DashboardSection, string>> = {
  zh: {
    overview: '概览',
    memory: '共享记忆',
    tasks: '任务',
    radio: 'Agent Radio',
    dispatch: '调度',
    workflows: '工作流',
    tools: '工具',
    projects: '项目',
    health: '健康',
    settings: '设置'
  },
  en: {
    overview: 'Overview',
    memory: 'Memory',
    tasks: 'Tasks',
    radio: 'Agent Radio',
    dispatch: 'Dispatch',
    workflows: 'Workflows',
    tools: 'Tools',
    projects: 'Projects',
    health: 'Health',
    settings: 'Settings'
  }
}

const subtitles: Record<Language, Record<DashboardSection, string>> = {
  zh: {
    overview: '本地多 Agent 协作状态',
    memory: 'MEMORY.md 快照与待同步事件',
    tasks: '共享任务队列和执行状态',
    radio: '跨工具消息与审核请求',
    dispatch: '自动派发、重试和运行记录',
    workflows: 'Planner / Executor / Reviewer 协作链路',
    tools: '工具接入、能力注册表和运行状态',
    projects: '项目注册表与可见项目',
    health: '记忆、存储和运行健康检查',
    settings: 'Dashboard 运行偏好'
  },
  en: {
    overview: 'Local multi-agent collaboration status',
    memory: 'MEMORY.md snapshot and pending events',
    tasks: 'Shared task queue and execution state',
    radio: 'Cross-tool messages and review requests',
    dispatch: 'Automation dispatch, retries, and run records',
    workflows: 'Planner / executor / reviewer coordination',
    tools: 'Tool connectivity, capabilities, and runner health',
    projects: 'Project registry and visible projects',
    health: 'Memory, storage, and runtime diagnostics',
    settings: 'Dashboard runtime preferences'
  }
}

const labels = {
  zh: {
    refresh: '刷新',
    refreshing: '刷新中',
    language: 'English',
    connectionError: '无法连接本地 hub',
    noData: '暂无数据',
    totalTasks: '任务总数',
    activeTasks: '活跃任务',
    workflows: '工作流',
    relayRate: 'Relay 成功率',
    toolsReady: '可自动执行工具',
    memoryRecords: '记忆记录',
    pendingEvents: '待同步事件',
    recentTasks: '最近任务',
    recentRadio: '最近消息',
    toolReadiness: '工具状态',
    recentFailures: '最近失败',
    status: '状态',
    project: '项目',
    owner: '负责人',
    title: '标题',
    updated: '更新时间',
    from: '来自',
    to: '发往',
    type: '类型',
    message: '内容',
    workflowTitle: '工作流',
    role: '角色',
    mode: '模式',
    health: '健康',
    installed: '已安装',
    runnable: '可执行',
    configured: '已配置',
    capability: '能力',
    visibleProjects: '可见项目',
    unregisteredProjects: '未注册引用',
    theme: '主题',
    autoRefresh: '自动刷新',
    notifications: '通知',
    refreshInterval: '刷新间隔',
    memorySnapshot: '记忆快照',
    profile: '用户配置',
    dispatchThreads: 'Relay 线程',
    dispatchLogs: '运行日志',
    settingsPanel: '运行偏好',
    yes: '是',
    no: '否',
    syncInbox: '同步 Inbox',
    rebuildSnapshot: '重建快照',
    running: '执行中',
    recordMemory: '记录记忆',
    memoryText: '记忆内容',
    kind: '类型',
    source: '来源',
    save: '保存',
    addTask: '新增任务',
    description: '描述',
    handoff: '交接',
    priority: '优先级',
    allProjects: '全部项目',
    allPriorities: '全部优先级',
    open: '待处理',
    active: '进行中',
    completed: '已完成',
    claim: '认领',
    start: '开始',
    block: '阻塞',
    unblock: '解除阻塞',
    complete: '完成',
    reopen: '重开',
    approve: '通过',
    reject: '拒绝',
    addNote: '添加备注',
    notePlaceholder: '备注或状态原因',
    broadcastMessage: '发送 Radio',
    searchText: '搜索文本',
    allSenders: '全部发送方',
    allRecipients: '全部接收方',
    allTypes: '全部类型',
    promoteToMemory: '提升为记忆',
    triggerDispatch: '立即触发调度',
    forceDispatch: '强制执行',
    limit: '数量',
    created: '创建时间',
    assignee: '执行人',
    notes: '备注',
    review: '审核',
    clear: '清空',
    cancel: '取消'
  },
  en: {
    refresh: 'Refresh',
    refreshing: 'Refreshing',
    language: '中文',
    connectionError: 'Local hub is unreachable',
    noData: 'No data',
    totalTasks: 'Total tasks',
    activeTasks: 'Active tasks',
    workflows: 'Workflows',
    relayRate: 'Relay success',
    toolsReady: 'Automated tools',
    memoryRecords: 'Memory records',
    pendingEvents: 'Pending events',
    recentTasks: 'Recent tasks',
    recentRadio: 'Recent radio',
    toolReadiness: 'Tool readiness',
    recentFailures: 'Recent failures',
    status: 'Status',
    project: 'Project',
    owner: 'Owner',
    title: 'Title',
    updated: 'Updated',
    from: 'From',
    to: 'To',
    type: 'Type',
    message: 'Message',
    workflowTitle: 'Workflow',
    role: 'Role',
    mode: 'Mode',
    health: 'Health',
    installed: 'Installed',
    runnable: 'Runnable',
    configured: 'Configured',
    capability: 'Capability',
    visibleProjects: 'Visible projects',
    unregisteredProjects: 'Unregistered refs',
    theme: 'Theme',
    autoRefresh: 'Auto refresh',
    notifications: 'Notifications',
    refreshInterval: 'Refresh interval',
    memorySnapshot: 'Memory snapshot',
    profile: 'Profile',
    dispatchThreads: 'Relay threads',
    dispatchLogs: 'Run logs',
    settingsPanel: 'Runtime preferences',
    yes: 'Yes',
    no: 'No',
    syncInbox: 'Sync Inbox',
    rebuildSnapshot: 'Rebuild Snapshot',
    running: 'Running',
    recordMemory: 'Record memory',
    memoryText: 'Memory text',
    kind: 'Kind',
    source: 'Source',
    save: 'Save',
    addTask: 'Add task',
    description: 'Description',
    handoff: 'Handoff',
    priority: 'Priority',
    allProjects: 'All projects',
    allPriorities: 'All priorities',
    open: 'Open',
    active: 'Active',
    completed: 'Completed',
    claim: 'Claim',
    start: 'Start',
    block: 'Block',
    unblock: 'Unblock',
    complete: 'Complete',
    reopen: 'Reopen',
    approve: 'Approve',
    reject: 'Reject',
    addNote: 'Add note',
    notePlaceholder: 'Note or status reason',
    broadcastMessage: 'Send radio',
    searchText: 'Search text',
    allSenders: 'All senders',
    allRecipients: 'All recipients',
    allTypes: 'All types',
    promoteToMemory: 'Promote to memory',
    triggerDispatch: 'Trigger dispatch',
    forceDispatch: 'Force run',
    limit: 'Limit',
    created: 'Created',
    assignee: 'Assignee',
    notes: 'Notes',
    review: 'Review',
    clear: 'Clear',
    cancel: 'Cancel'
  }
}

export default function Dashboard({ section }: DashboardProps) {
  const { language, toggleLanguage } = useOutletContext<AppOutletContext>()
  const [data, setData] = useState<DashboardSnapshot | null>(null)
  const [health, setHealth] = useState<AnyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')

  const copy = labels[language]
  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { snapshot, health: nextHealth } = await fetchDashboardData()
      setData(snapshot)
      setHealth(nextHealth)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [])

  const runHubAction = useCallback(async (path: string, action: string) => {
    setBusyAction(action)
    setError('')
    try {
      await apiPost<AnyRecord>(path, {})
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusyAction('')
    }
  }, [refresh])

  useEffect(() => {
    let active = true

    void fetchDashboardData()
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
  }, [])

  const viewModel = useMemo(() => buildViewModel(data), [data])

  return (
    <div className="dashboard-page">
      <header className="page-header">
        <div className="page-title-group">
          <p className="eyebrow">AI Memory Hub</p>
          <h2>{titles[language][section]}</h2>
          <p className="page-subtitle">{subtitles[language][section]}</p>
        </div>
        <div className="header-actions">
          <button className="btn ghost" type="button" onClick={() => void runHubAction('/api/pull', 'pull')} disabled={loading || Boolean(busyAction)}>
            {busyAction === 'pull' ? copy.running : copy.rebuildSnapshot}
          </button>
          <button className="btn ghost" type="button" onClick={() => void runHubAction('/api/sync', 'sync')} disabled={loading || Boolean(busyAction)}>
            {busyAction === 'sync' ? copy.running : copy.syncInbox}
          </button>
          <button className="btn ghost" type="button" onClick={toggleLanguage}>
            {copy.language}
          </button>
          <button className="btn" type="button" onClick={() => void refresh()} disabled={loading}>
            {loading ? copy.refreshing : copy.refresh}
          </button>
        </div>
      </header>

      {error ? (
        <section className="notice error">
          <strong>{copy.connectionError}</strong>
          <span>{error}</span>
        </section>
      ) : null}

      {loading && !data ? (
        <section className="notice">
          <span>{copy.refreshing}</span>
        </section>
      ) : (
        <>
          {section === 'overview' && <Overview copy={copy} model={viewModel} />}
          {section === 'memory' && <MemoryPanel copy={copy} model={viewModel} onRefresh={refresh} />}
          {section === 'tasks' && <TasksPanel copy={copy} model={viewModel} onRefresh={refresh} />}
          {section === 'radio' && <RadioPanel copy={copy} model={viewModel} onRefresh={refresh} />}
          {section === 'dispatch' && <DispatchPanel copy={copy} model={viewModel} onRefresh={refresh} />}
          {section === 'workflows' && <WorkflowsPanel copy={copy} model={viewModel} />}
          {section === 'tools' && <ToolsPanel copy={copy} model={viewModel} />}
          {section === 'projects' && <ProjectsPanel copy={copy} model={viewModel} />}
          {section === 'health' && <HealthPanel copy={copy} model={viewModel} health={health} />}
          {section === 'settings' && <SettingsPanel copy={copy} model={viewModel} />}
        </>
      )}
    </div>
  )
}

async function fetchDashboardData(): Promise<{ snapshot: DashboardSnapshot; health: AnyRecord | null }> {
  const [snapshot, health] = await Promise.all([
    apiGet<DashboardSnapshot>('/api/dashboard'),
    apiGet<AnyRecord>('/api/health').catch(() => null)
  ])
  return { snapshot, health }
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
    tools: asArray<AnyRecord>(tools.tools),
    toolSummary: asRecord(tools.summary),
    settings
  }
}

type ViewModel = ReturnType<typeof buildViewModel>
type Copy = typeof labels.zh

function Overview({ copy, model }: { copy: Copy; model: ViewModel }) {
  const statusTasks = asRecord(model.status.tasks)
  const statusWorkflows = asRecord(model.status.workflows)
  const index = asRecord(model.status.index)
  const relay = asRecord(model.metrics.relay)
  const capabilitySummary = asRecord(model.status.capabilitySummary)
  const recentFailures = asArray<AnyRecord>(model.metrics.recentFailures).slice(0, 4)

  return (
    <div className="dashboard-grid">
      <MetricCard label={copy.totalTasks} value={formatNumber(statusTasks.total)} />
      <MetricCard label={copy.activeTasks} value={formatNumber(statusTasks.active)} tone="success" />
      <MetricCard label={copy.workflows} value={formatNumber(statusWorkflows.total)} />
      <MetricCard label={copy.relayRate} value={textOf(relay.successRate, '0%')} tone="warning" />
      <MetricCard label={copy.toolsReady} value={formatNumber(capabilitySummary.autoDispatch)} />
      <MetricCard label={copy.memoryRecords} value={formatNumber(index.records)} />

      <Panel title={copy.recentTasks} className="span-2">
        <TaskList copy={copy} tasks={model.tasks.slice(0, 6)} />
      </Panel>
      <Panel title={copy.toolReadiness}>
        <ToolList copy={copy} tools={model.tools.slice(0, 7)} />
      </Panel>
      <Panel title={copy.recentRadio} className="span-2">
        <RadioList copy={copy} messages={model.radio.slice(-6).reverse()} />
      </Panel>
      <Panel title={copy.recentFailures}>
        {recentFailures.length ? (
          <div className="stack">
            {recentFailures.map((failure, indexValue) => (
              <div className="compact-row" key={`${textOf(failure.id)}-${indexValue}`}>
                <StatusBadge status="failed" />
                <span className="truncate">{textOf(failure.error, copy.noData)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text={copy.noData} />
        )}
      </Panel>
    </div>
  )
}

function MemoryPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const pending = asArray<AnyRecord>(model.memory.pending)
  const [text, setText] = useState('')
  const [kind, setKind] = useState('note')
  const [source, setSource] = useState('dashboard-next')
  const [recordOpen, setRecordOpen] = useState(false)
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
    </div>
  )
}

function TasksPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const [projectFilter, setProjectFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [query, setQuery] = useState('')
  const [newTask, setNewTask] = useState({ title: '', project: 'ai-memory-hub', priority: 'normal', description: '', handoff: '' })
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const projectOptions = useMemo(() => uniqueSorted([
    ...model.tasks.map(task => textOf(task.project)).filter(Boolean),
    ...model.visibleProjects.map(project => textOf(project.id || project.name)).filter(Boolean)
  ]), [model.tasks, model.visibleProjects])
  const priorityOptions = useMemo(() => uniqueSorted(model.tasks.map(task => textOf(task.priority)).filter(Boolean)), [model.tasks])
  const cleanQuery = query.trim().toLowerCase()
  const filteredTasks = model.tasks.filter(task => {
    if (projectFilter && textOf(task.project) !== projectFilter) return false
    if (priorityFilter && textOf(task.priority) !== priorityFilter) return false
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
          <label className="field">
            <span>{copy.project}</span>
            <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}>
              <option value="">{copy.allProjects}</option>
              {projectOptions.map(project => <option value={project} key={project}>{project}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{copy.priority}</span>
            <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}>
              <option value="">{copy.allPriorities}</option>
              {priorityOptions.map(priority => <option value={priority} key={priority}>{priority}</option>)}
            </select>
          </label>
          <button className="btn ghost" type="button" onClick={() => { setQuery(''); setProjectFilter(''); setPriorityFilter('') }}>
            {copy.clear}
          </button>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="kanban-grid">
          <TaskColumn title={copy.open} count={columns.open.length} tasks={columns.open} copy={copy} busy={busy} onMutate={mutateTask} />
          <TaskColumn title={copy.active} count={columns.active.length} tasks={columns.active} copy={copy} busy={busy} onMutate={mutateTask} />
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
              {projectOptions.map(project => <option value={project} key={project} />)}
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

type TaskMutator = (action: string, path: string, body: AnyRecord) => Promise<boolean>

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
        {['claimed', 'in_progress', 'blocked'].includes(status) ? (
          <button className="btn small" type="button" disabled={isBusy} onClick={() => void setStatus('done')}>
            {copy.complete}
          </button>
        ) : null}
        {['done', 'cancelled'].includes(status) ? (
          <button className="btn small ghost" type="button" disabled={isBusy} onClick={() => void setStatus('open')}>
            {copy.reopen}
          </button>
        ) : null}
        <button className="btn small ghost" type="button" disabled={isBusy || !note.trim()} onClick={() => void setStatus(status)}>
          {copy.addNote}
        </button>
        {status !== 'cancelled' ? (
          <>
            <button className="btn small ghost" type="button" disabled={isBusy} onClick={() => void review('approved')}>
              {copy.approve}
            </button>
            <button className="btn small ghost" type="button" disabled={isBusy} onClick={() => void review('rejected')}>
              {copy.reject}
            </button>
          </>
        ) : null}
      </div>
    </article>
  )
}

function RadioPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const [form, setForm] = useState({ text: '', from: 'dashboard-next', to: 'all', type: 'note', project: 'ai-memory-hub' })
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
  const projectOptions = useMemo(() => uniqueSorted([
    ...model.radio.map(message => textOf(message.project)).filter(Boolean),
    ...model.visibleProjects.map(project => textOf(project.id || project.name)).filter(Boolean)
  ]), [model.radio, model.visibleProjects])
  const cleanQuery = query.trim().toLowerCase()
  const filteredMessages = model.radio.filter(message => {
    if (fromFilter && textOf(message.from) !== fromFilter) return false
    if (toFilter && textOf(message.to) !== toFilter) return false
    if (typeFilter && textOf(message.type) !== typeFilter) return false
    if (projectFilter && textOf(message.project) !== projectFilter) return false
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
      setForm(value => ({ ...value, text: '' }))
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
          <label className="field">
            <span>{copy.from}</span>
            <select value={fromFilter} onChange={event => setFromFilter(event.target.value)}>
              <option value="">{copy.allSenders}</option>
              {senderOptions.map(sender => <option value={sender} key={sender}>{sender}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{copy.to}</span>
            <select value={toFilter} onChange={event => setToFilter(event.target.value)}>
              <option value="">{copy.allRecipients}</option>
              {recipientOptions.map(recipient => <option value={recipient} key={recipient}>{recipient}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{copy.type}</span>
            <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
              <option value="">{copy.allTypes}</option>
              {typeOptions.map(type => <option value={type} key={type}>{type}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{copy.project}</span>
            <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}>
              <option value="">{copy.allProjects}</option>
              {projectOptions.map(project => <option value={project} key={project}>{project}</option>)}
            </select>
          </label>
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
            <datalist id="radio-recipient-options">
              {recipientOptions.map(to => <option value={to} key={to} />)}
            </datalist>
            <datalist id="radio-project-options">
              {projectOptions.map(project => <option value={project} key={project} />)}
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

function DispatchPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const [force, setForce] = useState(false)
  const [limit, setLimit] = useState(10)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const trigger = async () => {
    setBusy(true)
    setError('')
    try {
      await apiPost<AnyRecord>('/api/dispatch/run', { force, limit })
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <Panel title={copy.triggerDispatch}>
        <div className="form-grid dispatch-control-grid">
          <label className="field checkbox-field">
            <input type="checkbox" checked={force} onChange={event => setForce(event.target.checked)} />
            <span>{copy.forceDispatch}</span>
          </label>
          <label className="field">
            <span>{copy.limit}</span>
            <input type="number" min={1} max={50} value={limit} onChange={event => setLimit(Number(event.target.value) || 10)} />
          </label>
          <div className="form-actions">
            <button className="btn" type="button" onClick={() => void trigger()} disabled={busy}>
              {busy ? copy.running : copy.triggerDispatch}
            </button>
          </div>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
      </Panel>
      <div className="panel-grid two">
        <Panel title={copy.dispatchThreads}>
          <div className="stack">
            {model.relay.length ? model.relay.map(entry => (
              <div className="dispatch-card" key={textOf(entry.id || entry.threadKey || entry.sourceId)}>
                <div className="dispatch-card-header">
                  <div>
                    <strong>{textOf(entry.tool, '-')}</strong>
                    <span>{textOf(entry.project, '-')}</span>
                  </div>
                  <StatusBadge status={textOf(entry.state, 'pending')} />
                </div>
                <p>{textOf(entry.threadKey || entry.thread || entry.sourceId, '-')}</p>
                {entry.progressPercent !== undefined && entry.progressPercent !== null ? (
                  <div className="progress-line">
                    <span style={{ width: `${Math.min(100, Math.max(0, numberOf(entry.progressPercent)))}%` }} />
                  </div>
                ) : null}
                {entry.progressStatus ? <p>{textOf(entry.progressStatus)}</p> : null}
                {entry.lastError ? <p className="error-text">{textOf(entry.lastError)}</p> : null}
                <span className="muted-text">{formatDate(textOf(entry.ts || entry.progressAt || entry.deliveryUpdatedAt))}</span>
              </div>
            )) : <EmptyState text={copy.noData} />}
          </div>
        </Panel>
        <Panel title={copy.dispatchLogs}>
          <DataTable
            emptyText={copy.noData}
            columns={[copy.status, copy.to, copy.project, copy.message]}
            rows={model.dispatchLogs.slice(0, 30).map(log => [
              <StatusBadge status={textOf(log.runStatus || log.status || log.exitCode, 'log')} />,
              textOf(log.tool, '-'),
              textOf(log.project, '-'),
              textOf(log.message || log.text || log.error || log.lastError, '-')
            ])}
          />
        </Panel>
      </div>
    </div>
  )
}

function WorkflowsPanel({ copy, model }: { copy: Copy; model: ViewModel }) {
  return (
    <Panel title={copy.workflows}>
      <DataTable
        emptyText={copy.noData}
        columns={[copy.status, copy.project, copy.workflowTitle, copy.role, copy.updated]}
        rows={model.workflows.map(workflow => [
          <StatusBadge status={textOf(workflow.status, 'open')} />,
          textOf(workflow.project, '-'),
          textOf(workflow.title, '-'),
          summarizeRoles(workflow),
          formatDate(textOf(workflow.updatedAt || workflow.createdAt))
        ])}
      />
    </Panel>
  )
}

function ToolsPanel({ copy, model }: { copy: Copy; model: ViewModel }) {
  if (!model.tools.length) {
    return (
      <Panel title={copy.toolReadiness}>
        <EmptyState text={copy.noData} />
      </Panel>
    )
  }

  return (
    <div className="tool-grid">
      {model.tools.map(tool => {
        const capability = asRecord(tool.capability)
        const runner = asRecord(tool.runner)
        const health = asRecord(tool.health)
        return (
          <section className="tool-card" key={textOf(tool.name)}>
            <div className="tool-card-header">
              <div>
                <h3>{textOf(tool.name, '-')}</h3>
                <p>{textOf(tool.kind, '-')}</p>
              </div>
              <StatusBadge status={textOf(health.status || tool.connectionStatus, 'missing')} />
            </div>
            <div className="property-grid">
              <Property label={copy.mode} value={textOf(capability.integrationMode, '-')} />
              <Property label={copy.installed} value={formatBool(boolOf(tool.installed), copy)} />
              <Property label={copy.configured} value={formatBool(boolOf(tool.configured), copy)} />
              <Property label={copy.runnable} value={formatBool(boolOf(tool.runnable || capability.autoDispatch), copy)} />
              <Property label={copy.capability} value={asArray<string>(capability.capabilities).join(', ') || textOf(runner.reason, '-')} />
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ProjectsPanel({ copy, model }: { copy: Copy; model: ViewModel }) {
  return (
    <div className="panel-grid two">
      <Panel title={copy.visibleProjects}>
        <DataTable
          emptyText={copy.noData}
          columns={[copy.status, copy.project, copy.title]}
          rows={model.visibleProjects.map(project => [
            <StatusBadge status={textOf(project.status, 'active')} />,
            textOf(project.id || project.name, '-'),
            textOf(project.displayName || project.description, '-')
          ])}
        />
      </Panel>
      <Panel title={copy.unregisteredProjects}>
        <div className="chip-list">
          {model.unregisteredProjects.length ? model.unregisteredProjects.map(project => (
            <span className="chip" key={project}>{project}</span>
          )) : <EmptyState text={copy.noData} />}
        </div>
      </Panel>
    </div>
  )
}

function HealthPanel({ copy, model, health }: { copy: Copy; model: ViewModel; health: AnyRecord | null }) {
  const issues = asArray<AnyRecord>(health?.issues)
  const recommendations = asArray<AnyRecord>(health?.recommendations || health?.actions)
  const daemon = asRecord(model.status.daemon)
  return (
    <div className="panel-grid two">
      <Panel title={copy.health}>
        <div className="property-grid">
          <Property label="Daemon" value={textOf(daemon.state, '-')} />
          <Property label="Memory" value={formatNumber(asRecord(model.status.index).records)} />
          <Property label="Radio" value={formatNumber(model.status.radioMessages)} />
          <Property label="Backups" value={formatNumber(model.status.backups)} />
        </div>
      </Panel>
      <Panel title="Issues">
        <IssueList items={issues.length ? issues : recommendations} emptyText={copy.noData} />
      </Panel>
    </div>
  )
}

function SettingsPanel({ copy, model }: { copy: Copy; model: ViewModel }) {
  const dashboard = asRecord(model.settings.dashboard)
  return (
    <Panel title={copy.settingsPanel}>
      <div className="property-grid settings-grid">
        <Property label={copy.theme} value={textOf(dashboard.theme, '-')} />
        <Property label={copy.autoRefresh} value={formatBool(boolOf(dashboard.autoRefresh), copy)} />
        <Property label={copy.notifications} value={formatBool(boolOf(dashboard.notifications), copy)} />
        <Property label={copy.refreshInterval} value={`${formatNumber(dashboard.refreshIntervalMs)} ms`} />
      </div>
    </Panel>
  )
}

function MetricCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warning' }) {
  return (
    <section className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  )
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
        <header className="modal-header">
          <h3>{title}</h3>
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
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  )
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

function TaskList({ copy, tasks }: { copy: Copy; tasks: AnyRecord[] }) {
  if (!tasks.length) return <EmptyState text={copy.noData} />
  return (
    <div className="stack">
      {tasks.map(task => (
        <div className="list-row" key={textOf(task.id)}>
          <StatusBadge status={textOf(task.status, 'open')} />
          <div className="list-row-main">
            <strong>{textOf(task.title, '-')}</strong>
            <span>{textOf(task.project, '-')} · {textOf(task.assignee || task.createdBy, '-')}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function RadioList({ copy, messages }: { copy: Copy; messages: AnyRecord[] }) {
  if (!messages.length) return <EmptyState text={copy.noData} />
  return (
    <div className="stack">
      {messages.map(message => (
        <div className="message-row" key={textOf(message.id)}>
          <div className="message-meta">
            <StatusBadge status={textOf(message.type, 'note')} />
            <span>{textOf(message.from)} {'->'} {textOf(message.to)}</span>
          </div>
          <p>{textOf(message.text, '-')}</p>
        </div>
      ))}
    </div>
  )
}

function ToolList({ copy, tools }: { copy: Copy; tools: AnyRecord[] }) {
  if (!tools.length) return <EmptyState text={copy.noData} />
  return (
    <div className="stack">
      {tools.map(tool => (
        <div className="compact-row" key={textOf(tool.name)}>
          <StatusBadge status={textOf(tool.connectionStatus, 'missing')} />
          <span className="truncate">{textOf(tool.name, '-')}</span>
        </div>
      ))}
    </div>
  )
}

function IssueList({ items, emptyText }: { items: AnyRecord[]; emptyText: string }) {
  if (!items.length) return <EmptyState text={emptyText} />
  return (
    <div className="stack">
      {items.slice(0, 8).map((item, indexValue) => (
        <div className="message-row" key={`${textOf(item.id || item.title)}-${indexValue}`}>
          <strong>{textOf(item.title || item.command || item.action, 'Issue')}</strong>
          <p>{textOf(item.description || item.message || item.reason || item.text, '-')}</p>
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
  const clean = status.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  return <span className={`status-badge ${clean}`}>{status || '-'}</span>
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>
}

function summarizeRoles(workflow: AnyRecord): string {
  const roles = ['planner', 'executor', 'reviewer', 'observer']
    .flatMap(role => asArray<string>(workflow[role]).map(value => `${role}:${value}`))
  return roles.join(', ') || '-'
}

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

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right))
}
