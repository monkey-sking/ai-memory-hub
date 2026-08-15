import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Activity, Bell, GitPullRequest, Network, Radio, RefreshCw, Terminal } from 'lucide-react'
import { apiGet, asArray, asRecord, boolOf, numberOf, textOf } from '@/lib/api'
import type { AnyRecord } from '@/lib/api'
import type { AppLanguage, AppOutletContext } from '@/lib/i18n'
import { dashboardLabels } from '@/lib/dashboardCopy'
import { statusBadgeVariant } from '@/lib/statusBadge'
import type { BadgeVariant } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, FilterBar, LoadingState } from '@/components/shell'
import type { FilterOption } from '@/components/shell'
import { AlertBanner, Card, MetricCard, MetricGrid, PageHead, ToolCard } from '@/components/ds'
import type { Tone } from '@/components/ds'

/**
 * Runners route (execution adapters / dispatch channels), rewritten to the
 * proto-next "bones" composition: PageHead -> (AlertBanner on real problem /
 * empty) -> MetricGrid (5 KPIs derived from loaded data) -> Card(ToolCard grid)
 * -> Card(config detail table). All real data-fetching is preserved: it loads
 * `/api/execution-adapters` and renders whatever named adapters (github / ssh /
 * notifications / unknown) the payload actually contains. No numbers are
 * fabricated — every KPI is computed from the loaded adapter payload.
 *
 * ChartRow / EventStream are intentionally omitted: the adapter payload carries
 * no time-series or event-log data, so charting or streaming it would invent
 * data that does not exist.
 */

/* ------------------------------------------------------------------ model */

interface AdapterView {
  /** Stable key from the payload (`github` / `ssh` / `notifications` / …). */
  key: string
  /** Human-friendly label for that adapter. */
  label: string
  /** Status token consumed by `statusBadgeVariant`. */
  status: string
  /** Short status copy shown on the badge. */
  statusLabel: string
  /** One-line configuration summary. */
  configSummary: string
  /** A "recent run" style line — `-` when the adapter carries no runtime field. */
  lastRun: string
  /** Extra key/value detail rows for the card body. */
  rows: Array<{ label: string; value: string }>
  raw: AnyRecord
}

/* -------------------------------------------------------------- normaliser */

const ADAPTER_FRIENDLY: Record<string, { zh: string; en: string }> = {
  github: { zh: 'GitHub 集成', en: 'GitHub' },
  ssh: { zh: 'SSH 远程', en: 'SSH' },
  notifications: { zh: '通知', en: 'Notifications' }
}

const githubStatus = (gh: AnyRecord, t: (zh: string, en: string) => string): { status: string; statusLabel: string } => {
  if (boolOf(gh.mergeReady)) return { status: 'active', statusLabel: t('就绪', 'Ready') }
  if (textOf(gh.pullRequest)) return { status: 'pending', statusLabel: t('待合并', 'Awaiting merge') }
  if (textOf(gh.issue) || textOf(gh.branch)) return { status: 'neutral', statusLabel: t('已关联', 'Linked') }
  return { status: 'missing', statusLabel: t('未关联', 'Unlinked') }
}

const sshStatus = (ssh: AnyRecord, t: (zh: string, en: string) => string): { status: string; statusLabel: string } => {
  const reconnect = textOf(ssh.reconnectState, 'unknown')
  if (reconnect === 'connected') return { status: 'active', statusLabel: t('已连接', 'Connected') }
  if (reconnect === 'unknown') return { status: 'neutral', statusLabel: t('未知', 'Unknown') }
  return { status: 'warning', statusLabel: textOf(reconnect, t('异常', 'Abnormal')) }
}

/** Defensive: the payload shape is { adapters: { github, ssh, notifications } }.
 *  We render whatever named adapters exist, degrading gracefully on missing
 *  fields rather than throwing. New adapter keys fall back to a generic card. */
