import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { CheckCheck, FileText, GitBranch, Layers, PauseCircle, Play, Plus, RefreshCw, Send } from 'lucide-react'
import { apiDelete, apiGet, apiPatch, apiPost, asArray, formatRelativeTime } from '../lib/api'
import type { AnyRecord } from '../lib/api'
import { dashboardLabels, dashboardSubtitles, dashboardTitles } from '../lib/dashboardCopy'
import type { AppOutletContext } from '../lib/i18n'
import type { DashboardCopy } from '../lib/dashboardCopy'
import { cn } from '@/lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { fieldBaseStyles, Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../components/ui/dialog'
import { priorityBadgeVariant, statusBadgeVariant } from '../lib/statusBadge'
import { EmptyState, ErrorState, FilterBar, LoadingState } from '../components/shell'
import {
  AlertBanner,
  Card,
  ChartRow,
  MetricCard,
  MetricGrid,
  PageHead,
  SectionTabs
} from '@/components/ds'
import type { DonutSegment } from '@/components/ds'

/* ------------------------------------------------------------------ types */

type WorkflowEntryAction = 'result' | 'review' | 'signal'

/** Core verbs preserved from the source WorkflowsPanel; advanced create /
 *  edit / delete and the portal-based overflow menu were intentionally dropped
 *  for this standalone route (see LANDING-CONTRACT.md "Plan A" extraction). */
type WorkflowActionState = { action: WorkflowEntryAction; workflow: AnyRecord } | null

/* -------------------------------------------------------------- helpers */

