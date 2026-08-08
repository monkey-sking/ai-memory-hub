import { useMemo, useState } from 'react'
import { ChevronDown, LoaderCircle, Plus, Search, X } from 'lucide-react'
import { Card, CardContent, CardHeader } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogClose } from './ui/dialog'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import type { AnyRecord } from '@/lib/api'
import type { DashboardCopy } from '@/lib/dashboardCopy'

type WorkflowsCopy = Pick<DashboardCopy,
  | 'actionText' | 'actionTextPlaceholder' | 'allProjects' | 'allStatuses' | 'block' | 'cancel' | 'clear' | 'close'
  | 'confirmDelete' | 'confirmDeleteWorkflow' | 'createdBy' | 'createWorkflow' | 'deleteWorkflow' | 'editWorkflow'
  | 'executor' | 'linkedItems' | 'markDone' | 'markReview' | 'noData' | 'noMatches' | 'observer' | 'planner'
  | 'priority' | 'priorityLabels' | 'project' | 'reviewer' | 'running' | 'save' | 'searchPlaceholder' | 'searchText'
  | 'signalTo' | 'signalToPlaceholder' | 'startWorkflow' | 'status' | 'statusLabels' | 'title' | 'titlePlaceholder'
  | 'updated' | 'viewExecutionGraph' | 'workflowAcceptance' | 'workflowActive' | 'workflowBlocked' | 'workflowCount'
  | 'workflowLogs' | 'workflowNote' | 'workflowPlan' | 'workflowResult' | 'workflowReview' | 'workflowReviewEntry'
  | 'workflowRisks' | 'workflowSignal' | 'workflowSignalTargetRequired' | 'workflowTextRequired' | 'workflowTitle'
  | 'workflowTitleRequired' | 'workflowTotal' | 'workflows'
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

type WorkflowEntryAction = 'result' | 'review' | 'note' | 'signal' | 'delete'

interface WorkflowActionState {
  action: WorkflowEntryAction
  workflow: AnyRecord
}

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

interface WorkflowLogEntry {
  type: string
  ts: string
  by: string
  role: string
  text: string
}

interface WorkflowsPanelProps {
  workflows: AnyRecord[]
  visibleProjects: AnyRecord[]
  copy: WorkflowsCopy
  onRefresh: () => Promise<void>
}

const workflowStatusOptions = ['open', 'planned', 'in_progress', 'review', 'blocked', 'done', 'cancelled']
const workflowPriorityOptions = ['low', 'normal', 'high', 'urgent']
const dialogFieldClass = 'min-h-[38px] rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground'
const dialogTextareaClass = 'min-h-[84px] rounded-md border border-input bg-background p-2 text-sm font-normal text-foreground'

