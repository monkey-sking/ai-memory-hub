import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Search, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import type { AnyRecord } from '@/lib/api'
import type { DashboardCopy } from '@/lib/dashboardCopy'

type WorkflowsCopy = Pick<DashboardCopy,
  | 'allProjects'
  | 'allStatuses'
  | 'clear'
  | 'createWorkflow'
  | 'executor'
  | 'linkedItems'
  | 'noData'
  | 'noMatches'
  | 'planner'
  | 'project'
  | 'reviewer'
  | 'running'
  | 'searchPlaceholder'
  | 'searchText'
  | 'status'
  | 'statusLabels'
  | 'updated'
  | 'viewExecutionGraph'
  | 'workflowActive'
  | 'workflowBlocked'
  | 'workflowReview'
  | 'workflowTotal'
  | 'workflows'
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

export function WorkflowsPanel({ workflows, copy }: WorkflowsPanelProps) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null)
  const [workflowNodes, setWorkflowNodes] = useState<Record<string, WorkflowNode[]>>({})
  const [loadingNodes, setLoadingNodes] = useState<Record<string, boolean>>({})

  const projectOptions = useMemo(() => uniqueSorted(workflows.map(workflow => textOf(workflow.project)).filter(Boolean)), [workflows])
  const normalizedQuery = query.trim().toLowerCase()
  const filteredWorkflows = workflows.filter(workflow => {
    if (statusFilter !== 'all' && textOf(workflow.status, 'open') !== statusFilter) return false
    if (projectFilter !== 'all' && textOf(workflow.project) !== projectFilter) return false
    return !normalizedQuery || [workflow.title, workflow.description, workflow.plan, workflow.project, workflow.planner, workflow.executor, workflow.reviewer]
      .some(value => textOf(value).toLowerCase().includes(normalizedQuery))
  })
  const stageCounts = workflowStatusOptions.map(status => ({ status, count: workflows.filter(workflow => textOf(workflow.status, 'open') === status).length }))

  const toggleWorkflow = async (workflowId: string) => {
    if (expandedWorkflow === workflowId) {
      setExpandedWorkflow(null)
      return
    }
    setExpandedWorkflow(workflowId)
    if (workflowNodes[workflowId]) return
    setLoadingNodes(current => ({ ...current, [workflowId]: true }))
    try {
      const response = await fetch(`/api/workflows/${workflowId}/nodes`)
      const data = await response.json()
      setWorkflowNodes(current => ({ ...current, [workflowId]: data.nodes || [] }))
    } catch (error) {
      console.error('Failed to fetch workflow nodes:', error)
    } finally {
      setLoadingNodes(current => ({ ...current, [workflowId]: false }))
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WorkflowMetric label={copy.workflowTotal} value={formatNumber(workflows.length)} />
        <WorkflowMetric label={copy.workflowActive} value={formatNumber(workflows.filter(workflow => ['open', 'planned', 'in_progress'].includes(textOf(workflow.status, 'open'))).length)} tone="teal" />
        <WorkflowMetric label={copy.workflowReview} value={formatNumber(workflows.filter(workflow => textOf(workflow.status) === 'review').length)} tone="amber" />
        <WorkflowMetric label={copy.workflowBlocked} value={formatNumber(workflows.filter(workflow => ['blocked', 'failed'].includes(textOf(workflow.status))).length)} tone="red" />
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-4">
            <div><CardTitle>{copy.workflows}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{filteredWorkflows.length}</p></div>
            <Button onClick={() => alert('Create workflow feature - TBD')}><Plus className="mr-2 h-4 w-4" />{copy.createWorkflow}</Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="workflow-stage-strip">
            <Button variant={statusFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('all')}>{copy.allStatuses} ({formatNumber(workflows.length)})</Button>
            {stageCounts.map(item => <Button key={item.status} variant={statusFilter === item.status ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(item.status)}>{statusLabel(copy, item.status)} ({formatNumber(item.count)})</Button>)}
          </div>
          <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2"><Label htmlFor="workflow-search">{copy.searchText}</Label><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="workflow-search" value={query} onChange={event => setQuery(event.target.value)} className="pl-9" placeholder={copy.searchPlaceholder} /></div></div>
            <div className="space-y-2"><Label htmlFor="workflow-project-filter">{copy.project}</Label><select id="workflow-project-filter" value={projectFilter} onChange={event => setProjectFilter(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"><option value="all">{copy.allProjects}</option>{projectOptions.map(project => <option value={project} key={project}>{project}</option>)}</select></div>
            <div className="flex items-end"><Button variant="outline" onClick={() => { setQuery(''); setStatusFilter('all'); setProjectFilter('all') }} className="w-full"><X className="mr-2 h-4 w-4" />{copy.clear}</Button></div>
          </div>

          {filteredWorkflows.length ? <div className="workflow-card-grid">{filteredWorkflows.map(workflow => <WorkflowCard key={textOf(workflow.id)} workflow={workflow} copy={copy} expanded={expandedWorkflow === textOf(workflow.id)} loading={Boolean(loadingNodes[textOf(workflow.id)])} nodes={workflowNodes[textOf(workflow.id)] || []} onToggle={toggleWorkflow} />)}</div> : <div className="py-8 text-center text-muted-foreground">{workflows.length ? copy.noMatches : copy.noData}</div>}
        </CardContent>
      </Card>
    </div>
  )
}

function WorkflowMetric({ label, value, tone }: { label: string; value: string; tone?: 'teal' | 'amber' | 'red' }) {
  return <Card className={tone ? `workflow-metric ${tone}` : 'workflow-metric'}><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{value}</div></CardContent></Card>
}

function WorkflowCard({ workflow, copy, expanded, loading, nodes, onToggle }: { workflow: AnyRecord; copy: WorkflowsCopy; expanded: boolean; loading: boolean; nodes: WorkflowNode[]; onToggle: (workflowId: string) => Promise<void> }) {
  const status = textOf(workflow.status, 'open')
  const title = textOf(workflow.title, '-')
  const project = textOf(workflow.project, '-')
  const description = textOf(workflow.description || workflow.plan || workflow.acceptance).trim()
  const workflowId = textOf(workflow.id)
  const roles = [[copy.planner, textOf(workflow.planner)], [copy.executor, textOf(workflow.executor)], [copy.reviewer, textOf(workflow.reviewer)]].filter(([, value]) => value) as Array<[string, string]>
  const linkedTasks = linkedTaskIds(workflow)

  return (
    <article className="workflow-card">
      <header className="workflow-card-header">
        <div className="workflow-title-block"><h3>{title}</h3><span className="workflow-project-chip">{project}</span></div>
        <StatusBadge status={status} copy={copy} />
      </header>
      {description ? <p className="workflow-description">{description}</p> : null}
      {roles.length ? <dl className="workflow-role-list">{roles.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
      {linkedTasks.length ? <div className="workflow-linked"><span>{copy.linkedItems}</span><div>{linkedTasks.map(taskId => <span className="workflow-link-chip" key={taskId}>{taskId}</span>)}</div></div> : null}
      <div className="workflow-actions"><Button variant="outline" size="sm" onClick={() => void onToggle(workflowId)}><span>{copy.viewExecutionGraph}</span>{expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</Button><span className="workflow-updated">{copy.updated}: {formatDate(textOf(workflow.updatedAt || workflow.createdAt))}</span></div>
      {expanded ? <div className="workflow-execution" aria-live="polite">{loading ? <p>{copy.running}</p> : nodes.length ? nodes.map(node => <div className="workflow-node" key={node.nodeId}><StatusBadge status={node.status} copy={copy} /><div><strong>{node.label}</strong><p>{node.role}: {node.actor}</p>{node.note ? <p>{node.note}</p> : null}{node.error ? <p className="workflow-node-error">{node.error}</p> : null}</div></div>) : <p>{copy.noData}</p>}</div> : null}
    </article>
  )
}

function StatusBadge({ status, copy }: { status: string; copy: WorkflowsCopy }) {
  return <span className={`status-badge ${status}`}>{statusLabel(copy, status)}</span>
}
