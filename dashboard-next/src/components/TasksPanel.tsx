import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertCircle, Plus, Search, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogClose } from './ui/dialog'
import { VirtualizedList } from './VirtualizedList'
import { RelatedEntities } from './RelatedEntities'
import type { AnyRecord } from '@/lib/api'
import { formatDate, formatRelativeTime } from '@/lib/api'
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
  | 'created'
  | 'createdLabel'
  | 'deliveryState'
  | 'description'
  | 'executionInfo'
  | 'handoff'
  | 'id'
  | 'itemsSelected'
  | 'moreActions'
  | 'noData'
  | 'noMatchesProject'
  | 'priority'
  | 'priorityLabels'
  | 'progressLabel'
  | 'project'
  | 'recentIssue'
  | 'recentTasks'
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
  copy: TasksCopy
  onMutate: (action: string, path: string, body: AnyRecord) => Promise<boolean>
  hasMore?: boolean
  onLoadMore?: () => Promise<void>
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

function priorityLabel(copy: TasksCopy, priority: string): string {
  return copy.priorityLabels[priority as keyof TasksCopy['priorityLabels']] || priority
}

export function TasksPanel({ tasks, visibleProjects, copy, onMutate, hasMore = false, onLoadMore }: TasksPanelProps) {
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
    <div className="space-y-6">
      <div className="task-status-summary">{['open', 'claimed', 'in_progress', 'needs_verification', 'done'].map(status => <button type="button" className={activeStatusFilter.includes(status) ? 'task-summary-item is-active' : 'task-summary-item'} key={status} onClick={() => setStatusFilter(activeStatusFilter.includes(status) ? activeStatusFilter.filter(value => value !== status) : [...activeStatusFilter, status])}><span>{statusLabel(copy, status)}</span><strong>{statusCounts[status] || 0}</strong></button>)}</div>
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>{copy.recentTasks}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{filteredTasks.length}</p>
            </div>
            <Button onClick={() => { setError(''); setCreateOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              {copy.addTask}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="task-filter-toolbar">
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="task-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchText} aria-label={copy.searchText} className="pl-9" />
              </div>
            </div>
            <MultiTaskFilter label={copy.status} values={activeStatusFilter} onChange={setStatusFilter} options={statusOptions} copy={copy} displayValue={value => statusLabel(copy, value)} />
            <MultiTaskFilter label={copy.project} values={activeProjectFilter} onChange={setProjectFilter} options={projectOptions} copy={copy} searchable />
            <MultiTaskFilter label={copy.priority} values={activePriorityFilter} onChange={setPriorityFilter} options={priorityOptions} copy={copy} displayValue={value => priorityLabel(copy, value)} />
            <div className="flex items-end">
              <Button variant="outline" onClick={() => { setQuery(''); setProjectFilter([]); setPriorityFilter([]); setStatusFilter([]) }} className="w-full">
                <X className="mr-2 h-4 w-4" />
                {copy.clear}
              </Button>
            </div>
          </div>

          {error ? <div className="flex items-center gap-2 mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3"><AlertCircle className="h-4 w-4 shrink-0 text-destructive" /><p className="text-sm text-destructive">{error}</p></div> : null}

          {filteredTasks.length ? (
            <div aria-live="polite" aria-busy={loadingMore}>
            <VirtualizedList
              items={visibleTasks}
              itemHeight={300}
              getKey={(task, index) => textOf(task.id, `${textOf(task.title, 'task')}-${index}`)}
              hasMore={visibleTasks.length < filteredTasks.length || hasMore}
              loading={loadingMore}
              onEndReached={() => void loadMore()}
              className="task-virtual-list"
              renderItem={task => <TaskCard task={task} copy={copy} busy={busy} onMutate={mutateTask} onOpen={() => setSelectedTask(task)} />}
            />
            </div>
          ) : <div className="py-8 text-center text-muted-foreground">{copy.noData}</div>}
        </CardContent>
      </Card>

      {selectedTask ? <TaskDetailsDialog task={selectedTask} copy={copy} busy={busy} onMutate={mutateTask} onClose={() => setSelectedTask(null)} /> : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{copy.addTask}</DialogTitle><DialogDescription>{copy.addTask}</DialogDescription></DialogHeader>
          {error ? <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2"><Label htmlFor="task-title">{copy.title}</Label><Input id="task-title" value={newTask.title} onChange={event => setNewTask(value => ({ ...value, title: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="task-project">{copy.project}</Label><Input id="task-project" value={newTask.project} onChange={event => setNewTask(value => ({ ...value, project: event.target.value }))} list="task-project-options" /><datalist id="task-project-options">{formProjectOptions.map(project => <option value={project} key={project} />)}</datalist></div>
              <div className="space-y-2"><Label htmlFor="task-priority">{copy.priority}</Label><select id="task-priority" value={newTask.priority} onChange={event => setNewTask(value => ({ ...value, priority: event.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">{['low', 'normal', 'high', 'urgent'].map(priority => <option value={priority} key={priority}>{priorityLabel(copy, priority)}</option>)}</select></div>
              <div className="col-span-2 space-y-2"><Label htmlFor="task-description">{copy.description}</Label><Textarea id="task-description" value={newTask.description} onChange={event => setNewTask(value => ({ ...value, description: event.target.value }))} rows={3} /></div>
              <div className="col-span-2 space-y-2"><Label htmlFor="task-handoff">{copy.handoff}</Label><Textarea id="task-handoff" value={newTask.handoff} onChange={event => setNewTask(value => ({ ...value, handoff: event.target.value }))} rows={3} /></div>
            </div>
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline">{copy.cancel}</Button></DialogClose><Button onClick={() => void submitTask()} disabled={busy === 'add-task' || !newTask.title.trim()}>{busy === 'add-task' ? copy.running : copy.addTask}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MultiTaskFilter({ label, values, onChange, options, copy, displayValue = value => value, searchable = false }: { label: string; values: string[]; onChange: (values: string[]) => void; options: string[]; copy: TasksCopy; displayValue?: (value: string) => string; searchable?: boolean }) {
  const [query, setQuery] = useState('')
  const detailsRef = useRef<HTMLDetailsElement | null>(null)
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) detailsRef.current.open = false
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current) detailsRef.current.open = false
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [])
  if (!options.length) return null
  const visibleOptions = options.filter(option => !query.trim() || displayValue(option).toLowerCase().includes(query.trim().toLowerCase()))
  const selectedLabel = values.length ? `${values.length} ${copy.itemsSelected}` : copy.allOption
  return <details ref={detailsRef} className="task-multi-filter"><summary><span>{label}</span><strong>{selectedLabel}</strong></summary><div className="task-filter-popover">{searchable ? <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchProjectPlaceholder} aria-label={copy.searchProjectPlaceholder} /> : null}<div className="task-filter-option-list"><button type="button" className={values.length === 0 ? 'task-filter-chip is-active' : 'task-filter-chip'} onClick={() => onChange([])}>{copy.allOption}</button>{visibleOptions.map(option => <button type="button" className={values.includes(option) ? 'task-filter-chip is-active' : 'task-filter-chip'} key={option} onClick={() => onChange(values.includes(option) ? values.filter(value => value !== option) : [...values, option])}>{displayValue(option)}</button>)}</div>{searchable && !visibleOptions.length ? <span className="task-filter-empty">{copy.noMatchesProject}</span> : null}</div></details>
}
function TaskCard({ task, copy, busy, onMutate, onOpen }: { task: AnyRecord; copy: TasksCopy; busy: string; onMutate: TasksPanelProps['onMutate']; onOpen: () => void }) {
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
  if (canReview) {
    secondaryActions.push(
      { key: 'approved', label: copy.approve, disabled: isBusy, onSelect: () => void review('approved') },
      { key: 'rejected', label: copy.reject, disabled: isBusy, onSelect: () => void review('rejected') },
      { key: 'cancel', label: copy.cancel, disabled: isBusy, onSelect: () => void runStatus('cancelled') }
    )
  }

  return (
    <article className="task-card" role="button" tabIndex={0} onClick={event => { if (!(event.target as HTMLElement).closest('button, a, input, textarea, select')) onOpen() }} onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) onOpen() }}>
      <header className="task-card-top">
        <div className="task-title-group"><h3 className="task-card-title">{textOf(task.title, '-')}</h3><StatusBadge status={status} copy={copy} /></div>
        <PriorityBadge priority={priority} copy={copy} />
      </header>
      {task.description ? <p className="task-description">{textOf(task.description)}</p> : null}
      <dl className="task-meta-grid">
        <TaskMetadata label={copy.project} value={textOf(task.project, '-')} />
        <TaskMetadata label={copy.assignee} value={textOf(task.assignee || task.createdBy, '-')} />
        <TaskMetadata label={copy.priority} value={priorityLabel(copy, priority)} />
        <TaskMetadata label={copy.updated} value={formatRelativeTime(textOf(task.updatedAt || task.createdAt))} />
      </dl>
      <div className="task-actions">
        {status === 'open' ? <Button size="sm" disabled={isBusy} onClick={() => void onMutate(`${id}:claim`, '/api/task/claim', { id, by: 'dashboard-next' })}>{copy.claim}</Button> : null}
        {['claimed', 'blocked'].includes(status) ? <Button size="sm" disabled={isBusy} onClick={() => void runStatus('in_progress')}>{status === 'blocked' ? copy.unblock : copy.start}</Button> : null}
        {status === 'in_progress' ? <><Button size="sm" disabled={isBusy} onClick={() => void runStatus('done')}>{copy.completeDirectly}</Button><Button size="sm" variant="outline" disabled={isBusy} onClick={() => void runStatus('needs_verification')}>{copy.requestVerification}</Button></> : null}
        {status === 'needs_verification' ? <Button size="sm" disabled={isBusy} onClick={() => void review('approved')}>{copy.approveAndComplete}</Button> : null}
        {status === 'done' ? <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void runStatus('open')}>{copy.reopen}</Button> : null}
        {status === 'cancelled' ? <p className="task-terminal-note">{copy.cancelledTerminal}</p> : <TaskActionMenu label={copy.moreActions} actions={secondaryActions} />}
      </div>
    </article>
  )
}

