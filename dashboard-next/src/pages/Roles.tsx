import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Bot, Crown, Pencil, Plus, RefreshCw, Shield, Trash2, Users, X } from 'lucide-react'
import { apiDelete, apiGet, apiPost, asArray, formatRelativeTime, numberOf, textOf, type AnyRecord } from '../lib/api'
import type { AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge, type BadgeVariant } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { EmptyState, ErrorState, LoadingState, PageShell } from '../components/shell'
import { AlertBanner, Card, PageHead, SummaryStrip } from '@/components/ds'

/* ----------------------------------------------------------------- types */

type RoleRecord = AnyRecord
type AgentRecord = AnyRecord
type TeamRecord = AnyRecord

type AgentsPayload = { agents?: AgentRecord[]; roles?: RoleRecord[] }
type TeamsPayload = { teams?: TeamRecord[]; agents?: Pick<AgentRecord, 'id' | 'name' | 'status'>[] }

/* ----------------------------------------------------------------- helpers */

function roleBadgeTone(roleId: string): BadgeVariant {
  switch (roleId) {
    case 'product-manager': return 'info'
    case 'programmer': return 'success'
    case 'ui-designer': return 'warning'
    case 'qa': return 'danger'
    case 'operations': return 'neutral'
    case 'data': return 'neutral'
    default: return 'neutral'
  }
}

