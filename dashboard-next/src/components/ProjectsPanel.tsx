import { useState } from 'react'
import type { AnyRecord } from '@/lib/api'
import { apiPatch, apiDelete, asArray, asRecord, formatRelativeTime, textOf } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, ErrorState, PageShell, Panel } from '@/components/shell'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Input, fieldBaseStyles } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RelatedEntities } from '@/components/RelatedEntities'

interface ProjectsPanelProps {
  copy: {
    visibleProjects: string
    unregisteredProjects: string
    noData: string
    status: string
    project: string
    type: string
    title: string
    updated: string
    actions: string
    editProject: string
    archive: string
    repo: string
    feishu: string
    close: string
    id: string
    createdLabel: string
    nameLabel: string
    displayNameLabel: string
    typeLabel: string
    descriptionLabel: string
    aliasesLabel: string
    metadataLabel: string
    resourcesLabel: string
    cancel: string
    save: string
    saving: string
    invalidMetadataJson: string
    invalidResourcesJson: string
    actionFailed: string
    archiveProject: string
    confirmArchiveProject: string
    projectStatusLabels: Record<string, string>
  }
  model: {
    visibleProjects: AnyRecord[]
    unregisteredProjects: string[]
  }
  onRefresh: () => Promise<void>
}

function StatusBadge({ status, copy }: { status: string; copy: ProjectsPanelProps['copy'] }) {
  const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
    active: 'default',
    paused: 'secondary',
    archived: 'outline',
    hidden: 'outline'
  }
  const label = copy.projectStatusLabels[status] || status
  return <Badge variant={variants[status] || 'outline'}>{label}</Badge>
}

