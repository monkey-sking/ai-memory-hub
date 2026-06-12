import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AnyRecord } from '../lib/api'
import { apiGet, asArray, asRecord, boolOf, numberOf, textOf } from '../lib/api'
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
    no: '否'
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
    no: 'No'
  }
}

export default function Dashboard({ section }: DashboardProps) {
  const { language, toggleLanguage } = useOutletContext<AppOutletContext>()
  const [data, setData] = useState<DashboardSnapshot | null>(null)
  const [health, setHealth] = useState<AnyRecord | null>(null)
  const [loading, setLoading] = useState(true)
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

      {section === 'overview' && <Overview copy={copy} model={viewModel} />}
      {section === 'memory' && <MemoryPanel copy={copy} model={viewModel} />}
      {section === 'tasks' && <TasksPanel copy={copy} model={viewModel} />}
      {section === 'radio' && <RadioPanel copy={copy} model={viewModel} />}
      {section === 'dispatch' && <DispatchPanel copy={copy} model={viewModel} />}
      {section === 'workflows' && <WorkflowsPanel copy={copy} model={viewModel} />}
      {section === 'tools' && <ToolsPanel copy={copy} model={viewModel} />}
      {section === 'projects' && <ProjectsPanel copy={copy} model={viewModel} />}
      {section === 'health' && <HealthPanel copy={copy} model={viewModel} health={health} />}
      {section === 'settings' && <SettingsPanel copy={copy} model={viewModel} />}
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

function MemoryPanel({ copy, model }: { copy: Copy; model: ViewModel }) {
  const pending = asArray<AnyRecord>(model.memory.pending)
  return (
    <div className="panel-grid two">
      <Panel title={copy.memorySnapshot}>
        <pre className="text-snapshot">{textOf(model.memory.memory, copy.noData)}</pre>
      </Panel>
      <div className="stack">
        <MetricCard label={copy.pendingEvents} value={formatNumber(pending.length)} tone="warning" />
        <Panel title={copy.profile}>
          <pre className="text-snapshot small">{textOf(model.memory.profile, copy.noData)}</pre>
        </Panel>
      </div>
    </div>
  )
}

function TasksPanel({ copy, model }: { copy: Copy; model: ViewModel }) {
  return (
    <Panel title={copy.recentTasks}>
      <DataTable
        emptyText={copy.noData}
        columns={[copy.status, copy.project, copy.owner, copy.title, copy.updated]}
        rows={model.tasks.map(task => [
          <StatusBadge status={textOf(task.status)} />,
          textOf(task.project, '-'),
          textOf(task.assignee || task.createdBy, '-'),
          textOf(task.title, '-'),
          formatDate(textOf(task.updatedAt || task.createdAt))
        ])}
      />
    </Panel>
  )
}

function RadioPanel({ copy, model }: { copy: Copy; model: ViewModel }) {
  return (
    <Panel title={copy.recentRadio}>
      <DataTable
        emptyText={copy.noData}
        columns={[copy.type, copy.from, copy.to, copy.project, copy.message]}
        rows={model.radio.slice().reverse().map(message => [
          <StatusBadge status={textOf(message.type, 'note')} />,
          textOf(message.from, '-'),
          textOf(message.to, '-'),
          textOf(message.project, '-'),
          textOf(message.text, '-')
        ])}
      />
    </Panel>
  )
}

function DispatchPanel({ copy, model }: { copy: Copy; model: ViewModel }) {
  return (
    <div className="panel-grid two">
      <Panel title={copy.dispatchThreads}>
        <DataTable
          emptyText={copy.noData}
          columns={[copy.status, copy.to, copy.project, copy.updated]}
          rows={model.relay.map(entry => [
            <StatusBadge status={textOf(entry.state, 'pending')} />,
            textOf(entry.tool, '-'),
            textOf(entry.project, '-'),
            formatDate(textOf(entry.ts || entry.deliveryUpdatedAt))
          ])}
        />
      </Panel>
      <Panel title={copy.dispatchLogs}>
        <DataTable
          emptyText={copy.noData}
          columns={[copy.type, copy.message]}
          rows={model.dispatchLogs.slice(0, 20).map(log => [
            textOf(log.type || log.level, 'log'),
            textOf(log.message || log.text || log.error, '-')
          ])}
        />
      </Panel>
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
