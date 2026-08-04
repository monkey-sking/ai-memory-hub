import { useMemo, useState } from 'react'
import { ChevronDown, LoaderCircle, Plus, Search, X } from 'lucide-react'
import { Card, CardContent, CardHeader } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import type { AnyRecord } from '@/lib/api'
import type { DashboardCopy } from '@/lib/dashboardCopy'

type WorkflowsCopy = Pick<DashboardCopy,
  | 'allProjects' | 'allStatuses' | 'clear' | 'createWorkflow' | 'executor' | 'linkedItems' | 'noData' | 'noMatches'
  | 'planner' | 'project' | 'reviewer' | 'running' | 'searchPlaceholder' | 'searchText' | 'status' | 'statusLabels'
  | 'updated' | 'viewExecutionGraph' | 'workflowActive' | 'workflowBlocked' | 'workflowReview' | 'workflowTotal' | 'workflows'
>

interface WorkflowNode {
  nodeId: string
  slug: string
  label: string
  role: string
  actor: string
  status: string
  note: string
  error: string
  isRequired: boolean
  isFinal: boolean
}

interface WorkflowsPanelProps {
  workflows: AnyRecord[]
  visibleProjects: AnyRecord[]
  copy: WorkflowsCopy
  onRefresh: () => Promise<void>
}

const workflowStatusOptions = ['open', 'planned', 'in_progress', 'review', 'blocked', 'done', 'cancelled']