const toAdapterViews = (adapters: AnyRecord, language: AppLanguage): AdapterView[] => {
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en)
  const views: AdapterView[] = []

  if ('github' in adapters) {
    const gh = asRecord(adapters.github)
    const status = githubStatus(gh, t)
    const issue = textOf(gh.issue, '-')
    const pr = textOf(gh.pullRequest, '-')
    const branch = textOf(gh.branch, '-')
    const checks = textOf(gh.checks, '-')
    views.push({
      key: 'github',
      label: ADAPTER_FRIENDLY.github[language],
      status: status.status,
      statusLabel: status.statusLabel,
      configSummary: branch === '-' ? t('未绑定分支', 'No branch bound') : `${t('分支', 'Branch')} ${branch}`,
      lastRun: '-',
      rows: [
        { label: t('Issue', 'Issue'), value: issue },
        { label: t('Pull Request', 'Pull Request'), value: pr },
        { label: t('Checks', 'Checks'), value: checks },
        { label: t('合并就绪', 'Merge ready'), value: boolOf(gh.mergeReady) ? t('是', 'Yes') : t('否', 'No') }
      ],
      raw: gh
    })
  }

  if ('ssh' in adapters) {
    const ssh = asRecord(adapters.ssh)
    const status = sshStatus(ssh, t)
    const forwards = asArray<AnyRecord>(ssh.forwards)
    views.push({
      key: 'ssh',
      label: ADAPTER_FRIENDLY.ssh[language],
      status: status.status,
      statusLabel: status.statusLabel,
      configSummary: textOf(ssh.host) ? `${textOf(ssh.user, '-')}@${textOf(ssh.host)}` : t('未配置主机', 'No host configured'),
      lastRun: '-',
      rows: [
        { label: t('Host', 'Host'), value: textOf(ssh.host, '-') },
        { label: t('User', 'User'), value: textOf(ssh.user, '-') },
        { label: t('Path', 'Path'), value: textOf(ssh.path, '-') },
        { label: t('重连状态', 'Reconnect state'), value: textOf(ssh.reconnectState, 'unknown') },
        { label: t('端口转发', 'Port forwards'), value: `${forwards.length} ${t('条', 'items')}` }
      ],
      raw: ssh
    })
  }

  if ('notifications' in adapters) {
    const items = asArray<AnyRecord>(adapters.notifications)
    views.push({
      key: 'notifications',
      label: ADAPTER_FRIENDLY.notifications[language],
      status: 'info',
      statusLabel: t('已启用', 'Enabled'),
      configSummary: `${t('队列', 'Queue')} ${numberOf(items.length)} ${t('条', 'items')}`,
      lastRun: '-',
      rows: [{ label: t('队列条目', 'Queue items'), value: `${numberOf(items.length)} ${t('条', 'items')}` }],
      raw: { notifications: items }
    })
  }

  // Any unexpected adapter keys still render as a neutral card instead of
  // disappearing — keeps the panel honest about the real payload.
  for (const [key, value] of Object.entries(adapters)) {
    if (key === 'github' || key === 'ssh' || key === 'notifications') continue
    const record = asRecord(value)
    views.push({
      key,
      label: ADAPTER_FRIENDLY[key]?.[language] ?? key,
      status: 'neutral',
      statusLabel: t('未知', 'Unknown'),
      configSummary: '-',
      lastRun: '-',
      rows: [{ label: t('原始字段数', 'Raw field count'), value: `${Object.keys(record).length}` }],
      raw: record
    })
  }

  return views
}

/* ------------------------------------------------------------------ status labels */

const STATUS_FILTER_LABELS: Record<AppLanguage, Record<string, string>> = {
  zh: { active: '就绪', pending: '待合并', warning: '异常', missing: '未关联', info: '通知', neutral: '未知' },
  en: { active: 'Ready', pending: 'Awaiting merge', warning: 'Abnormal', missing: 'Unlinked', info: 'Notification', neutral: 'Unknown' }
}

const STATUS_ORDER = ['active', 'pending', 'warning', 'missing', 'info', 'neutral'] as const

const statusFilterLabel = (status: string, language: AppLanguage): string =>
  STATUS_FILTER_LABELS[language][status] ?? status

/** ToolCard tone follows the adapter status token (all colour via tokens). */
const toneOfStatus = (status: string): Tone => {
  switch (status) {
    case 'active':
      return 'success'
    case 'pending':
      return 'warning'
    case 'warning':
      return 'danger'
    case 'info':
      return 'info'
    case 'missing':
      return 'warning'
    default:
      return 'neutral'
  }
}

/* ------------------------------------------------------------------ icons */

const ADAPTER_ICON: Record<string, React.ReactNode> = {
  github: <GitPullRequest className="h-4 w-4" aria-hidden="true" />,
  ssh: <Terminal className="h-4 w-4" aria-hidden="true" />,
  notifications: <Bell className="h-4 w-4" aria-hidden="true" />
}

