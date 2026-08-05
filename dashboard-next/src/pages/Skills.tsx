import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { CheckCircle2, Download, RefreshCw, Search, ShieldAlert, Upload, Wrench } from 'lucide-react'
import { apiGet, apiPost, asArray } from '../lib/api'
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
  const [snapshot, setSnapshot] = useState<SkillSnapshot>({})
  const [scan, setScan] = useState<ScanGroup[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [credentials, setCredentials] = useState<CredentialProfile[]>([])
  const [sourceChoice, setSourceChoice] = useState<Record<string, string>>({})
  const zh = language === 'zh'

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
      await apiPost('/api/skills/sync', { project: '.' })
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
          <h1>{zh ? '共享 Skill 中心' : 'Shared Skill Center'}</h1>
          <p>{zh ? '统一安装一次，多个项目和 Agent 共用。' : 'Install once, reuse across projects and Agents.'}</p>
        </div>
        <div className="skills-header-actions"><Button variant="outline" onClick={() => void load()} disabled={busy}><RefreshCw size={16} />{zh ? '刷新状态' : 'Refresh'}</Button><Button onClick={() => void syncSkills()} disabled={busy}><Upload size={16} />{zh ? '同步到 Agent' : 'Sync to Agents'}</Button></div>
      </header>

      <section className="skills-summary-grid">
        <Card><CardContent><span>{zh ? 'Registry Skill' : 'Registry Skills'}</span><strong>{packages.length}</strong></CardContent></Card>
        <Card><CardContent><span>{zh ? '当前项目已启用' : 'Enabled here'}</span><strong>{asArray(snapshot.selected).length}</strong></CardContent></Card>
        <Card><CardContent><span>{zh ? '本机发现' : 'Discovered locally'}</span><strong>{scan.length}</strong></CardContent></Card>
        <Card><CardContent><span>{zh ? '冲突' : 'Conflicts'}</span><strong>{packages.filter(item => item.conflict || scan.some(found => found.id === item.id && found.status === 'conflict')).length}</strong></CardContent></Card>
        <Card><CardContent><span>{zh ? '适配变体' : 'Target variants'}</span><strong>{scan.filter(item => item.status === 'variant').length}</strong></CardContent></Card>
        <Card><CardContent><span>{zh ? '受保护核心' : 'Protected core'}</span><strong>{scan.filter(item => item.status === 'protected').length}</strong></CardContent></Card>
      </section>

      <Card>
        <CardHeader><CardTitle>{zh ? '统一 Skill Registry' : 'Canonical Skill Registry'}</CardTitle></CardHeader>
        <CardContent>
          <div className="skills-toolbar"><label><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={zh ? '搜索 Skill' : 'Search Skills'} /></label><span>{zh ? 'Agent 目录只保留受管入口，不再作为源文件' : 'Agent directories are projections, not sources of truth'}</span></div>
          <div className="skills-list">
            {packageGroups.map(group => { const state = snapshot.lifecycle?.[group.id]; const selectedVersion = state?.selectedVersion || group.versions[0]?.version || ''; return <div className="skill-row" key={group.id}><div><strong>{group.id}</strong><small>{group.versions.length} {zh ? '个版本' : 'versions'} · {selectedVersion ? `v${selectedVersion}` : (zh ? '未选择' : 'not selected')}</small></div><div className="skill-row-state">{state?.updateAvailable ? <span className="skill-warning"><RefreshCw size={15} />{zh ? '有更新' : 'Update available'}</span> : state?.enabled ? <span className="skill-good"><CheckCircle2 size={15} />{zh ? '已启用' : 'Enabled'}</span> : <span>{zh ? '未启用' : 'Disabled'}</span>}<RelatedEntities entityType="skill" entityId={group.id} title={zh ? '关联' : 'Relations'} /><select value={selectedVersion} onChange={event => void selectSkill(group.id, event.target.value)} disabled={busy}>{group.versions.map(version => <option key={`${version.id}@${version.version}`} value={version.version}>v{version.version}</option>)}</select><Button size="sm" variant="outline" onClick={() => void selectSkill(group.id, selectedVersion, !state?.enabled)} disabled={busy}>{state?.enabled ? (zh ? '停用' : 'Disable') : (zh ? '启用' : 'Enable')}</Button></div></div> })}
            {!packages.length && <div className="skills-empty">{zh ? '还没有导入 Skill。可从下方本机发现列表导入。' : 'No Skills imported yet. Import one from the local discovery list below.'}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle><Wrench size={18} />{zh ? '本机 Skill 发现' : 'Local Skill Discovery'}</CardTitle></CardHeader>
        <CardContent><div className="skills-list">{scan.filter(item => !importedIds.has(item.id)).slice(0, 150).map(item => <div className={`skill-row ${item.status === 'protected' ? 'is-protected' : ''}`} key={item.id}><div><strong>{item.id}</strong><small>{item.sourceCount} {zh ? '个来源' : 'sources'} · {item.status === 'protected' ? (zh ? 'AMH 核心适配器，禁止导入' : 'AMH core adapter; import disabled') : item.status === 'variant' ? (zh ? 'Agent 目标适配变体，按目标查看' : 'target-agent variants') : item.status === 'conflict' ? (zh ? '内容冲突，请选择版本' : 'content conflict; choose a version') : item.status === 'duplicate' ? (zh ? '重复来源已合并' : 'identical sources merged') : (zh ? '待导入' : 'ready to import')}</small>{item.sources.length > 1 && <select value={sourceChoice[item.id] || item.sources[0].path} onChange={event => setSourceChoice(previous => ({ ...previous, [item.id]: event.target.value }))} disabled={item.status === 'protected'}>{item.sources.map(source => <option key={`${source.tool}:${source.path}`} value={source.path}>{source.tool} · {source.contentHash?.slice(-12) || source.path}</option>)}</select>}</div><div className="skill-row-state">{item.status === 'protected' ? <><span className="skill-warning"><ShieldAlert size={15} />{zh ? '受保护' : 'Protected'}</span><RelatedEntities entityType="skill" entityId={item.id} title={zh ? '查看关联' : 'View relations'} /></> : item.status === 'variant' ? <span className="skill-warning"><ShieldAlert size={15} />{zh ? '目标变体' : 'Target variants'}</span> : item.status === 'conflict' ? <span className="skill-warning"><ShieldAlert size={15} />{zh ? '需选择' : 'Choose version'}</span> : item.status === 'duplicate' ? <span className="skill-good"><CheckCircle2 size={15} />{zh ? '已去重' : 'Deduplicated'}</span> : null}{item.importable !== false && <Button size="sm" onClick={() => void importSkill(item)} disabled={busy}><Download size={14} />{item.status === 'conflict' ? (zh ? '导入所选版本' : 'Import selected') : (zh ? '导入到 AMH' : 'Import to AMH')}</Button>}</div></div>)}{!scan.length && <div className="skills-empty">{zh ? '未发现本机 Skill。' : 'No local Skills discovered.'}</div>}</div></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle><ShieldAlert size={18} />{zh ? '统一凭据' : 'Shared Credentials'}</CardTitle></CardHeader>
        <CardContent>
          <p className="skills-credential-note">{zh ? '凭据只配置一次，密钥不会返回到页面或 Skill 文件。' : 'Configure credentials once; secret values are never returned to the page or Skill files.'}</p>
          <CredentialForm language={language} onSaved={() => void load()} />
          <div className="skills-credential-list">{credentials.map(profile => <span key={profile.id} className="skill-good"><CheckCircle2 size={14} />{profile.id}{profile.envVar ? ` · ${profile.envVar}` : ''}</span>)}{!credentials.length && <span className="skills-empty">{zh ? '尚未配置凭据' : 'No credentials configured'}</span>}</div>
        </CardContent>
      </Card>
      {message && <p className="skills-error" role="alert">{message}</p>}
    </div>
  )
}
