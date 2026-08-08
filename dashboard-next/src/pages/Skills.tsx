import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { CheckCircle2, Download, RefreshCw, Search, ShieldAlert, Upload, Wrench } from 'lucide-react'
import { apiGet, apiPost, asArray } from '../lib/api'
import { dashboardLabels } from '../lib/dashboardCopy'
import type { AppOutletContext } from '../lib/i18n'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { CredentialForm } from '../components/CredentialForm'
import { RelatedEntities } from '../components/RelatedEntities'
import './Skills.css'

type SkillPackage = { id: string; version: string; contentHash?: string; source?: { kind?: string; location?: string }; packagePath?: string; conflict?: boolean }
type SkillLifecycle = { selectedVersion?: string; enabled?: boolean; updateAvailable?: boolean; registryVersions?: string[]; projectionStatus?: string; dependencyStatus?: string }
type SkillSnapshot = { packages?: SkillPackage[]; manifest?: { skills?: Record<string, { constraint?: string; enabled?: boolean }>; targets?: string[] }; selected?: SkillPackage[]; lifecycle?: Record<string, SkillLifecycle> }
type ScanSource = { tool: string; path: string; skillFile?: string; ownership: string; contentHash?: string; protected?: boolean }
type ScanGroup = { id: string; status: 'discovered' | 'duplicate' | 'variant' | 'conflict' | 'protected'; sourceCount: number; duplicateCount: number; contentHashes: string[]; sources: ScanSource[]; packageId?: string; protected?: boolean; variant?: boolean; importable?: boolean }
type CredentialProfile = { id: string; envVar?: string; configured?: boolean }

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

  return (
    <div className="skills-page">
      <header className="skills-header">
        <div>
          <p className="skills-eyebrow">AI MEMORY HUB / SKILLS</p>
          <h1>{copy.skills.title}</h1>
          <p>{copy.skills.subtitle}</p>
        </div>
        <div className="skills-targets" aria-label={copy.skills.syncTargets}>{(['codex', 'claude', 'gemini', 'opencode', 'antigravity'] as const).map(target => <label key={target}><input type="checkbox" checked={selectedTargets[target]} onChange={event => setSelectedTargets(previous => ({ ...previous, [target]: event.target.checked }))} />{target}</label>)}</div>
        <div className="skills-header-actions"><Button variant="outline" onClick={() => void load()} disabled={busy}><RefreshCw size={16} />{copy.skills.refreshStatus}</Button><Button onClick={() => void syncSkills()} disabled={busy}><Upload size={16} />{copy.skills.syncToAgents}</Button></div>
      </header>

      <section className="skills-summary-grid">
        <Card><CardContent><span>{copy.skills.registrySkills}</span><strong>{packages.length}</strong></CardContent></Card>
        <Card><CardContent><span>{copy.skills.enabledHere}</span><strong>{asArray(snapshot.selected).length}</strong></CardContent></Card>
        <Card><CardContent><span>{copy.skills.discoveredLocally}</span><strong>{scan.length}</strong></CardContent></Card>
        <Card><CardContent><span>{copy.skills.conflicts}</span><strong>{packages.filter(item => item.conflict || scan.some(found => found.id === item.id && found.status === 'conflict')).length}</strong></CardContent></Card>
        <Card><CardContent><span>{copy.skills.targetVariants}</span><strong>{scan.filter(item => item.status === 'variant').length}</strong></CardContent></Card>
        <Card><CardContent><span>{copy.skills.protectedCore}</span><strong>{scan.filter(item => item.status === 'protected').length}</strong></CardContent></Card>
      </section>

      <Card>
        <CardHeader><CardTitle>{copy.skills.canonicalRegistry}</CardTitle></CardHeader>
        <CardContent>
          <div className="skills-toolbar"><label><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.skills.searchPlaceholder} /></label><span>{copy.skills.projectionNote}</span></div>
          <div className="skills-list">
            {packageGroups.map(group => { const state = snapshot.lifecycle?.[group.id]; const selectedVersion = state?.selectedVersion || group.versions[0]?.version || ''; return <div className="skill-row" key={group.id}><div><strong>{group.id}</strong><small>{group.versions.length} {copy.skills.versions} · {selectedVersion ? `v${selectedVersion}` : copy.skills.notSelected}</small></div><div className="skill-row-state">{state?.updateAvailable ? <span className="skill-warning"><RefreshCw size={15} />{copy.skills.updateAvailable}</span> : state?.enabled ? <span className="skill-good"><CheckCircle2 size={15} />{copy.skills.enabled}</span> : <span>{copy.skills.disabled}</span>}<RelatedEntities entityType="skill" entityId={group.id} title={copy.skills.relations} /><select value={selectedVersion} onChange={event => void selectSkill(group.id, event.target.value)} disabled={busy}>{group.versions.map(version => <option key={`${version.id}@${version.version}`} value={version.version}>v{version.version}</option>)}</select><Button size="sm" variant="outline" onClick={() => void selectSkill(group.id, selectedVersion, !state?.enabled)} disabled={busy}>{state?.enabled ? copy.skills.disable : copy.skills.enable}</Button></div></div> })}
            {!packages.length && <div className="skills-empty">{copy.skills.emptyImported}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle><Wrench size={18} />{copy.skills.localDiscovery}</CardTitle></CardHeader>
        <CardContent><div className="skills-list">{scan.filter(item => !importedIds.has(item.id)).slice(0, 150).map(item => <div className={`skill-row ${item.status === 'protected' ? 'is-protected' : ''}`} key={item.id}><div><strong>{item.id}</strong><small>{item.sourceCount} {copy.skills.sources} · {item.status === 'protected' ? copy.skills.coreAdapterProtected : item.status === 'variant' ? copy.skills.targetVariantsNote : item.status === 'conflict' ? copy.skills.contentConflict : item.status === 'duplicate' ? copy.skills.duplicateMerged : copy.skills.readyToImport}</small>{item.sources.length > 1 && <select value={sourceChoice[item.id] || item.sources[0].path} onChange={event => setSourceChoice(previous => ({ ...previous, [item.id]: event.target.value }))} disabled={item.status === 'protected'}>{item.sources.map(source => <option key={`${source.tool}:${source.path}`} value={source.path}>{source.tool} · {source.contentHash?.slice(-12) || source.path}</option>)}</select>}</div><div className="skill-row-state">{item.status === 'protected' ? <><span className="skill-warning"><ShieldAlert size={15} />{copy.skills.protected}</span><RelatedEntities entityType="skill" entityId={item.id} title={copy.skills.viewRelations} /></> : item.status === 'variant' ? <span className="skill-warning"><ShieldAlert size={15} />{copy.skills.targetVariantBadge}</span> : item.status === 'conflict' ? <span className="skill-warning"><ShieldAlert size={15} />{copy.skills.chooseVersion}</span> : item.status === 'duplicate' ? <span className="skill-good"><CheckCircle2 size={15} />{copy.skills.deduplicated}</span> : null}{item.importable !== false && <Button size="sm" onClick={() => void importSkill(item)} disabled={busy}><Download size={14} />{item.status === 'conflict' ? copy.skills.importSelected : copy.skills.importToAmh}</Button>}</div></div>)}{!scan.filter(item => !importedIds.has(item.id)).length && <div className="skills-empty">{copy.skills.emptyImported}</div>}</div></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle><ShieldAlert size={18} />{copy.skills.sharedCredentials}</CardTitle></CardHeader>
        <CardContent>
          <p className="skills-credential-note">{copy.skills.credentialNote}</p>
          <CredentialForm language={language} onSaved={() => void load()} />
          <div className="skills-credential-list">{credentials.map(profile => <span key={profile.id} className="skill-good"><CheckCircle2 size={14} />{profile.id}{profile.envVar ? ` · ${profile.envVar}` : ''}</span>)}{!credentials.length && <span className="skills-empty">{copy.skills.noCredentials}</span>}</div>
        </CardContent>
      </Card>
      {message && <p className="skills-error" role="alert">{message}</p>}
    </div>
  )
}
