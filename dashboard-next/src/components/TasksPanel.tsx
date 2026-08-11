import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Plus } from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input, fieldBaseStyles } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from './ui/dialog'
import { EmptyState, FilterBar, Panel, StatusTabs } from '@/components/shell'
import { priorityBadgeVariant, statusBadgeVariant } from '@/lib/statusBadge'
import { VirtualizedList } from './VirtualizedList'
import { ListRow, LIST_ROW_HEIGHT } from './ListRow'
import { RelatedEntities } from './RelatedEntities'
import type { AnyRecord } from '@/lib/api'
import type { AppLanguage } from '@/lib/i18n'
import { formatDate, formatRelativeTime } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { DashboardCopy } from '@/lib/dashboardCopy'

type TasksCopy = Pick<DashboardCopy,
  | 'addTask'
  | 'allOption'
  | 'allPriorities'
  | 'allProjects'
  | 'allStatuses'
  | 'approve'
  | 'approveAndComplete'
  | 'assignee'
  | 'attempts'
  | 'cancel'
  | 'cancelledTerminal'
  | 'claim'
  | 'clear'
  | 'close'
  | 'completeDirectly'
  | 'confirmCancelTask'
  | 'confirmCancelTaskAction'
  | 'confirmCancelTaskHint'
  | 'created'
  | 'createdLabel'
  | 'deliveryState'
  | 'description'
  | 'executionInfo'
  | 'handoff'
  | 'id'
  | 'keepTask'
  | 'loadMore'
  | 'loadingMore'
  | 'itemsSelected'
  | 'moreActions'
  | 'noData'
  | 'noMatchesInLoaded'
  | 'noMatchesProject'
  | 'partialScopePrefix'
  | 'partialScopeSuffix'
  | 'priority'
  | 'priorityLabels'
  | 'progressLabel'
  | 'project'
  | 'recentIssue'
  | 'recentTasks'
  | 'refreshing'
  | 'activityLog'
  | 'reject'
  | 'reopen'
  | 'requestVerification'
  | 'reviewStatusLabel'
  | 'running'
  | 'searchProjectPlaceholder'
  | 'searchText'
  | 'sendRadioRequest'
  | 'source'
  | 'start'
  | 'status'
  | 'statusLabels'
  | 'taskLabel'
  | 'time'
  | 'title'
  | 'unblock'
  | 'updated'
  | 'updatedLabel'
  | 'worktreeLabel'
>

interface TasksPanelProps {
  tasks: AnyRecord[]
  visibleProjects: AnyRecord[]
  /** Full server-side per-status counts (the `kanban` field). When present the
   *  status strip prefers these over the loaded-slice counts so /tasks agrees
   *  with /analytics. */
  kanban?: AnyRecord
  copy: TasksCopy
  onMutate: (action: string, path: string, body: AnyRecord) => Promise<boolean>
  hasMore?: boolean
  onLoadMore?: () => Promise<void>
  language: AppLanguage
}

type TaskMenuAction = {
  key: string
  label: string
  disabled?: boolean
  onSelect: () => void
}

