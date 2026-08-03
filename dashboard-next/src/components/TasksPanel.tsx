import { useId, useMemo, useState } from 'react'
import { AlertCircle, Plus, Search, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import type { AnyRecord } from '@/lib/api'
import type { DashboardCopy } from '@/lib/dashboardCopy'

type TasksCopy = Pick<DashboardCopy,
  | 'addTask'
  | 'allPriorities'
  | 'allProjects'
  | 'allStatuses'
  | 'approve'
  | 'approveAndComplete'
  | 'assignee'
  | 'cancel'
  | 'claim'
  | 'clear'
  | 'completeDirectly'
  | 'created'
  | 'description'
  | 'handoff'
  | 'moreActions'
  | 'noData'
  | 'priority'
  | 'priorityLabels'
  | 'project'
  | 'recentTasks'
  | 'reject'
  | 'reopen'
  | 'requestVerification'
  | 'running'
  | 'searchText'
  | 'sendRadioRequest'
  | 'start'
  | 'status'
  | 'statusLabels'
  | 'title'
  | 'unblock'
  | 'updated'
>

interface TasksPanelProps {
  tasks: AnyRecord[]
  visibleProjects: AnyRecord[]
  copy: TasksCopy
  onMutate: (action: string, path: string, body: AnyRecord) => Promise<boolean>
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

function formatDate(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function statusLabel(copy: TasksCopy, status: string): string {
  return copy.statusLabels[status as keyof TasksCopy['statusLabels']] || status
}

function priorityLabel(copy: TasksCopy, priority: string): string {
  return copy.priorityLabels[priority as keyof TasksCopy['priorityLabels']] || priority
}

export function TasksPanel({ tasks, visibleProjects, copy, onMutate }: TasksPanelProps) {
  const [projectFilter, setProjectFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
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
  const activeProjectFilter = projectOptions.includes(projectFilter) ? projectFilter : ''
  const activePriorityFilter = priorityOptions.includes(priorityFilter) ? priorityFilter : ''
  const activeStatusFilter = statusOptions.includes(statusFilter) ? statusFilter : ''
  const filteredTasks = tasks.filter(task => {
    if (activeProjectFilter && textOf(task.project) !== activeProjectFilter) return false
    if (activePriorityFilter && textOf(task.priority) !== activePriorityFilter) return false
    if (activeStatusFilter && textOf(task.status) !== activeStatusFilter) return false
    return !cleanQuery || [task.title, task.description, task.handoff, task.assignee, task.createdBy, task.status, task.project]
      .some(value => textOf(value).toLowerCase().includes(cleanQuery))
  })

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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5 mb-6">
            <div className="space-y-2">
              <Label htmlFor="task-search">{copy.searchText}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="task-search" value={query} onChange={event => setQuery(event.target.value)} className="pl-9" />
              </div>
            </div>
            <TaskFilter label={copy.status} value={activeStatusFilter} onChange={setStatusFilter} allLabel={copy.allStatuses} options={statusOptions} displayValue={value => statusLabel(copy, value)} />
            <TaskFilter label={copy.project} value={activeProjectFilter} onChange={setProjectFilter} allLabel={copy.allProjects} options={projectOptions} />
            <TaskFilter label={copy.priority} value={activePriorityFilter} onChange={setPriorityFilter} allLabel={copy.allPriorities} options={priorityOptions} displayValue={value => priorityLabel(copy, value)} />
            <div className="flex items-end">
              <Button variant="outline" onClick={() => { setQuery(''); setProjectFilter(''); setPriorityFilter(''); setStatusFilter('') }} className="w-full">
                <X className="mr-2 h-4 w-4" />
                {copy.clear}
              </Button>
            </div>
          </div>

          {error ? <div className="flex items-center gap-2 mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3"><AlertCircle className="h-4 w-4 shrink-0 text-destructive" /><p className="text-sm text-destructive">{error}</p></div> : null}

          {filteredTasks.length ? (
            <div className="task-card-grid">
              {filteredTasks.map(task => <TaskCard key={textOf(task.id, textOf(task.title, 'task'))} task={task} copy={copy} busy={busy} onMutate={mutateTask} />)}
            </div>
          ) : <div className="py-8 text-center text-muted-foreground">{copy.noData}</div>}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{copy.addTask}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2"><Label htmlFor="task-title">{copy.title}</Label><Input id="task-title" value={newTask.title} onChange={event => setNewTask(value => ({ ...value, title: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="task-project">{copy.project}</Label><Input id="task-project" value={newTask.project} onChange={event => setNewTask(value => ({ ...value, project: event.target.value }))} list="task-project-options" /><datalist id="task-project-options">{formProjectOptions.map(project => <option value={project} key={project} />)}</datalist></div>
              <div className="space-y-2"><Label htmlFor="task-priority">{copy.priority}</Label><select id="task-priority" value={newTask.priority} onChange={event => setNewTask(value => ({ ...value, priority: event.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">{['low', 'normal', 'high', 'urgent'].map(priority => <option value={priority} key={priority}>{priorityLabel(copy, priority)}</option>)}</select></div>
              <div className="col-span-2 space-y-2"><Label htmlFor="task-description">{copy.description}</Label><Textarea id="task-description" value={newTask.description} onChange={event => setNewTask(value => ({ ...value, description: event.target.value }))} rows={3} /></div>
              <div className="col-span-2 space-y-2"><Label htmlFor="task-handoff">{copy.handoff}</Label><Textarea id="task-handoff" value={newTask.handoff} onChange={event => setNewTask(value => ({ ...value, handoff: event.target.value }))} rows={3} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>{copy.cancel}</Button><Button onClick={() => void submitTask()} disabled={busy === 'add-task' || !newTask.title.trim()}>{busy === 'add-task' ? copy.running : copy.addTask}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TaskFilter({ label, value, onChange, allLabel, options, displayValue = value => value }: { label: string; value: string; onChange: (value: string) => void; allLabel: string; options: string[]; displayValue?: (value: string) => string }) {
  return <div className="space-y-2"><Label>{label}</Label><select value={value} onChange={event => onChange(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"><option value="">{allLabel}</option>{options.map(option => <option value={option} key={option}>{displayValue(option)}</option>)}</select></div>
}

function TaskCard({ task, copy, busy, onMutate }: { task: AnyRecord; copy: TasksCopy; busy: string; onMutate: TasksPanelProps['onMutate'] }) {
  const id = textOf(task.id)
  const status = textOf(task.status, 'open')
  const priority = textOf(task.priority, 'normal')
  const isBusy = busy.startsWith(`${id}:`)
  const runStatus = (nextStatus: string) => onMutate(`${id}:${nextStatus}`, '/api/task/status', { id, status: nextStatus, by: 'dashboard-next' })
  const review = (decision: 'approved' | 'rejected') => onMutate(`${id}:${decision}`, '/api/task/review', { id, decision, by: 'dashboard-next' })
  const sendRadioRequest = () => onMutate(`${id}:radio-request`, '/api/radio/send', {
    from: 'dashboard-next', to: textOf(task.assignee, 'all') || 'all', type: 'request', project: textOf(task.project), thread: id, replyTo: id, text: `Task request: ${textOf(task.title, id)}`
  })
  const secondaryActions: TaskMenuAction[] = [
    { key: 'radio-request', label: copy.sendRadioRequest, disabled: isBusy, onSelect: () => void sendRadioRequest() },
    { key: 'approved', label: copy.approve, disabled: isBusy, onSelect: () => void review('approved') },
    { key: 'rejected', label: copy.reject, disabled: isBusy, onSelect: () => void review('rejected') }
  ]
  if (!['cancelled', 'done'].includes(status)) secondaryActions.push({ key: 'cancel', label: copy.cancel, disabled: isBusy, onSelect: () => void runStatus('cancelled') })

  return (
    <article className="task-card">
      <header className="task-card-top">
        <div className="task-title-group"><h3 className="task-card-title">{textOf(task.title, '-')}</h3><StatusBadge status={status} copy={copy} /></div>
        <PriorityBadge priority={priority} copy={copy} />
      </header>
      {task.description ? <p className="task-description">{textOf(task.description)}</p> : null}
      <dl className="task-meta-grid">
        <TaskMetadata label={copy.project} value={textOf(task.project, '-')} />
        <TaskMetadata label={copy.assignee} value={textOf(task.assignee || task.createdBy, '-')} />
        <TaskMetadata label={copy.priority} value={priorityLabel(copy, priority)} />
        <TaskMetadata label={copy.updated} value={formatDate(textOf(task.updatedAt || task.createdAt))} />
      </dl>
      <div className="task-actions">
        {status === 'open' ? <Button size="sm" disabled={isBusy} onClick={() => void onMutate(`${id}:claim`, '/api/task/claim', { id, by: 'dashboard-next' })}>{copy.claim}</Button> : null}
        {['claimed', 'blocked'].includes(status) ? <Button size="sm" disabled={isBusy} onClick={() => void runStatus('in_progress')}>{status === 'blocked' ? copy.unblock : copy.start}</Button> : null}
        {status === 'in_progress' ? <><Button size="sm" disabled={isBusy} onClick={() => void runStatus('done')}>{copy.completeDirectly}</Button><Button size="sm" variant="outline" disabled={isBusy} onClick={() => void runStatus('needs_verification')}>{copy.requestVerification}</Button></> : null}
        {status === 'needs_verification' ? <Button size="sm" disabled={isBusy} onClick={() => void review('approved')}>{copy.approveAndComplete}</Button> : null}
        {['done', 'cancelled'].includes(status) ? <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void runStatus('open')}>{copy.reopen}</Button> : null}
        <TaskActionMenu label={copy.moreActions} actions={secondaryActions} />
      </div>
    </article>
  )
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
  const menuId = useId()
  return <details className="task-action-menu"><summary className="task-action-menu-trigger" aria-haspopup="menu">{label}</summary><div className="task-action-menu-items" id={menuId} role="menu">{actions.map(action => <button key={action.key} type="button" role="menuitem" disabled={action.disabled} onClick={action.onSelect}>{action.label}</button>)}</div></details>
}
