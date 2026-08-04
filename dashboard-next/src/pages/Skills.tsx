import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { CheckCircle2, Download, RefreshCw, Search, ShieldAlert, Wrench } from 'lucide-react'
import { apiGet, apiPost, asArray, textOf } from '../lib/api'
import type { AppOutletContext } from '../lib/i18n'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { CredentialForm } from '../components/CredentialForm'
import './Skills.css'

type SkillPackage = { id: string; version: string; contentHash?: string; source?: { kind?: string; location?: string }; packagePath?: string; conflict?: boolean }
type SkillSnapshot = { packages?: SkillPackage[]; manifest?: { skills?: Record<string, { constraint?: string; enabled?: boolean }>; targets?: string[] }; selected?: SkillPackage[] }
type ScanItem = { id: string; tool: string; path: string; ownership: string; conflict?: boolean }
type CredentialProfile = { id: string; envVar?: string; configured?: boolean }

export default function Skills() {
  const { language } = useOutletContext<AppOutletContext>()
  const [snapshot, setSnapshot] = useState<SkillSnapshot>({})
  const [scan, setScan] = useState<ScanItem[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [credentials, setCredentials] = useState<CredentialProfile[]>([])
  const zh = language === 'zh'

  const load = async () => {
    setBusy(true)
    try {
      const [next, detected, credentialState] = await Promise.all([apiGet<SkillSnapshot>('/api/skills'), apiGet<{ skills?: ScanItem[] }>('/api/skills/scan'), apiGet<{ profiles?: CredentialProfile[] }>('/api/credentials')])
      setSnapshot(next)
      setScan(asArray<ScanItem>(detected.skills))
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
  const selected = new Set(asArray<SkillPackage>(snapshot.selected).map(item => `${item.id}@${item.version}`))
  const importedIds = new Set(asArray<SkillPackage>(snapshot.packages).map(item => item.id))

  const importSkill = async (item: ScanItem) => {
    setBusy(true)
    try {
      await apiPost('/api/skills/install', { path: item.path, project: '.' })
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
        <Button variant="outline" onClick={() => void load()} disabled={busy}><RefreshCw size={16} />{zh ? '刷新状态' : 'Refresh'}</Button>
      </header>

      <section className="skills-summary-grid">
        <Card><CardContent><span>{zh ? 'Registry Skill' : 'Registry Skills'}</span><strong>{packages.length}</strong></CardContent></Card>
        <Card><CardContent><span>{zh ? '当前项目已启用' : 'Enabled here'}</span><strong>{asArray(snapshot.selected).length}</strong></CardContent></Card>
        <Card><CardContent><span>{zh ? '本机发现' : 'Discovered locally'}</span><strong>{scan.length}</strong></CardContent></Card>
        <Card><CardContent><span>{zh ? '冲突' : 'Conflicts'}</span><strong>{packages.filter(item => item.conflict || scan.some(found => found.id === item.id && found.conflict)).length}</strong></CardContent></Card>
      </section>

      <Card>
        <CardHeader><CardTitle>{zh ? '统一 Skill Registry' : 'Canonical Skill Registry'}</CardTitle></CardHeader>
        <CardContent>
          <div className="skills-toolbar"><label><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={zh ? '搜索 Skill' : 'Search Skills'} /></label><span>{zh ? 'Agent 目录只保留受管入口，不再作为源文件' : 'Agent directories are projections, not sources of truth'}</span></div>
          <div className="skills-list">
            {packages.map(item => <div className="skill-row" key={`${item.id}@${item.version}`}><div><strong>{item.id}</strong><small>v{item.version} · {textOf(item.source?.kind, 'local')}</small></div><div className="skill-row-state">{item.conflict ? <span className="skill-warning"><ShieldAlert size={15} />{zh ? '冲突' : 'Conflict'}</span> : selected.has(`${item.id}@${item.version}`) ? <span className="skill-good"><CheckCircle2 size={15} />{zh ? '已启用' : 'Enabled'}</span> : <span>{zh ? '可用' : 'Available'}</span>}</div></div>)}
            {!packages.length && <div className="skills-empty">{zh ? '还没有导入 Skill。可从下方本机发现列表导入。' : 'No Skills imported yet. Import one from the local discovery list below.'}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle><Wrench size={18} />{zh ? '本机 Skill 发现' : 'Local Skill Discovery'}</CardTitle></CardHeader>
        <CardContent><div className="skills-list">{scan.filter(item => !importedIds.has(item.id)).slice(0, 50).map(item => <div className="skill-row" key={`${item.tool}:${item.path}`}><div><strong>{item.id}</strong><small>{item.tool} · {item.path}</small></div><Button size="sm" onClick={() => void importSkill(item)} disabled={busy}><Download size={14} />{zh ? '导入到 AMH' : 'Import to AMH'}</Button></div>)}{!scan.length && <div className="skills-empty">{zh ? '未发现本机 Skill。' : 'No local Skills discovered.'}</div>}</div></CardContent>
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