function textOf(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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

function priorityLabel(copy: WorkflowsCopy, priority: string): string {
  return copy.priorityLabels[priority as keyof WorkflowsCopy['priorityLabels']] || priority
}

function linkedTaskIds(workflow: AnyRecord): string[] {
  const linked = Array.isArray(workflow.linkedTasks) ? workflow.linkedTasks : [workflow.linkedTasks, workflow.taskId]
  return linked.map(item => textOf(item).trim()).filter(Boolean)
}

function roleValues(workflow: AnyRecord | undefined, role: string): string[] {
  const value = workflow?.[role]
  if (Array.isArray(value)) return value.map(item => textOf(item).trim()).filter(Boolean)
  return textOf(value).split(',').map(item => item.trim()).filter(Boolean)
}

function createWorkflowForm(workflow: AnyRecord, defaultProject = 'default'): WorkflowFormState {
  return {
    id: textOf(workflow.id),
    title: textOf(workflow.title),
    by: textOf(workflow.createdBy, 'dashboard'),
    project: textOf(workflow.project, defaultProject),
    priority: textOf(workflow.priority, 'normal'),
    status: textOf(workflow.status, 'open'),
    planner: roleValues(workflow, 'planner').join(', '),
    executor: roleValues(workflow, 'executor').join(', '),
    reviewer: roleValues(workflow, 'reviewer').join(', '),
    observer: roleValues(workflow, 'observer').join(', '),
    plan: textOf(workflow.plan),
    acceptance: textOf(workflow.acceptance),
    risks: Array.isArray(workflow.risks) ? workflow.risks.map(item => textOf(item)).filter(Boolean).join('\n') : textOf(workflow.risks)
  }
}

function workflowActionTitle(copy: WorkflowsCopy, action: WorkflowEntryAction): string {
  if (action === 'result') return copy.workflowResult
  if (action === 'review') return copy.workflowReviewEntry
  if (action === 'note') return copy.workflowNote
  if (action === 'signal') return copy.workflowSignal
  return copy.confirmDelete
}

function collectWorkflowLogs(workflow: AnyRecord, copy: WorkflowsCopy): WorkflowLogEntry[] {
  const normalize = (items: unknown, type: string): WorkflowLogEntry[] => (Array.isArray(items) ? items as AnyRecord[] : [])
    .map(item => ({
      type,
      ts: textOf(item.ts || item.createdAt || item.updatedAt),
      by: textOf(item.by || item.from),
      role: textOf(item.role),
      text: textOf(item.text)
    }))
    .filter(entry => entry.text || entry.by || entry.role)
  return [
    ...normalize(workflow.results, copy.workflowResult),
    ...normalize(workflow.reviews, copy.workflowReviewEntry),
    ...normalize(workflow.notes, copy.workflowNote)
  ].sort((left, right) => right.ts.localeCompare(left.ts))
}

export function WorkflowsPanel({ workflows, visibleProjects, copy, onRefresh }: WorkflowsPanelProps) {
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
  const [editForm, setEditForm] = useState<WorkflowFormState | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')
  const [actionState, setActionState] = useState<WorkflowActionState | null>(null)
  const [actionText, setActionText] = useState('')
  const [signalTo, setSignalTo] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [statusBusy, setStatusBusy] = useState('')
  const [panelError, setPanelError] = useState('')

  const projectOptions = useMemo(() => uniqueSorted(workflows.map(workflow => textOf(workflow.project)).filter(Boolean)), [workflows])
  const formProjectOptions = useMemo(() => uniqueSorted([
    ...visibleProjects.map(project => textOf(project.id || project.name || project.displayName)).filter(Boolean),
    ...projectOptions
  ]), [visibleProjects, projectOptions])
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
      await apiPost('/api/workflows', { ...createForm, title: createForm.title.trim(), createdBy: 'dashboard-next', status: 'open' })
      setCreateOpen(false)
      setCreateForm(current => ({ ...current, title: '' }))
      await onRefresh()
    } catch (error) {
      setCreateError(errorText(error))
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
      const data = await apiGet<{ nodes?: WorkflowNode[] }>(`/api/workflows/${encodeURIComponent(textOf(workflow.id))}/nodes`)
      setWorkflowNodes(Array.isArray(data.nodes) ? data.nodes : [])
    } catch (error) {
      setNodeError(errorText(error))
    } finally {
      setLoadingNodes(false)
    }
  }
  const openWorkflowEdit = (workflow: AnyRecord) => {
    setEditError('')
    setEditForm(createWorkflowForm(workflow, formProjectOptions[0] || 'default'))
  }
  const saveWorkflow = async () => {
    if (!editForm || editBusy) return
    if (!editForm.title.trim()) {
      setEditError(copy.workflowTitleRequired)
      return
    }
    setEditBusy(true)
    setEditError('')
    try {
      await apiPatch(`/api/workflows/${encodeURIComponent(editForm.id)}`, {
        title: editForm.title.trim(),
        by: editForm.by.trim() || 'dashboard',
        from: editForm.by.trim() || 'dashboard',
        project: editForm.project.trim() || 'default',
        priority: editForm.priority || 'normal',
        status: editForm.status || 'open',
        planner: editForm.planner,
        executor: editForm.executor,
        reviewer: editForm.reviewer,
        observer: editForm.observer,
        plan: editForm.plan,
        acceptance: editForm.acceptance,
        risks: editForm.risks
      })
      setEditForm(null)
      await onRefresh()
    } catch (error) {
      setEditError(errorText(error))
    } finally {
      setEditBusy(false)
    }
  }
  const setWorkflowStatus = async (workflow: AnyRecord, status: string) => {
    const id = textOf(workflow.id)
    if (!id || statusBusy) return
    setStatusBusy(`${id}:${status}`)
    setPanelError('')
    try {
      await apiPost(`/api/workflows/${encodeURIComponent(id)}/status`, { status, by: 'dashboard' })
      await onRefresh()
    } catch (error) {
      setPanelError(errorText(error))
    } finally {
      setStatusBusy('')
    }
  }
  const openWorkflowAction = (workflow: AnyRecord, action: WorkflowEntryAction) => {
    setActionError('')
    setActionText('')
    setSignalTo(action === 'signal' ? roleValues(workflow, 'reviewer')[0] || roleValues(workflow, 'executor')[0] || 'all' : '')
    setActionState({ workflow, action })
  }
  const submitWorkflowAction = async () => {
    if (!actionState || actionBusy) return
    const id = textOf(actionState.workflow.id)
    if (!id) return
    const { action } = actionState
    if (action === 'signal' && !signalTo.trim()) {
      setActionError(copy.workflowSignalTargetRequired)
      return
    }
    if (action !== 'delete' && !actionText.trim()) {
      setActionError(copy.workflowTextRequired)
      return
    }
    setActionBusy(true)
    setActionError('')
    try {
      if (action === 'delete') {
        await apiDelete(`/api/workflows/${encodeURIComponent(id)}`, { by: 'dashboard' })
      } else if (action === 'signal') {
        await apiPost(`/api/workflows/${encodeURIComponent(id)}/signal`, { to: signalTo.trim(), text: actionText.trim(), type: 'handoff', by: 'dashboard' })
      } else {
        await apiPost(`/api/workflows/${encodeURIComponent(id)}/${action}`, {
          text: actionText.trim(),
          role: action === 'review' ? 'reviewer' : action === 'result' ? 'executor' : '',
          by: 'dashboard'
        })
      }
      setActionState(null)
      if (action === 'delete' && textOf(selectedWorkflow?.id) === id) setSelectedWorkflow(null)
      await onRefresh()
    } catch (error) {
      setActionError(errorText(error))
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="workflow-console-card">
        <CardHeader className="border-b workflow-console-header">
          <div className="workflow-list-header"><span className="workflow-result-count">{filteredWorkflows.length} {copy.workflowCount}</span><Button onClick={() => { setCreateError(''); setCreateOpen(true) }}><Plus className="mr-2 h-4 w-4" />{copy.createWorkflow}</Button></div>        </CardHeader>
        <CardContent className="pt-6">
          <div className="workflow-stage-strip" role="tablist" aria-label={copy.status}>
            <Button className={`workflow-stage-item ${statusFilter === 'all' ? 'selected' : ''}`} variant="ghost" size="sm" onClick={() => setStatusFilter('all')}><span className="workflow-stage-dot" />{copy.allStatuses}<strong>{formatNumber(workflows.length)}</strong></Button>
            {stageCounts.map(item => <Button className={`workflow-stage-item ${item.status} ${statusFilter === item.status ? 'selected' : ''}`} key={item.status} variant="ghost" size="sm" onClick={() => setStatusFilter(item.status)}><span className="workflow-stage-dot" />{statusLabel(copy, item.status)}<strong>{formatNumber(item.count)}</strong></Button>)}
          </div>          <div className="workflow-filter-bar">
            <div className="workflow-search-field"><Search className="h-4 w-4" /><Input id="workflow-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} aria-label={copy.searchText} /></div>
            <div className="workflow-project-field"><Label htmlFor="workflow-project-filter">{copy.project}</Label><select id="workflow-project-filter" value={projectFilter} onChange={event => setProjectFilter(event.target.value)}><option value="all">{copy.allProjects}</option>{projectOptions.map(project => <option value={project} key={project}>{project}</option>)}</select></div>
            <Button variant="outline" onClick={() => { setQuery(''); setStatusFilter('all'); setProjectFilter('all') }}><X className="mr-2 h-4 w-4" />{copy.clear}</Button>
          </div>

          {panelError ? <div className="inline-error" role="alert">{panelError}</div> : null}
          {filteredWorkflows.length ? <div className="workflow-card-grid workflow-list">{filteredWorkflows.map(workflow => <WorkflowCard key={textOf(workflow.id)} workflow={workflow} copy={copy} busy={Boolean(statusBusy)} onOpenGraph={openWorkflowGraph} onEdit={openWorkflowEdit} onStatus={setWorkflowStatus} onAction={openWorkflowAction} />)}</div> : <div className="py-8 text-center text-muted-foreground">{workflows.length ? copy.noMatches : copy.noData}</div>}
        </CardContent>
      </Card>

      {createOpen ? <Dialog open onOpenChange={open => { if (!open && !createBusy) setCreateOpen(false) }}><DialogContent className="workflow-create-dialog"><DialogHeader><DialogTitle>{copy.createWorkflow}</DialogTitle><DialogDescription>{copy.createWorkflow}</DialogDescription></DialogHeader><div className="workflow-create-form"><label><span>{copy.title}</span><input value={createForm.title} onChange={event => setCreateForm(current => ({ ...current, title: event.target.value }))} placeholder={copy.titlePlaceholder} /></label><label><span>{copy.project}</span><input value={createForm.project} onChange={event => setCreateForm(current => ({ ...current, project: event.target.value }))} /></label><div className="workflow-create-grid"><label><span>{copy.planner}</span><input value={createForm.planner} onChange={event => setCreateForm(current => ({ ...current, planner: event.target.value }))} /></label><label><span>{copy.executor}</span><input value={createForm.executor} onChange={event => setCreateForm(current => ({ ...current, executor: event.target.value }))} /></label><label><span>{copy.reviewer}</span><input value={createForm.reviewer} onChange={event => setCreateForm(current => ({ ...current, reviewer: event.target.value }))} /></label></div>{createError ? <div className="inline-error" role="alert">{createError}</div> : null}</div><DialogFooter><DialogClose asChild><Button variant="outline" disabled={createBusy}>{copy.cancel}</Button></DialogClose><Button onClick={() => void createWorkflow()} disabled={createBusy || !createForm.title.trim()}>{createBusy ? copy.running : copy.createWorkflow}</Button></DialogFooter></DialogContent></Dialog> : null}
      {editForm ? <WorkflowEditDialog copy={copy} form={editForm} busy={editBusy} error={editError} projectOptions={formProjectOptions} onChange={patch => setEditForm(current => (current ? { ...current, ...patch } : current))} onClose={() => setEditForm(null)} onSave={saveWorkflow} /> : null}
      {actionState ? <WorkflowActionDialog copy={copy} state={actionState} text={actionText} signalTo={signalTo} busy={actionBusy} error={actionError} onTextChange={setActionText} onSignalToChange={setSignalTo} onClose={() => setActionState(null)} onSubmit={submitWorkflowAction} /> : null}
      {selectedWorkflow ? <WorkflowGraphDialog workflow={selectedWorkflow} copy={copy} nodes={workflowNodes} loading={loadingNodes} error={nodeError} onClose={() => setSelectedWorkflow(null)} /> : null}
    </div>
  )
}

