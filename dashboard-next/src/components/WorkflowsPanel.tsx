import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Plus, Search, X } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState, PageShell, Panel, StatusTabs } from './shell'
import { Button } from './ui/button'
import { Input, fieldBaseStyles } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogClose } from './ui/dialog'
import { apiDelete, apiGet, apiPatch, apiPost, formatDate, formatRelativeTime } from '@/lib/api'
import type { AnyRecord } from '@/lib/api'
import type { DashboardCopy } from '@/lib/dashboardCopy'

type WorkflowsCopy = Pick<DashboardCopy,
  | 'actionText' | 'actionTextPlaceholder' | 'allProjects' | 'allStatuses' | 'block' | 'cancel' | 'clear' | 'close'
  | 'confirmDelete' | 'confirmDeleteWorkflow' | 'createdBy' | 'createWorkflow' | 'deleteWorkflow' | 'editWorkflow'
  | 'executor' | 'linkedItems' | 'markDone' | 'markReview' | 'moreActions' | 'noData' | 'noMatches' | 'observer' | 'planner'
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

/** One row of the card's `⋯` overflow menu. Same shape as `TaskMenuAction` in TasksPanel.tsx. */
type WorkflowMenuAction = {
  key: string
  label: string
  disabled?: boolean
  /** Renders the row in danger colours without giving it a filled button on the card. */
  tone?: 'danger'
  onSelect: () => void
}

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
/**
 * `.workflow-create-form label` is `font-weight: 700`, so a bare select would
 * inherit bold — hence `font-normal`. `h-9`/`px-3` deliberately match
 * `.workflow-create-form input { min-height: 36px; padding: 0 12px }` in
 * Dashboard.css: that rule targets `input` only, so before this the selects
 * sat 2px taller and 4px narrower than the inputs beside them.
 */