const fallbackIcon = <Radio className="h-4 w-4" aria-hidden="true" />

const formatNumber = (value: unknown): string => numberOf(value).toLocaleString()

/* --------------------------------------------------------------- component */

export default function Runners() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const [adapters, setAdapters] = useState<AnyRecord>({})
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setBusy(true)
    setError('')
    try {
      const payload = await apiGet<AnyRecord>('/api/execution-adapters')
      setAdapters(asRecord(payload.adapters))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => {
    void load()
  }, [])

  const views = useMemo<AdapterView[]>(() => toAdapterViews(adapters, language), [adapters, language])

  const github = asRecord(adapters.github)
  const ssh = asRecord(adapters.ssh)
  const sshForwards = asArray<AnyRecord>(ssh.forwards)
  const notifications = asArray<AnyRecord>(adapters.notifications)

  const filteredViews = useMemo(
    () =>
      views.filter(view => {
        if (statusFilter !== 'all' && view.status !== statusFilter) return false
        const needle = query.trim().toLowerCase()
        if (!needle) return true
        return [view.key, view.label, view.statusLabel, view.configSummary]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      }),
    [views, query, statusFilter]
  )

  // Filter options derived from the real statuses present in the payload.
  const statusOptions = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>()
    for (const view of views) counts.set(view.status, (counts.get(view.status) ?? 0) + 1)
    return STATUS_ORDER.filter(status => counts.has(status)).map(status => ({
      value: status,
      label: statusFilterLabel(status, language),
      count: counts.get(status) ?? 0
    }))
  }, [views, language])

  // KPIs — all computed from the loaded adapter payload, never fabricated.
  const channels = views.length
  const readyCount = useMemo(() => views.filter(view => view.status === 'active').length, [views])
  const abnormalCount = useMemo(() => views.filter(view => view.status === 'warning').length, [views])

  const isEmpty = views.length === 0 && !busy && !error

  // AlertBanner surfaces real problems only: abnormal channels first, then the
  // genuinely-empty state once a successful load returns no adapters.
  const alert =
    !busy && !error
      ? abnormalCount > 0
        ? {
            tone: 'warning' as const,
            title: t(`${abnormalCount} 个通道连接异常`, `${abnormalCount} channels are abnormal`),
            description: t(
              '存在处于异常状态的执行通道（如 SSH 重连失败），请检查其配置。',
              'Some execution channels are in an abnormal state (e.g. SSH reconnect failed); check their configuration.'
            )
          }
        : views.length === 0
          ? {
              tone: 'info' as const,
              title: t('暂无执行适配器', 'No execution adapters'),
              description: t(
                '当前任务 / 工作流未关联任何 GitHub、SSH 或通知适配器。关联后将在此展示配置与状态。',
                'No task or workflow is currently linked to a GitHub, SSH, or notification adapter. Linked adapters will show their configuration and status here.'
              )
            }
          : null
      : null

  return (
    <>
      <PageHead
        title={t('调度器', 'Runners')}
        subtitle={t(
          'AMH 执行适配器（调度通道）的配置与状态：GitHub 集成、SSH 远程与通知队列。',
          'Configuration and status of AMH execution adapters (dispatch channels): GitHub integration, SSH remote, and notification queue.'
        )}
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={busy}>
            <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
            {copy.refresh}
          </Button>
        }
      />

      {error && views.length === 0 ? (
        <ErrorState
          variant="block"
          title={t('加载调度器失败', 'Failed to load runners')}
          description={error}
          action={
            <Button onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
              {t('重试', 'Retry')}
            </Button>
          }
        />
      ) : (
        <>
          {alert ? <AlertBanner tone={alert.tone} title={alert.title} description={alert.description} /> : null}

          <MetricGrid>
            <MetricCard
              label={t('调度通道', 'Channels')}
              value={formatNumber(channels)}
              icon={Radio}
              note={t('执行适配器', 'Execution adapters')}
            />
            <MetricCard
              label={t('就绪通道', 'Ready channels')}
              value={formatNumber(readyCount)}
              icon={Activity}
              note={t('状态为就绪 / 已连接', 'Ready / connected')}
            />
            <MetricCard
              label={t('GitHub 合并就绪', 'GitHub merge ready')}
              value={boolOf(github.mergeReady) ? copy.ready : '—'}
              icon={GitPullRequest}
              note={textOf(github.branch) ? `${t('分支', 'Branch')} ${textOf(github.branch)}` : t('未绑定分支', 'No branch bound')}
            />
            <MetricCard
              label={t('SSH 端口转发', 'SSH port forwards')}
              value={formatNumber(sshForwards.length)}
              icon={Network}
              note={textOf(ssh.host) ? `${textOf(ssh.user, '-')}@${textOf(ssh.host)}` : t('未配置主机', 'No host configured')}
            />
            <MetricCard
              label={t('通知队列', 'Notification queue')}
              value={formatNumber(notifications.length)}
              icon={Bell}
              note={t('待处理通知', 'Pending notifications')}
            />
          </MetricGrid>

          <Card
            title={t('执行适配器', 'Execution adapters')}
            count={filteredViews.length}
            flushBody
            toolbar={
              <FilterBar
                search={{
                  id: 'runners-search',
                  value: query,
                  onChange: setQuery,
                  placeholder: t('搜索适配器', 'Search adapters'),
                  label: t('搜索适配器', 'Search adapters')
                }}
                filters={[
                  {
                    type: 'single',
                    id: 'runners-status',
                    label: copy.status,
                    value: statusFilter === 'all' ? '' : statusFilter,
                    onChange: (value: string) => setStatusFilter(value || 'all'),
                    allLabel: copy.allOption,
                    options: statusOptions
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
            {busy && views.length === 0 ? (
              <LoadingState variant="rows" label={t('加载调度器…', 'Loading runners…')} className="p-4" />
            ) : isEmpty ? (
              <EmptyState
                icon={<Radio className="h-5 w-5" />}
                title={t('暂无执行适配器', 'No execution adapters')}
                description={t(
                  '当前任务 / 工作流未关联任何 GitHub、SSH 或通知适配器。关联后将在此展示配置与状态。',
                  'No task or workflow is currently linked to a GitHub, SSH, or notification adapter. Linked adapters will show their configuration and status here.'
                )}
              />
            ) : filteredViews.length ? (
              <div className="grid grid-cols-1 gap-3 px-[var(--card-pad)] py-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredViews.map(view => (
                  <ToolCard
                    key={view.key}
                    name={view.key}
                    displayName={view.label}
                    tone={toneOfStatus(view.status)}
                    badgeText={view.statusLabel}
                    lastRun={view.lastRun !== '-' ? view.lastRun : undefined}
                    enabled={view.status === 'active'}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={t('无匹配适配器', 'No matching adapters')}
                description={t(
                  '当前筛选条件下没有适配器。尝试调整状态筛选或搜索关键词。',
                  'No adapters match the current filters. Try adjusting the status filter or search term.'
                )}
              />
            )}
          </Card>

          {filteredViews.length ? (
            <Card title={t('适配器配置', 'Adapter configuration')} count={filteredViews.length} flushBody>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">
                        {t('适配器', 'Adapter')}
                      </th>
                      <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">{copy.status}</th>
                      <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">
                        {t('配置', 'Configuration')}
                      </th>
                      <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">
                        {t('明细', 'Details')}
                      </th>
                      <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">{copy.lastRun}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredViews.map(view => (
                      <tr key={view.key} className="border-b border-line last:border-b-0 hover:bg-surface-sunk">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-sunk text-ink-2">
                              {ADAPTER_ICON[view.key] ?? fallbackIcon}
                            </span>
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate font-medium text-ink">{view.label}</span>
                              <span className="truncate font-mono text-xs text-ink-3">{view.key}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusBadgeVariant(view.status) as BadgeVariant} dot>
                            {view.statusLabel}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-ink-2">
                          <span className="block max-w-[220px] truncate">{view.configSummary}</span>
                        </td>
                        <td className="px-4 py-3">
                          <dl className="flex max-w-[320px] flex-col gap-0.5">
                            {view.rows.map(row => (
                              <div key={row.label} className="flex items-center justify-between gap-3">
                                <dt className="shrink-0 text-xs text-ink-3">{row.label}</dt>
                                <dd className="min-w-0 truncate text-right text-xs text-ink-2">{row.value}</dd>
                              </div>
                            ))}
                          </dl>
                        </td>
                        <td className="px-4 py-3 text-ink-2">{view.lastRun}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </>
      )}
    </>
  )
}