function WorkflowCard({ workflow, copy, busy, onOpenGraph, onEdit, onStatus, onAction }: {
  workflow: AnyRecord
  copy: WorkflowsCopy
  busy: boolean
  onOpenGraph: (workflow: AnyRecord) => Promise<void>
  onEdit: (workflow: AnyRecord) => void
  onStatus: (workflow: AnyRecord, status: string) => Promise<void>
  onAction: (workflow: AnyRecord, action: WorkflowEntryAction) => void
}) {
  const status = textOf(workflow.status, 'open')
  const priority = textOf(workflow.priority, 'normal')
  const title = textOf(workflow.title, '-')
  const project = textOf(workflow.project, '-')
  const description = textOf(workflow.description || workflow.plan || workflow.acceptance).trim()
  const roles = [[copy.planner, textOf(workflow.planner)], [copy.executor, textOf(workflow.executor)], [copy.reviewer, textOf(workflow.reviewer)], [copy.observer, textOf(workflow.observer)]].filter(([, value]) => value) as Array<[string, string]>
  const linkedTasks = linkedTaskIds(workflow)
  const logs = collectWorkflowLogs(workflow, copy).slice(0, 8)
  const canStart = !['in_progress', 'review', 'done', 'cancelled'].includes(status)
  const canReview = !['review', 'done', 'cancelled'].includes(status)
  const canBlock = !['blocked', 'done', 'cancelled'].includes(status)
  const canDone = !['done', 'cancelled'].includes(status)

  return <article className="workflow-card workflow-card-clickable" role="button" tabIndex={0} onClick={event => { if (!(event.target as HTMLElement).closest('button, a, input, select, summary, details')) void onOpenGraph(workflow) }} onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) void onOpenGraph(workflow) }}>
    <header className="workflow-card-header"><div className="workflow-title-block"><h3>{title}</h3><span className="workflow-project-chip">{project}</span></div><div className="workflow-badges"><StatusBadge status={status} copy={copy} /><span className={`status-badge ${priority}`}>{priorityLabel(copy, priority)}</span></div></header>
    {description ? <p className="workflow-description">{description}</p> : null}
    {roles.length ? <dl className="workflow-role-list">{roles.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
    {linkedTasks.length ? <div className="workflow-linked"><span>{copy.linkedItems}</span><div>{linkedTasks.map(taskId => <span className="workflow-link-chip" key={taskId}>{taskId}</span>)}</div></div> : null}
    <details className="workflow-details"><summary>{copy.workflowLogs}</summary><div className="task-notes">{logs.length ? logs.map((entry, index) => <p key={`${entry.type}-${entry.ts}-${index}`}><span>{[entry.type, entry.role, entry.by, formatDate(entry.ts)].filter(Boolean).join(' · ')}</span><span>{entry.text}</span></p>) : <span>{copy.noData}</span>}</div></details>
    <div className="workflow-actions flex flex-wrap items-center gap-2">
      {canStart ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => void onStatus(workflow, 'in_progress')}>{copy.startWorkflow}</Button> : null}
      {canReview ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => void onStatus(workflow, 'review')}>{copy.markReview}</Button> : null}
      {canDone ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => void onStatus(workflow, 'done')}>{copy.markDone}</Button> : null}
      {canBlock ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => void onStatus(workflow, 'blocked')}>{copy.block}</Button> : null}
      <Button variant="outline" size="sm" onClick={() => onEdit(workflow)}>{copy.editWorkflow}</Button>
      <Button variant="ghost" size="sm" onClick={() => onAction(workflow, 'result')}>{copy.workflowResult}</Button>
      <Button variant="ghost" size="sm" onClick={() => onAction(workflow, 'review')}>{copy.workflowReviewEntry}</Button>
      <Button variant="ghost" size="sm" onClick={() => onAction(workflow, 'note')}>{copy.workflowNote}</Button>
      <Button variant="ghost" size="sm" onClick={() => onAction(workflow, 'signal')}>{copy.workflowSignal}</Button>
      <Button variant="destructive" size="sm" onClick={() => onAction(workflow, 'delete')}>{copy.deleteWorkflow}</Button>
      <Button variant="outline" size="sm" onClick={() => void onOpenGraph(workflow)}><span>{copy.viewExecutionGraph}</span><ChevronDown className="h-3.5 w-3.5" /></Button>
      <span className="workflow-updated">{copy.updated}: {formatDate(textOf(workflow.updatedAt || workflow.createdAt))}</span>
    </div>
  </article>
}