const dialogFieldClass = cn(fieldBaseStyles, 'flex h-9 px-3 py-0 font-normal')

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
    <PageShell>
      <Panel
        title={copy.workflows}
        count={formatNumber(filteredWorkflows.length)}
        actions={
          /* Panel.tsx:9 — buttons in a panel header MUST be size="sm" (32px). */
          <Button size="sm" onClick={() => { setCreateError(''); setCreateOpen(true) }}>
            <Plus className="h-4 w-4" />
            {copy.createWorkflow}
          </Button>
        }
        tabs={
          <StatusTabs
            label={copy.status}
            variant="pill"
            value={statusFilter}
            onChange={setStatusFilter}
            allItem={{ value: 'all', label: copy.allStatuses, count: workflows.length }}
            items={stageCounts.map(item => ({
              value: item.status,
              label: statusLabel(copy, item.status),
              count: item.count,
            }))}
          />
        }
        toolbar={
          <>
            <div className="relative w-full min-w-0 max-w-xs shrink">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
              <Input id="workflow-search" className="h-8 pl-8" value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} aria-label={copy.searchText} />
            </div>
            <Label htmlFor="workflow-project-filter" className="sr-only">{copy.project}</Label>
            <select
              id="workflow-project-filter"
              value={projectFilter}
              onChange={event => setProjectFilter(event.target.value)}
              className={cn(fieldBaseStyles, 'h-8 w-auto shrink-0 px-2 py-0')}
            >
              <option value="all">{copy.allProjects}</option>
              {projectOptions.map(project => <option value={project} key={project}>{project}</option>)}
            </select>
            <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={() => { setQuery(''); setStatusFilter('all'); setProjectFilter('all') }}>
              <X className="h-4 w-4" />
              {copy.clear}
            </Button>
          </>
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          {panelError ? <ErrorState variant="inline" title={panelError} /> : null}
          {filteredWorkflows.length
            ? <div className="workflow-card-grid workflow-list">{filteredWorkflows.map(workflow => <WorkflowCard key={textOf(workflow.id)} workflow={workflow} copy={copy} busy={Boolean(statusBusy)} onOpenGraph={openWorkflowGraph} onEdit={openWorkflowEdit} onStatus={setWorkflowStatus} onAction={openWorkflowAction} />)}</div>
            : <EmptyState title={workflows.length ? copy.noMatches : copy.noData} />}
        </div>
      </Panel>

      {createOpen ? <Dialog open onOpenChange={open => { if (!open && !createBusy) setCreateOpen(false) }}><DialogContent className="workflow-create-dialog" aria-describedby={undefined}><DialogHeader><DialogTitle>{copy.createWorkflow}</DialogTitle></DialogHeader><div className="workflow-create-form"><label><span>{copy.title}</span><input value={createForm.title} onChange={event => setCreateForm(current => ({ ...current, title: event.target.value }))} placeholder={copy.titlePlaceholder} /></label><label><span>{copy.project}</span><input value={createForm.project} onChange={event => setCreateForm(current => ({ ...current, project: event.target.value }))} /></label><div className="workflow-create-grid"><label><span>{copy.planner}</span><input value={createForm.planner} onChange={event => setCreateForm(current => ({ ...current, planner: event.target.value }))} /></label><label><span>{copy.executor}</span><input value={createForm.executor} onChange={event => setCreateForm(current => ({ ...current, executor: event.target.value }))} /></label><label><span>{copy.reviewer}</span><input value={createForm.reviewer} onChange={event => setCreateForm(current => ({ ...current, reviewer: event.target.value }))} /></label></div>{createError ? <ErrorState variant="inline" title={createError} /> : null}</div><DialogFooter><DialogClose asChild><Button variant="outline" disabled={createBusy}>{copy.cancel}</Button></DialogClose><Button onClick={() => void createWorkflow()} disabled={createBusy || !createForm.title.trim()}>{createBusy ? copy.running : copy.createWorkflow}</Button></DialogFooter></DialogContent></Dialog> : null}
      {editForm ? <WorkflowEditDialog copy={copy} form={editForm} busy={editBusy} error={editError} projectOptions={formProjectOptions} onChange={patch => setEditForm(current => (current ? { ...current, ...patch } : current))} onClose={() => setEditForm(null)} onSave={saveWorkflow} /> : null}
      {actionState ? <WorkflowActionDialog copy={copy} state={actionState} text={actionText} signalTo={signalTo} busy={actionBusy} error={actionError} onTextChange={setActionText} onSignalToChange={setSignalTo} onClose={() => setActionState(null)} onSubmit={submitWorkflowAction} /> : null}
      {selectedWorkflow ? <WorkflowGraphDialog workflow={selectedWorkflow} copy={copy} nodes={workflowNodes} loading={loadingNodes} error={nodeError} onClose={() => setSelectedWorkflow(null)} /> : null}
    </PageShell>
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
  /**
   * Ordered forward path through the lifecycle, so the first still-available
   * step is by definition "what to do next with this workflow". That one gets
   * the card's single filled button; the rest drop into the overflow menu, so
   * a card can never show two primaries.
   */
  const forwardTransitions = [
    { status: 'in_progress', label: copy.startWorkflow, available: canStart },
    { status: 'review', label: copy.markReview, available: canReview },
    { status: 'done', label: copy.markDone, available: canDone }
  ].filter(item => item.available)
  const nextTransition = forwardTransitions[0]
  const menuActions: WorkflowMenuAction[] = [
    ...forwardTransitions.slice(1).map(item => ({
      key: `status-${item.status}`,
      label: item.label,
      disabled: busy,
      onSelect: () => void onStatus(workflow, item.status)
    })),
    { key: 'edit', label: copy.editWorkflow, onSelect: () => onEdit(workflow) },
    { key: 'result', label: copy.workflowResult, onSelect: () => onAction(workflow, 'result') },
    { key: 'review-entry', label: copy.workflowReviewEntry, onSelect: () => onAction(workflow, 'review') },
    { key: 'note', label: copy.workflowNote, onSelect: () => onAction(workflow, 'note') },
    { key: 'signal', label: copy.workflowSignal, onSelect: () => onAction(workflow, 'signal') },
    { key: 'delete', label: copy.deleteWorkflow, tone: 'danger', onSelect: () => onAction(workflow, 'delete') }
  ]

  return <article
    className="workflow-card workflow-card-clickable"
    role="button"
    tabIndex={0}
    aria-label={`${title} — ${copy.viewExecutionGraph}`}
    onClick={event => { if (!(event.target as HTMLElement).closest('button, a, input, select, summary, details')) void onOpenGraph(workflow) }}
    onKeyDown={event => {
      if ((event.key !== 'Enter' && event.key !== ' ') || event.target !== event.currentTarget) return
      // Without preventDefault the browser runs Enter's default activation
      // *after* this handler — by then Radix has moved focus into the graph
      // dialog, so the synthesized click lands on the dialog's close button
      // and shuts it again (measured: opened at +0ms, closed at +41ms).
      // Space would additionally scroll the panel.
      event.preventDefault()
      void onOpenGraph(workflow)
    }}
  >
    <header className="workflow-card-header"><div className="workflow-title-block"><h3>{title}</h3><span className="workflow-project-chip">{project}</span></div><div className="workflow-badges"><StatusBadge status={status} copy={copy} /><span className={`status-badge ${priority}`}>{priorityLabel(copy, priority)}</span></div></header>
    {description ? <p className="workflow-description">{description}</p> : null}
    {roles.length ? <dl className="workflow-role-list">{roles.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
    {linkedTasks.length ? <div className="workflow-linked"><span>{copy.linkedItems}</span><div>{linkedTasks.map(taskId => <span className="workflow-link-chip" key={taskId}>{taskId}</span>)}</div></div> : null}
    <details className="workflow-details"><summary>{copy.workflowLogs}</summary><div className="task-notes">{logs.length ? logs.map((entry, index) => <p key={`${entry.type}-${entry.ts}-${index}`}><span>{[entry.type, entry.role, entry.by, formatDate(entry.ts, 'short')].filter(Boolean).join(' · ')}</span><span>{entry.text}</span></p>) : <span>{copy.noData}</span>}</div></details>
    <div className="workflow-actions flex flex-wrap items-center gap-2">
      {nextTransition ? <Button size="sm" disabled={busy} onClick={() => void onStatus(workflow, nextTransition.status)}>{nextTransition.label}</Button> : null}
      {canBlock ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => void onStatus(workflow, 'blocked')}>{copy.block}</Button> : null}
      <WorkflowActionMenu label={copy.moreActions} actions={menuActions} />
      <span className="workflow-updated">{copy.updated}: {formatRelativeTime(textOf(workflow.updatedAt || workflow.createdAt))}</span>
    </div>
  </article>
}

