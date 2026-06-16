import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Plus, Search, X, Users, GitBranch, ChevronDown, ChevronUp } from 'lucide-react'
import type { AnyRecord } from '@/lib/api'

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
  copy: {
    workflows: string
    workflowTotal: string
    workflowActive: string
    workflowReview: string
    workflowBlocked: string
    createWorkflow: string
    searchText: string
    searchPlaceholder: string
    status: string
    project: string
    allStatuses: string
    allProjects: string
    clear: string
    noData: string
    noMatches: string
  }
  onRefresh: () => Promise<void>
}

function textOf(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function uniqueSorted(items: string[]): string[] {
  return Array.from(new Set(items)).sort()
}

function formatNumber(value: unknown): string {
  const num = Number(value)
  return Number.isNaN(num) ? String(value) : num.toLocaleString()
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

const workflowStatusOptions = ['open', 'planned', 'in_progress', 'review', 'blocked', 'done', 'cancelled']

export function WorkflowsPanel({ workflows, copy }: WorkflowsPanelProps) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null)
  const [workflowNodes, setWorkflowNodes] = useState<Record<string, WorkflowNode[]>>({})
  const [loadingNodes, setLoadingNodes] = useState<Record<string, boolean>>({})

  const projectOptions = useMemo(
    () => uniqueSorted(workflows.map(workflow => textOf(workflow.project)).filter(Boolean)),
    [workflows]
  )

  const normalizedQuery = query.trim().toLowerCase()
  const filteredWorkflows = workflows.filter(workflow => {
    if (statusFilter !== 'all' && textOf(workflow.status, 'open') !== statusFilter) return false
    if (projectFilter !== 'all' && textOf(workflow.project) !== projectFilter) return false
    if (!normalizedQuery) return true
    return [workflow.title, workflow.project, workflow.planner, workflow.executor, workflow.reviewer]
      .some(value => textOf(value).toLowerCase().includes(normalizedQuery))
  })

  const stageCounts = workflowStatusOptions.map(status => ({
    status,
    count: workflows.filter(workflow => textOf(workflow.status, 'open') === status).length
  }))

  const toggleWorkflow = async (workflowId: string) => {
    if (expandedWorkflow === workflowId) {
      setExpandedWorkflow(null)
      return
    }
    setExpandedWorkflow(workflowId)
    if (workflowNodes[workflowId]) return
    setLoadingNodes({ ...loadingNodes, [workflowId]: true })
    try {
      const res = await fetch(`/api/workflows/${workflowId}/nodes`)
      const data = await res.json()
      setWorkflowNodes({ ...workflowNodes, [workflowId]: data.nodes || [] })
    } catch (err) {
      console.error('Failed to fetch workflow nodes:', err)
    } finally {
      setLoadingNodes({ ...loadingNodes, [workflowId]: false })
    }
  }

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{copy.workflowTotal}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatNumber(workflows.length)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{copy.workflowActive}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              {formatNumber(
                workflows.filter(workflow => ['open', 'planned', 'in_progress'].includes(textOf(workflow.status, 'open'))).length
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{copy.workflowReview}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-500">
              {formatNumber(workflows.filter(workflow => textOf(workflow.status) === 'review').length)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{copy.workflowBlocked}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">
              {formatNumber(workflows.filter(workflow => textOf(workflow.status) === 'blocked').length)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Panel */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{copy.workflows}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">共 {filteredWorkflows.length} 个工作流</p>
            </div>
            <Button onClick={() => alert('Create workflow feature - TBD')}>
              <Plus className="w-4 h-4 mr-2" />
              {copy.createWorkflow}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {/* Stage Tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('all')}
            >
              {copy.allStatuses} ({formatNumber(workflows.length)})
            </Button>
            {stageCounts.map(item => (
              <Button
                key={item.status}
                variant={statusFilter === item.status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(item.status)}
              >
                {item.status} ({formatNumber(item.count)})
              </Button>
            ))}
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="search">{copy.searchText}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="pl-9"
                  placeholder={copy.searchPlaceholder || '搜索工作流...'}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-filter">{copy.project}</Label>
              <select
                id="project-filter"
                value={projectFilter}
                onChange={e => setProjectFilter(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="all">{copy.allProjects}</option>
                {projectOptions.map(project => (
                  <option value={project} key={project}>
                    {project}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('')
                  setStatusFilter('all')
                  setProjectFilter('all')
                }}
                className="w-full"
              >
                <X className="w-4 h-4 mr-2" />
                {copy.clear}
              </Button>
            </div>
          </div>

          {/* Workflow Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkflows.length ? (
              filteredWorkflows.map(workflow => {
                const status = textOf(workflow.status, 'open')
                const title = textOf(workflow.title, '-')
                const project = textOf(workflow.project, '-')
                const planner = textOf(workflow.planner, '-')
                const executor = textOf(workflow.executor, '-')
                const reviewer = textOf(workflow.reviewer, '-')
                const createdAt = textOf(workflow.createdAt)
                const updatedAt = textOf(workflow.updatedAt)
                const workflowId = textOf(workflow.id)
                const isExpanded = expandedWorkflow === workflowId
                const nodes = workflowNodes[workflowId] || []
                const isLoading = loadingNodes[workflowId]

                return (
                  <Card key={workflowId} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <StatusBadge status={status} />
                          <Badge variant="secondary">{project}</Badge>
                        </div>

                        {/* Title */}
                        <h3 className="font-medium line-clamp-2">{title}</h3>

                        {/* Roles */}
                        <div className="space-y-1.5 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="w-3.5 h-3.5" />
                            <span className="text-xs">P: {planner}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <GitBranch className="w-3.5 h-3.5" />
                            <span className="text-xs">E: {executor}</span>
                          </div>
                          {reviewer !== '-' && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Users className="w-3.5 h-3.5" />
                              <span className="text-xs">R: {reviewer}</span>
                            </div>
                          )}
                        </div>

                        {/* Toggle Execution Graph */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleWorkflow(workflowId)}
                          className="w-full justify-between"
                        >
                          <span className="text-xs">Execution Graph</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>

                        {/* Execution Graph */}
                        {isExpanded && (
                          <div className="pt-2 border-t space-y-2">
                            {isLoading ? (
                              <p className="text-xs text-muted-foreground">Loading nodes...</p>
                            ) : nodes.length > 0 ? (
                              nodes.map(node => (
                                <div key={node.nodeId} className="flex items-start gap-2 text-xs">
                                  <NodeStatusBadge status={node.status} />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{node.label}</p>
                                    <p className="text-muted-foreground">
                                      {node.role}:{node.actor}
                                      {!node.isRequired && <span className="ml-1">(optional)</span>}
                                    </p>
                                    {node.note && <p className="text-muted-foreground italic">Note: {node.note}</p>}
                                    {node.error && <p className="text-destructive">Error: {node.error}</p>}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground">(no execution history)</p>
                            )}
                          </div>
                        )}

                        {/* Footer */}
                        <div className="pt-2 border-t text-xs text-muted-foreground">
                          <p>更新: {formatDate(updatedAt || createdAt)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            ) : (
              <div className="col-span-full text-center text-muted-foreground py-8">
                {workflows.length ? copy.noMatches : copy.noData}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    open: { variant: 'secondary' },
    planned: { variant: 'default' },
    in_progress: { variant: 'default' },
    review: { variant: 'outline' },
    blocked: { variant: 'destructive' },
    done: { variant: 'outline' },
    cancelled: { variant: 'outline' }
  }

  const config = variants[status] || variants.open
  return <Badge variant={config.variant}>{status}</Badge>
}

function NodeStatusBadge({ status }: { status: string }) {
  const icons: Record<string, string> = {
    completed: '✓',
    failed: '✗',
    error: '✗',
    cancelled: '⊗',
    rejected: '⊘',
    running: '▶',
    waiting: '⏸',
    queued: '◦'
  }

  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    completed: { variant: 'default' },
    failed: { variant: 'destructive' },
    error: { variant: 'destructive' },
    cancelled: { variant: 'outline' },
    rejected: { variant: 'destructive' },
    running: { variant: 'default' },
    waiting: { variant: 'secondary' },
    queued: { variant: 'outline' }
  }

  const icon = icons[status] || '?'
  const config = variants[status] || variants.queued
  return <Badge variant={config.variant} className="text-xs">{icon}</Badge>
}