function WorkflowEditDialog({ copy, form, busy, error, projectOptions, onChange, onClose, onSave }: {
  copy: WorkflowsCopy
  form: WorkflowFormState
  busy: boolean
  error: string
  projectOptions: string[]
  onChange: (patch: Partial<WorkflowFormState>) => void
  onClose: () => void
  onSave: () => Promise<void>
}) {
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="workflow-create-dialog"><DialogHeader><DialogTitle>{copy.editWorkflow}</DialogTitle><DialogDescription>{form.id}</DialogDescription></DialogHeader>
    <div className="workflow-create-form">
      <label><span>{copy.workflowTitle}</span><input value={form.title} onChange={event => onChange({ title: event.target.value })} placeholder={copy.titlePlaceholder} /></label>
      <div className="workflow-create-grid">
        <label><span>{copy.createdBy}</span><input value={form.by} onChange={event => onChange({ by: event.target.value })} /></label>
        <label><span>{copy.project}</span><input value={form.project} onChange={event => onChange({ project: event.target.value })} list="workflow-edit-project-options" /></label>
        <label><span>{copy.priority}</span><select className={dialogFieldClass} value={form.priority} onChange={event => onChange({ priority: event.target.value })}>{workflowPriorityOptions.map(priority => <option value={priority} key={priority}>{priorityLabel(copy, priority)}</option>)}</select></label>
      </div>
      <label><span>{copy.status}</span><select className={dialogFieldClass} value={form.status} onChange={event => onChange({ status: event.target.value })}>{workflowStatusOptions.map(status => <option value={status} key={status}>{statusLabel(copy, status)}</option>)}</select></label>
      <div className="workflow-create-grid">
        <label><span>{copy.planner}</span><input value={form.planner} onChange={event => onChange({ planner: event.target.value })} /></label>
        <label><span>{copy.executor}</span><input value={form.executor} onChange={event => onChange({ executor: event.target.value })} /></label>
        <label><span>{copy.reviewer}</span><input value={form.reviewer} onChange={event => onChange({ reviewer: event.target.value })} /></label>
      </div>
      <label><span>{copy.observer}</span><input value={form.observer} onChange={event => onChange({ observer: event.target.value })} /></label>
      <label><span>{copy.workflowPlan}</span><textarea className={dialogTextareaClass} value={form.plan} onChange={event => onChange({ plan: event.target.value })} /></label>
      <label><span>{copy.workflowAcceptance}</span><textarea className={dialogTextareaClass} value={form.acceptance} onChange={event => onChange({ acceptance: event.target.value })} /></label>
      <label><span>{copy.workflowRisks}</span><textarea className={dialogTextareaClass} value={form.risks} onChange={event => onChange({ risks: event.target.value })} /></label>
      <datalist id="workflow-edit-project-options">{projectOptions.map(project => <option value={project} key={project} />)}</datalist>
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
    </div>
    <DialogFooter><DialogClose asChild><Button variant="outline" disabled={busy}>{copy.cancel}</Button></DialogClose><Button onClick={() => void onSave()} disabled={busy || !form.title.trim()}>{busy ? copy.running : copy.save}</Button></DialogFooter>
  </DialogContent></Dialog>
}