/**
 * Overflow menu for the card's secondary verbs. Behaviour is a local copy of
 * `TaskActionMenu` in TasksPanel.tsx (roving focus with arrows/Home/End,
 * Escape closes and restores focus to the trigger); only the styling is
 * expressed in design-system utilities rather than the legacy
 * `.task-action-menu-*` rules, so the danger row can be tinted without
 * fighting that stylesheet's specificity.
 */
function WorkflowActionMenu({ label, actions }: { label: string; actions: WorkflowMenuAction[] }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuContentRef = useRef<HTMLDivElement | null>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const closeAndFocusTrigger = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  // Position the portal menu (fixed) from the trigger rect, flipping up when
  // there isn't room below. Rendering in a portal keeps it above the panel's
  // scroll/stacking context so the sticky toolbar can't cover its items
  // (previously the menu rendered inside the scroll body and the panel
  // toolbar's search input intercepted the item clicks).
  useEffect(() => {
    if (!open) { setCoords(null); return }
    const tr = triggerRef.current
    if (!tr) return
    const rect = tr.getBoundingClientRect()
    const menuH = actions.length * 34 + 16
    const menuW = 184
    const down = rect.bottom + menuH + 8 <= window.innerHeight
    const top = down ? rect.bottom + 8 : rect.top - menuH - 8
    const left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8))
    setCoords({ top, left })
  }, [open, actions.length])

  // Close on scroll/resize so the fixed menu can't drift from the trigger.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const items = () => Array.from(menuContentRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []).filter(item => !item.disabled)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeAndFocusTrigger()
        return
      }
      const list = items()
      if (!list.length) return
      const currentIndex = list.indexOf(document.activeElement as HTMLButtonElement)
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        list[(currentIndex + 1) % list.length]?.focus()
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        list[(currentIndex - 1 + list.length) % list.length]?.focus()
      } else if (event.key === 'Home') {
        event.preventDefault()
        list[0]?.focus()
      } else if (event.key === 'End') {
        event.preventDefault()
        list[list.length - 1]?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closeAndFocusTrigger])

  useEffect(() => {
    if (!open) return
    const first = menuContentRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')
    first?.focus()
  }, [open, coords])

  // The card behind this menu is itself a click target, so an unclosed menu
  // would linger under the dialog that click opens.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const t = event.target as Node
      if (!menuContentRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const menu = open && coords ? createPortal(
    <div
      ref={menuContentRef}
      className="fixed z-50 grid min-w-[168px] gap-0.5 rounded-lg border border-line bg-surface p-2 shadow-lg"
      style={{ top: coords.top, left: coords.left }}
      id={menuId}
      role="menu"
      aria-label={label}
    >
      {actions.map(action => <button
        key={action.key}
        type="button"
        role="menuitem"
        disabled={action.disabled}
        className={cn(
          'flex h-8 items-center rounded-sm px-2 text-left text-xs text-ink-2',
          'transition-colors duration-[var(--dur-fast)] hover:bg-surface-sunk hover:text-ink',
          'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
          'disabled:pointer-events-none disabled:opacity-45',
          action.tone === 'danger' && 'text-danger hover:bg-danger-tint hover:text-danger-text'
        )}
        onClick={() => { closeAndFocusTrigger(); action.onSelect() }}
      >{action.label}</button>)}
    </div>,
    document.body
  ) : null

  return <div className="relative shrink-0">
    <Button ref={triggerRef} variant="ghost" size="sm" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(value => !value)}>
      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
    {menu}
  </div>
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
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="workflow-create-dialog" aria-describedby={undefined}><DialogHeader><DialogTitle>{copy.editWorkflow}</DialogTitle></DialogHeader>
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
      <label><span>{copy.workflowPlan}</span><Textarea className="font-normal" value={form.plan} onChange={event => onChange({ plan: event.target.value })} /></label>
      <label><span>{copy.workflowAcceptance}</span><Textarea className="font-normal" value={form.acceptance} onChange={event => onChange({ acceptance: event.target.value })} /></label>
      <label><span>{copy.workflowRisks}</span><Textarea className="font-normal" value={form.risks} onChange={event => onChange({ risks: event.target.value })} /></label>
      <datalist id="workflow-edit-project-options">{projectOptions.map(project => <option value={project} key={project} />)}</datalist>
      {error ? <ErrorState variant="inline" title={error} /> : null}
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
      {isDelete ? null : <label><span>{copy.actionText}</span><Textarea className="font-normal" value={text} onChange={event => onTextChange(event.target.value)} placeholder={copy.actionTextPlaceholder} /></label>}
      {error ? <ErrorState variant="inline" title={error} /> : null}
    </div>
    <DialogFooter><DialogClose asChild><Button variant="outline" disabled={busy}>{copy.cancel}</Button></DialogClose><Button variant={isDelete ? 'destructive' : 'default'} onClick={() => void onSubmit()} disabled={busy}>{busy ? copy.running : isDelete ? copy.deleteWorkflow : title}</Button></DialogFooter>
  </DialogContent></Dialog>
}