function textOf(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function uniqueSorted(items: string[]): string[] {
  return Array.from(new Set(items)).sort()
}

function roleValues(workflow: AnyRecord, role: string): string[] {
  const value = workflow[role]
  if (Array.isArray(value)) return value.map(item => textOf(item).trim()).filter(Boolean)
  return textOf(value).split(',').map(item => item.trim()).filter(Boolean)
}

function progressPercentOf(workflow: AnyRecord): number {
  const raw = Number(workflow.progressPercent)
  if (!Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(100, raw))
}

const workflowStatusOptions = ['open', 'planned', 'in_progress', 'review', 'blocked', 'done', 'cancelled'] as const

const workflowPriorityOptions = ['low', 'normal', 'high', 'urgent'] as const

const workflowNodeRoleOrder = ['planner', 'executor', 'reviewer', 'observer'] as const

type WorkflowFormState = {
  title: string
  project: string
  priority: string
  status: string
  planner: string
  executor: string
  reviewer: string
  observer: string
  risks: string
  plan: string
  acceptance: string
}

function emptyWorkflowForm(): WorkflowFormState {
  return {
    title: '',
    project: '',
    priority: 'normal',
    status: 'open',
    planner: '',
    executor: '',
    reviewer: '',
    observer: '',
    risks: '',
    plan: '',
    acceptance: ''
  }
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

/* ------------------------------------------------------------- component */

export default function Workflows() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const title = dashboardTitles[language].workflows
  const description = dashboardSubtitles[language].workflows

  const t = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const [workflows, setWorkflows] = useState<AnyRecord[]>([])
  const [visibleProjects, setVisibleProjects] = useState<AnyRecord[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const [actionState, setActionState] = useState<WorkflowActionState>(null)
  const [actionText, setActionText] = useState('')
  const [signalTo, setSignalTo] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [editState, setEditState] = useState<AnyRecord | null>(null)
  const [deleteState, setDeleteState] = useState<AnyRecord | null>(null)
  const [graphState, setGraphState] = useState<AnyRecord | null>(null)

  const [form, setForm] = useState<WorkflowFormState>(emptyWorkflowForm())
  const setField = (key: keyof WorkflowFormState, value: string) => setForm(prev => ({ ...prev, [key]: value }))
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const [graphNodes, setGraphNodes] = useState<AnyRecord[]>([])
  const [graphBusy, setGraphBusy] = useState(false)
  const [graphError, setGraphError] = useState('')

  const load = async () => {
    setBusy(true)
    try {
      const [workflowData, projectData] = await Promise.all([
        apiGet<AnyRecord>('/api/workflows'),
        apiGet<AnyRecord>('/api/projects')
      ])
      setWorkflows(asArray<AnyRecord>((workflowData as AnyRecord).workflows))
      setVisibleProjects(asArray<AnyRecord>((projectData as AnyRecord).visibleProjects))
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [])

  const statusLabel = (status: string) => copy.statusLabels[status as keyof DashboardCopy['statusLabels']] ?? status
  const priorityLabel = (priority: string) => copy.priorityLabels[priority as keyof DashboardCopy['priorityLabels']] ?? priority

  const projectOptions = useMemo(
    () =>
      uniqueSorted([
        ...visibleProjects.map(project => textOf(project.id || project.name || project.displayName)).filter(Boolean),
        ...workflows.map(workflow => textOf(workflow.project)).filter(Boolean)
      ]),
    [visibleProjects, workflows]
  )

  const normalizedQuery = query.trim().toLowerCase()
  const filteredWorkflows = useMemo(
    () =>
      workflows.filter(workflow => {
        if (statusFilter !== 'all' && textOf(workflow.status, 'open') !== statusFilter) return false
        if (projectFilter && textOf(workflow.project) !== projectFilter) return false
        return (
          !normalizedQuery ||
          [workflow.title, workflow.description, workflow.plan, workflow.project, workflow.planner, workflow.executor, workflow.reviewer]
            .some(value => textOf(value).toLowerCase().includes(normalizedQuery))
        )
      }),
    [workflows, statusFilter, projectFilter, normalizedQuery]
  )

  const stageCounts = useMemo(
    () =>
      workflowStatusOptions.map(status => ({
        status,
        count: workflows.filter(workflow => textOf(workflow.status, 'open') === status).length
      })),
    [workflows]
  )

  const activeCount = workflows.filter(workflow => textOf(workflow.status, 'open') === 'in_progress').length
  const reviewCount = workflows.filter(workflow => textOf(workflow.status, 'open') === 'review').length
  const blockedCount = workflows.filter(workflow => textOf(workflow.status, 'open') === 'blocked').length
  const doneCount = workflows.filter(workflow => textOf(workflow.status, 'open') === 'done').length
  const otherCount = Math.max(0, workflows.length - activeCount - reviewCount - blockedCount - doneCount)

  /**
   * Completion trend derived entirely from loaded workflows: real
   * `progressPercent` values ordered by their `updatedAt`/`createdAt`. No
   * synthetic numbers — the sparkline / line chart only plot what the API
   * already returned.
   */
  const trend = useMemo(() => {
    const dated = workflows.map(workflow => ({
      workflow,
      t: new Date(textOf(workflow.updatedAt || workflow.createdAt)).getTime()
    }))
    const hasTime = dated.some(entry => !Number.isNaN(entry.t))
    const ordered = hasTime
      ? dated.filter(entry => !Number.isNaN(entry.t)).sort((a, b) => a.t - b.t).map(entry => entry.workflow)
      : workflows
    const points = ordered.map(progressPercentOf)
    const labels = ordered.map(workflow => textOf(workflow.id).slice(0, 6) || '-')
    let peakAt: number | undefined
    let peakLabel: string | undefined
    if (points.length >= 2) {
      let maxIndex = 0
      points.forEach((value, index) => {
        if (value > points[maxIndex]) maxIndex = index
      })
      peakAt = maxIndex
      peakLabel = `${points[maxIndex]}%`
    }
    return { points, labels, peakAt, peakLabel }
  }, [workflows])

  // Status distribution for the donut — real counts only, empty slices dropped.
  const statusSegments = useMemo<DonutSegment[]>(
    () =>
      (
        [
          { label: statusLabel('in_progress'), value: activeCount, tone: 'accent' },
          { label: statusLabel('review'), value: reviewCount, tone: 'info' },
          { label: statusLabel('blocked'), value: blockedCount, tone: 'danger' },
          { label: statusLabel('done'), value: doneCount, tone: 'success' },
          { label: t('其他', 'Other'), value: otherCount, tone: 'neutral' }
        ] satisfies DonutSegment[]
      ).filter(segment => segment.value > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCount, reviewCount, blockedCount, doneCount, otherCount, language]
  )

  // Alert surfaces a real, actionable condition only (blocked workflows).
  const alert = !message && blockedCount > 0
    ? {
        title:
          language === 'zh'
            ? `${blockedCount} 个工作流被阻塞`
            : `${blockedCount} workflows blocked`,
        description:
          language === 'zh'
            ? '这些工作流处于 blocked 状态，请复核后推进或发送 Signal 协调。'
            : 'These workflows are blocked — review and unblock or send a signal to coordinate.'
      }
    : null

  /* ----------------------------------------------------- core actions */

  const setWorkflowStatus = async (workflow: AnyRecord, status: string) => {
    const id = textOf(workflow.id)
    if (!id || busy) return
    setBusy(true)
    setMessage('')
    try {
      await apiPost(`/api/workflows/${encodeURIComponent(id)}/status`, { status, by: 'dashboard' })
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const openWorkflowAction = (workflow: AnyRecord, action: WorkflowEntryAction) => {
    setActionError('')
    setActionText('')
    setSignalTo(
      action === 'signal'
        ? roleValues(workflow, 'reviewer')[0] || roleValues(workflow, 'executor')[0] || 'all'
        : ''
    )
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
    if (!actionText.trim()) {
      setActionError(copy.workflowTextRequired)
      return
    }
    setActionBusy(true)
    setActionError('')
    try {
      if (action === 'signal') {
        await apiPost(`/api/workflows/${encodeURIComponent(id)}/signal`, {
          to: signalTo.trim(),
          text: actionText.trim(),
          type: 'handoff',
          by: 'dashboard'
        })
      } else {
        await apiPost(`/api/workflows/${encodeURIComponent(id)}/${action}`, {
          text: actionText.trim(),
          role: action === 'review' ? 'reviewer' : 'executor',
          by: 'dashboard'
        })
      }
      setActionState(null)
      await load()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setActionBusy(false)
    }
  }

  const canStart = (status: string) => !['in_progress', 'review', 'done', 'cancelled'].includes(status)

  /* ------------------------------------------------- CRUD */

  const openCreate = () => {
    setForm(emptyWorkflowForm())
    setFormError('')
    setEditState(null)
    setCreateOpen(true)
  }

  const openEdit = (workflow: AnyRecord) => {
    setForm({
      title: textOf(workflow.title),
      project: textOf(workflow.project),
      priority: textOf(workflow.priority, 'normal'),
      status: textOf(workflow.status, 'open'),
      planner: roleValues(workflow, 'planner').join(', '),
      executor: roleValues(workflow, 'executor').join(', '),
      reviewer: roleValues(workflow, 'reviewer').join(', '),
      observer: roleValues(workflow, 'observer').join(', '),
      risks: roleValues(workflow, 'risks').join(', '),
      plan: textOf(workflow.plan),
      acceptance: textOf(workflow.acceptance)
    })
    setFormError('')
    setEditState(workflow)
  }

  const submitForm = async () => {
    if (formBusy) return
    if (!form.title.trim()) {
      setFormError(copy.workflowTitleRequired)
      return
    }
    const id = editState ? textOf(editState.id) : ''
    const body = {
      title: form.title.trim(),
      project: form.project.trim(),
      priority: form.priority,
      status: form.status,
      planner: splitList(form.planner),
      executor: splitList(form.executor),
      reviewer: splitList(form.reviewer),
      observer: splitList(form.observer),
      risks: splitList(form.risks),
      plan: form.plan,
      acceptance: form.acceptance
    }
    setFormBusy(true)
    setFormError('')
    try {
      if (editState && id) {
        await apiPatch(`/api/workflows/${encodeURIComponent(id)}`, body)
      } else {
        await apiPost('/api/workflows', body)
      }
      setCreateOpen(false)
      setEditState(null)
      await load()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setFormBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteState) return
    const id = textOf(deleteState.id)
    if (!id) return
    setBusy(true)
    setMessage('')
    try {
      await apiDelete(`/api/workflows/${encodeURIComponent(id)}`, {})
      setDeleteState(null)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const openGraph = async (workflow: AnyRecord) => {
    const id = textOf(workflow.id)
    if (!id) return
    setGraphState(workflow)
    setGraphNodes([])
    setGraphError('')
    setGraphBusy(true)
    try {
      const data = await apiGet<AnyRecord>(`/api/workflows/${encodeURIComponent(id)}/nodes`)
      setGraphNodes(asArray<AnyRecord>((data as AnyRecord).nodes))
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : String(error))
    } finally {
      setGraphBusy(false)
    }
  }

  const sortedGraphNodes = useMemo(() => {
    const order = (role: string): number => {
      const index = workflowNodeRoleOrder.indexOf(role as (typeof workflowNodeRoleOrder)[number])
      return index === -1 ? workflowNodeRoleOrder.length : index
    }
    return [...graphNodes].sort((a, b) => {
      const diff = order(textOf(a.role)) - order(textOf(b.role))
      if (diff !== 0) return diff
      return textOf(a.createdAt || a.ts).localeCompare(textOf(b.createdAt || b.ts))
    })
  }, [graphNodes])

  const statusTabs = useMemo(
    () => [
      { id: 'all', label: copy.allStatuses, badge: workflows.length },
      ...stageCounts
        .filter(item => item.count > 0)
        .map(item => ({ id: item.status, label: statusLabel(item.status), badge: item.count }))
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stageCounts, workflows.length, language]
  )

  return (
    <>
      <PageHead
        title={title}
        subtitle={description}
        actions={
          <>
            <Button onClick={openCreate} disabled={busy}>
              <Plus className="h-4 w-4" />
              {copy.createWorkflow}
            </Button>
            <Button variant="secondary" onClick={() => void load()} disabled={busy}>
              <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
              {copy.refresh}
            </Button>
          </>
        }
      />

      {message ? (
        <ErrorState
          variant="block"
          title={copy.error}
          description={message}
          action={
            <Button onClick={() => void load()} disabled={busy}>
              <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
              {copy.refresh}
            </Button>
          }
        />
      ) : (
        <>
          {alert ? <AlertBanner tone="warning" title={alert.title} description={alert.description} /> : null}

          <MetricGrid>
            <MetricCard
              label={copy.workflowTotal}
              value={workflows.length}
              icon={GitBranch}
              spark={trend.points.length > 1 ? trend.points : undefined}
            />
            <MetricCard label={copy.workflowActive} value={activeCount} icon={Play} />
            <MetricCard label={copy.workflowReview} value={reviewCount} icon={CheckCheck} />
            <MetricCard label={copy.workflowBlocked} value={blockedCount} icon={PauseCircle} />
            <MetricCard label={statusLabel('done')} value={doneCount} icon={Layers} />
          </MetricGrid>

          {workflows.length >= 2 ? (
            <ChartRow
              title={t('工作流完成度', 'Workflow completion')}
              subtitle={t('按更新时间排序的进度', 'Progress ordered by last update')}
              series={[{ label: copy.progressLabel, points: trend.points }]}
              xLabels={trend.labels.length ? trend.labels : undefined}
              peakAt={trend.peakAt}
              peakLabel={trend.peakLabel}
              donutTitle={copy.workflowsByStatus}
              donutCenter={workflows.length}
              donutCenterLabel={copy.workflows}
              segments={statusSegments}
            />
          ) : null}

          <SectionTabs tabs={statusTabs} active={statusFilter} onChange={setStatusFilter} />

          <Card
            title={copy.workflows}
            count={filteredWorkflows.length}
            flushBody
            toolbar={
              <FilterBar
                search={{
                  id: 'workflow-search',
                  value: query,
                  onChange: setQuery,
                  placeholder: copy.searchPlaceholder,
                  label: copy.searchText
                }}
                filters={
                  projectOptions.length
                    ? [
                        {
                          type: 'single',
                          id: 'workflow-project',
                          label: copy.project,
                          allLabel: copy.allProjects,
                          options: projectOptions.map(project => ({ value: project, label: project })),
                          value: projectFilter,
                          onChange: setProjectFilter
                        }
                      ]
                    : []
                }
                onClear={() => {
                  setQuery('')
                  setStatusFilter('all')
                  setProjectFilter('')
                }}
                clearLabel={copy.clear}
              />
            }
          >
            {busy && workflows.length === 0 ? (
              <LoadingState variant="rows" label={copy.refreshing} className="p-4" />
            ) : filteredWorkflows.length ? (
              <div className="grid grid-cols-1 gap-4 p-[var(--card-pad)] lg:grid-cols-2">
                {filteredWorkflows.map(workflow => {
              const id = textOf(workflow.id)
              const status = textOf(workflow.status, 'open')
              const priority = textOf(workflow.priority, 'normal')
              const titleText = textOf(workflow.title, '-')
              const project = textOf(workflow.project, '-')
              const planner = roleValues(workflow, 'planner').join(', ')
              const executor = roleValues(workflow, 'executor').join(', ')
              const reviewer = roleValues(workflow, 'reviewer').join(', ')
              const observer = roleValues(workflow, 'observer').join(', ')
              const percent = progressPercentOf(workflow)
              return (
                <article
                  key={id}
                  className="flex min-h-[320px] flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-ink-3">#{id}</span>
                        <h3 className="truncate text-sm font-medium text-ink">{titleText}</h3>
                        <span className="rounded-full bg-surface-sunk px-2 py-0.5 text-xs text-ink-2">{project}</span>
                      </div>
                      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                        {planner ? (
                          <div className="flex gap-1">
                            <dt className="font-medium">{copy.planner}</dt>
                            <dd>{planner}</dd>
                          </div>
                        ) : null}
                        {executor ? (
                          <div className="flex gap-1">
                            <dt className="font-medium">{copy.executor}</dt>
                            <dd>{executor}</dd>
                          </div>
                        ) : null}
                        {reviewer ? (
                          <div className="flex gap-1">
                            <dt className="font-medium">{copy.reviewer}</dt>
                            <dd>{reviewer}</dd>
                          </div>
                        ) : null}
                        {observer ? (
                          <div className="flex gap-1">
                            <dt className="font-medium">{copy.observer}</dt>
                            <dd>{observer}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>
                      <Badge variant={priorityBadgeVariant(priority)}>{priorityLabel(priority)}</Badge>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-ink-3">
                      <span>{copy.progressLabel}</span>
                      <span className="tabular-nums">{percent}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunk">
                      <div
                        className="h-full rounded-full bg-accent-base transition-[width]"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-ink-3">
                      {copy.updated}: {formatRelativeTime(textOf(workflow.updatedAt || workflow.createdAt))}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {canStart(status) ? (
                        <Button size="sm" onClick={() => void setWorkflowStatus(workflow, 'in_progress')} disabled={busy}>
                          <Play className="h-4 w-4" />
                          {copy.startWorkflow}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openWorkflowAction(workflow, 'result')}
                        disabled={busy}
                      >
                        <FileText className="h-4 w-4" />
                        {copy.workflowResult}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openWorkflowAction(workflow, 'review')}
                        disabled={busy}
                      >
                        <CheckCheck className="h-4 w-4" />
                        {copy.workflowReviewEntry}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openWorkflowAction(workflow, 'signal')}
                        disabled={busy}
                      >
                        <Send className="h-4 w-4" />
                        {copy.workflowSignal}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEdit(workflow)}
                        disabled={busy}
                      >
                        {copy.editWorkflow}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void openGraph(workflow)}
                        disabled={busy}
                      >
                        {copy.viewExecutionGraph}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setDeleteState(workflow)}
                        disabled={busy}
                      >
                        {copy.deleteWorkflow}
                      </Button>
                    </div>
                  </div>
                </article>
              )
                })}
              </div>
            ) : (
              <EmptyState
                icon={<GitBranch className="h-5 w-5" />}
                title={workflows.length ? copy.noMatches : copy.noData}
                description={workflows.length ? undefined : copy.workflows}
              />
            )}
          </Card>
        </>
      )}

      {actionState ? (
        <WorkflowActionDialog
          copy={copy}
          state={actionState}
          text={actionText}
          signalTo={signalTo}
          busy={actionBusy}
          error={actionError}
          onTextChange={setActionText}
          onSignalToChange={setSignalTo}
          onClose={() => setActionState(null)}
          onSubmit={() => void submitWorkflowAction()}
        />
      ) : null}

      {createOpen || editState ? (
        <WorkflowFormDialog
          copy={copy}
          t={t}
          form={form}
          onFieldChange={setField}
          busy={formBusy}
          error={formError}
          isEdit={Boolean(editState)}
          onClose={() => {
            setCreateOpen(false)
            setEditState(null)
          }}
          onSubmit={() => void submitForm()}
        />
      ) : null}

      {deleteState ? (
        <WorkflowDeleteDialog
          copy={copy}
          workflow={deleteState}
          busy={busy}
          onClose={() => setDeleteState(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {graphState ? (
        <WorkflowGraphDialog
          copy={copy}
          t={t}
          workflow={graphState}
          nodes={sortedGraphNodes}
          busy={graphBusy}
          error={graphError}
          onClose={() => setGraphState(null)}
        />
      ) : null}
    </>
  )
}

/* ---------------------------------------------------- action dialog */

function WorkflowActionDialog({
  copy,
  state,
  text,
  signalTo,
  busy,
  error,
  onTextChange,
  onSignalToChange,
  onClose,
  onSubmit
}: {
  copy: DashboardCopy
  state: { action: WorkflowEntryAction; workflow: AnyRecord }
  text: string
  signalTo: string
  busy: boolean
  error: string
  onTextChange: (value: string) => void
  onSignalToChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  const isSignal = state.action === 'signal'
  const heading =
    state.action === 'result' ? copy.workflowResult : state.action === 'review' ? copy.workflowReviewEntry : copy.workflowSignal
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent className="workflow-create-dialog" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            {textOf(state.workflow.title, '-')} · {textOf(state.workflow.project, '-')}
          </DialogDescription>
        </DialogHeader>
        <div className="workflow-create-form flex flex-col gap-3">
          {isSignal ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-3">{copy.signalTo}</span>
              <input
                value={signalTo}
                onChange={event => onSignalToChange(event.target.value)}
                placeholder={copy.signalToPlaceholder}
                className={cn(fieldBaseStyles, 'h-9 px-3 py-0 font-normal')}
              />
            </label>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="workflow-action-text">{copy.actionText}</Label>
            <Textarea
              id="workflow-action-text"
              className="font-normal"
              value={text}
              onChange={event => onTextChange(event.target.value)}
              placeholder={copy.actionTextPlaceholder}
            />
          </div>
          {error ? <ErrorState variant="inline" title={error} /> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              {copy.cancel}
            </Button>
          </DialogClose>
          <Button onClick={onSubmit} disabled={busy}>
            {busy ? copy.running : heading}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------------------------- form dialog */

function WorkflowField({
  id,
  label,
  hint,
  value,
  onChange
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={event => onChange(event.target.value)} />
      {hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </div>
  )
}

function WorkflowFormDialog({
  copy,
  t,
  form,
  onFieldChange,
  busy,
  error,
  isEdit,
  onClose,
  onSubmit
}: {
  copy: DashboardCopy
  t: (zh: string, en: string) => string
  form: WorkflowFormState
  onFieldChange: (key: keyof WorkflowFormState, value: string) => void
  busy: boolean
  error: string
  isEdit: boolean
  onClose: () => void
  onSubmit: () => void
}) {
  const statusText = (status: string) =>
    copy.statusLabels[status as keyof DashboardCopy['statusLabels']] ?? status
  const commaHint = t('多个值用逗号分隔', 'Separate multiple values with commas')
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent className="workflow-create-dialog" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isEdit ? copy.editWorkflow : copy.createWorkflow}</DialogTitle>
          <DialogDescription>
            {t('填写工作流字段，多个角色用逗号分隔。', 'Fill in the workflow fields; separate multiple roles with commas.')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="workflow-create-form flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="wf-title">{copy.title}</Label>
            <Input
              id="wf-title"
              value={form.title}
              onChange={event => onFieldChange('title', event.target.value)}
              placeholder={copy.titlePlaceholder}
            />
          </div>
          <WorkflowField
            id="wf-project"
            label={copy.project}
            value={form.project}
            onChange={value => onFieldChange('project', value)}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="wf-priority">{copy.priority}</Label>
              <select
                id="wf-priority"
                value={form.priority}
                onChange={event => onFieldChange('priority', event.target.value)}
                className={cn(fieldBaseStyles, 'h-9 px-3 py-0')}
              >
                {workflowPriorityOptions.map(opt => (
                  <option key={opt} value={opt}>
                    {copy.priorityLabels[opt] ?? opt}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="wf-status">{copy.status}</Label>
              <select
                id="wf-status"
                value={form.status}
                onChange={event => onFieldChange('status', event.target.value)}
                className={cn(fieldBaseStyles, 'h-9 px-3 py-0')}
              >
                {workflowStatusOptions.map(opt => (
                  <option key={opt} value={opt}>
                    {statusText(opt)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <WorkflowField
            id="wf-planner"
            label={copy.planner}
            hint={commaHint}
            value={form.planner}
            onChange={value => onFieldChange('planner', value)}
          />
          <WorkflowField
            id="wf-executor"
            label={copy.executor}
            hint={commaHint}
            value={form.executor}
            onChange={value => onFieldChange('executor', value)}
          />
          <WorkflowField
            id="wf-reviewer"
            label={copy.reviewer}
            hint={commaHint}
            value={form.reviewer}
            onChange={value => onFieldChange('reviewer', value)}
          />
          <WorkflowField
            id="wf-observer"
            label={copy.observer}
            hint={commaHint}
            value={form.observer}
            onChange={value => onFieldChange('observer', value)}
          />
          <WorkflowField
            id="wf-risks"
            label={copy.workflowRisks}
            hint={commaHint}
            value={form.risks}
            onChange={value => onFieldChange('risks', value)}
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="wf-plan">{copy.workflowPlan}</Label>
            <Textarea
              id="wf-plan"
              className="font-normal"
              value={form.plan}
              onChange={event => onFieldChange('plan', event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="wf-acceptance">{copy.workflowAcceptance}</Label>
            <Textarea
              id="wf-acceptance"
              className="font-normal"
              value={form.acceptance}
              onChange={event => onFieldChange('acceptance', event.target.value)}
            />
          </div>
          {error ? <ErrorState variant="inline" title={error} /> : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              {copy.cancel}
            </Button>
          </DialogClose>
          <Button onClick={onSubmit} disabled={busy}>
            {busy ? copy.running : isEdit ? copy.editWorkflow : copy.createWorkflow}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------------------------- delete dialog */

function WorkflowDeleteDialog({
  copy,
  workflow,
  busy,
  onClose,
  onConfirm
}: {
  copy: DashboardCopy
  workflow: AnyRecord
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{copy.deleteWorkflow}</DialogTitle>
          <DialogDescription>
            {textOf(workflow.title, '-')} · {textOf(workflow.project, '-')}
          </DialogDescription>
        </DialogHeader>
        <div className="px-4 py-4">
          <p className="text-sm text-ink-3">{copy.confirmDeleteWorkflow}</p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              {copy.cancel}
            </Button>
          </DialogClose>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? copy.running : copy.deleteWorkflow}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------------------------- graph dialog */

function WorkflowGraphDialog({
  copy,
  t,
  workflow,
  nodes,
  busy,
  error,
  onClose
}: {
  copy: DashboardCopy
  t: (zh: string, en: string) => string
  workflow: AnyRecord
  nodes: AnyRecord[]
  busy: boolean
  error: string
  onClose: () => void
}) {
  const statusText = (status: string) =>
    copy.statusLabels[status as keyof DashboardCopy['statusLabels']] ?? status
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{copy.viewExecutionGraph}</DialogTitle>
          <DialogDescription>
            {textOf(workflow.title, '-')} · {textOf(workflow.project, '-')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {busy ? (
            <LoadingState variant="rows" label={copy.refreshing} className="p-4" />
          ) : error ? (
            <ErrorState variant="inline" title={error} />
          ) : nodes.length ? (
            <ol className="flex flex-col">
              {nodes.map((node, index) => {
                const status = textOf(node.status)
                const role = textOf(node.role)
                const actor = textOf(node.actor)
                return (
                  <li
                    key={textOf(node.nodeId, String(index))}
                    className="relative flex gap-3 pb-4 last:pb-0"
                  >
                    <div className="flex flex-col items-center">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunk text-xs font-medium text-ink-2">
                        {index + 1}
                      </span>
                      {index < nodes.length - 1 ? (
                        <span className="mt-1 w-px flex-1 bg-line" aria-hidden="true" />
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">{textOf(node.label, '-')}</span>
                        <Badge variant={statusBadgeVariant(status)}>{statusText(status)}</Badge>
                      </div>
                      <div className="text-xs text-ink-3">
                        {role}
                        {role && actor ? ' · ' : ''}
                        {actor}
                      </div>
                      <div className="text-xs text-ink-3">{formatRelativeTime(textOf(node.ts))}</div>
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : (
            <EmptyState
              title={t('暂无执行节点', 'No execution nodes yet')}
              description={t('该工作流还没有节点记录。', 'This workflow has no node records yet.')}
            />
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              {copy.close}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
