import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Archive, Pencil, RefreshCw } from 'lucide-react'
import {
  apiDelete,
  apiGet,
  apiPatch,
  asArray,
  asRecord,
  formatRelativeTime,
  textOf,
  type AnyRecord
} from '../lib/api'
import { dashboardLabels, dashboardSubtitles, dashboardTitles, type DashboardCopy } from '../lib/dashboardCopy'
import type { AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge, type BadgeVariant } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose
} from '../components/ui/dialog'
import { Input, fieldBaseStyles } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { RelatedEntities } from '../components/RelatedEntities'
import {
  AlertBanner,
  Card,
  PageHead,
  SectionTabs,
  SummaryStrip
} from '@/components/ds'
import type { SectionTab } from '@/components/ds'
import { EmptyState, ErrorState, FilterBar, LoadingState, PageShell } from '../components/shell'

type ProjectRecord = AnyRecord

type ProjectsPayload = {
  projects?: AnyRecord[]
  visibleProjects?: AnyRecord[]
  unregisteredProjects?: string[]
  statuses?: string[]
  visibleStatuses?: string[]
}

/* ----------------------------------------------------------------- helpers */

function statusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'active':
      return 'success'
    case 'paused':
      return 'warning'
    case 'planning':
      return 'info'
    case 'archived':
    case 'hidden':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/** Left accent bar — uses the same `-line` tokens the badge border uses. */
function statusBarClass(status: string): string {
  switch (status) {
    case 'active':
      return 'border-success-line'
    case 'paused':
      return 'border-warning-line'
    case 'planning':
      return 'border-info-line'
    case 'archived':
    case 'hidden':
      return 'border-line'
    default:
      return 'border-line'
  }
}

function StatusBadge({ status, copy }: { status: string; copy: DashboardCopy }) {
  const labels = copy.projectStatusLabels as Record<string, string>
  return <Badge variant={statusBadgeVariant(status)}>{labels[status] || status}</Badge>
}

/* ------------------------------------------------------------ edit dialog */

