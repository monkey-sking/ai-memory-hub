import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Plus, Search, X, AlertCircle, Clock, User, FolderKanban } from 'lucide-react'
import type { AnyRecord } from '@/lib/api'

interface TasksPanelProps {
  tasks: AnyRecord[]
  visibleProjects: AnyRecord[]
  copy: {
    recentTasks: string
    addTask: string
    searchText: string
    project: string
    priority: string
    status: string
    allProjects: string
    allPriorities: string
    allStatuses: string
    clear: string
    noData: string
    title: string
    description: string
    handoff: string
    cancel: string
    running: string
    assignee: string
    updated: string
  }
  onMutate: (action: string, path: string, body: AnyRecord) => Promise<boolean>
}

function uniqueSorted(items: string[]): string[] {
  return Array.from(new Set(items)).sort()
}

function textOf(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function formatDate(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
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
    () =>
      uniqueSorted([
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

  const mutateTask = async (action: string, path: string, body: AnyRecord) => {
    setBusy(action)
    setError('')
    try {
      await onMutate(action, path, body)
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
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{copy.recentTasks}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                共 {filteredTasks.length} 个任务
              </p>
            </div>
            <Button onClick={() => { setError(''); setCreateOpen(true) }}>
              <Plus className="w-4 h-4 mr-2" />
              {copy.addTask}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="space-y-2">
              <Label htmlFor="search">{copy.searchText}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="pl-9"
                  placeholder="搜索任务..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status-filter">{copy.status}</Label>
              <select
                id="status-filter"
                value={activeStatusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">{copy.allStatuses || '全部状态'}</option>
                {statusOptions.map(option => (
                  <option value={option} key={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-filter">{copy.project}</Label>
              <select
                id="project-filter"
                value={activeProjectFilter}
                onChange={e => setProjectFilter(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">{copy.allProjects}</option>
                {projectOptions.map(option => (
                  <option value={option} key={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority-filter">{copy.priority}</Label>
              <select
                id="priority-filter"
                value={activePriorityFilter}
                onChange={e => setPriorityFilter(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">{copy.allPriorities}</option>
                {priorityOptions.map(option => (
                  <option value={option} key={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => { setQuery(''); setProjectFilter(''); setPriorityFilter(''); setStatusFilter('') }}
                className="w-full"
              >
                <X className="w-4 h-4 mr-2" />
                {copy.clear}
              </Button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg border border-destructive/20 bg-destructive/10">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Tasks Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">优先级</TableHead>
                  <TableHead className="w-[100px]">状态</TableHead>
                  <TableHead>任务标题</TableHead>
                  <TableHead className="w-[150px]">项目</TableHead>
                  <TableHead className="w-[120px]">负责人</TableHead>
                  <TableHead className="w-[140px]">更新时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {copy.noData}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTasks.map((task, idx) => {
                    const status = textOf(task.status, 'open')
                    const priority = textOf(task.priority, 'normal')
                    const title = textOf(task.title, '-')
                    const project = textOf(task.project, '-')
                    const assignee = textOf(task.assignee || task.createdBy, '-')
                    const updatedAt = textOf(task.updatedAt)

                    return (
                      <TableRow key={idx} className="hover:bg-accent cursor-pointer">
                        <TableCell>
                          <PriorityBadge priority={priority} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={status} />
                        </TableCell>
                        <TableCell className="font-medium">{title}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <FolderKanban className="w-3.5 h-3.5" />
                            {project}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <User className="w-3.5 h-3.5" />
                            {assignee}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            {formatDate(updatedAt)}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Task Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy.addTask}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="task-title">{copy.title}</Label>
                <Input
                  id="task-title"
                  value={newTask.title}
                  onChange={e => setNewTask(v => ({ ...v, title: e.target.value }))}
                  placeholder="请输入任务标题"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-project">{copy.project}</Label>
                <Input
                  id="task-project"
                  value={newTask.project}
                  onChange={e => setNewTask(v => ({ ...v, project: e.target.value }))}
                  list="task-project-options"
                  placeholder="项目名称"
                />
                <datalist id="task-project-options">
                  {formProjectOptions.map(project => (
                    <option value={project} key={project} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-priority">{copy.priority}</Label>
                <select
                  id="task-priority"
                  value={newTask.priority}
                  onChange={e => setNewTask(v => ({ ...v, priority: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="low">低</option>
                  <option value="normal">普通</option>
                  <option value="high">高</option>
                  <option value="urgent">紧急</option>
                </select>
              </div>

              <div className="col-span-2 space-y-2">
                <Label htmlFor="task-description">{copy.description}</Label>
                <Textarea
                  id="task-description"
                  value={newTask.description}
                  onChange={e => setNewTask(v => ({ ...v, description: e.target.value }))}
                  rows={3}
                  placeholder="任务描述"
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label htmlFor="task-handoff">{copy.handoff}</Label>
                <Textarea
                  id="task-handoff"
                  value={newTask.handoff}
                  onChange={e => setNewTask(v => ({ ...v, handoff: e.target.value }))}
                  rows={3}
                  placeholder="移交说明"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/10">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {copy.cancel}
            </Button>
            <Button
              onClick={() => void submitTask()}
              disabled={busy === 'add-task' || !newTask.title.trim()}
            >
              {busy === 'add-task' ? copy.running : copy.addTask}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    urgent: { variant: 'destructive', label: '紧急' },
    high: { variant: 'default', label: '高' },
    normal: { variant: 'secondary', label: '普通' },
    low: { variant: 'outline', label: '低' }
  }

  const config = variants[priority] || variants.normal
  return <Badge variant={config.variant}>{config.label}</Badge>
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    open: { variant: 'secondary', label: 'Open' },
    claimed: { variant: 'default', label: 'Claimed' },
    in_progress: { variant: 'default', label: 'In Progress' },
    blocked: { variant: 'destructive', label: 'Blocked' },
    needs_verification: { variant: 'outline', label: 'Review' },
    done: { variant: 'outline', label: 'Done' },
    cancelled: { variant: 'outline', label: 'Cancelled' }
  }

  const config = variants[status] || { variant: 'outline' as const, label: status }
  return <Badge variant={config.variant}>{config.label}</Badge>
}
