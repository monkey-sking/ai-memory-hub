import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Download, GitCompare, Puzzle, RefreshCw, ShieldAlert, Upload } from 'lucide-react'
import { apiGet, apiPost, asArray } from '../lib/api'
import { toolIconFiles, toolDisplayNames } from '../lib/toolMetadata'
import { dashboardLabels, type DashboardCopy } from '../lib/dashboardCopy'
import type { AppOutletContext, AppLanguage } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  EmptyState,
  FilterBar,
  LoadingState
} from '../components/shell'
import {
  AlertBanner,
  Card,
  MetricCard,
  MetricGrid,
  PageHead,
  SectionTabs
} from '@/components/ds'

type ExtensionRecord = {
  id: string
  kind: 'mcp'
  server?: { type?: string; command?: string; url?: string }
  apps?: Record<string, boolean>
  managed?: boolean
  source?: string
  updatedAt?: string
}

type DiffChange = {
  app: string
  id: string
  action: 'current' | 'conflict' | 'add'
}

type StatusClient = {
  mcp: number
  skills: number
  diagnostics: { level: string; message: string; path?: string }[]
  managed: { mcp: number; skills: number }
}

type StatusResponse = {
  registry: { mcp: number; skills: number }
  clients: Record<string, StatusClient>
}

const APPS = ['claude', 'codex', 'gemini', 'opencode'] as const
type AppName = typeof APPS[number]