function WorkflowGraphDialog({ workflow, copy, nodes, loading, error, onClose }: { workflow: AnyRecord; copy: WorkflowsCopy; nodes: WorkflowNode[]; loading: boolean; error: string; onClose: () => void }) {
  const title = textOf(workflow.title, '-')
  const project = textOf(workflow.project, '-')
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="workflow-graph-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription className="workflow-graph-subtitle">{project} · {statusLabel(copy, textOf(workflow.status, 'open'))}</DialogDescription></DialogHeader><div className="workflow-graph-body">{loading ? <LoadingState label={copy.running} /> : error ? <ErrorState variant="inline" title={error} /> : nodes.length ? <div className="workflow-graph-list">{nodes.map((node, index) => <div className="workflow-graph-node" key={node.nodeId || `${node.slug}-${index}`}><div className="workflow-graph-node-marker"><span>{index + 1}</span>{index < nodes.length - 1 ? <i /> : null}</div><div className="workflow-graph-node-content"><div className="workflow-graph-node-heading"><strong>{node.label || node.slug || '-'}</strong><StatusBadge status={node.status} copy={copy} /></div><p className="workflow-graph-node-meta">{node.role || '-'} · {node.actor || '-'}</p>{node.note ? <p>{node.note}</p> : null}{node.error ? <p className="workflow-node-error">{node.error}</p> : null}</div></div>)}</div> : <EmptyState size="sm" title={copy.noData} />}</div><DialogFooter><DialogClose asChild><Button variant="outline">{copy.close}</Button></DialogClose></DialogFooter></DialogContent></Dialog>
}

function StatusBadge({ status, copy }: { status: string; copy: WorkflowsCopy }) {
  return <span className={`status-badge ${status}`}>{statusLabel(copy, status)}</span>
}
