import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Download, GitCompare, RefreshCw, Search, ShieldAlert, Upload, XCircle } from 'lucide-react'
import { apiGet, apiPost, asArray } from '../lib/api'
import { toolIconFiles, toolDisplayNames } from '../lib/toolMetadata'
import type { AppOutletContext } from '../lib/i18n'
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
  const zh = language === 'zh'

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
      setMessage(res.applied ? (zh ? '同步已应用' : 'Sync applied') : (zh ? '预览完成，未修改文件' : 'Preview complete, no files modified'))
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
          <h1>{zh ? 'MCP 同步中心' : 'MCP Sync Center'}</h1>
          <p>{zh ? '管理 MCP 服务器配置，同步到 Claude、Codex、Gemini、OpenCode。Skill 请前往 Skills 页面管理。' : 'Manage MCP server configurations across Claude, Codex, Gemini, and OpenCode. Manage Skills on the Skills page.'}</p>
        </div>
        <div className="extensions-header-actions">
          <Button variant="outline" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={16} />{zh ? '刷新' : 'Refresh'}
          </Button>
          <Button variant="outline" onClick={() => void importExtensions()} disabled={busy}>
            <Download size={16} />{zh ? '导入全部' : 'Import All'}
          </Button>
          <Button onClick={() => void runDiff()} disabled={busy}>
            <GitCompare size={16} />{zh ? '查看差异' : 'Diff'}
          </Button>
        </div>
      </header>

      <section className="extensions-summary-grid">
        <Card>
          <CardContent>
            <span>{zh ? '注册 MCP' : 'Registry MCP'}</span>
            <strong>{mcpRecords.length}</strong>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <span>{zh ? 'Skill 管理' : 'Skill management'}</span>
            <a href="/skills" className="extensions-skill-link">{zh ? '前往 Skills 页面' : 'Open Skills page'}</a>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <span>{zh ? '受管扩展' : 'Managed'}</span>
            <strong>{managedCount}</strong>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <span>{zh ? '冲突' : 'Conflicts'}</span>
            <strong className={conflictCount > 0 ? 'extensions-conflict-count' : ''}>{conflictCount}</strong>
          </CardContent>
        </Card>
      </section>

      <section className="extensions-status-grid">
        {APPS.map(app => {
          const client = appStatus[app]
          return (
            <Status key={app} app={app} client={client} zh={zh} language={language} />
          )
        })}
      </section>

      <div className="extensions-toolbar">
        <div className="extensions-toolbar-filters">
          <label className="extensions-search">
            <Search size={16} />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={zh ? '搜索扩展' : 'Search extensions'} />
          </label>
          <div className="extensions-filter-btn">
            {(['all', 'mcp'] as const).map(kind => (
              <Button key={kind} size="sm" variant={kindFilterValue === kind ? 'default' : 'outline'} onClick={() => kindFilter(kind)}>
                {kind === 'all' ? (zh ? '全部' : 'All') : kind.toUpperCase()}
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
          <span>{zh ? '应用（否则仅预览）' : 'Apply (else preview only)'}</span>
        </label>
        <Button size="sm" onClick={() => void runSync()} disabled={busy}>
          <Upload size={14} />{previewApply ? (zh ? '应用同步' : 'Apply Sync') : (zh ? '预览同步' : 'Preview Sync')}
        </Button>
      </div>

      {showPreview && (
        <Card className="extensions-preview-card">
          <CardHeader>
            <CardTitle className="extensions-diff-header">
              <GitCompare size={18} />
              {zh ? '差异预览' : 'Diff Preview'}
              <span className="extensions-diff-count">
                {addCount} {zh ? '待添加' : 'to add'} · {conflictCount} {zh ? '冲突' : 'conflicts'} · {currentCount} {zh ? '一致' : 'current'}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setShowPreview(false)}>{zh ? '关闭' : 'Close'}</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="extensions-diff-list">
              {diffChanges.map((change, i) => (
                <div key={`${change.app}-${change.id}-${i}`} className={`extensions-diff-row extensions-diff-${change.action} extensions-diff-conflict`}>
                  <span className="extensions-diff-action">{/* Badge variant="destructive" marks conflicts */}
                    {change.action === 'add' ? <Download size={14} /> : change.action === 'conflict' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                    {change.action === 'add' ? (zh ? '添加' : 'ADD') : change.action === 'conflict' ? (zh ? '冲突' : 'CONFLICT') : (zh ? '一致' : 'CURRENT')}
                  </span>
                  <span className="extensions-diff-id">{change.id}</span>
                  <span className="extensions-diff-app">{toolDisplayNames[language][change.app] || change.app}</span>
                </div>
              ))}
              {!diffChanges.length && <div className="extensions-empty">{zh ? '没有差异' : 'No differences'}</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {lastSyncResult && (
        <Card className="extensions-sync-result">
          <CardContent>
            <span className={lastSyncResult.applied ? 'ext-status-good' : 'ext-status-preview'}>
              {lastSyncResult.applied ? <CheckCircle2 size={14} /> : <GitCompare size={14} />}
              {lastSyncResult.applied ? (zh ? '已应用' : 'Applied') : (zh ? '仅预览' : 'Preview only')}
            </span>
            {lastSyncResult.changes && (
              <span>{lastSyncResult.changes.length} {zh ? '项变更' : 'changes'}</span>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{zh ? '已同步扩展' : 'Synced Extensions'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="extensions-list">
            {filteredRecords.map(item => (
              <div className={`extensions-row ${item.managed === false ? 'extensions-unmanaged' : ''}`} key={item.id}>
                <div className="extensions-row-main">
                  <div className="extensions-row-info">
                    <strong>{item.id}</strong>
                    <small>
                      {item.kind === 'mcp' ? 'MCP' : 'Skill'}
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
                  {item.managed === false && <span className="ext-unmanaged-tag"><ShieldAlert size={13} />{zh ? '未受管' : 'Unmanaged'}</span>}
                  {item.kind === 'mcp' && (removeTarget === item.id ? (
                    <span className="extensions-remove-confirm">
                      <span>{zh ? '确定移除？' : 'Remove?'}</span>
                      <Button size="sm" variant="destructive" onClick={() => void removeExtension(item.id)} disabled={busy}>{zh ? '确定' : 'Yes'}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(null)}>{zh ? '取消' : 'No'}</Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" title={zh ? '从注册表移除' : 'Remove from synced list'} aria-label={zh ? '从注册表移除' : 'Remove from synced list'} onClick={() => setRemoveTarget(item.id)} disabled={busy}>{zh ? '移除' : 'Remove'}
                    </Button>
                  )
                  )}
                </div>
              </div>
            ))}
            {!filteredRecords.length && (
              <div className="extensions-empty">{zh ? '还没有同步扩展。可点击“导入全部”读取现有 MCP，Skill 请在 Skills 页面管理。' : 'No synced extensions yet. Import MCP here; manage Skills in the Skills page.'}</div>
            )}
          </div>
        </CardContent>
      </Card>

      {message && <p className="extensions-error" role="alert">{message}</p>}
    </div>
  )
}

function Status({ app, client, zh, language }: { app: string; client?: StatusClient; zh: boolean; language: string }) {
  return (
    <Card className="extensions-status-card">
      <CardContent className="extensions-client-card">
        <div className="extensions-client-header">
          <span className={`extensions-client-dot ${client ? 'dot-good' : 'dot-missing'}`} />
          <strong>{toolDisplayNames[language as 'zh' | 'en'][app] || app}</strong>
          {client ? (
            <span className="ext-status-good"><CheckCircle2 size={14} />{zh ? '已检测' : 'Detected'}</span>
          ) : (
            <span className="ext-status-missing"><XCircle size={14} />{zh ? '未检测' : 'Not detected'}</span>
          )}
        </div>
        {client && (
          <div className="extensions-client-stats">
            <span>{zh ? 'MCP' : 'MCP'}: {client.managed.mcp} / {client.mcp}</span>
            <span>{zh ? 'Skill' : 'Skill'}: {client.managed.skills} / {client.skills}</span>
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
