function WorkflowActionDialog({ copy, state, text, signalTo, busy, error, onTextChange, onSignalToChange, onClose, onSubmit }: {
  copy: WorkflowsCopy
  state: WorkflowActionState
  text: string
  signalTo: string
  busy: boolean
  error: string
  onTextChange: (value: string) => void
  onSignalToChange: (value: string) => void
  onClose: () => void
  onSubmit: () => Promise<void>
}) {
  const isDelete = state.action === 'delete'
  const title = workflowActionTitle(copy, state.action)
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="workflow-create-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{textOf(state.workflow.title, '-')} · {textOf(state.workflow.project, '-')}</DialogDescription></DialogHeader>
    <div className="workflow-create-form">
      <div className="workflow-action-summary"><StatusBadge status={textOf(state.workflow.status, 'open')} copy={copy} /><strong>{textOf(state.workflow.title, '-')}</strong><span>{textOf(state.workflow.project, '-')}</span></div>
      {isDelete ? <p className="workflow-description">{copy.confirmDeleteWorkflow}</p> : null}
      {state.action === 'signal' ? <label><span>{copy.signalTo}</span><input value={signalTo} onChange={event => onSignalToChange(event.target.value)} placeholder={copy.signalToPlaceholder} /></label> : null}
      {isDelete ? null : <label><span>{copy.actionText}</span><textarea className={dialogTextareaClass} value={text} onChange={event => onTextChange(event.target.value)} placeholder={copy.actionTextPlaceholder} /></label>}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
    </div>
    <DialogFooter><DialogClose asChild><Button variant="outline" disabled={busy}>{copy.cancel}</Button></DialogClose><Button variant={isDelete ? 'destructive' : 'default'} onClick={() => void onSubmit()} disabled={busy}>{busy ? copy.running : isDelete ? copy.deleteWorkflow : title}</Button></DialogFooter>
  </DialogContent></Dialog>
}