function textOf(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function uniqueSorted(items: string[]): string[] {
  return Array.from(new Set(items)).sort()
}

function statusLabel(copy: TasksCopy, status: string): string {
  return copy.statusLabels[status as keyof TasksCopy['statusLabels']] || status
}

/** Canonical task-status order for the status strip. The old strip hardcoded
 *  only five of these (dropping `blocked`, `failed`, `cancelled`); deriving
 *  the strip from this full list keeps every real status reachable. */
const TASK_STATUS_ORDER = [
  'open',
  'claimed',
  'in_progress',
  'needs_verification',
  'blocked',
  'failed',
  'done',
  'cancelled'
]

function priorityLabel(copy: TasksCopy, priority: string): string {
  return copy.priorityLabels[priority as keyof TasksCopy['priorityLabels']] || priority
}

export function TasksPanel({ tasks, visibleProjects, kanban, copy, onMutate, hasMore = false, onLoadMore, language }: TasksPanelProps) {
  const locale = language === 'zh' ? 'zh-CN' : 'en'
  const [projectFilter, setProjectFilter] = useState<string[]>([])
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [newTask, setNewTask] = useState({
    title: '',
    project: 'ai-memory-hub',
    priority: 'normal',
    description: '',
    handoff: ''
  })
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [selectedTask, setSelectedTask] = useState<AnyRecord | null>(null)
  const [visibleCount, setVisibleCount] = useState(60)
  const [loadingMore, setLoadingMore] = useState(false)

  const projectOptions = useMemo(
    () => uniqueSorted(tasks.map(task => textOf(task.project)).filter(Boolean)),
    [tasks]
  )
  const formProjectOptions = useMemo(
    () => uniqueSorted([
      ...visibleProjects.map(project => textOf(project.id || project.name || project.displayName)).filter(Boolean),
      ...projectOptions
    ]),
    [visibleProjects, projectOptions]
  )
  const priorityOptions = useMemo(
    () => uniqueSorted(tasks.map(task => textOf(task.priority)).filter(Boolean)),
    [tasks]
  )
  const statusOptions = useMemo(
    () => uniqueSorted(tasks.map(task => textOf(task.status)).filter(Boolean)),
    [tasks]
  )
  const cleanQuery = query.trim().toLowerCase()
  const activeProjectFilter = projectFilter.filter(value => projectOptions.includes(value))
  const activePriorityFilter = priorityFilter.filter(value => priorityOptions.includes(value))
  const activeStatusFilter = statusFilter.filter(value => statusOptions.includes(value))
  const statusCounts = useMemo(() => tasks.reduce<Record<string, number>>((counts, task) => { const status = textOf(task.status, 'open'); counts[status] = (counts[status] || 0) + 1; return counts }, {}), [tasks])
  // The server `kanban` is built from the whole filtered dataset, so its per-
  // status lengths are the authoritative totals (the loaded `tasks` slice may
  // be capped at the page size). Prefer it so the strip matches /analytics.
  const kanbanCounts = useMemo(() => {
    if (!kanban) return null
    const result: Record<string, number> = {}
    for (const [status, value] of Object.entries(kanban)) {
      result[status] = Array.isArray(value) ? value.length : Number(value) || 0
    }
    return result
  }, [kanban])
  const displayCounts = kanbanCounts ?? statusCounts
  const totalTaskCount = TASK_STATUS_ORDER.reduce((sum, status) => sum + (displayCounts[status] || 0), 0)
  const statusTabItems = useMemo(() => {
    const source = kanbanCounts ? TASK_STATUS_ORDER : statusOptions
    return source
      .map(status => ({ value: status, label: statusLabel(copy, status), count: displayCounts[status] || 0 }))
      // With server counts we only surface statuses that actually have tasks;
      // in the fallback (no kanban) we keep whatever the loaded slice shows.
      .filter(item => item.count > 0)
  }, [kanbanCounts, statusOptions, displayCounts, copy])
  const filteredTasks = tasks.filter(task => {
    if (activeProjectFilter.length && !activeProjectFilter.includes(textOf(task.project))) return false
    if (activePriorityFilter.length && !activePriorityFilter.includes(textOf(task.priority))) return false
    if (activeStatusFilter.length && !activeStatusFilter.includes(textOf(task.status))) return false
    return !cleanQuery || [task.title, task.description, task.handoff, task.assignee, task.createdBy, task.status, task.project]
      .some(value => textOf(value).toLowerCase().includes(cleanQuery))
  })

  const projectFilterKey = activeProjectFilter.join(',')
  const priorityFilterKey = activePriorityFilter.join(',')
  const statusFilterKey = activeStatusFilter.join(',')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset load-more window when filters change
    setVisibleCount(60)
  }, [cleanQuery, projectFilterKey, priorityFilterKey, statusFilterKey])

  const visibleTasks = filteredTasks.slice(0, visibleCount)
  // The filter above only sees the rows this client has fetched, so any count we
  // print is a count of the loaded slice — never a server total. `hasMore` is the
  // only server-side signal we get here (`total` is not passed in), so the copy
  // states the searched scope instead of inventing a denominator.
  const partialScopeNote = `${copy.partialScopePrefix} ${tasks.length} ${copy.partialScopeSuffix}`
  const loadMore = async () => {
    if (visibleTasks.length < filteredTasks.length) {
      setVisibleCount(value => Math.min(value + 60, filteredTasks.length))
      return
    }
    if (!hasMore || !onLoadMore || loadingMore) return
    setLoadingMore(true)
    try {
      await onLoadMore()
    } finally {
      setLoadingMore(false)
    }
  }

  const mutateTask = async (action: string, path: string, body: AnyRecord) => {
    setBusy(action)
    setError('')
    try {
      return await onMutate(action, path, body)
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
    const succeeded = await mutateTask('add-task', '/api/task/add', { ...newTask, title, from: 'dashboard-next' })
    if (succeeded) {
      setNewTask({ title: '', project: newTask.project, priority: 'normal', description: '', handoff: '' })
      setCreateOpen(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <StatusTabs
        mode="multi"
        label={copy.status}
        items={statusTabItems}
        values={activeStatusFilter}
        onChange={setStatusFilter}
        allItem={{ value: '', label: copy.allStatuses, count: totalTaskCount }}
      />
      {/* Panel (h2) rather than Card (CardTitle renders h3): this section sits under
          the page h1, so a card title skipped a heading level (WCAG 1.3.1). The body
          keeps its default p-4 because the toolbar lives in it — `flushBody` would
          leave ListRow's `-mx-4` bleeding 16px past the panel edge. */}
      <Panel
        title={copy.recentTasks}
        count={filteredTasks.length}
        actions={
          /* Panel.tsx:9 — buttons in a panel header MUST be size="sm" (32px). */
          <Button size="sm" onClick={() => { setError(''); setCreateOpen(true) }}>
            <Plus className="h-4 w-4" />
            {copy.addTask}
          </Button>
        }
        footer={hasMore && filteredTasks.length > 0 ? (
          // The end marker only auto-loads once per sentinel crossing now, so a
          // filtered result shorter than the viewport can never scroll far enough to
          // ask for the next page. This footer is that ask, made explicit.
          <>
            <span>{partialScopeNote}</span>
            <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? copy.loadingMore : copy.loadMore}</Button>
          </>
        ) : undefined}
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
                options: priorityOptions.map(value => ({ value, label: priorityLabel(copy, value) })),
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

          {error ? <div className="flex items-center gap-2 rounded-sm border border-danger-line bg-danger-tint p-3"><AlertCircle className="h-4 w-4 shrink-0 text-danger" /><p className="text-sm text-danger-text">{error}</p></div> : null}

          {filteredTasks.length ? (
            <div aria-busy={loadingMore} className="-mx-4 border-t border-border">
            <VirtualizedList
              items={visibleTasks}
              itemHeight={LIST_ROW_HEIGHT}
              getKey={(task, index) => textOf(task.id, `${textOf(task.title, 'task')}-${index}`)}
              hasMore={visibleTasks.length < filteredTasks.length || hasMore}
              loading={loadingMore}
              loadingLabel={copy.loadingMore}
              onEndReached={() => void loadMore()}
              renderItem={task => <TaskCard task={task} copy={copy} busy={busy} onMutate={mutateTask} onOpen={() => setSelectedTask(task)} locale={locale} />}
            />
            </div>
          ) : hasMore ? (
            // Filtering to zero rows used to unmount the list, which also unmounted the
            // only thing that ever called `loadMore` (VirtualizedList's end marker), so
            // "no data" became permanent even though unfetched pages still matched.
            <div aria-busy={loadingMore}>
              <EmptyState
                title={copy.noMatchesInLoaded}
                description={partialScopeNote}
                action={<Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? copy.loadingMore : copy.loadMore}</Button>}
              />
            </div>
          ) : <EmptyState title={copy.noData} />}
      </Panel>

      {selectedTask ? <TaskDetailsDialog task={selectedTask} copy={copy} busy={busy} onMutate={mutateTask} onClose={() => setSelectedTask(null)} /> : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl dialog-scroll-shell" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{copy.addTask}</DialogTitle></DialogHeader>
          <div className="grid gap-4 dialog-scroll-body">
            {error ? <div role="alert" className="rounded-sm border border-danger-line bg-danger-tint p-3 text-sm text-danger-text">{error}</div> : null}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 grid gap-2"><Label htmlFor="task-title">{copy.title}</Label><Input id="task-title" value={newTask.title} onChange={event => setNewTask(value => ({ ...value, title: event.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="task-project">{copy.project}</Label><Input id="task-project" value={newTask.project} onChange={event => setNewTask(value => ({ ...value, project: event.target.value }))} list="task-project-options" /><datalist id="task-project-options">{formProjectOptions.map(project => <option value={project} key={project} />)}</datalist></div>
              <div className="grid gap-2"><Label htmlFor="task-priority">{copy.priority}</Label><select id="task-priority" value={newTask.priority} onChange={event => setNewTask(value => ({ ...value, priority: event.target.value }))} className={cn(fieldBaseStyles, 'flex h-9 px-3 py-0')}>{['low', 'normal', 'high', 'urgent'].map(priority => <option value={priority} key={priority}>{priorityLabel(copy, priority)}</option>)}</select></div>
              <div className="col-span-2 grid gap-2"><Label htmlFor="task-description">{copy.description}</Label><Textarea id="task-description" value={newTask.description} onChange={event => setNewTask(value => ({ ...value, description: event.target.value }))} rows={3} /></div>
              <div className="col-span-2 grid gap-2"><Label htmlFor="task-handoff">{copy.handoff}</Label><Textarea id="task-handoff" value={newTask.handoff} onChange={event => setNewTask(value => ({ ...value, handoff: event.target.value }))} rows={3} /></div>
            </div>
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline">{copy.cancel}</Button></DialogClose><Button onClick={() => void submitTask()} disabled={busy === 'add-task' || !newTask.title.trim()}>{busy === 'add-task' ? copy.running : copy.addTask}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TaskCard({ task, copy, busy, onMutate, onOpen, locale }: { task: AnyRecord; copy: TasksCopy; busy: string; onMutate: TasksPanelProps['onMutate']; onOpen: () => void; locale: string }) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const id = textOf(task.id)
  const status = textOf(task.status, 'open')
  const priority = textOf(task.priority, 'normal')
  const isBusy = busy.startsWith(`${id}:`)
  const canReview = !['cancelled', 'done'].includes(status)
  const runStatus = (nextStatus: string) => onMutate(`${id}:${nextStatus}`, '/api/task/status', { id, status: nextStatus, by: 'dashboard-next' })
  const review = (decision: 'approved' | 'rejected') => onMutate(`${id}:${decision}`, '/api/task/review', { id, decision, by: 'dashboard-next' })
  const sendRadioRequest = () => onMutate(`${id}:radio-request`, '/api/radio/send', {
    from: 'dashboard-next', to: textOf(task.assignee, 'all') || 'all', type: 'request', project: textOf(task.project), thread: id, replyTo: id, text: `Task request: ${textOf(task.title, id)}`
  })
  const secondaryActions: TaskMenuAction[] = [
    { key: 'radio-request', label: copy.sendRadioRequest, disabled: isBusy, onSelect: () => void sendRadioRequest() }
  ]
  if (status === 'in_progress') {
    secondaryActions.unshift({ key: 'needs_verification', label: copy.requestVerification, disabled: isBusy, onSelect: () => void runStatus('needs_verification') })
  }
  if (canReview) {
    secondaryActions.push(
      { key: 'approved', label: copy.approve, disabled: isBusy, onSelect: () => void review('approved') },
      { key: 'rejected', label: copy.reject, disabled: isBusy, onSelect: () => void review('rejected') },
      // Cancel is confirmed rather than fired straight from the menu: the server hides
      // cancelled tasks from every response unless `includeCancelled` is set, and no
      // client code sends that flag, so the row is unrecoverable from this console.
      { key: 'cancel', label: copy.cancel, disabled: isBusy, onSelect: () => setCancelOpen(true) }
    )
  }

  const rawTimestamp = textOf(task.updatedAt || task.createdAt)
  const timeNode = rawTimestamp ? <time dateTime={rawTimestamp}>{formatRelativeTime(rawTimestamp, locale)}</time> : null
  const subtitleParts = [textOf(task.project), textOf(task.assignee || task.createdBy), timeNode].filter(Boolean)
  const subtitle = subtitleParts.length ? (
    <span className="inline-flex items-center gap-2">
      {subtitleParts.map((part, index) => (index === 0 ? part : <span key={index} className="inline-flex items-center gap-2"><span aria-hidden="true">·</span>{part}</span>))}
    </span>
  ) : undefined

  return (
    <ListRow
      onOpen={onOpen}
      ariaLabel={textOf(task.title, id)}
      leading={<span className={`size-2 shrink-0 rounded-full ${statusDotClass(status)}`} aria-hidden="true" />}
      title={textOf(task.title, '-')}
      subtitle={subtitle || undefined}
      meta={
        <>
          <StatusBadge status={status} copy={copy} />
          <PriorityBadge priority={priority} copy={copy} />
        </>
      }
      actionsVisible
      actions={
        <>
          {status === 'open' ? <Button size="sm" disabled={isBusy} onClick={() => void onMutate(`${id}:claim`, '/api/task/claim', { id, by: 'dashboard-next' })}>{copy.claim}</Button> : null}
          {['claimed', 'blocked'].includes(status) ? <Button size="sm" disabled={isBusy} onClick={() => void runStatus('in_progress')}>{status === 'blocked' ? copy.unblock : copy.start}</Button> : null}
          {status === 'in_progress' ? <Button size="sm" disabled={isBusy} onClick={() => void runStatus('done')}>{copy.completeDirectly}</Button> : null}
          {status === 'needs_verification' ? <Button size="sm" disabled={isBusy} onClick={() => void review('approved')}>{copy.approveAndComplete}</Button> : null}
          {status === 'done' ? <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void runStatus('open')}>{copy.reopen}</Button> : null}
          {status === 'cancelled' ? null : <TaskActionMenu label={copy.moreActions} actions={secondaryActions} />}
          {cancelOpen ? (
            <CancelTaskDialog
              copy={copy}
              taskTitle={textOf(task.title, id)}
              busy={isBusy}
              onClose={() => setCancelOpen(false)}
              onConfirm={async () => {
                await runStatus('cancelled')
                setCancelOpen(false)
              }}
            />
          ) : null}
        </>
      }
    />
  )
}

function CancelTaskDialog({ copy, taskTitle, busy, onClose, onConfirm }: { copy: TasksCopy; taskTitle: string; busy: boolean; onClose: () => void; onConfirm: () => Promise<void> }) {
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{copy.confirmCancelTask}</DialogTitle>
        <DialogDescription>{taskTitle}</DialogDescription>
      </DialogHeader>
      <p className="text-sm text-ink-3">{copy.confirmCancelTaskHint}</p>
      <DialogFooter>
        <DialogClose asChild><Button variant="outline" disabled={busy}>{copy.keepTask}</Button></DialogClose>
        <Button variant="destructive" disabled={busy} onClick={() => void onConfirm()}>{busy ? copy.running : copy.confirmCancelTaskAction}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

function TaskDetailsDialog({ task, copy, busy, onMutate, onClose }: { task: AnyRecord; copy: TasksCopy; busy: string; onMutate: TasksPanelProps['onMutate']; onClose: () => void }) {
  const id = textOf(task.id)
  const status = textOf(task.status, 'open')
  const priority = textOf(task.priority, 'normal')
  const isBusy = busy.startsWith(`${id}:`)
  const runStatus = (nextStatus: string) => void onMutate(`${id}:${nextStatus}`, '/api/task/status', { id, status: nextStatus, by: 'dashboard-next' })
  const review = (decision: 'approved' | 'rejected') => void onMutate(`${id}:${decision}`, '/api/task/review', { id, decision, by: 'dashboard-next' })
  const notes = Array.isArray(task.notes) ? task.notes : []
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="max-w-3xl task-detail-dialog-content" aria-describedby={undefined}><DialogHeader><DialogTitle>{textOf(task.title, copy.recentTasks)}</DialogTitle></DialogHeader><div className="task-detail-dialog"><div className="task-detail-lead"><StatusBadge status={status} copy={copy} /><PriorityBadge priority={priority} copy={copy} /><span>{textOf(task.project, copy.allProjects)}</span><RelatedEntities entityType="task" entityId={id} /></div>{task.description ? <section className="task-detail-section"><h3>{copy.description}</h3><p className="task-detail-description">{textOf(task.description)}</p></section> : null}<dl className="task-detail-grid"><TaskMetadata label={copy.project} value={textOf(task.project, '-')} /><TaskMetadata label={copy.assignee} value={textOf(task.assignee || task.createdBy, '-')} /><TaskMetadata label={copy.priority} value={priorityLabel(copy, priority)} /><TaskMetadata label={copy.updatedLabel} value={formatDate(textOf(task.updatedAt || task.createdAt))} /><TaskMetadata label={copy.createdLabel} value={formatDate(textOf(task.createdAt))} /><TaskMetadata label={copy.id} value={id || '-'} /></dl>{task.handoff ? <section className="task-detail-section task-detail-note"><h3>{copy.handoff}</h3><p>{textOf(task.handoff)}</p></section> : null}<section className="task-detail-section"><h3>{copy.executionInfo}</h3><dl className="task-detail-grid"><TaskMetadata label={copy.deliveryState} value={textOf(task.deliveryState, '-')} /><TaskMetadata label={copy.attempts} value={`${textOf(task.attempt, '0')} / ${textOf(task.maxRetries, '—')}`} /><TaskMetadata label={copy.progressLabel} value={textOf(task.progressStatus || task.progressPercent, '-')} /><TaskMetadata label={copy.reviewStatusLabel} value={textOf(task.reviewStatus, '-')} /></dl></section>{task.lastError ? <section className="task-detail-section task-detail-error"><h3>{copy.recentIssue}</h3><p>{textOf(task.lastError)}</p></section> : null}{notes.length ? <section className="task-detail-section"><h3>{copy.activityLog}（{Math.min(notes.length, 8)}）</h3><div className="task-detail-timeline">{notes.slice(-8).reverse().map((note, index) => <div key={textOf(note.ts, String(index))}><time dateTime={textOf(note.ts)}>{formatDate(textOf(note.ts))}</time><strong>{textOf(note.by, '-')}</strong><p>{textOf(note.text, '-')}</p></div>)}</div></section> : null}<div className="task-detail-actions">{status === 'open' ? <Button disabled={isBusy} onClick={() => void onMutate(`${id}:claim`, '/api/task/claim', { id, by: 'dashboard-next' })}>{copy.claim}</Button> : null}{['claimed', 'blocked'].includes(status) ? <Button disabled={isBusy} onClick={() => runStatus('in_progress')}>{status === 'blocked' ? copy.unblock : copy.start}</Button> : null}{status === 'in_progress' ? <><Button disabled={isBusy} onClick={() => runStatus('done')}>{copy.completeDirectly}</Button><Button variant="outline" disabled={isBusy} onClick={() => runStatus('needs_verification')}>{copy.requestVerification}</Button></> : null}{status === 'needs_verification' ? <><Button disabled={isBusy} onClick={() => review('approved')}>{copy.approveAndComplete}</Button><Button variant="outline" disabled={isBusy} onClick={() => review('rejected')}>{copy.reject}</Button></> : null}{status === 'done' ? <Button variant="outline" disabled={isBusy} onClick={() => runStatus('open')}>{copy.reopen}</Button> : null}</div></div><DialogFooter><Button variant="outline" onClick={onClose}>{copy.cancel}</Button></DialogFooter></DialogContent></Dialog>
}
const STATUS_DOT_CLASSES: Record<string, string> = {
  open: 'bg-muted-foreground',
  claimed: 'bg-info',
  in_progress: 'bg-accent-bright',
  needs_verification: 'bg-warning',
  blocked: 'bg-destructive',
  failed: 'bg-destructive',
  done: 'bg-success',
  cancelled: 'bg-line-strong'
}

export function statusDotClass(status: string) {
  return STATUS_DOT_CLASSES[status] || 'bg-muted-foreground'
}

function TaskMetadata({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>
}

function StatusBadge({ status, copy }: { status: string; copy: TasksCopy }) {
  return (
    <Badge variant={statusBadgeVariant(status)} className="max-w-[180px] truncate">
      {statusLabel(copy, status)}
    </Badge>
  )
}

function PriorityBadge({ priority, copy }: { priority: string; copy: TasksCopy }) {
  return (
    <Badge variant={priorityBadgeVariant(priority)} className="max-w-[180px] truncate">
      {priorityLabel(copy, priority)}
    </Badge>
  )
}

function TaskActionMenu({ label, actions }: { label: string; actions: TaskMenuAction[] }) {
  const [open, setOpen] = useState(false)
  const [dropDown, setDropDown] = useState(false)
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Dashboard.css:514 opens this menu upward (`bottom: calc(100% + 8px)`), and the
  // virtualized list clips its overflow, so for the top rows the whole menu was
  // painted above the scroller and became invisible AND unclickable — the newest
  // task, the one people act on most, had no working "more actions". Flipping it
  // down is only half the fix: every row is a `will-change: transform` stacking
  // context, so a downward menu is painted under the NEXT row unless the open row
  // is lifted above its siblings for as long as the menu is open.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const items = menuRef.current?.querySelector<HTMLDivElement>('.task-action-menu-items')
    const clip = trigger?.closest('.virtual-list-viewport')
    const row = trigger?.closest<HTMLElement>('.virtual-list-item')
    if (row) row.style.zIndex = '5'
    if (trigger && items && clip) {
      const roomAbove = trigger.getBoundingClientRect().top - clip.getBoundingClientRect().top
      // Flip direction from measured geometry, before paint.
      setDropDown(roomAbove < items.getBoundingClientRect().height + 8)
    }
    return () => { if (row) row.style.zIndex = '' }
  }, [open])

  const closeAndFocusTrigger = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []).filter(item => !item.disabled)

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
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')
    first?.focus()
  }, [open])

  return <div className="task-action-menu" ref={menuRef}>
    <button ref={triggerRef} className="task-action-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(value => !value)}>{label}</button>
    {open ? <div className="task-action-menu-items" style={dropDown ? { top: 'calc(100% + 8px)', bottom: 'auto' } : undefined} id={menuId} role="menu" aria-label={label}>{actions.map(action => <button key={action.key} type="button" role="menuitem" disabled={action.disabled} onClick={() => { closeAndFocusTrigger(); action.onSelect() }}>{action.label}</button>)}</div> : null}
  </div>
}
