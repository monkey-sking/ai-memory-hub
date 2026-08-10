import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { CheckCircle2, Download, RefreshCw, ShieldAlert, Upload } from 'lucide-react'
import { apiGet, apiPost, asArray } from '../lib/api'
import { dashboardLabels } from '../lib/dashboardCopy'
import { toolDisplayNames } from '../lib/toolMetadata'
import type { AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { fieldBaseStyles } from '../components/ui/input'
import {
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  PageShell,
  Panel,
  StatTile,
  StatTileGrid
} from '../components/shell'
import { CredentialForm } from '../components/CredentialForm'
import { RelatedEntities } from '../components/RelatedEntities'
import './Skills.css'

type SkillPackage = { id: string; version: string; contentHash?: string; source?: { kind?: string; location?: string }; packagePath?: string; conflict?: boolean }
type SkillLifecycle = { selectedVersion?: string; enabled?: boolean; updateAvailable?: boolean; registryVersions?: string[]; projectionStatus?: string; dependencyStatus?: string }
type SkillSnapshot = { packages?: SkillPackage[]; manifest?: { skills?: Record<string, { constraint?: string; enabled?: boolean }>; targets?: string[] }; selected?: SkillPackage[]; lifecycle?: Record<string, SkillLifecycle> }
type ScanSource = { tool: string; path: string; skillFile?: string; ownership: string; contentHash?: string; protected?: boolean }
type ScanGroup = { id: string; status: 'discovered' | 'duplicate' | 'variant' | 'conflict' | 'protected'; sourceCount: number; duplicateCount: number; contentHashes: string[]; sources: ScanSource[]; packageId?: string; protected?: boolean; variant?: boolean; importable?: boolean }
type CredentialProfile = { id: string; envVar?: string; configured?: boolean }

const SYNC_TARGETS = ['codex', 'claude', 'gemini', 'opencode', 'antigravity'] as const

/** 32px so the row cannot drift past the 48px toolbar rhythm the shell uses. */
const rowSelectClass = cn(fieldBaseStyles, 'h-8 w-auto max-w-[220px] px-2 py-0')

export default function Skills() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const [snapshot, setSnapshot] = useState<SkillSnapshot>({})
  const [scan, setScan] = useState<ScanGroup[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [credentials, setCredentials] = useState<CredentialProfile[]>([])
  const [sourceChoice, setSourceChoice] = useState<Record<string, string>>({})
  const [selectedTargets, setSelectedTargets] = useState<Record<string, boolean>>({ codex: true, claude: true, gemini: true, opencode: true, antigravity: true })

  const load = async () => {
    setBusy(true)
    try {
      const [next, detected, credentialState] = await Promise.all([apiGet<SkillSnapshot>('/api/skills'), apiGet<{ groups?: ScanGroup[] }>('/api/skills/scan'), apiGet<{ profiles?: CredentialProfile[] }>('/api/credentials')])
      setSnapshot(next)
      setScan(asArray<ScanGroup>(detected.groups))
      setCredentials(asArray<CredentialProfile>(credentialState.profiles))
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [])

  const packages = useMemo(() => asArray<SkillPackage>(snapshot.packages).filter(item => !query || item.id.toLowerCase().includes(query.toLowerCase())), [snapshot.packages, query])
  const packageGroups = useMemo(() => {
    const groups = new Map<string, SkillPackage[]>()
    for (const item of packages) groups.set(item.id, [...(groups.get(item.id) || []), item])
    return [...groups.entries()].map(([id, versions]) => ({ id, versions: versions.sort((a, b) => b.version.localeCompare(a.version)) }))
  }, [packages])
  const importedIds = new Set(asArray<SkillPackage>(snapshot.packages).map(item => item.id))
  const discoverable = scan.filter(item => !importedIds.has(item.id)).slice(0, 150)

  const importSkill = async (item: ScanGroup) => {
    const source = item.sources.find(candidate => candidate.path === sourceChoice[item.id]) || item.sources[0]
    if (!source) return
    setBusy(true)
    try {
      await apiPost('/api/skills/install', { path: source.path, project: '.' })
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const selectSkill = async (id: string, version: string, enabled = true) => {
    setBusy(true)
    try {
      await apiPost('/api/skills/select', { id, version, enabled, project: '.' })
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const syncSkills = async () => {
    setBusy(true)
    try {
      await apiPost('/api/skills/sync', { project: '.', targets: Object.entries(selectedTargets).filter(([, enabled]) => enabled).map(([target]) => target) })
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const discoveryStatusText = (status: ScanGroup['status']) => {
    if (status === 'protected') return copy.skills.coreAdapterProtected
    if (status === 'variant') return copy.skills.targetVariantsNote
    if (status === 'conflict') return copy.skills.contentConflict
    if (status === 'duplicate') return copy.skills.duplicateMerged
    return copy.skills.readyToImport
  }

  return (
    <PageShell
      title={copy.skills.title}
      description={copy.skills.subtitle}
      contentClassName="flex flex-col gap-6"
      actions={
        <>
          <Button variant="secondary" onClick={() => void load()} disabled={busy}>
            <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
            {copy.skills.refreshStatus}
          </Button>
          <Button onClick={() => void syncSkills()} disabled={busy}>
            <Upload className="h-4 w-4" />
            {copy.skills.syncToAgents}
          </Button>
        </>
      }
      toolbar={
        <div role="group" aria-label={copy.skills.syncTargets} className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-3">{copy.skills.syncTargets}</span>
          {SYNC_TARGETS.map(target => (
            <Button
              key={target}
              size="sm"
              variant={selectedTargets[target] ? 'primary' : 'secondary'}
              aria-pressed={Boolean(selectedTargets[target])}
              onClick={() => setSelectedTargets(previous => ({ ...previous, [target]: !previous[target] }))}
            >
              {toolDisplayNames[language][target] || target}
            </Button>
          ))}
        </div>
      }
    >
      {message ? <ErrorState variant="inline" title={copy.error} description={message} /> : null}

      <StatTileGrid columns={3}>
        <StatTile label={copy.skills.registrySkills} value={packages.length} />
        <StatTile label={copy.skills.enabledHere} value={asArray(snapshot.selected).length} />
        <StatTile label={copy.skills.discoveredLocally} value={scan.length} />
        <StatTile
          label={copy.skills.conflicts}
          value={<span className={cn(packages.some(item => item.conflict) && 'text-danger')}>{packages.filter(item => item.conflict || scan.some(found => found.id === item.id && found.status === 'conflict')).length}</span>}
        />
        <StatTile label={copy.skills.targetVariants} value={scan.filter(item => item.status === 'variant').length} />
        <StatTile label={copy.skills.protectedCore} value={scan.filter(item => item.status === 'protected').length} />
      </StatTileGrid>

      <Panel
        title={copy.skills.canonicalRegistry}
        count={packageGroups.length}
        flushBody
        toolbar={
          <FilterBar
            search={{
              id: 'skills-search',
              value: query,
              onChange: setQuery,
              placeholder: copy.skills.searchPlaceholder,
              label: copy.skills.searchPlaceholder
            }}
          />
        }
        footer={<span className="truncate">{copy.skills.projectionNote}</span>}
      >
        {busy && !packageGroups.length ? (
          <LoadingState variant="rows" label={copy.refreshing} className="p-4" />
        ) : packageGroups.length ? (
          packageGroups.map(group => {
            const state = snapshot.lifecycle?.[group.id]
            const selectedVersion = state?.selectedVersion || group.versions[0]?.version || ''
            return (
              <div key={group.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-ink">{group.id}</span>
                  <span className="truncate text-xs text-ink-3">
                    {group.versions.length} {copy.skills.versions} · {selectedVersion ? `v${selectedVersion}` : copy.skills.notSelected}
                  </span>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {state?.updateAvailable ? (
                    <Badge variant="warning"><RefreshCw className="h-3 w-3" />{copy.skills.updateAvailable}</Badge>
                  ) : state?.enabled ? (
                    <Badge variant="success"><CheckCircle2 className="h-3 w-3" />{copy.skills.enabled}</Badge>
                  ) : (
                    <Badge variant="neutral">{copy.skills.disabled}</Badge>
                  )}
                  <RelatedEntities entityType="skill" entityId={group.id} title={copy.skills.relations} />
                  <select
                    aria-label={`${group.id} · ${copy.skills.versions}`}
                    className={rowSelectClass}
                    value={selectedVersion}
                    onChange={event => void selectSkill(group.id, event.target.value)}
                    disabled={busy}
                  >
                    {/* a group can legitimately carry the same id@version twice (same skill seen from two sources), so the index keeps keys unique */}
                    {group.versions.map((version, index) => <option key={`${version.id}@${version.version}#${index}`} value={version.version}>v{version.version}</option>)}
                  </select>
                  <Button size="sm" variant="secondary" onClick={() => void selectSkill(group.id, selectedVersion, !state?.enabled)} disabled={busy}>
                    {state?.enabled ? copy.skills.disable : copy.skills.enable}
                  </Button>
                </div>
              </div>
            )
          })
        ) : (
          <EmptyState title={copy.noData} description={copy.skills.emptyImported} />
        )}
      </Panel>

      <Panel title={copy.skills.localDiscovery} count={discoverable.length} flushBody>
        {busy && !discoverable.length ? (
          <LoadingState variant="rows" label={copy.refreshing} className="p-4" />
        ) : discoverable.length ? (
          discoverable.map(item => (
            <div
              key={item.id}
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0',
                item.status === 'protected' && 'bg-warning-tint/40'
              )}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-sm font-medium text-ink">{item.id}</span>
                <span className="truncate text-xs text-ink-3">{item.sourceCount} {copy.skills.sources} · {discoveryStatusText(item.status)}</span>
                {item.sources.length > 1 ? (
                  <select
                    aria-label={`${item.id} · ${copy.source}`}
                    className={rowSelectClass}
                    value={sourceChoice[item.id] || item.sources[0].path}
                    onChange={event => setSourceChoice(previous => ({ ...previous, [item.id]: event.target.value }))}
                    disabled={item.status === 'protected'}
                  >
                    {item.sources.map(source => <option key={`${source.tool}:${source.path}`} value={source.path}>{source.tool} · {source.contentHash?.slice(-12) || source.path}</option>)}
                  </select>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {item.status === 'protected' ? (
                  <>
                    <Badge variant="warning"><ShieldAlert className="h-3 w-3" />{copy.skills.protected}</Badge>
                    <RelatedEntities entityType="skill" entityId={item.id} title={copy.skills.viewRelations} />
                  </>
                ) : item.status === 'variant' ? (
                  <Badge variant="warning"><ShieldAlert className="h-3 w-3" />{copy.skills.targetVariantBadge}</Badge>
                ) : item.status === 'conflict' ? (
                  <Badge variant="danger"><ShieldAlert className="h-3 w-3" />{copy.skills.chooseVersion}</Badge>
                ) : item.status === 'duplicate' ? (
                  <Badge variant="success"><CheckCircle2 className="h-3 w-3" />{copy.skills.deduplicated}</Badge>
                ) : null}
                {item.importable !== false ? (
                  <Button size="sm" onClick={() => void importSkill(item)} disabled={busy}>
                    <Download className="h-4 w-4" />
                    {item.status === 'conflict' ? copy.skills.importSelected : copy.skills.importToAmh}
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <EmptyState title={copy.noData} />
        )}
      </Panel>

      <Panel title={copy.skills.sharedCredentials} count={credentials.length}>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-ink-3">{copy.skills.credentialNote}</p>
          <CredentialForm language={language} onSaved={() => void load()} />
          {credentials.length ? (
            <div className="flex flex-wrap gap-2">
              {credentials.map(profile => (
                <Badge key={profile.id} variant="success">
                  <CheckCircle2 className="h-3 w-3" />
                  {profile.id}{profile.envVar ? ` · ${profile.envVar}` : ''}
                </Badge>
              ))}
            </div>
          ) : (
            <EmptyState size="sm" icon={null} title={copy.skills.noCredentials} />
          )}
        </div>
      </Panel>
    </PageShell>
  )
}
