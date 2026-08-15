import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { RefreshCw, Wrench } from 'lucide-react'
import { apiGet, apiPost, asArray, asRecord, boolOf, formatDate, formatRelativeTime, numberOf, textOf } from '../lib/api'
import type { AnyRecord } from '../lib/api'
import {
  dashboardLabels,
  dashboardSubtitles,
  dashboardTitles
} from '../lib/dashboardCopy'
import type { DashboardCopy } from '../lib/dashboardCopy'
import { toolDisplayNames, toolKindBadges, toolKinds } from '../lib/toolMetadata'
import type { AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  PageShell,
  Panel,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetDetailList,
  SheetHeader,
  SheetTitle
} from '../components/shell'
import { SummaryStrip } from '@/components/ds/SummaryStrip'
import { ToolCard, type Tone } from '@/components/ds/ToolCard'

/* ------------------------------------------------------------------ helpers */

const formatNumberLocal = (value: unknown): string => numberOf(value).toLocaleString()

const formatPercent = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '-'
  const next = Number(value)
  if (!Number.isFinite(next)) return '-'
  return `${Math.round(next * 100)}%`
}

const formatDurationMs = (value: unknown): string => {
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) return '-'
  if (next < 1000) return `${Math.round(next)} ms`
  if (next < 60000) return `${Math.round(next / 1000)} s`
  const minutes = Math.floor(next / 60000)
  const seconds = Math.round((next % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

const getToolStatus = (tool: AnyRecord): string => {
  const health = asRecord(tool.health)
  return textOf(health.status || tool.connectionStatus || (tool.installed ? 'installed' : 'missing'), 'missing')
}

const toolMatchesStatusFilter = (tool: AnyRecord, filter: string): boolean => {
  const status = getToolStatus(tool)
  if (filter === 'all') return true
  if (filter === 'ready') return status.startsWith('ready')
  if (filter === 'connected') return boolOf(tool.connected) || textOf(tool.connectionStatus).startsWith('connected')
  if (filter === 'runnable') return boolOf(tool.runnable || asRecord(tool.capability).autoDispatch)
  if (filter === 'missing') return !boolOf(tool.installed) || status.includes('missing')
  if (filter === 'needs') return status.includes('needs') || status.includes('unconfigured') || (boolOf(tool.installed) && !boolOf(tool.configured))
  return true
}

const getToolDisplayName = (toolName: string, language: AppOutletContext['language']): string => {
  const clean = toolName.toLowerCase().trim()
  return toolDisplayNames[language]?.[clean] || toolName || '-'
}

const getToolKindLabel = (kind: string, language: AppOutletContext['language']): string => {
  const clean = kind.toLowerCase().trim()
  return toolKindBadges[language]?.[clean] || kind || '-'
}

const mapToolTone = (status: string): Tone => {
  const k = status.toLowerCase()
  if (k.startsWith('ready') || k === 'connected' || k.startsWith('connected')) return 'success'
  if (k === 'error') return 'danger'
  if (k.includes('missing')) return 'neutral'
  if (k.includes('needs') || k.includes('unconfigured')) return 'warning'
  if (k === 'installed') return 'info'
  return 'neutral'
}

const mapToolBadge = (status: string): string => {
  const k = status.toLowerCase()
  if (k.startsWith('ready') || k === 'connected' || k.startsWith('connected')) return '运行中'
  if (k === 'error') return '错误'
  if (k.includes('missing')) return '离线'
  if (k.includes('needs') || k.includes('unconfigured')) return '待配置'
  if (k === 'installed') return '空闲'
  return status
}

type BadgeTone = 'neutral' | 'success' | 'info' | 'danger' | 'warning'

const toolStatusTone = (status: string): BadgeTone => {
  if (status.startsWith('ready')) return 'success'
  if (status === 'connected' || status.startsWith('connected')) return 'info'
  if (status === 'error') return 'danger'
  if (status.includes('missing')) return 'warning'
  if (status.includes('needs') || status.includes('unconfigured')) return 'warning'
  if (status === 'installed') return 'success'
  return 'neutral'
}

function ToolStatusBadge({ status, copy }: { status: string; copy: DashboardCopy }) {
  const label = (copy.statusLabels as Record<string, string>)[status] ?? status
  return (
    <Badge variant={toolStatusTone(status)} dot>
      {label}
    </Badge>
  )
}

function ToolPreviewCard({
  busy,
  copy,
  disabled,
  label,
  onApply,
  preview,
  primaryLabel
}: {
  busy: boolean
  copy: DashboardCopy
  disabled: boolean
  label: string
  onApply: () => void
  preview: AnyRecord | null
  primaryLabel: string
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface-sunk p-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm font-medium text-ink">{label}</strong>
        <Button size="sm" disabled={disabled || busy} onClick={onApply}>
          {busy ? copy.running : primaryLabel}
        </Button>
      </div>
      <p className="truncate font-mono text-xs text-ink-2">{preview ? textOf(preview.file, '-') : copy.previewUnavailable}</p>
      <pre className="max-h-28 overflow-auto rounded-md bg-surface p-2 font-mono text-xs whitespace-pre-wrap text-ink-3">
        {preview ? textOf(preview.snippet, '-') : copy.previewUnavailable}
      </pre>
    </section>
  )
}

/* ------------------------------------------------------------------ component */

export default function Tools() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]

  const [tools, setTools] = useState<AnyRecord[]>([])
  const [summary, setSummary] = useState<AnyRecord>({})
  const [capabilities, setCapabilities] = useState<AnyRecord>({})
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedTool, setSelectedTool] = useState<AnyRecord | null>(null)
  const [localPreview, setLocalPreview] = useState<AnyRecord | null>(null)
  const [globalPreview, setGlobalPreview] = useState<AnyRecord | null>(null)
  const [lastInstallFile, setLastInstallFile] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async (forceRefresh = false) => {
    setBusy(true)
    setError('')
    try {
      const payload = await apiGet<AnyRecord>(`/api/tools${forceRefresh ? '?refresh=1' : ''}`)
      setTools(asArray<AnyRecord>(payload.tools))
      setSummary(asRecord(payload.summary))
      setCapabilities(asRecord(payload.capabilities || asRecord(payload.summary).capabilities))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy(false)
    }
  }

  // Initial data load on mount
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [])

  const detectTools = async () => {
    setBusy(true)
    setError('')
    try {
      const payload = await apiGet<AnyRecord>('/api/detect')
      setTools(asArray<AnyRecord>(payload.tools))
      setSummary(asRecord(payload.summary))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy(false)
    }
  }

  const refreshCapabilities = async () => {
    setBusy(true)
    setError('')
    try {
      const payload = await apiGet<AnyRecord>('/api/capabilities?refresh=1')
      setCapabilities(payload)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy(false)
    }
  }

  const openToolSheet = async (tool: AnyRecord) => {
    setSelectedTool(tool)
    setLocalPreview(null)
    setGlobalPreview(null)
    setLastInstallFile('')
    setError('')
    setBusy(true)
    const toolName = textOf(tool.name)
    try {
      const [localResult, globalResult] = await Promise.all([
        apiGet<AnyRecord>(`/api/install/preview?tool=${encodeURIComponent(toolName)}&scope=local`).catch(() => null),
        apiGet<AnyRecord>(`/api/install/preview?tool=${encodeURIComponent(toolName)}&scope=global`).catch(() => null)
      ])
      setLocalPreview(localResult)
      setGlobalPreview(globalResult)
    } finally {
      setBusy(false)
    }
  }

  const applyToolRules = async (scope: 'local' | 'global') => {
    if (!selectedTool) return
    const toolName = textOf(selectedTool.name)
    setBusy(true)
    setError('')
    setLastInstallFile('')
    try {
      const result = await apiPost<AnyRecord>('/api/install/apply', { tool: toolName, scope })
      await openToolSheet(selectedTool)
      setLastInstallFile(textOf(result.file, '-'))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy(false)
    }
  }

  const activeSummary = useMemo<AnyRecord>(() => {
    if (summary.total) return summary
    return {
      total: tools.length,
      detected: tools.filter(tool => boolOf(tool.installed || tool.connected)).length,
      configured: tools.filter(tool => boolOf(tool.configured)).length,
      runnable: tools.filter(tool => boolOf(tool.runnable)).length,
      missing: tools.filter(tool => !boolOf(tool.installed)).length
    }
  }, [summary, tools])

  const filteredTools = useMemo(
    () =>
      tools.filter(tool => {
        if (!toolMatchesStatusFilter(tool, statusFilter)) return false
        const needle = query.trim().toLowerCase()
        if (!needle) return true
        return [
          tool.name,
          tool.kind,
          tool.connectionStatus,
          tool.runnerReason,
          tool.action,
          textOf(asRecord(tool.health).status),
          textOf(asRecord(tool.capability).integrationMode)
        ]
          .map(value => textOf(value).toLowerCase())
          .join(' ')
          .includes(needle)
      }),
    [tools, query, statusFilter]
  )

  const selectedCapability = asRecord(selectedTool?.capability)
  const selectedConfig = asRecord(selectedTool?.config)
  const selectedHealth = asRecord(selectedTool?.health)

  return (
    <PageShell
      title={dashboardTitles[language]['tools']}
      description={dashboardSubtitles[language]['tools']}
      contentClassName="flex flex-col gap-6"
      actions={
        <>
          <Button variant="secondary" onClick={() => void load(true)} disabled={busy}>
            <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
            {copy.refreshTools}
          </Button>
          <Button variant="secondary" onClick={() => void detectTools()} disabled={busy}>
            <Wrench className="h-4 w-4" />
            {copy.detectTools}
          </Button>
        </>
      }
    >
      <SummaryStrip
        items={[
          { label: copy.toolReadiness, value: formatNumberLocal(activeSummary.runnable), tone: 'success' },
          { label: copy.installed, value: formatNumberLocal(activeSummary.detected), tone: 'neutral' },
          { label: copy.missing, value: formatNumberLocal(activeSummary.missing), tone: activeSummary.missing ? 'warning' : 'neutral' },
          { label: copy.configured, value: formatNumberLocal(activeSummary.configured), tone: 'info' }
        ]}
        note="本地数据 · 实时"
      />

      <Panel
        title={copy.toolInventory}
        count={filteredTools.length}
        toolbar={
          <FilterBar
            search={{
              id: 'tools-search',
              value: query,
              onChange: setQuery,
              placeholder: copy.searchPlaceholder,
              label: copy.searchText
            }}
            filters={[
              {
                type: 'single',
                id: 'tools-status',
                label: copy.status,
                value: statusFilter,
                onChange: setStatusFilter,
                allLabel: copy.toolFilterAll,
                options: [
                  { value: 'all', label: copy.toolFilterAll },
                  { value: 'ready', label: copy.toolFilterReady },
                  { value: 'connected', label: copy.toolFilterConnected },
                  { value: 'runnable', label: copy.toolFilterRunnable },
                  { value: 'needs', label: copy.toolFilterNeeds },
                  { value: 'missing', label: copy.toolFilterMissing }
                ]
              }
            ]}
            onClear={() => {
              setQuery('')
              setStatusFilter('all')
            }}
            clearLabel={copy.clear}
          />
        }
      >
        {error && tools.length === 0 ? (
          <ErrorState
            variant="block"
            title={copy.error}
            description={error}
            action={
              <Button onClick={() => void load()}>
                <RefreshCw className="h-4 w-4" />
                {copy.refresh}
              </Button>
            }
          />
        ) : busy && tools.length === 0 ? (
          <LoadingState variant="rows" label={copy.refreshing} className="p-4" />
        ) : filteredTools.length ? (
          <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredTools.map(tool => {
              const toolName = textOf(tool.name)
              const status = getToolStatus(tool)
              const enabled = boolOf(tool.enabled ?? tool.configured ?? tool.installed)
              const version = textOf(tool.version, '')
              const lastRunAt = textOf(asRecord(tool.performance).lastRunAt)
              const lastRun = lastRunAt ? formatRelativeTime(lastRunAt) : ''
              return (
                <ToolCard
                  key={toolName}
                  name={toolName}
                  displayName={getToolDisplayName(toolName, language)}
                  tone={mapToolTone(status)}
                  badgeText={mapToolBadge(status)}
                  version={version}
                  lastRun={lastRun}
                  enabled={enabled}
                  onView={() => void openToolSheet(tool)}
                />
              )
            })}
          </div>
        ) : (
          <EmptyState title={tools.length ? copy.noMatches : copy.noData} />
        )}
      </Panel>

      <Panel
        title={copy.toolReadiness}
        actions={
          <Button variant="ghost" size="sm" onClick={() => void refreshCapabilities()} disabled={busy}>
            {copy.refreshCapabilities}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-3">{copy.directCli}</span>
            <span className="text-ink tabular-nums">{formatNumberLocal(capabilities.directCliProfiles)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-3">{copy.autoDispatchLabel}</span>
            <span className="text-ink tabular-nums">{formatNumberLocal(capabilities.autoDispatch)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-3">{copy.sharedState}</span>
            <span className="text-ink tabular-nums">{formatNumberLocal(capabilities.sharedState)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-3">{copy.capabilitySummary}</span>
            <span className="text-ink tabular-nums">{formatNumberLocal(capabilities.total)}</span>
          </div>
        </div>
      </Panel>

      <Panel title="工具清单（详细）" count={filteredTools.length} flushBody>
        {error && tools.length > 0 ? <ErrorState variant="inline" title={error} /> : null}
        {filteredTools.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">{copy.toolName}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">{copy.status}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">{copy.mode}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">{copy.declaredModels}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">{copy.runnable}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">{copy.totalRuns}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">{copy.successRate}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">{copy.lastRun}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">{copy.toolDetail}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">{copy.manageConfig}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTools.map(tool => {
                  const capability = asRecord(tool.capability)
                  const config = asRecord(tool.config)
                  const health = asRecord(tool.health)
                  const metrics = asRecord(tool.metrics)
                  const performance = asRecord(tool.performance)
                  const toolName = textOf(tool.name)
                  const kind = textOf(tool.kind || toolKinds[toolName.toLowerCase()])
                  const detail = textOf(config.action || tool.action || tool.runnerReason || asArray<string>(health.reasons)[0], '-')
                  const command = textOf(tool.runnerCommand || config.runnerCommand || tool.runnerProfile || config.runnerCommandKind)
                  const declaredModels = asArray<string>(asRecord(tool.declared).models)
                  const declaredStrengths = asArray<string>(asRecord(tool.strengths).all)
                  return (
                    <tr key={toolName} className="border-b border-line last:border-b-0 hover:bg-surface-sunk">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-ink">{getToolDisplayName(toolName, language)}</span>
                          <span className="text-xs text-ink-3">{toolName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><ToolStatusBadge status={getToolStatus(tool)} copy={copy} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-ink-3">{getToolKindLabel(kind, language)}</span>
                          <span className="text-ink-2">{textOf(capability.integrationMode, '-')}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          {declaredModels.length ? (
                            <span className="text-ink-2">{declaredModels.slice(0, 2).join(', ')}</span>
                          ) : (
                            <span className="text-ink-4">-</span>
                          )}
                          {declaredStrengths.length ? (
                            <span className="text-xs text-ink-3">{declaredStrengths.slice(0, 2).join(', ')}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={boolOf(tool.installed || tool.connected) ? 'success' : 'neutral'}>{copy.installed}</Badge>
                          <Badge variant={boolOf(tool.configured) ? 'success' : 'neutral'}>{copy.configured}</Badge>
                          <Badge variant={boolOf(tool.runnable || capability.autoDispatch) ? 'success' : 'neutral'}>{copy.runnable}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink">
                        <div className="flex flex-col">
                          <strong>{formatNumberLocal(metrics.totalRuns)}</strong>
                          <span className="text-xs text-ink-3">{formatDurationMs(performance.avgDurationMs)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink-2">{formatPercent(performance.successRate)}</td>
                      <td className="px-4 py-3 text-ink-2">{formatDate(textOf(performance.lastRunAt))}</td>
                      <td className="px-4 py-3">
                        <div className="flex max-w-[240px] flex-col gap-0.5">
                          <span className="truncate text-ink-2">{detail}</span>
                          {command ? <code className="truncate font-mono text-xs text-ink-3">{command}</code> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" onClick={() => void openToolSheet(tool)} disabled={busy}>
                          {copy.manageConfig}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={tools.length ? copy.noMatches : copy.noData} />
        )}
      </Panel>

      <Sheet open={selectedTool !== null} onOpenChange={open => { if (!open) setSelectedTool(null) }}>
        <SheetContent side="right" closeLabel={copy.close}>
          <SheetHeader>
            <SheetTitle>{`${copy.manageConfig}: ${textOf(selectedTool?.name, '-')}`}</SheetTitle>
            <SheetDescription>{textOf(selectedTool?.kind, '-')}</SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4">
            {selectedTool ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <ToolStatusBadge status={getToolStatus(selectedTool)} copy={copy} />
                  <strong className="text-ink">{textOf(selectedTool.name, '-')}</strong>
                  <span className="text-ink-3">{textOf(selectedTool.kind, '-')}</span>
                </div>
                <SheetDetailList>
                  <dt>{copy.mode}</dt>
                  <dd>{textOf(selectedCapability.integrationMode, '-')}</dd>
                  <dt>{copy.runner}</dt>
                  <dd>{textOf(selectedTool.runnerProfile || selectedConfig.runnerCommandKind, '-')}</dd>
                  <dt>{copy.command}</dt>
                  <dd>{textOf(selectedTool.runnerCommand || selectedConfig.runnerCommand, '-')}</dd>
                  <dt>{copy.path}</dt>
                  <dd>{textOf(selectedTool.dir || selectedConfig.instructionFile, '-')}</dd>
                  <dt>{copy.capability}</dt>
                  <dd>{asArray<string>(selectedCapability.capabilities).join(', ') || '-'}</dd>
                  <dt>{copy.healthReasons}</dt>
                  <dd>{asArray<string>(selectedHealth.reasons).join(' · ') || '-'}</dd>
                  <dt>{copy.declaredModels}</dt>
                  <dd>{asArray<string>(asRecord(selectedTool.declared).models).join(', ') || '-'}</dd>
                  <dt>{copy.availableModels}</dt>
                  <dd>{asArray<string>(asRecord(selectedTool.models).all).slice(0, 12).join(', ') || '-'}</dd>
                  <dt>{copy.strengths}</dt>
                  <dd>{asArray<string>(asRecord(selectedTool.strengths).all).join(', ') || '-'}</dd>
                </SheetDetailList>
                {lastInstallFile ? <Badge variant="info">{`${copy.changed}: ${lastInstallFile}`}</Badge> : null}
                {error ? <ErrorState variant="inline" title={error} /> : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ToolPreviewCard
                    busy={busy}
                    copy={copy}
                    disabled={!localPreview}
                    label={copy.localTarget}
                    onApply={() => void applyToolRules('local')}
                    preview={localPreview}
                    primaryLabel={copy.installLocal}
                  />
                  <ToolPreviewCard
                    busy={busy}
                    copy={copy}
                    disabled={!globalPreview}
                    label={copy.globalTarget}
                    onApply={() => void applyToolRules('global')}
                    preview={globalPreview}
                    primaryLabel={copy.installGlobal}
                  />
                </div>
              </>
            ) : null}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </PageShell>
  )
}