function textOf(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function uniqueSorted(items: string[]): string[] {
  return Array.from(new Set(items)).sort()
}

function formatNumber(value: unknown): string {
  const number = Number(value)
  return Number.isNaN(number) ? String(value) : number.toLocaleString()
}

function formatDate(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function statusLabel(copy: WorkflowsCopy, status: string): string {
  return copy.statusLabels[status as keyof WorkflowsCopy['statusLabels']] || status
}

function linkedTaskIds(workflow: AnyRecord): string[] {
  const linked = Array.isArray(workflow.linkedTasks) ? workflow.linkedTasks : [workflow.linkedTasks, workflow.taskId]
  return linked.map(item => textOf(item).trim()).filter(Boolean)
}

export function WorkflowsPanel({ workflows, copy, onRefresh }: WorkflowsPanelProps) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [selectedWorkflow, setSelectedWorkflow] = useState<AnyRecord | null>(null)
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNode[]>([])
  const [loadingNodes, setLoadingNodes] = useState(false)
  const [nodeError, setNodeError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createForm, setCreateForm] = useState({ title: '', project: 'ai-memory-hub', planner: 'codex', executor: 'antigravity', reviewer: 'codex' })

  const projectOptions = useMemo(() => uniqueSorted(workflows.map(workflow => textOf(workflow.project)).filter(Boolean)), [workflows])
  const normalizedQuery = query.trim().toLowerCase()
  const filteredWorkflows = workflows.filter(workflow => {
    if (statusFilter !== 'all' && textOf(workflow.status, 'open') !== statusFilter) return false
    if (projectFilter !== 'all' && textOf(workflow.project) !== projectFilter) return false
    return !normalizedQuery || [workflow.title, workflow.description, workflow.plan, workflow.project, workflow.planner, workflow.executor, workflow.reviewer]
      .some(value => textOf(value).toLowerCase().includes(normalizedQuery))
  })
  const stageCounts = workflowStatusOptions.map(status => ({ status, count: workflows.filter(workflow => textOf(workflow.status, 'open') === status).length }))

  const createWorkflow = async () => {
    if (!createForm.title.trim() || createBusy) return
    setCreateBusy(true)
    setCreateError('')
    try {
      const response = await fetch('/api/workflows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...createForm, title: createForm.title.trim(), createdBy: 'dashboard-next', status: 'open' }) })
      if (!response.ok) throw new Error(await response.text())
      setCreateOpen(false)
      setCreateForm(current => ({ ...current, title: '' }))
      await onRefresh()
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error))
    } finally {
      setCreateBusy(false)
    }
  }
  const openWorkflowGraph = async (workflow: AnyRecord) => {
    setSelectedWorkflow(workflow)
    setWorkflowNodes([])
    setNodeError('')
    setLoadingNodes(true)
    try {
      const response = await fetch(`/api/workflows/${encodeURIComponent(textOf(workflow.id))}/nodes`)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const data = await response.json()
      setWorkflowNodes(Array.isArray(data.nodes) ? data.nodes : [])
    } catch (error) {
      setNodeError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoadingNodes(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="workflow-console-card">
        <CardHeader className="border-b workflow-console-header">
          <div className="workflow-list-header"><span className="workflow-result-count">{filteredWorkflows.length} 条工作流</span><Button onClick={() => { setCreateError(''); setCreateOpen(true) }}><Plus className="mr-2 h-4 w-4" />{copy.createWorkflow}</Button></div>        </CardHeader>
        <CardContent className="pt-6">
          <div className="workflow-stage-strip" role="tablist" aria-label={copy.status}>
            <Button className={`workflow-stage-item ${statusFilter === 'all' ? 'selected' : ''}`} variant="ghost" size="sm" onClick={() => setStatusFilter('all')}><span className="workflow-stage-dot" />{copy.allStatuses}<strong>{formatNumber(workflows.length)}</strong></Button>
            {stageCounts.map(item => <Button className={`workflow-stage-item ${item.status} ${statusFilter === item.status ? 'selected' : ''}`} key={item.status} variant="ghost" size="sm" onClick={() => setStatusFilter(item.status)}><span className="workflow-stage-dot" />{statusLabel(copy, item.status)}<strong>{formatNumber(item.count)}</strong></Button>)}
          </div>          <div className="workflow-filter-bar">
            <div className="workflow-search-field"><Search className="h-4 w-4" /><Input id="workflow-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} aria-label={copy.searchText} /></div>
            <div className="workflow-project-field"><Label htmlFor="workflow-project-filter">{copy.project}</Label><select id="workflow-project-filter" value={projectFilter} onChange={event => setProjectFilter(event.target.value)}><option value="all">{copy.allProjects}</option>{projectOptions.map(project => <option value={project} key={project}>{project}</option>)}</select></div>
            <Button variant="outline" onClick={() => { setQuery(''); setStatusFilter('all'); setProjectFilter('all') }}><X className="mr-2 h-4 w-4" />{copy.clear}</Button>
          </div>

          {filteredWorkflows.length ? <div className="workflow-card-grid workflow-list">{filteredWorkflows.map(workflow => <WorkflowCard key={textOf(workflow.id)} workflow={workflow} copy={copy} onOpenGraph={openWorkflowGraph} />)}</div> : <div className="py-8 text-center text-muted-foreground">{workflows.length ? copy.noMatches : copy.noData}</div>}
        </CardContent>
      </Card>

      {createOpen ? <Dialog open onOpenChange={open => { if (!open && !createBusy) setCreateOpen(false) }}><DialogContent className="workflow-create-dialog"><DialogHeader><DialogTitle>{copy.createWorkflow}</DialogTitle></DialogHeader><div className="workflow-create-form"><label><span>标题</span><input value={createForm.title} onChange={event => setCreateForm(current => ({ ...current, title: event.target.value }))} placeholder="输入工作流标题" /></label><label><span>{copy.project}</span><input value={createForm.project} onChange={event => setCreateForm(current => ({ ...current, project: event.target.value }))} /></label><div className="workflow-create-grid"><label><span>{copy.planner}</span><input value={createForm.planner} onChange={event => setCreateForm(current => ({ ...current, planner: event.target.value }))} /></label><label><span>{copy.executor}</span><input value={createForm.executor} onChange={event => setCreateForm(current => ({ ...current, executor: event.target.value }))} /></label><label><span>{copy.reviewer}</span><input value={createForm.reviewer} onChange={event => setCreateForm(current => ({ ...current, reviewer: event.target.value }))} /></label></div>{createError ? <div className="inline-error">{createError}</div> : null}</div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createBusy}>{copy.clear}</Button><Button onClick={() => void createWorkflow()} disabled={createBusy || !createForm.title.trim()}>{createBusy ? copy.running : copy.createWorkflow}</Button></DialogFooter></DialogContent></Dialog> : null}
      {selectedWorkflow ? <WorkflowGraphDialog workflow={selectedWorkflow} copy={copy} nodes={workflowNodes} loading={loadingNodes} error={nodeError} onClose={() => setSelectedWorkflow(null)} /> : null}
    </div>
  )
}

function WorkflowCard({ workflow, copy, onOpenGraph }: { workflow: AnyRecord; copy: WorkflowsCopy; onOpenGraph: (workflow: AnyRecord) => Promise<void> }) {
  const status = textOf(workflow.status, 'open')
  const title = textOf(workflow.title, '-')
  const project = textOf(workflow.project, '-')
  const description = textOf(workflow.description || workflow.plan || workflow.acceptance).trim()
  const roles = [[copy.planner, textOf(workflow.planner)], [copy.executor, textOf(workflow.executor)], [copy.reviewer, textOf(workflow.reviewer)]].filter(([, value]) => value) as Array<[string, string]>
  const linkedTasks = linkedTaskIds(workflow)

  return <article className="workflow-card workflow-card-clickable" role="button" tabIndex={0} onClick={event => { if (!(event.target as HTMLElement).closest('button, a, input, select')) void onOpenGraph(workflow) }} onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) void onOpenGraph(workflow) }}>
    <header className="workflow-card-header"><div className="workflow-title-block"><h3>{title}</h3><span className="workflow-project-chip">{project}</span></div><StatusBadge status={status} copy={copy} /></header>
    {description ? <p className="workflow-description">{description}</p> : null}
    {roles.length ? <dl className="workflow-role-list">{roles.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
    {linkedTasks.length ? <div className="workflow-linked"><span>{copy.linkedItems}</span><div>{linkedTasks.map(taskId => <span className="workflow-link-chip" key={taskId}>{taskId}</span>)}</div></div> : null}
    <div className="workflow-actions"><Button variant="outline" size="sm" onClick={() => void onOpenGraph(workflow)}><span>{copy.viewExecutionGraph}</span><ChevronDown className="h-3.5 w-3.5" /></Button><span className="workflow-updated">{copy.updated}: {formatDate(textOf(workflow.updatedAt || workflow.createdAt))}</span></div>
  </article>
}

function WorkflowGraphDialog({ workflow, copy, nodes, loading, error, onClose }: { workflow: AnyRecord; copy: WorkflowsCopy; nodes: WorkflowNode[]; loading: boolean; error: string; onClose: () => void }) {
  const title = textOf(workflow.title, '-')
  const project = textOf(workflow.project, '-')
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="workflow-graph-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><p className="workflow-graph-subtitle">{project} · {statusLabel(copy, textOf(workflow.status, 'open'))}</p></DialogHeader><div className="workflow-graph-body">{loading ? <div className="workflow-graph-loading"><LoaderCircle className="h-5 w-5 animate-spin" />{copy.running}</div> : error ? <div className="workflow-graph-error">{error}</div> : nodes.length ? <div className="workflow-graph-list">{nodes.map((node, index) => <div className="workflow-graph-node" key={node.nodeId || `${node.slug}-${index}`}><div className="workflow-graph-node-marker"><span>{index + 1}</span>{index < nodes.length - 1 ? <i /> : null}</div><div className="workflow-graph-node-content"><div className="workflow-graph-node-heading"><strong>{node.label || node.slug || '-'}</strong><StatusBadge status={node.status} copy={copy} /></div><p className="workflow-graph-node-meta">{node.role || '-'} · {node.actor || '-'}</p>{node.note ? <p>{node.note}</p> : null}{node.error ? <p className="workflow-node-error">{node.error}</p> : null}</div></div>)}</div> : <p className="workflow-graph-empty">{copy.noData}</p>}</div><DialogFooter><Button variant="outline" onClick={onClose}>{copy.clear}</Button></DialogFooter></DialogContent></Dialog>
}

function StatusBadge({ status, copy }: { status: string; copy: WorkflowsCopy }) {
  return <span className={`status-badge ${status}`}>{statusLabel(copy, status)}</span>
}