function TaskDetailsDialog({ task, copy, busy, onMutate, onClose }: { task: AnyRecord; copy: TasksCopy; busy: string; onMutate: TasksPanelProps['onMutate']; onClose: () => void }) {
  const id = textOf(task.id)
  const status = textOf(task.status, 'open')
  const priority = textOf(task.priority, 'normal')
  const isBusy = busy.startsWith(`${id}:`)
  const runStatus = (nextStatus: string) => void onMutate(`${id}:${nextStatus}`, '/api/task/status', { id, status: nextStatus, by: 'dashboard-next' })
  const review = (decision: 'approved' | 'rejected') => void onMutate(`${id}:${decision}`, '/api/task/review', { id, decision, by: 'dashboard-next' })
  const notes = Array.isArray(task.notes) ? task.notes : []
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="max-w-3xl task-detail-dialog-content"><DialogHeader><DialogTitle>{textOf(task.title, copy.recentTasks)}</DialogTitle><DialogDescription>{copy.recentTasks}</DialogDescription><DialogClose aria-label={copy.close} className="ml-auto rounded-md p-1 opacity-70 hover:opacity-100"><X className="h-4 w-4" /></DialogClose></DialogHeader><div className="task-detail-dialog"><div className="task-detail-lead"><StatusBadge status={status} copy={copy} /><PriorityBadge priority={priority} copy={copy} /><span>{textOf(task.project, copy.allProjects)}</span><RelatedEntities entityType="task" entityId={id} /></div>{task.description ? <section className="task-detail-section"><h4>{copy.description}</h4><p className="task-detail-description">{textOf(task.description)}</p></section> : null}<dl className="task-detail-grid"><TaskMetadata label={copy.project} value={textOf(task.project, '-')} /><TaskMetadata label={copy.assignee} value={textOf(task.assignee || task.createdBy, '-')} /><TaskMetadata label={copy.priority} value={priorityLabel(copy, priority)} /><TaskMetadata label={copy.updatedLabel} value={formatDate(textOf(task.updatedAt || task.createdAt))} /><TaskMetadata label={copy.createdLabel} value={formatDate(textOf(task.createdAt))} /><TaskMetadata label={copy.id} value={id || '-'} /></dl>{task.handoff ? <section className="task-detail-section task-detail-note"><h4>{copy.handoff}</h4><p>{textOf(task.handoff)}</p></section> : null}<section className="task-detail-section"><h4>{copy.executionInfo}</h4><dl className="task-detail-grid"><TaskMetadata label={copy.deliveryState} value={textOf(task.deliveryState, '-')} /><TaskMetadata label={copy.attempts} value={`${textOf(task.attempt, '0')} / ${textOf(task.maxRetries, '—')}`} /><TaskMetadata label={copy.progressLabel} value={textOf(task.progressStatus || task.progressPercent, '-')} /><TaskMetadata label={copy.reviewStatusLabel} value={textOf(task.reviewStatus, '-')} /></dl></section>{task.lastError ? <section className="task-detail-section task-detail-error"><h4>{copy.recentIssue}</h4><p>{textOf(task.lastError)}</p></section> : null}{notes.length ? <section className="task-detail-section"><h4>{copy.activityLog}（{Math.min(notes.length, 8)}）</h4><div className="task-detail-timeline">{notes.slice(-8).reverse().map((note, index) => <div key={textOf(note.ts, String(index))}><time>{formatDate(textOf(note.ts))}</time><strong>{textOf(note.by, '-')}</strong><p>{textOf(note.text, '-')}</p></div>)}</div></section> : null}<div className="task-detail-actions">{status === 'open' ? <Button disabled={isBusy} onClick={() => void onMutate(`${id}:claim`, '/api/task/claim', { id, by: 'dashboard-next' })}>{copy.claim}</Button> : null}{['claimed', 'blocked'].includes(status) ? <Button disabled={isBusy} onClick={() => runStatus('in_progress')}>{status === 'blocked' ? copy.unblock : copy.start}</Button> : null}{status === 'in_progress' ? <><Button disabled={isBusy} onClick={() => runStatus('done')}>{copy.completeDirectly}</Button><Button variant="outline" disabled={isBusy} onClick={() => runStatus('needs_verification')}>{copy.requestVerification}</Button></> : null}{status === 'needs_verification' ? <><Button disabled={isBusy} onClick={() => review('approved')}>{copy.approveAndComplete}</Button><Button variant="outline" disabled={isBusy} onClick={() => review('rejected')}>{copy.reject}</Button></> : null}{status === 'done' ? <Button variant="outline" disabled={isBusy} onClick={() => runStatus('open')}>{copy.reopen}</Button> : null}</div></div><DialogFooter><Button variant="outline" onClick={onClose}>{copy.cancel}</Button></DialogFooter></DialogContent></Dialog>
}
function TaskMetadata({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>
}

function StatusBadge({ status, copy }: { status: string; copy: TasksCopy }) {
  return <span className={`status-badge ${status}`}>{statusLabel(copy, status)}</span>
}

function PriorityBadge({ priority, copy }: { priority: string; copy: TasksCopy }) {
  return <span className={`status-badge priority-${priority}`}>{priorityLabel(copy, priority)}</span>
}

function TaskActionMenu({ label, actions }: { label: string; actions: TaskMenuAction[] }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

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
    {open ? <div className="task-action-menu-items" id={menuId} role="menu" aria-label={label}>{actions.map(action => <button key={action.key} type="button" role="menuitem" disabled={action.disabled} onClick={() => { closeAndFocusTrigger(); action.onSelect() }}>{action.label}</button>)}</div> : null}
  </div>
}