function ProjectEditDialog({
  project,
  open,
  onClose,
  onSave,
  copy
}: {
  project: AnyRecord
  open: boolean
  onClose: () => void
  onSave: (id: string, patch: AnyRecord) => Promise<void>
  copy: ProjectsPanelProps['copy']
}) {
  const metadata = asRecord(project.metadata)
  const resources = asRecord(project.resources)
  const aliases = asArray<string>(project.aliases)

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
  /** `title` is the human summary shown by `ErrorState`; `description` carries the raw message. */
  const [error, setError] = useState<{ title: string; description?: string } | null>(null)

  const updateField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

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
        aliases: form.aliases.split(',').map(s => s.trim()).filter(Boolean)
      }

      try {
        if (form.metadataJson.trim()) {
          patch.metadata = JSON.parse(form.metadataJson)
        }
      } catch {
        setError({ title: copy.invalidMetadataJson })
        return
      }

      try {
        if (form.resourcesJson.trim()) {
          patch.resources = JSON.parse(form.resourcesJson)
        }
      } catch {
        setError({ title: copy.invalidResourcesJson })
        return
      }

      await onSave(textOf(project.id), patch)
      onClose()
    } catch (e) {
      // `onSave` deliberately lets the API rejection propagate here (see
      // `updateProject`), so this is the single place a failed save is
      // reported. Not calling `onClose()` keeps the user's input on screen.
      setError({ title: copy.actionFailed, description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{copy.editProject}: {textOf(project.id)}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{copy.nameLabel}</Label>
            <Input id="name" value={form.name} onChange={e => updateField('name', e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">{copy.displayNameLabel}</Label>
            <Input id="displayName" value={form.displayName} onChange={e => updateField('displayName', e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="status">{copy.status}</Label>
            <select
              id="status"
              value={form.status}
              onChange={e => updateField('status', e.target.value)}
              className={cn(fieldBaseStyles, 'flex h-9 px-3 py-0')}
            >
              <option value="active">{copy.projectStatusLabels.active}</option>
              <option value="paused">{copy.projectStatusLabels.paused}</option>
              <option value="archived">{copy.projectStatusLabels.archived}</option>
              <option value="hidden">{copy.projectStatusLabels.hidden}</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="type">{copy.typeLabel}</Label>
            <Input id="type" value={form.type} onChange={e => updateField('type', e.target.value)} placeholder="game, tool, etc." />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="description">{copy.descriptionLabel}</Label>
            <Textarea id="description" value={form.description} onChange={e => updateField('description', e.target.value)} rows={2} />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="aliases">{copy.aliasesLabel}</Label>
            <Input id="aliases" value={form.aliases} onChange={e => updateField('aliases', e.target.value)} placeholder="alias1, alias2" />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="metadata">{copy.metadataLabel}</Label>
            <Textarea
              id="metadata"
              value={form.metadataJson}
              onChange={e => updateField('metadataJson', e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder='{"key": "value"}'
            />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="resources">{copy.resourcesLabel}</Label>
            <Textarea
              id="resources"
              value={form.resourcesJson}
              onChange={e => updateField('resourcesJson', e.target.value)}
              rows={4}
              className="font-mono text-xs"
              placeholder='{"repo": "https://...", "feishu": "https://..."}'
            />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-4 rounded-sm bg-surface-sunk p-3 text-sm">
            <div><span className="text-ink-3">{copy.createdLabel}:</span> {textOf(project.createdAt, '-')}</div>
            <div><span className="text-ink-3">{copy.updated}:</span> {textOf(project.updatedAt, '-')}</div>
          </div>
          {error ? <ErrorState variant="inline" className="col-span-2" title={error.title} description={error.description} /> : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>{copy.cancel}</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={busy}>{busy ? copy.saving : copy.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * In-app archive confirmation. Replaces the browser `confirm()`/`alert()` pair,
 * which shipped hardcoded English in a zh/en app and ignored the design system.
 * Mirrors `WorkflowActionDialog` in WorkflowsPanel.tsx: localized copy, the
 * affected record echoed back, and failures reported inline so the dialog can
 * stay open.
 */
function ProjectArchiveDialog({
  project,
  busy,
  error,
  onClose,
  onConfirm,
  copy
}: {
  project: AnyRecord
  busy: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
  copy: ProjectsPanelProps['copy']
}) {
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
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
            <Button variant="outline" disabled={busy}>{copy.cancel}</Button>
          </DialogClose>
          <Button onClick={onConfirm} disabled={busy}>{copy.archive}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectsPanel({ copy, model, onRefresh }: ProjectsPanelProps) {
  const [editingProject, setEditingProject] = useState<AnyRecord | null>(null)
  const [archivingProject, setArchivingProject] = useState<AnyRecord | null>(null)
  const [archiveError, setArchiveError] = useState('')
  const [busy, setBusy] = useState('')

  const openEdit = (project: AnyRecord) => {
    setEditingProject(project)
  }

  const closeEdit = () => {
    setEditingProject(null)
  }

  /**
   * No `catch` on purpose: `ProjectEditDialog.handleSave` awaits this inside its
   * own try/catch and owns the error surface, so swallowing the rejection here
   * would make the dialog think the save succeeded and close it — losing the
   * user's input. `closeEdit()` only runs on the success path.
   */
  const updateProject = async (id: string, patch: AnyRecord) => {
    setBusy(`${id}:update`)
    try {
      await apiPatch(`/api/projects/${encodeURIComponent(id)}`, patch)
      await onRefresh()
      closeEdit()
    } finally {
      setBusy('')
    }
  }

  const openArchive = (project: AnyRecord) => {
    setArchiveError('')
    setArchivingProject(project)
  }

  const archiveProject = async (id: string) => {
    setBusy(`${id}:archive`)
    setArchiveError('')
    try {
      await apiDelete(`/api/projects/${encodeURIComponent(id)}`, {})
      await onRefresh()
      setArchivingProject(null)
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  return (
    <PageShell>
      <Panel title={copy.visibleProjects} count={model.visibleProjects.length} flushBody>
        <div>
          <Table bordered={false}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">{copy.status}</TableHead>
                <TableHead className="w-56">{copy.project}</TableHead>
                <TableHead className="w-28">{copy.type}</TableHead>
                <TableHead>{copy.title}</TableHead>
                <TableHead className="w-24" numeric>{copy.updated}</TableHead>
                <TableHead className="w-56 text-right">{copy.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {model.visibleProjects.length === 0 ? (
                <TableEmpty colSpan={6}>{copy.noData}</TableEmpty>
              ) : (
                model.visibleProjects.map((project, idx) => (
                  <TableRow key={idx} className="project-row-clickable" tabIndex={0} onClick={event => { if (!(event.target as HTMLElement).closest('button, a, input, select')) openEdit(project) }} onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) openEdit(project) }}>
                    <TableCell>
                      <StatusBadge status={textOf(project.status, 'active')} copy={copy} />
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{textOf(project.id || project.name, '-')}</span>
                        {asArray<string>(project.aliases).length > 0 && (
                          <span className="truncate text-xs text-ink-3">
                            {asArray<string>(project.aliases).join(', ')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{textOf(project.type, '-')}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate">{textOf(project.displayName || project.description, '-')}</span>
                        {(() => {
                          const resources = asRecord(project.resources)
                          const repoUrl = resources.repo ? String(resources.repo) : ''
                          const feishuUrl = resources.feishu ? String(resources.feishu) : ''
                          if (!repoUrl && !feishuUrl) return null
                          return (
                            <span className="flex shrink-0 items-center gap-2">
                              {repoUrl && (
                                <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-base hover:underline">
                                  {copy.repo}
                                </a>
                              )}
                              {feishuUrl && (
                                <a href={feishuUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-base hover:underline">
                                  {copy.feishu}
                                </a>
                              )}
                            </span>
                          )
                        })()}
                      </div>
                    </TableCell>
                    <TableCell numeric className="text-xs text-ink-3">
                      {formatRelativeTime(textOf(project.updatedAt))}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(project)}>{copy.editProject}</Button>
                        <RelatedEntities entityType="project" entityId={textOf(project.id || project.name)} />
                        <Button size="sm" variant="outline" onClick={() => openArchive(project)} disabled={busy.startsWith(`${textOf(project.id)}:`)}>
                          {copy.archive}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel title={copy.unregisteredProjects} count={model.unregisteredProjects.length}>
        {model.unregisteredProjects.length === 0 ? (
          <EmptyState size="sm" icon={null} title={copy.noData} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {model.unregisteredProjects.map((project, idx) => (
              <Badge key={idx} variant="outline">{project}</Badge>
            ))}
          </div>
        )}
      </Panel>

      {editingProject && (
        <ProjectEditDialog
          project={editingProject}
          open={true}
          onClose={closeEdit}
          onSave={updateProject}
          copy={copy}
        />
      )}

      {archivingProject && (
        <ProjectArchiveDialog
          project={archivingProject}
          busy={busy.endsWith(':archive')}
          error={archiveError}
          onClose={() => setArchivingProject(null)}
          onConfirm={() => void archiveProject(textOf(archivingProject.id))}
          copy={copy}
        />
      )}
    </PageShell>
  )
}