function WorkflowGraphDialog({ workflow, copy, nodes, loading, error, onClose }: { workflow: AnyRecord; copy: WorkflowsCopy; nodes: WorkflowNode[]; loading: boolean; error: string; onClose: () => void }) {
  const title = textOf(workflow.title, '-')
  const project = textOf(workflow.project, '-')
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="workflow-graph-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription className="workflow-graph-subtitle">{project} · {statusLabel(copy, textOf(workflow.status, 'open'))}</DialogDescription></DialogHeader><div className="workflow-graph-body">{loading ? <div className="workflow-graph-loading"><LoaderCircle className="h-5 w-5 animate-spin" />{copy.running}</div> : error ? <div className="workflow-graph-error" role="alert">{error}</div> : nodes.length ? <div className="workflow-graph-list">{nodes.map((node, index) => <div className="workflow-graph-node" key={node.nodeId || `${node.slug}-${index}`}><div className="workflow-graph-node-marker"><span>{index + 1}</span>{index < nodes.length - 1 ? <i /> : null}</div><div className="workflow-graph-node-content"><div className="workflow-graph-node-heading"><strong>{node.label || node.slug || '-'}</strong><StatusBadge status={node.status} copy={copy} /></div><p className="workflow-graph-node-meta">{node.role || '-'} · {node.actor || '-'}</p>{node.note ? <p>{node.note}</p> : null}{node.error ? <p className="workflow-node-error">{node.error}</p> : null}</div></div>)}</div> : <p className="workflow-graph-empty">{copy.noData}</p>}</div><DialogFooter><DialogClose asChild><Button variant="outline">{copy.close}</Button></DialogClose></DialogFooter></DialogContent></Dialog>
}

function StatusBadge({ status, copy }: { status: string; copy: WorkflowsCopy }) {
  return <span className={`status-badge ${status}`}>{statusLabel(copy, status)}</span>
}
