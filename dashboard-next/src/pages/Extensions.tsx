import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Download, GitCompare, RefreshCw, Search, ShieldAlert, Upload, XCircle } from 'lucide-react'
import { apiGet, apiPost, asArray } from '../lib/api'
import { toolIconFiles, toolDisplayNames } from '../lib/toolMetadata'
import { dashboardLabels, type DashboardCopy } from '../lib/dashboardCopy'
import type { AppOutletContext, AppLanguage } from '../lib/i18n'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import './Extensions.css'

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
  const [query, setQuery] = useState('')
  const [selectedApps, setSelectedApps] = useState<Record<AppName, boolean>>({
    claude: true, codex: true, gemini: true, opencode: true,
  })
  const [kindFilterValue, setKindFilterValue] = useState<'all' | 'mcp'>('all')
  const [showPreview, setShowPreview] = useState(false)
  const [previewApply, setPreviewApply] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState<{ applied?: boolean; changes?: DiffChange[] } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)

  const load = async () => {
    setBusy(true)
    try {
      const [extRes, statusRes] = await Promise.all([
        apiGet<{ ok: boolean; records: ExtensionRecord[]; diff?: { changes?: DiffChange[] } }>('/api/extensions'),
        apiGet<{ ok: boolean } & StatusResponse>('/api/extensions/status'),
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
      setMessage(error instanceof Error ? error.message : String(error))
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
      setMessage(error instanceof Error ? error.message : String(error))
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
      setMessage(error instanceof Error ? error.message : String(error))
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
      setMessage(res.applied ? copy.extensions.syncApplied : copy.extensions.previewComplete)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
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
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const kindFilter = (kind: 'all' | 'mcp') => {
    setKindFilterValue(kind)
  }

  const appStatus = status?.clients || {}

  return (
    <div className="extensions-page">
      <header className="extensions-header">
        <div>
          <p className="extensions-eyebrow">AI MEMORY HUB / EXTENSIONS</p>
          <h1>{copy.extensions.title}</h1>
          <p>{copy.extensions.subtitle}</p>
        </div>
        <div className="extensions-header-actions">
          <Button variant="outline" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={16} />{copy.extensions.refresh}
          </Button>
          <Button variant="outline" onClick={() => void importExtensions()} disabled={busy}>
            <Download size={16} />{copy.extensions.importAll}
          </Button>
          <Button onClick={() => void runDiff()} disabled={busy}>
            <GitCompare size={16} />{copy.extensions.diff}
          </Button>
        </div>
      </header>

      <section className="extensions-summary-grid">
        <Card>
          <CardContent>
            <span>{copy.extensions.registryMcp}</span>
            <strong>{mcpRecords.length}</strong>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <span>{copy.extensions.skillManagement}</span>
            <a href="/skills" className="extensions-skill-link">{copy.extensions.openSkillsPage}</a>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <span>{copy.extensions.managed}</span>
            <strong>{managedCount}</strong>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <span>{copy.extensions.conflicts}</span>
            <strong className={conflictCount > 0 ? 'extensions-conflict-count' : ''}>{conflictCount}</strong>
          </CardContent>
        </Card>
      </section>

      <section className="extensions-status-grid">
        {APPS.map(app => {
          const client = appStatus[app]
          return (
            <Status key={app} app={app} client={client} copy={copy} language={language} />
          )
        })}
      </section>

      <div className="extensions-toolbar">
        <div className="extensions-toolbar-filters">
          <label className="extensions-search">
            <Search size={16} />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={copy.extensions.searchPlaceholder} />
          </label>
          <div className="extensions-filter-btn">
            {(['all', 'mcp'] as const).map(kind => (
              <Button key={kind} size="sm" variant={kindFilterValue === kind ? 'default' : 'outline'} onClick={() => kindFilter(kind)}>
                {kind === 'all' ? copy.extensions.all : kind.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
        <div className="extensions-app-selector">
          {APPS.map(app => (
            <button key={app} className={`extensions-app-btn ${selectedApps[app] ? 'active' : ''}`} onClick={() => toggleApp(app)} type="button">
              {toolIconFiles[app] && <img className="extensions-app-icon" src={toolIconFiles[app]} alt={toolDisplayNames[language][app] || app} />}
              <span>{toolDisplayNames[language][app] || app}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="extensions-toolbar">
        <label className="extensions-preview-toggle">
          <input type="checkbox" checked={previewApply} onChange={e => setPreviewApply(e.target.checked)} />
          <span>{copy.extensions.applyElsePreview}</span>
        </label>
        <Button size="sm" onClick={() => void runSync()} disabled={busy}>
          <Upload size={14} />{previewApply ? copy.extensions.applySync : copy.extensions.previewSync}
        </Button>
      </div>

      {showPreview && (
        <Card className="extensions-preview-card">
          <CardHeader>
            <CardTitle className="extensions-diff-header">
              <GitCompare size={18} />
              {copy.extensions.diffPreview}
              <span className="extensions-diff-count">
                {addCount} {copy.extensions.toAdd} · {conflictCount} {copy.extensions.conflicts} · {currentCount} {copy.extensions.current}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setShowPreview(false)}>{copy.close}</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="extensions-diff-list">
              {groupedDiffChanges.map(change => (
                <div key={change.id} className={`extensions-diff-row extensions-diff-${change.action} extensions-diff-conflict`}>
                  <span className="extensions-diff-action">
                    {change.action === 'add' ? <Download size={14} /> : change.action === 'conflict' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                    {change.action === 'add' ? copy.extensions.add : change.action === 'conflict' ? copy.extensions.conflict : copy.extensions.currentBadge}
                  </span>
                  <span className="extensions-diff-id">{change.id}</span>
                  <span className="extensions-diff-app">{change.apps.map(app => toolDisplayNames[language][app] || app).join(' · ')}</span>
                </div>
              ))}
              {!diffChanges.length && <div className="extensions-empty">{copy.extensions.noDifferences}</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {lastSyncResult && (
        <Card className="extensions-sync-result">
          <CardContent>
            <span className={lastSyncResult.applied ? 'ext-status-good' : 'ext-status-preview'}>
              {lastSyncResult.applied ? <CheckCircle2 size={14} /> : <GitCompare size={14} />}
              {lastSyncResult.applied ? copy.extensions.applied : copy.extensions.previewOnly}
            </span>
            {lastSyncResult.changes && (
              <span>{lastSyncResult.changes.length} {copy.extensions.changes}</span>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{copy.extensions.syncedExtensions}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="extensions-list">
            {filteredRecords.map(item => (
              <div className={`extensions-row ${item.managed === false ? 'extensions-unmanaged' : ''}`} key={item.id}>
                <div className="extensions-row-main">
                  <div className="extensions-row-info">
                    <strong>{item.id}</strong>
                    <small>
                      {item.kind === 'mcp' ? copy.extensions.mcp : copy.extensions.skillKind}
                      {item.server?.type ? ` · ${item.server.type}` : ''}
                      {item.server?.command ? ` · ${item.server.command}` : ''}
                      {item.server?.url ? ` · ${item.server.url}` : ''}
                      {item.updatedAt ? ` · ${new Date(item.updatedAt).toLocaleDateString()}` : ''}
                    </small>
                  </div>
                  <div className="extensions-row-apps">
                    {APPS.map(app => {
                      const enabled = item.apps?.[app] !== false
                      return (
                        <Badge key={app} variant={enabled ? 'default' : 'outline'} className="extensions-app-badge">
                          {toolDisplayNames[language][app] || app}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
                <div className="extensions-row-state">
                  {item.managed === false && <span className="ext-unmanaged-tag"><ShieldAlert size={13} />{copy.extensions.unmanaged}</span>}
                  {item.kind === 'mcp' && (removeTarget === item.id ? (
                    <span className="extensions-remove-confirm">
                      <span>{copy.extensions.removeQuestion}</span>
                      <Button size="sm" variant="destructive" onClick={() => void removeExtension(item.id)} disabled={busy}>{copy.extensions.confirmYes}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(null)}>{copy.extensions.confirmNo}</Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" title={copy.extensions.removeFromList} aria-label={copy.extensions.removeFromList} onClick={() => setRemoveTarget(item.id)} disabled={busy}>{copy.extensions.remove}
                    </Button>
                  )
                  )}
                </div>
              </div>
            ))}
            {!filteredRecords.length && (
              <div className="extensions-empty">{copy.extensions.emptySynced}</div>
            )}
          </div>
        </CardContent>
      </Card>

      {message && <p className="extensions-error" role="alert">{message}</p>}
    </div>
  )
}

function Status({ app, client, copy, language }: { app: string; client?: StatusClient; copy: DashboardCopy; language: AppLanguage }) {
  return (
    <Card className="extensions-status-card">
      <CardContent className="extensions-client-card">
        <div className="extensions-client-header">
          <span className={`extensions-client-dot ${client ? 'dot-good' : 'dot-missing'}`} />
          <strong>{toolDisplayNames[language][app] || app}</strong>
          {client ? (
            <span className="ext-status-good"><CheckCircle2 size={14} />{copy.extensions.detected}</span>
          ) : (
            <span className="ext-status-missing"><XCircle size={14} />{copy.extensions.notDetected}</span>
          )}
        </div>
        {client && (
          <div className="extensions-client-stats">
            <span>{copy.extensions.mcp}: {client.managed.mcp} / {client.mcp}</span>
            <span>{copy.extensions.skillKind}: {client.managed.skills} / {client.skills}</span>
          </div>
        )}
        {(client?.diagnostics?.length ?? 0) > 0 && (
          <div className="extensions-status-diagnostics">
            {client!.diagnostics.slice(0, 2).map((diag, i) => (
              <span key={i} className={`ext-diag ext-diag-${diag.level}`}>{diag.message}</span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