function slugify(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/* ----------------------------------------------------------------- dialog: role form */

type RoleFormData = { id: string; name: string; description: string; permissions: string }

function RoleFormDialog({
  open, onOpenChange, initial, language, onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: RoleRecord | null
  language: 'zh' | 'en'
  onSubmit: (data: RoleFormData) => Promise<void>
}) {
  const isEdit = !!initial
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permissions, setPermissions] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (open) {
      setId(textOf(initial?.id, ''))
      setName(textOf(initial?.name, ''))
      setDescription(textOf(initial?.description, ''))
      setPermissions(asArray<string>(initial?.permissions).join(', '))
      setErr('')
    }
  }, [open, initial])

  const zh = language === 'zh'
  const handleSubmit = async () => {
    const finalId = (id || slugify(name)).trim()
    if (!finalId) { setErr(zh ? 'ID 不能为空' : 'ID is required'); return }
    setSaving(true); setErr('')
    try {
      await onSubmit({
        id: finalId,
        name: name.trim() || finalId,
        description: description.trim(),
        permissions: permissions.split(',').map(s => s.trim()).filter(Boolean),
      })
      onOpenChange(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? (zh ? '编辑角色' : 'Edit Role') : (zh ? '新建角色' : 'New Role')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{zh ? 'ID' : 'ID'}</label>
              <Input value={id} onChange={e => setId(e.target.value)} placeholder="product-manager" disabled={isEdit} />
              <span className="text-xs text-ink-4">{zh ? '唯一标识，创建后不可修改' : 'Unique identifier, cannot change after creation'}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{zh ? '名称' : 'Name'}</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={zh ? '产品经理' : 'Product Manager'} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{zh ? '描述' : 'Description'}</label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder={zh ? '角色职责说明' : 'Role description'} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{zh ? '权限（逗号分隔）' : 'Permissions (comma-separated)'}</label>
              <Input value={permissions} onChange={e => setPermissions(e.target.value)} placeholder="task.create, spec.write" />
            </div>
            {err ? <AlertBanner title={err} variant="danger" /> : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {zh ? '取消' : 'Cancel'}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------------------------------------------- dialog: team form */

type TeamFormData = { id: string; name: string; description: string }

function TeamFormDialog({
  open, onOpenChange, initial, language, onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: TeamRecord | null
  language: 'zh' | 'en'
  onSubmit: (data: TeamFormData) => Promise<void>
}) {
  const isEdit = !!initial
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (open) {
      setId(textOf(initial?.id, ''))
      setName(textOf(initial?.name, ''))
      setDescription(textOf(initial?.description, ''))
      setErr('')
    }
  }, [open, initial])

  const zh = language === 'zh'
  const handleSubmit = async () => {
    const finalId = (id || slugify(name)).trim()
    if (!finalId) { setErr(zh ? 'ID 不能为空' : 'ID is required'); return }
    setSaving(true); setErr('')
    try {
      await onSubmit({ id: finalId, name: name.trim() || finalId, description: description.trim() })
      onOpenChange(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? (zh ? '编辑团队' : 'Edit Team') : (zh ? '新建团队' : 'New Team')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">ID</label>
              <Input value={id} onChange={e => setId(e.target.value)} placeholder="core-team" disabled={isEdit} />
              <span className="text-xs text-ink-4">{zh ? '唯一标识，创建后不可修改' : 'Unique identifier, cannot change after creation'}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{zh ? '名称' : 'Name'}</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={zh ? '核心团队' : 'Core Team'} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{zh ? '描述' : 'Description'}</label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder={zh ? '团队说明' : 'Team description'} />
            </div>
            {err ? <AlertBanner title={err} variant="danger" /> : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {zh ? '取消' : 'Cancel'}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------------------------------------------- dialog: agent persona editor */

function AgentEditDialog({
  open, onOpenChange, agent, language, onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  agent: AgentRecord | null
  language: 'zh' | 'en'
  onSubmit: (data: { id: string; name: string; persona: string; bio: string }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [persona, setPersona] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (open && agent) {
      setName(textOf(agent.name, ''))
      setPersona(textOf(agent.persona, ''))
      setBio(textOf(agent.bio, ''))
      setErr('')
    }
  }, [open, agent])

  const zh = language === 'zh'
  const agentId = textOf(agent?.id, '')

  const handleSubmit = async () => {
    setSaving(true); setErr('')
    try {
      await onSubmit({ id: agentId, name: name.trim(), persona: persona.trim(), bio: bio.trim() })
      onOpenChange(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{zh ? '编辑智能体' : 'Edit Agent'} · {agentId}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{zh ? '名称' : 'Name'}</label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">
                {zh ? '提示词（Persona）' : 'Persona / System Prompt'}
              </label>
              <Textarea
                value={persona}
                onChange={e => setPersona(e.target.value)}
                rows={6}
                placeholder={zh ? '设定这个 agent 的角色定位、行为准则、语气风格……' : 'Define this agent\'s role, behavior, tone...'}
                className="font-mono text-sm"
              />
              <span className="text-xs text-ink-4">
                {zh ? 'agent 执行任务时读取的提示词' : 'System prompt the agent uses when executing tasks'}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{zh ? '简介（Bio）' : 'Bio'}</label>
              <Textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                rows={2}
                placeholder={zh ? '一句话介绍' : 'One-line description'}
              />
            </div>
            {err ? <AlertBanner title={err} variant="danger" /> : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {zh ? '取消' : 'Cancel'}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------------------------------------------- page */

export default function Roles() {
  const { language } = useOutletContext<AppOutletContext>()
  const zh = language === 'zh'

  const [agentsData, setAgentsData] = useState<AgentsPayload | null>(null)
  const [teamsData, setTeamsData] = useState<TeamsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // dialog state
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; edit: RoleRecord | null }>({ open: false, edit: null })
  const [teamDialog, setTeamDialog] = useState<{ open: boolean; edit: TeamRecord | null }>({ open: false, edit: null })
  const [agentDialog, setAgentDialog] = useState<{ open: boolean; agent: AgentRecord | null }>({ open: false, agent: null })
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'role' | 'team'; id: string; name: string } | null>(null)
  const [teamMemberMgr, setTeamMemberMgr] = useState<TeamRecord | null>(null)
  const [memberAgentId, setMemberAgentId] = useState('')
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [agents, teams] = await Promise.all([
        apiGet<AgentsPayload>('/api/agents'),
        apiGet<TeamsPayload>('/api/teams')
      ])
      setAgentsData(agents)
      setTeamsData(teams)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const roles = useMemo(() => asArray<RoleRecord>(agentsData?.roles), [agentsData])
  const agents = useMemo(() => asArray<AgentRecord>(agentsData?.agents), [agentsData])
  const teams = useMemo(() => asArray<TeamRecord>(teamsData?.teams), [teamsData])
  const teamAgentOptions = useMemo(() => asArray<AgentRecord>(teamsData?.agents), [teamsData])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // ── handlers
  const handleRoleSubmit = async (data: RoleFormData) => {
    await apiPost('/api/roles', data as AnyRecord)
    showToast(zh ? `角色「${data.name}」已保存` : `Role "${data.name}" saved`)
    await load()
  }
  const handleRoleDelete = async () => {
    if (!confirmDelete) return
    await apiDelete(`/api/roles?id=${encodeURIComponent(confirmDelete.id)}`, {})
    showToast(zh ? `角色「${confirmDelete.name}」已删除` : `Role "${confirmDelete.name}" deleted`)
    setConfirmDelete(null)
    await load()
  }
  const handleTeamSubmit = async (data: TeamFormData) => {
    await apiPost('/api/teams', data as AnyRecord)
    showToast(zh ? `团队「${data.name}」已保存` : `Team "${data.name}" saved`)
    await load()
  }
  const handleTeamDelete = async () => {
    if (!confirmDelete) return
    await apiDelete(`/api/teams?id=${encodeURIComponent(confirmDelete.id)}`, {})
    showToast(zh ? `团队「${confirmDelete.name}」已删除` : `Team "${confirmDelete.name}" deleted`)
    setConfirmDelete(null)
    await load()
  }
  const handleAgentSubmit = async (data: { id: string; name: string; persona: string; bio: string }) => {
    await apiPost('/api/agents', data as AnyRecord)
    showToast(zh ? `智能体「${data.id}」已更新` : `Agent "${data.id}" updated`)
    await load()
  }
  const handleAddMember = async (teamId: string, agentId: string) => {
    if (!agentId) return
    await apiPost('/api/teams/member', { teamId, agentId } as AnyRecord)
    showToast(zh ? `${agentId} 已加入团队` : `${agentId} joined team`)
    setMemberAgentId('')
    await load()
  }
  const handleRemoveMember = async (teamId: string, agentId: string) => {
    await apiDelete(`/api/teams/member?teamId=${encodeURIComponent(teamId)}&agentId=${encodeURIComponent(agentId)}`, {})
    showToast(zh ? `${agentId} 已移出团队` : `${agentId} removed from team`)
    await load()
  }

  const labels = zh
    ? {
        title: '团队与角色', subtitle: 'Agent 角色、团队归属、提示词与权限',
        refresh: '刷新', newRole: '新建角色', newTeam: '新建团队',
        roles: '角色', agents: '智能体', teams: '团队',
        permissions: '权限', roleBindings: '当前绑定', noBindings: '无动态绑定',
        noRoles: '暂无角色定义', noTeams: '暂无团队',
        noTeamsDesc: '点击「新建团队」创建第一个团队',
        bio: '简介', persona: '提示词', status: '状态',
        memberCount: '成员', agentCount: '智能体', roleCount: '角色', teamCount: '团队',
        retry: '重试', loading: '正在加载角色与团队数据',
        edit: '编辑', delete: '删除', manageMembers: '管理成员',
        addMember: '加入团队', removeMember: '移出', members: '团队成员',
        selectAgent: '选择 agent…', deleteConfirm: '确认删除', deleteWarn: '此操作不可撤销',
        cancel: '取消',
      }
    : {
        title: 'Teams & Roles', subtitle: 'Agent roles, teams, personas & permissions',
        refresh: 'Refresh', newRole: 'New Role', newTeam: 'New Team',
        roles: 'Roles', agents: 'Agents', teams: 'Teams',
        permissions: 'Permissions', roleBindings: 'Active bindings', noBindings: 'No dynamic bindings',
        noRoles: 'No roles defined yet', noTeams: 'No teams yet',
        noTeamsDesc: 'Click "New Team" to create your first team',
        bio: 'Bio', persona: 'Persona', status: 'Status',
        memberCount: 'Members', agentCount: 'Agents', roleCount: 'Roles', teamCount: 'Teams',
        retry: 'Retry', loading: 'Loading roles and teams data',
        edit: 'Edit', delete: 'Delete', manageMembers: 'Members',
        addMember: 'Join', removeMember: 'Remove', members: 'Team members',
        selectAgent: 'Select agent…', deleteConfirm: 'Confirm delete', deleteWarn: 'This cannot be undone',
        cancel: 'Cancel',
      }

  return (
    <PageShell contentClassName="flex flex-col gap-6">
      <PageHead
        title={labels.title}
        subtitle={labels.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              {labels.refresh}
            </Button>
          </div>
        }
      />

      {toast ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-line bg-surface px-4 py-2 text-sm text-ink shadow-lg">
          {toast}
        </div>
      ) : null}

      {error ? (
        <ErrorState variant="block" title={labels.retry} description={error}
          action={<Button variant="secondary" onClick={() => void load()}><RefreshCw className="h-4 w-4" />{labels.refresh}</Button>} />
      ) : loading && !agentsData ? (
        <LoadingState label={labels.loading} />
      ) : (
        <>
          <SummaryStrip
            items={[
              { label: labels.roleCount, value: roles.length, tone: 'neutral' },
              { label: labels.agentCount, value: agents.length, tone: 'neutral' },
              { label: labels.teamCount, value: teams.length, tone: teams.length ? 'success' : 'neutral' },
            ]}
            note={zh ? '实时数据 · 点击编辑按钮修改' : 'Live data · click edit to modify'}
          />

          {/* ── roles grid */}
          <Card title={labels.roles} count={roles.length} flushBody
            toolbar={
              <Button variant="secondary" size="sm" onClick={() => setRoleDialog({ open: true, edit: null })}>
                <Plus className="h-3.5 w-3.5" /> {labels.newRole}
              </Button>
            }
          >
            {roles.length ? (
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {roles.map((role, index) => {
                  const id = textOf(role.id, '')
                  const name = textOf(role.name, id)
                  const description = textOf(role.description, '')
                  const permissions = asArray<string>(role.permissions)
                  return (
                    <article key={id || index} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-ink-3" />
                          <Badge variant={roleBadgeTone(id)}>{name}</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setRoleDialog({ open: true, edit: role })}
                            className="rounded-md p-1 text-ink-4 hover:bg-surface-sunk hover:text-ink" title={labels.edit}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setConfirmDelete({ type: 'role', id, name })}
                            className="rounded-md p-1 text-ink-4 hover:bg-surface-sunk hover:text-danger" title={labels.delete}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {description ? <p className="text-sm text-ink-2">{description}</p> : null}
                      {permissions.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {permissions.map((perm, pi) => (
                            <span key={`${perm}:${pi}`} className="rounded-full border border-line bg-surface-sunk px-2 py-0.5 font-mono text-xs text-ink-3">{perm}</span>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            ) : (
              <EmptyState title={labels.noRoles} className="p-4" />
            )}
          </Card>

          {/* ── teams section */}
          <Card title={labels.teams} count={teams.length} flushBody
            toolbar={
              <Button variant="secondary" size="sm" onClick={() => setTeamDialog({ open: true, edit: null })}>
                <Plus className="h-3.5 w-3.5" /> {labels.newTeam}
              </Button>
            }
          >
            {teams.length ? (
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {teams.map((team, index) => {
                  const id = textOf(team.id, '')
                  const name = textOf(team.name, id)
                  const description = textOf(team.description, '')
                  const memberCount = numberOf(team.memberCount)
                  const memberIds = asArray<string>(team.memberIds)
                  return (
                    <article key={id || index} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-ink-3" />
                          <span className="truncate text-sm font-semibold text-ink">{name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setTeamMemberMgr(team)} className="rounded-md p-1 text-ink-4 hover:bg-surface-sunk hover:text-ink" title={labels.manageMembers}>
                            <Users className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setTeamDialog({ open: true, edit: team })} className="rounded-md p-1 text-ink-4 hover:bg-surface-sunk hover:text-ink" title={labels.edit}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setConfirmDelete({ type: 'team', id, name })} className="rounded-md p-1 text-ink-4 hover:bg-surface-sunk hover:text-danger" title={labels.delete}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {description ? <p className="text-sm text-ink-2">{description}</p> : null}
                      <div className="flex items-center gap-2 text-xs text-ink-3">
                        <Users className="h-3.5 w-3.5" />
                        {labels.memberCount}: {memberCount}
                      </div>
                      {memberIds.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {memberIds.map((mid, mi) => (
                            <Badge key={`${mid}:${mi}`} variant="neutral">{mid}</Badge>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            ) : (
              <EmptyState title={labels.noTeams} description={labels.noTeamsDesc} className="p-4" />
            )}
          </Card>

          {/* ── agents list */}
          <Card title={labels.agents} count={agents.length} flushBody>
            {agents.length ? (
              <div className="divide-y divide-line">
                {agents.map((agent, index) => {
                  const id = textOf(agent.id, '')
                  const name = textOf(agent.name, id)
                  const bio = textOf(agent.bio, '')
                  const persona = textOf(agent.persona, '')
                  const status = textOf(agent.status, 'idle')
                  const roleBindings = asArray<string>(agent.roleBindings)
                  const staticRoles = asArray<string>(agent.roles)
                  const allRoles = [...staticRoles, ...roleBindings]
                  return (
                    <div key={id || index} className="flex items-center gap-3 px-4 py-3">
                      <Bot className="h-4 w-4 shrink-0 text-ink-4" />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-ink">{name}</span>
                          <Badge variant={status === 'active' || status === 'busy' ? 'success' : 'neutral'}>{status}</Badge>
                        </div>
                        {bio ? <span className="truncate text-xs text-ink-3">{bio}</span> : null}
                        {persona ? <span className="truncate text-xs text-ink-4 font-mono">persona: {persona.slice(0, 60)}{persona.length > 60 ? '…' : ''}</span> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {allRoles.length ? (
                          allRoles.map((roleId, ri) => {
                            const role = roles.find(r => textOf(r.id, '') === roleId)
                            const roleName = role ? textOf(role.name, roleId) : roleId
                            return <Badge key={`${roleId}:${ri}`} variant={roleBadgeTone(roleId)}>{roleName}</Badge>
                          })
                        ) : (
                          <span className="text-xs text-ink-4">{labels.noBindings}</span>
                        )}
                      </div>
                      <button onClick={() => setAgentDialog({ open: true, agent })}
                        className="shrink-0 rounded-md p-1.5 text-ink-4 hover:bg-surface-sunk hover:text-ink" title={labels.edit}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <span className="hidden shrink-0 text-xs text-ink-4 lg:inline">
                        {formatRelativeTime(textOf(agent.updatedAt || agent.createdAt))}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState className="p-4" />
            )}
          </Card>
        </>
      )}

      {/* ── dialogs */}
      <RoleFormDialog open={roleDialog.open} onOpenChange={v => setRoleDialog({ ...roleDialog, open: v })}
        initial={roleDialog.edit} language={language} onSubmit={handleRoleSubmit} />
      <TeamFormDialog open={teamDialog.open} onOpenChange={v => setTeamDialog({ ...teamDialog, open: v })}
        initial={teamDialog.edit} language={language} onSubmit={handleTeamSubmit} />
      <AgentEditDialog open={agentDialog.open} onOpenChange={v => setAgentDialog({ ...agentDialog, open: v })}
        agent={agentDialog.agent} language={language} onSubmit={handleAgentSubmit} />

      {/* ── delete confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={v => { if (!v) setConfirmDelete(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{labels.deleteConfirm} · {confirmDelete?.name}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-ink-2">
              <span className="font-medium text-danger">⚠ {labels.deleteWarn}</span>
            </p>
            <p className="mt-2 text-sm text-ink-3">
              {zh ? `即将删除${confirmDelete?.type === 'role' ? '角色' : '团队'}「${confirmDelete?.name}」` : `Delete ${confirmDelete?.type} "${confirmDelete?.name}"`}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>{labels.cancel}</Button>
            <Button variant="danger" onClick={() => confirmDelete?.type === 'role' ? handleRoleDelete() : handleTeamDelete()}>
              {labels.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── team member manager */}
      <Dialog open={!!teamMemberMgr} onOpenChange={v => { if (!v) setTeamMemberMgr(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{labels.members} · {textOf(teamMemberMgr?.name, '')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-4">
              {/* add member */}
              <div className="flex items-center gap-2">
                <select
                  value={memberAgentId}
                  onChange={e => setMemberAgentId(e.target.value)}
                  className="flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                >
                  <option value="">{labels.selectAgent}</option>
                  {teamAgentOptions.map(a => {
                    const aid = textOf(a.id, '')
                    return <option key={aid} value={aid}>{textOf(a.name, aid)}</option>
                  })}
                </select>
                <Button size="sm" onClick={() => teamMemberMgr && handleAddMember(textOf(teamMemberMgr.id, ''), memberAgentId)} disabled={!memberAgentId}>
                  <Plus className="h-3.5 w-3.5" /> {labels.addMember}
                </Button>
              </div>
              {/* current members */}
              <div className="flex flex-col gap-2">
                {asArray<string>(teamMemberMgr?.memberIds).length ? (
                  asArray<string>(teamMemberMgr?.memberIds).map((mid, mi) => (
                    <div key={`${mid}:${mi}`} className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Bot className="h-3.5 w-3.5 text-ink-4" />
                        <span className="text-sm text-ink">{mid}</span>
                      </div>
                      <button onClick={() => teamMemberMgr && handleRemoveMember(textOf(teamMemberMgr.id, ''), mid)}
                        className="rounded-md p-1 text-ink-4 hover:bg-surface-sunk hover:text-danger" title={labels.removeMember}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <span className="text-sm text-ink-4">{zh ? '暂无成员' : 'No members'}</span>
                )}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setTeamMemberMgr(null); setMemberAgentId('') }}>{labels.cancel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