function ProjectEditDialog({
  project,
  open,
  onClose,
  onSave,
  copy
}: {
  project: ProjectRecord
  open: boolean
  onClose: () => void
  onSave: (id: string, patch: AnyRecord) => Promise<void>
  copy: DashboardCopy
}) {
  const metadata = asRecord(project.metadata)
  const resources = asRecord(project.resources)
  const aliases = asArray<string>(project.aliases)
  const statusLabels = copy.projectStatusLabels as Record<string, string>

  const [form, setForm] = useState({
    name: textOf(project.name, ''),
    displayName: textOf(project.displayName, ''),
    status: textOf(project.status, 'active'),
    type: textOf(project.type, ''),
    description: textOf(project.description, ''),
    aliases: aliases.join(', '),
    metadataJson: JSON.stringify(metadata, null, 2),
    resourcesJson: JSON.stringify(resources, null, 2)
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ title: string; description?: string } | null>(null)

  const updateField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    try {
      const patch: AnyRecord = {
        name: form.name,
        displayName: form.displayName,
        status: form.status,
        type: form.type,
        description: form.description,
        aliases: form.aliases
          .split(',')
          .map(segment => segment.trim())
          .filter(Boolean)
      }

      try {
        if (form.metadataJson.trim()) patch.metadata = JSON.parse(form.metadataJson)
      } catch {
        setError({ title: copy.invalidMetadataJson })
        return
      }

      try {
        if (form.resourcesJson.trim()) patch.resources = JSON.parse(form.resourcesJson)
      } catch {
        setError({ title: copy.invalidResourcesJson })
        return
      }

      // `onSave` lets the API rejection propagate so this dialog keeps the
      // user's input on screen instead of pretending the save succeeded.
      await onSave(textOf(project.id, ''), patch)
      onClose()
    } catch (e) {
      setError({ title: copy.actionFailed, description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {copy.editProject}: {textOf(project.id, '')}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="projects-edit-name">{copy.nameLabel}</Label>
            <Input id="projects-edit-name" value={form.name} onChange={event => updateField('name', event.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="projects-edit-displayName">{copy.displayNameLabel}</Label>
            <Input id="projects-edit-displayName" value={form.displayName} onChange={event => updateField('displayName', event.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="projects-edit-status">{copy.projectStatusLabel}</Label>
            <select
              id="projects-edit-status"
              value={form.status}
              onChange={event => updateField('status', event.target.value)}
              className={cn(fieldBaseStyles, 'flex h-9 px-3 py-0')}
            >
              <option value="active">{statusLabels.active}</option>
              <option value="paused">{statusLabels.paused}</option>
              <option value="planning">{statusLabels.planning || 'planning'}</option>
              <option value="archived">{statusLabels.archived}</option>
              <option value="hidden">{statusLabels.hidden}</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="projects-edit-type">{copy.typeLabel}</Label>
            <Input id="projects-edit-type" value={form.type} onChange={event => updateField('type', event.target.value)} placeholder="game, tool, etc." />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="projects-edit-description">{copy.descriptionLabel}</Label>
            <Textarea id="projects-edit-description" value={form.description} onChange={event => updateField('description', event.target.value)} rows={2} />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="projects-edit-aliases">{copy.aliasesLabel}</Label>
            <Input id="projects-edit-aliases" value={form.aliases} onChange={event => updateField('aliases', event.target.value)} placeholder="alias1, alias2" />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="projects-edit-metadata">{copy.metadataLabel}</Label>
            <Textarea
              id="projects-edit-metadata"
              value={form.metadataJson}
              onChange={event => updateField('metadataJson', event.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder='{"key": "value"}'
            />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="projects-edit-resources">{copy.resourcesLabel}</Label>
            <Textarea
              id="projects-edit-resources"
              value={form.resourcesJson}
              onChange={event => updateField('resourcesJson', event.target.value)}
              rows={4}
              className="font-mono text-xs"
              placeholder='{"repo": "https://...", "feishu": "https://..."}'
            />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-4 rounded-sm bg-surface-sunk p-3 text-sm">
            <div>
              <span className="text-ink-3">{copy.createdLabel}:</span> {textOf(project.createdAt, '-')}
            </div>
            <div>
              <span className="text-ink-3">{copy.updatedLabel}:</span> {textOf(project.updatedAt, '-')}
            </div>
          </div>
          {error ? <ErrorState variant="inline" className="col-span-2" title={error.title} description={error.description} /> : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              {copy.cancel}
            </Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? copy.saving : copy.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------------------------------- archive dialog */

function ProjectArchiveDialog({
  project,
  busy,
  error,
  onClose,
  onConfirm,
  copy
}: {
  project: ProjectRecord
  busy: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
  copy: DashboardCopy
}) {
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{copy.archiveProject}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <StatusBadge status={textOf(project.status, 'active')} copy={copy} />
            <span className="min-w-0 truncate font-medium">{textOf(project.id || project.name, '-')}</span>
          </div>
          <p className="text-sm text-ink-2">{copy.confirmArchiveProject}</p>
          {error ? <ErrorState variant="inline" title={copy.actionFailed} description={error} /> : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              {copy.cancel}
            </Button>
          </DialogClose>
          <Button onClick={onConfirm} disabled={busy}>
            {copy.archive}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------------------------------------------- page */

export default function Projects() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const [payload, setPayload] = useState<ProjectsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<ProjectRecord | null>(null)
  const [archiving, setArchiving] = useState<ProjectRecord | null>(null)
  const [archiveError, setArchiveError] = useState('')
  const [busy, setBusy] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const next = await apiGet<ProjectsPayload>('/api/projects')
      setPayload(asRecord(next))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => {
    void load()
  }, [])

  const projects = useMemo(() => asArray<ProjectRecord>(payload?.projects), [payload])
  const unregistered = useMemo(() => asArray<string>(payload?.unregisteredProjects), [payload])
  const statuses = useMemo(() => asArray<string>(payload?.statuses), [payload])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const project of projects) {
      const status = textOf(project.status, 'active')
      counts[status] = (counts[status] || 0) + 1
    }
    return counts
  }, [projects])

  const activeCount = statusCounts['active'] || 0
  const archivedCount = (statusCounts['archived'] || 0) + (statusCounts['hidden'] || 0)

  const lastActiveAt = useMemo(() => {
    let max = ''
    for (const project of projects) {
      const stamp = textOf(project.updatedAt)
      if (stamp && stamp > max) max = stamp
    }
    return max
  }, [projects])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return projects.filter(project => {
      if (statusFilter !== 'all' && textOf(project.status, 'active') !== statusFilter) return false
      if (!needle) return true
      const haystack = [project.id, project.name, project.displayName, project.description, ...asArray<string>(project.aliases)]
        .map(value => String(value ?? '').toLowerCase())
        .join(' ')
      return haystack.includes(needle)
    })
  }, [projects, statusFilter, query])

  // No `catch` on purpose: `ProjectEditDialog.handleSave` awaits this inside its
  // own try/catch and owns the error surface, so swallowing the rejection here
  // would hide a failed save and close the dialog, losing the user's input.
  const updateProject = async (id: string, patch: AnyRecord) => {
    setBusy(`${id}:update`)
    try {
      await apiPatch(`/api/projects/${encodeURIComponent(id)}`, patch)
      await load()
      setEditing(null)
    } finally {
      setBusy('')
    }
  }

  const archiveProject = async (id: string) => {
    setBusy(`${id}:archive`)
    setArchiveError('')
    try {
      await apiDelete(`/api/projects/${encodeURIComponent(id)}`, {})
      await load()
      setArchiving(null)
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const statusTabs = useMemo<SectionTab[]>(() => {
    const tabs: SectionTab[] = [{ id: 'all', label: copy.allOption, badge: projects.length }]
    for (const status of statuses) {
      tabs.push({
        id: status,
        label: (copy.projectStatusLabels as Record<string, string>)[status] || status,
        badge: statusCounts[status] || 0
      })
    }
    return tabs
  }, [statuses, statusCounts, projects.length, copy.allOption, copy.projectStatusLabels])

  return (
    <PageShell contentClassName="flex flex-col gap-6">
      <PageHead
        title={dashboardTitles[language]['projects']}
        subtitle={dashboardSubtitles[language]['projects']}
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {copy.refresh}
          </Button>
        }
      />

      {error ? (
        <ErrorState
          variant="block"
          title={copy.actionFailed}
          description={error}
          action={
            <Button onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
              {copy.refresh}
            </Button>
          }
        />
      ) : (
        <>
          {unregistered.length ? (
            <AlertBanner
              tone="info"
              title={copy.unregisteredProjects}
              description={unregistered.join(' · ')}
            />
          ) : null}

          <SummaryStrip
            items={[
              { label: copy.visibleProjects, value: projects.length, tone: 'neutral' },
              { label: copy.active, value: activeCount, tone: 'success' },
              { label: (copy.projectStatusLabels as Record<string, string>).archived, value: archivedCount, tone: 'neutral' },
              {
                label: copy.unregisteredProjects,
                value: unregistered.length,
                tone: unregistered.length ? 'warning' : 'neutral'
              },
              { label: copy.updated, value: lastActiveAt ? formatRelativeTime(lastActiveAt) : '-' }
            ]}
            note="本地仓库 · 实时"
          />

          <Card
            title={copy.visibleProjects}
            count={filtered.length}
            meta={`${filtered.length} / ${projects.length}`}
            flushBody
            toolbar={
              <FilterBar
                search={{
                  id: 'projects-search',
                  value: query,
                  onChange: setQuery,
                  placeholder: copy.searchProjectPlaceholder,
                  label: copy.searchProjectPlaceholder
                }}
              />
            }
          >
            <div className="px-4 pt-3">
              <SectionTabs tabs={statusTabs} active={statusFilter} onChange={setStatusFilter} />
            </div>

            {loading && filtered.length === 0 ? (
              <LoadingState variant="rows" label={copy.refreshing} className="p-4" />
            ) : filtered.length ? (
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((project, index) => {
                  const id = textOf(project.id, '') || textOf(project.name, '')
                  const status = textOf(project.status, 'active')
                  const resources = asRecord(project.resources)
                  const repoUrl = textOf(resources.repo)
                  const feishuUrl = textOf(resources.feishu)
                  const aliases = asArray<string>(project.aliases)
                  const isBusy = busy.startsWith(`${id}:`)
                  return (
                    <article
                      key={id || index}
                      className={cn(
                        'relative flex flex-col gap-3 overflow-hidden rounded-lg border border-line border-l-2 bg-surface p-4',
                        statusBarClass(status)
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-sm font-semibold text-ink">{id || '-'}</span>
                          <span className="truncate text-xs text-ink-3">{formatRelativeTime(textOf(project.updatedAt))}</span>
                        </div>
                        <StatusBadge status={status} copy={copy} />
                      </div>
                      <p className="line-clamp-2 text-sm text-ink-2">{textOf(project.displayName || project.description, '-')}</p>
                      {repoUrl || feishuUrl || textOf(project.type) ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {textOf(project.type) ? <Badge variant="secondary">{textOf(project.type)}</Badge> : null}
                          {repoUrl ? (
                            <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-hover hover:underline">
                              {copy.repo}
                            </a>
                          ) : null}
                          {feishuUrl ? (
                            <a href={feishuUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-hover hover:underline">
                              {copy.feishu}
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                      {aliases.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {aliases.map((alias, aliasIndex) => (
                            <span
                              key={`${alias}:${aliasIndex}`}
                              className="rounded-full border border-line bg-surface-sunk px-2 py-0.5 font-mono text-xs text-ink-3"
                            >
                              {alias}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-auto flex items-center justify-end gap-2 border-t border-line pt-3">
                        <RelatedEntities entityType="project" entityId={id} />
                        <Button size="sm" variant="outline" onClick={() => setEditing(project)}>
                          <Pencil className="h-3.5 w-3.5" />
                          {copy.editProject}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setArchiving(project)} disabled={isBusy}>
                          <Archive className="h-3.5 w-3.5" />
                          {copy.archive}
                        </Button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <EmptyState title={projects.length ? copy.noMatchesProject : copy.noData} className="p-4" />
            )}
          </Card>
        </>
      )}

      {editing ? (
        <ProjectEditDialog project={editing} open onClose={() => setEditing(null)} onSave={updateProject} copy={copy} />
      ) : null}

      {archiving ? (
        <ProjectArchiveDialog
          project={archiving}
          busy={busy.endsWith(':archive')}
          error={archiveError}
          onClose={() => setArchiving(null)}
          onConfirm={() => void archiveProject(textOf(archiving.id, ''))}
          copy={copy}
        />
      ) : null}
    </PageShell>
  )
}