export default function Extensions() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const [records, setRecords] = useState<ExtensionRecord[]>([])
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [diffChanges, setDiffChanges] = useState<DiffChange[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  // `message` carries both failures and sync confirmations. Without this the
  // "preview complete" line would render inside a danger-tinted ErrorState.
  const [messageKind, setMessageKind] = useState<'error' | 'info'>('error')
  const [query, setQuery] = useState('')
  const [selectedApps, setSelectedApps] = useState<Record<AppName, boolean>>({
    claude: true, codex: true, gemini: true, opencode: true,
  })
  const [kindFilterValue, setKindFilterValue] = useState<'all' | 'mcp'>('all')
  const [showPreview, setShowPreview] = useState(false)
  const [previewApply, setPreviewApply] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState<{ applied?: boolean; changes?: DiffChange[] } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)

  const fail = (error: unknown) => {
    setMessageKind('error')
    setMessage(error instanceof Error ? error.message : String(error))
  }

  const load = async () => {
    setBusy(true)
    try {
      const [extRes, statusRes] = await Promise.all([
        apiGet<{ ok: boolean; records: ExtensionRecord[]; diff?: { changes?: DiffChange[] } }>('/api/extensions'),
        apiGet<{ ok: boolean } & StatusResponse>('/api/extensions/status')
      ])
      setRecords(asArray<ExtensionRecord>(extRes.records))
      const initialChanges = asArray<DiffChange>(extRes.diff?.changes)
      setDiffChanges(initialChanges)
      setShowPreview(initialChanges.length > 0)
      if (statusRes.ok) {
        setStatus({ registry: statusRes.registry, clients: statusRes.clients })
      }
      setMessage('')
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [])

  function toggleApp(app: AppName) {
    setSelectedApps(prev => ({ ...prev, [app]: !prev[app] }))
  }

  const filteredRecords = useMemo(() => {
    return records.filter(item => {
      if (kindFilterValue !== 'all' && item.kind !== kindFilterValue) return false
      if (query && !item.id.toLowerCase().includes(query.toLowerCase())) return false
      return true
    })
  }, [records, query, kindFilterValue])

  const mcpRecords = useMemo(() => records.filter(r => r.kind === 'mcp'), [records])
  const managedCount = useMemo(() => records.filter(r => r.managed !== false).length, [records])

  const conflictCount = diffChanges.filter(c => c.action === 'conflict').length
  const addCount = diffChanges.filter(c => c.action === 'add').length
  const currentCount = diffChanges.filter(c => c.action === 'current').length

  const groupedDiffChanges = useMemo(() => {
    const groups = new Map<string, { id: string; action: DiffChange['action']; apps: string[] }>()
    const rank = { current: 0, add: 1, conflict: 2 }
    for (const change of diffChanges) {
      const existing = groups.get(change.id)
      if (!existing) { groups.set(change.id, { id: change.id, action: change.action, apps: [change.app] }); continue }
      if (!existing.apps.includes(change.app)) existing.apps.push(change.app)
      if (rank[change.action] > rank[existing.action]) existing.action = change.action
    }
    return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id))
  }, [diffChanges])

  const activeApps = useMemo(() => APPS.filter(a => selectedApps[a]), [selectedApps])

  const importExtensions = async () => {
    setBusy(true)
    try {
      await apiPost('/api/extensions/import', { app: activeApps.length === 1 ? activeApps[0] : '' })
      await load()
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  async function runDiff() {
    setBusy(true)
    try {
      const res = await apiPost<{ ok: boolean; changes: DiffChange[] }>('/api/extensions/diff', {
        app: activeApps.length === 1 ? activeApps[0] : '',
        kind: kindFilterValue === 'all' ? 'mcp' : kindFilterValue,
      })
      setDiffChanges(asArray<DiffChange>(res.changes))
      setShowPreview(true)
      setMessage('')
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  async function runSync() {
    setBusy(true)
    try {
      const res = await apiPost<{ ok: boolean; applied?: boolean; changes?: DiffChange[] }>('/api/extensions/sync', {
        app: activeApps.length === 1 ? activeApps[0] : '',
        kind: kindFilterValue === 'all' ? 'mcp' : kindFilterValue,
        apply: previewApply,
      })
      setLastSyncResult({ applied: res.applied, changes: asArray<DiffChange>(res.changes) })
      if (res.changes?.length) {
        setDiffChanges(asArray<DiffChange>(res.changes))
        setShowPreview(true)
      }
      setMessageKind('info')
      setMessage(res.applied ? copy.extensions.syncApplied : copy.extensions.previewComplete)
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  async function removeExtension(id: string) {
    setBusy(true)
    try {
      await apiPost('/api/extensions/remove', { id, kind: kindFilterValue === 'all' ? 'mcp' : kindFilterValue, apply: true })
      setRemoveTarget(null)
      await load()
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  const kindFilter = (kind: string) => setKindFilterValue(kind === 'mcp' ? 'mcp' : 'all')

  const appStatus = status?.clients || {}

  return (
    <>
      <PageHead
        title={copy.extensions.title}
        subtitle={copy.extensions.subtitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => void load()} disabled={busy}>
              <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
              {copy.extensions.refresh}
            </Button>
            <Button variant="secondary" onClick={() => void importExtensions()} disabled={busy}>
              <Download className="h-4 w-4" />
              {copy.extensions.importAll}
            </Button>
            <Button onClick={() => void runDiff()} disabled={busy}>
              <GitCompare className="h-4 w-4" />
              {copy.extensions.diff}
            </Button>
          </>
        }
      />

      {message ? (
        messageKind === 'error'
          ? <AlertBanner tone="error" title={copy.error} description={message} onDismiss={() => setMessage('')} />
          : <AlertBanner tone="info" title={copy.extensions.previewComplete} description={message} onDismiss={() => setMessage('')} />
      ) : null}

      <MetricGrid>
        <MetricCard label={copy.extensions.registryMcp} value={mcpRecords.length} icon={Puzzle} />
        <MetricCard label={copy.extensions.managed} value={managedCount} />
        <MetricCard
          label={copy.extensions.conflicts}
          value={<span className={cn(conflictCount > 0 && 'text-danger')}>{conflictCount}</span>}
        />
        <MetricCard label={copy.extensions.toAdd} value={addCount} />
        <MetricCard label={copy.extensions.currentBadge} value={currentCount} />
      </MetricGrid>

      <SectionTabs
        tabs={[
          { id: 'all', label: copy.extensions.all, badge: records.length },
          { id: 'mcp', label: copy.extensions.mcp, badge: mcpRecords.length }
        ]}
        active={kindFilterValue}
        onChange={kindFilter}
      />

      <Card title={copy.skills.syncTargets} toolbar={<span className="text-xs text-ink-3">{copy.extensions.skillManagement}</span>}>
        <div className="flex flex-col gap-3 p-[var(--card-pad)] md:flex-row md:items-center md:gap-4">
          <div role="group" aria-label={copy.toolReadiness} className="flex flex-wrap items-center gap-2">
            {APPS.map(app => (
              <Button
                key={app}
                size="sm"
                variant={selectedApps[app] ? 'primary' : 'secondary'}
                aria-pressed={selectedApps[app]}
                onClick={() => toggleApp(app)}
              >
                {toolIconFiles[app] ? <img className="h-3.5 w-3.5 rounded-xs object-contain" src={toolIconFiles[app]} alt="" /> : null}
                {toolDisplayNames[language][app] || app}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 md:ml-auto">
            <label className="inline-flex h-8 cursor-pointer items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-accent-base)]"
                checked={previewApply}
                onChange={e => setPreviewApply(e.target.checked)}
              />
              {copy.extensions.applyElsePreview}
            </label>
            <Button size="sm" onClick={() => void runSync()} disabled={busy}>
              <Upload className="h-4 w-4" />
              {previewApply ? copy.extensions.applySync : copy.extensions.previewSync}
            </Button>
          </div>
        </div>
      </Card>

      <Card title={copy.toolReadiness} count={APPS.filter(app => appStatus[app]).length}>
        <div className="grid gap-3 p-[var(--card-pad)] sm:grid-cols-2 xl:grid-cols-4">
          {APPS.map(app => (
            <ClientStatus key={app} app={app} client={appStatus[app]} copy={copy} language={language} />
          ))}
        </div>
      </Card>

      {showPreview ? (
        <Card
          title={copy.extensions.diffPreview}
          count={groupedDiffChanges.length}
          flushBody
          toolbar={<Button size="sm" variant="ghost" onClick={() => setShowPreview(false)}>{copy.close}</Button>}
          bodyClassName="pb-[var(--card-pad)]"
        >
          {groupedDiffChanges.length ? (
            groupedDiffChanges.map(change => (
              <div
                key={change.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0',
                  change.action === 'conflict' && 'bg-danger-tint/50',
                  change.action === 'add' && 'bg-success-tint/50'
                )}
              >
                <span
                  className={cn(
                    'flex w-28 shrink-0 items-center gap-1.5 text-xs font-semibold uppercase',
                    change.action === 'conflict' ? 'text-danger-text' : change.action === 'add' ? 'text-success-text' : 'text-ink-3'
                  )}
                >
                  {change.action === 'add' ? <Download className="h-3.5 w-3.5" /> : change.action === 'conflict' ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {change.action === 'add' ? copy.extensions.add : change.action === 'conflict' ? copy.extensions.conflict : copy.extensions.currentBadge}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{change.id}</span>
                <span className="shrink-0 text-xs text-ink-3">{change.apps.map(app => toolDisplayNames[language][app] || app).join(' · ')}</span>
              </div>
            ))
          ) : (
            <EmptyState size="sm" icon={null} title={copy.extensions.noDifferences} />
          )}
          <div className="border-t border-line px-4 py-2 text-xs tabular-nums text-ink-3">
            {addCount} {copy.extensions.toAdd} · {conflictCount} {copy.extensions.conflicts} · {currentCount} {copy.extensions.current}
          </div>
        </Card>
      ) : null}

      {lastSyncResult ? (
        <AlertBanner
          tone={lastSyncResult.applied ? 'success' : 'info'}
          title={lastSyncResult.applied ? copy.extensions.applied : copy.extensions.previewOnly}
          description={lastSyncResult.changes ? `${lastSyncResult.changes.length} ${copy.extensions.changes}` : undefined}
        />
      ) : null}

      <Card
        title={copy.extensions.syncedExtensions}
        count={filteredRecords.length}
        flushBody
        toolbar={
          <FilterBar
            search={{
              id: 'extensions-search',
              value: query,
              onChange: setQuery,
              placeholder: copy.extensions.searchPlaceholder,
              label: copy.extensions.searchPlaceholder
            }}
          />
        }
      >
        {busy && !records.length ? (
          <LoadingState variant="rows" label={copy.refreshing} className="p-4" />
        ) : filteredRecords.length ? (
          filteredRecords.map(item => (
            <div
              key={item.id}
              className={cn(
                'flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0',
                item.managed === false && 'bg-surface-sunk/60'
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-ink">{item.id}</span>
                <span className="truncate text-xs text-ink-3">
                  {item.kind === 'mcp' ? copy.extensions.mcp : copy.extensions.skillKind}
                  {item.server?.type ? ` · ${item.server.type}` : ''}
                  {item.server?.command ? ` · ${item.server.command}` : ''}
                  {item.server?.url ? ` · ${item.server.url}` : ''}
                  {item.updatedAt ? ` · ${new Date(item.updatedAt).toLocaleDateString()}` : ''}
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {APPS.map(app => (
                  <Badge key={app} variant={item.apps?.[app] !== false ? 'accent' : 'neutral'}>
                    {toolDisplayNames[language][app] || app}
                  </Badge>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {item.managed === false ? (
                  <Badge variant="warning"><ShieldAlert className="h-3 w-3" />{copy.extensions.unmanaged}</Badge>
                ) : null}
                {item.kind === 'mcp' && (removeTarget === item.id ? (
                  <>
                    <span className="text-xs text-ink-3">{copy.extensions.removeQuestion}</span>
                    <Button size="sm" variant="danger" onClick={() => void removeExtension(item.id)} disabled={busy}>{copy.extensions.confirmYes}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(null)}>{copy.extensions.confirmNo}</Button>
                  </>
                ) : (
                  <Button size="sm" variant="secondary" title={copy.extensions.removeFromList} aria-label={copy.extensions.removeFromList} onClick={() => setRemoveTarget(item.id)} disabled={busy}>
                    {copy.extensions.remove}
                  </Button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            title={records.length ? copy.noMatches : copy.noData}
            description={records.length ? undefined : copy.extensions.emptySynced}
          />
        )}
      </Card>
    </>
  )
}

function ClientStatus({ app, client, copy, language }: { app: string; client?: StatusClient; copy: DashboardCopy; language: AppLanguage }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border border-line p-3">
      <div className="flex min-w-0 items-center gap-2">
        {toolIconFiles[app] ? <img className="h-4 w-4 shrink-0 rounded-xs object-contain" src={toolIconFiles[app]} alt="" /> : null}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{toolDisplayNames[language][app] || app}</span>
        <Badge variant={client ? 'success' : 'danger'} dot>
          {client ? copy.extensions.detected : copy.extensions.notDetected}
        </Badge>
      </div>
      {client ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-ink-3">
          <span>{copy.extensions.mcp}: {client.managed.mcp} / {client.mcp}</span>
          <span>{copy.extensions.skillKind}: {client.managed.skills} / {client.skills}</span>
        </div>
      ) : null}
      {(client?.diagnostics?.length ?? 0) > 0 ? (
        <div className="flex flex-col gap-1">
          {client!.diagnostics.slice(0, 2).map((diag, i) => (
            <span key={i} className={cn('text-xs', diag.level === 'error' ? 'text-danger' : 'text-warning')}>{diag.message}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
