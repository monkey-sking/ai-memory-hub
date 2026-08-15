import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Archive,
  Database,
  History,
  Layers,
  RefreshCw,
  RotateCcw,
  Save
} from 'lucide-react'
import { apiGet, apiPost, asArray, asRecord, formatDate, formatRelativeTime, numberOf, textOf } from '../lib/api'
import type { AnyRecord } from '../lib/api'
import { dashboardLabels, dashboardSubtitles, dashboardTitles } from '../lib/dashboardCopy'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '../components/ui/badge'
import type { BadgeVariant } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input, fieldBaseStyles } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { EmptyState, ErrorState, LoadingState } from '../components/shell'
import {
  AlertBanner,
  Card,
  MetricCard,
  MetricGrid,
  PageHead
} from '@/components/ds'

type SettingsForm = {
  snapshotLimit: string
  coreLimit: string
  recentLimit: string
  lockStaleMs: string
  autoRefresh: boolean
  refreshIntervalMs: string
  language: string
  /** Persisted verbatim: the shell owns theming, so this route never offers a toggle. */
  theme: string
  notifications: boolean
  shortcutsEnabled: boolean
  daily: string
  weekly: string
  preSync: string
  pruneAfterSync: boolean
}

type BusyKind = '' | 'load' | 'save'

/** `GET /api/settings` omits booleans it never wrote, so absent means "use the default". */
function boolSetting(value: unknown, fallback: boolean): boolean {
  return value === undefined || value === null ? fallback : Boolean(value)
}

function createSettingsForm(settings: AnyRecord): SettingsForm {
  const sync = asRecord(settings.sync)
  const dashboard = asRecord(settings.dashboard)
  const shortcuts = asRecord(dashboard.shortcuts)
  const backupPolicy = asRecord(settings.backupPolicy)
  return {
    snapshotLimit: String(numberOf(sync.snapshotLimit, 120)),
    coreLimit: String(numberOf(sync.coreLimit, 80)),
    recentLimit: String(numberOf(sync.recentLimit, 40)),
    lockStaleMs: String(numberOf(sync.lockStaleMs, 30000)),
    autoRefresh: boolSetting(dashboard.autoRefresh, true),
    refreshIntervalMs: String(numberOf(dashboard.refreshIntervalMs, 5000)),
    language: ['zh', 'en'].includes(textOf(dashboard.language)) ? textOf(dashboard.language) : 'zh',
    theme: ['dark', 'light'].includes(textOf(dashboard.theme)) ? textOf(dashboard.theme) : 'dark',
    notifications: boolSetting(dashboard.notifications, true),
    shortcutsEnabled: boolSetting(shortcuts.enabled, true),
    daily: String(numberOf(backupPolicy.daily, 14)),
    weekly: String(numberOf(backupPolicy.weekly, 8)),
    preSync: String(numberOf(backupPolicy.preSync, 24)),
    pruneAfterSync: boolSetting(backupPolicy.pruneAfterSync, true)
  }
}

function parsePositiveInteger(value: string, label: string, invalidMessage: string): number {
  const next = Number(value)
  if (!Number.isInteger(next) || next <= 0) {
    throw new Error(`${label}: ${invalidMessage}`)
  }
  return next
}

/**
 * The server rebuilds `dashboard.shortcuts` from whatever it receives, so the
 * current bindings are echoed back untouched and only `enabled` is patched.
 */
function buildSettingsPayload(
  form: SettingsForm,
  settings: AnyRecord,
  labels: { refreshInterval: string; snapshotLimit: string; coreLimit: string; recentLimit: string; lockStaleMs: string; daily: string; weekly: string; preSync: string; invalid: string }
): AnyRecord {
  const refreshIntervalMs = parsePositiveInteger(form.refreshIntervalMs, labels.refreshInterval, labels.invalid)
  if (refreshIntervalMs < 1000 || refreshIntervalMs > 60000) {
    throw new Error(`${labels.refreshInterval}: 1000-60000`)
  }
  const shortcuts = asRecord(asRecord(settings.dashboard).shortcuts)
  return {
    sync: {
      snapshotLimit: parsePositiveInteger(form.snapshotLimit, labels.snapshotLimit, labels.invalid),
      coreLimit: parsePositiveInteger(form.coreLimit, labels.coreLimit, labels.invalid),
      recentLimit: parsePositiveInteger(form.recentLimit, labels.recentLimit, labels.invalid),
      lockStaleMs: parsePositiveInteger(form.lockStaleMs, labels.lockStaleMs, labels.invalid)
    },
    dashboard: {
      autoRefresh: form.autoRefresh,
      refreshIntervalMs,
      language: form.language,
      theme: form.theme,
      notifications: form.notifications,
      shortcuts: { ...shortcuts, enabled: form.shortcutsEnabled }
    },
    backupPolicy: {
      daily: parsePositiveInteger(form.daily, labels.daily, labels.invalid),
      weekly: parsePositiveInteger(form.weekly, labels.weekly, labels.invalid),
      preSync: parsePositiveInteger(form.preSync, labels.preSync, labels.invalid),
      pruneAfterSync: form.pruneAfterSync
    }
  }
}

function formatCount(value: unknown): string {
  return numberOf(value).toLocaleString()
}

const settingsGridClass = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
const selectClass = cn(fieldBaseStyles, 'h-9 w-full px-3 py-0')

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-line bg-surface-sunk px-3 py-2">
      <span className="truncate text-xs font-medium uppercase tracking-wide text-ink-3">{label}</span>
      <span className="truncate text-sm text-ink" title={value}>{value}</span>
    </div>
  )
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange
}: {
  id: string
  label: string
  value: string
  min?: number
  max?: number
  step?: number
  disabled: boolean
  onChange: (next: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
      />
    </div>
  )
}

function ToggleField({
  id,
  label,
  checked,
  disabled,
  onChange
}: {
  id: string
  label: string
  checked: boolean
  disabled: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-w-0 items-center gap-3 rounded-md border border-line bg-surface-sunk px-3 py-2"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 rounded-sm border border-line-strong accent-[var(--color-accent-base)]"
      />
      <span className="truncate text-sm text-ink-2">{label}</span>
    </label>
  )
}

function DecisionBadge({ decision }: { decision: string }) {
  const variant: BadgeVariant =
    decision === 'allow' ? 'success' :
    decision === 'deny' ? 'danger' :
    decision === 'ask' ? 'warning' : 'neutral'
  const label =
    decision === 'allow' ? '允许' :
    decision === 'deny' ? '拒绝' :
    decision === 'ask' ? '询问' : decision
  return <Badge variant={variant} dot>{label}</Badge>
}

function PolicyRuleRow({ rule }: { rule: AnyRecord }) {
  const operation = textOf(rule.operation, '-')
  const decision = textOf(rule.decision, 'allow')
  const scope = textOf(rule.scope, 'all')
  const actor = textOf(rule.actor, '*')
  const project = textOf(rule.project, '*')
  const reason = textOf(rule.reason)
  const createdAt = textOf(rule.createdAt)
  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium text-ink">{operation}</span>
        <DecisionBadge decision={decision} />
        <span className="rounded-full bg-surface-sunk px-2 py-0.5 text-xs text-ink-3">scope: {scope}</span>
      </div>
      {reason ? <p className="text-sm text-ink-2">{reason}</p> : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        <span>actor: {actor}</span>
        <span>project: {project}</span>
        {createdAt ? <span>{formatDate(createdAt, 'short')}</span> : null}
      </div>
    </div>
  )
}

/**
 * Reads `GET /api/policy` which returns the seeded permission matrix:
 *   { ok, count, rules[], operations[], decisions[], scopes[] }
 * `rules[]` are `policy.rule` events — defensive reads, never assume a field.
 */
function PolicyPanel({ language }: { language: AppLanguage }) {
  const [data, setData] = useState<AnyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await apiGet<AnyRecord>('/api/policy')
      setData(next)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [load])

  const rules = asArray<AnyRecord>(data?.rules)
  const count = numberOf(data?.count, rules.length)
  const retryLabel = t('重试', 'Retry')

  return (
    <Card
      title={t('策略', 'Policy')}
      count={loading ? undefined : count}
      toolbar={
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      }
    >
      {loading ? (
        <LoadingState variant="skeleton" label={t('加载策略中…', 'Loading policy…')} rows={4} />
      ) : error ? (
        <ErrorState
          variant="inline"
          title={t('策略加载失败', 'Failed to load policy')}
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              {retryLabel}
            </Button>
          }
        />
      ) : rules.length === 0 ? (
        <EmptyState
          title={t('暂无策略规则', 'No policy rules')}
          description={t('后端尚未写入任何策略规则（policy.rule 事件）。', 'The backend has not written any policy rules (policy.rule events) yet.')}
        />
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {rules.map((rule, index) => (
            <PolicyRuleRow key={textOf(rule.id, `rule-${index}`)} rule={rule} />
          ))}
        </div>
      )}
    </Card>
  )
}

function UnreadRow({ item, language }: { item: AnyRecord; language: AppLanguage }) {
  const kind = textOf(item.kind, 'radio')
  const title = textOf(item.title, '-')
  const text = textOf(item.text)
  const ts = textOf(item.ts)
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en)
  const kindLabel = kind === 'agent' ? t('Agent', 'Agent') : t('Radio', 'Radio')
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <Badge variant={kind === 'agent' ? 'info' : 'accent'} className="mt-0.5 shrink-0">{kindLabel}</Badge>
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-ink">{title}</span>
          {ts ? <span className="shrink-0 text-xs text-ink-3">{formatRelativeTime(ts, language === 'zh' ? 'zh-CN' : 'en')}</span> : null}
        </div>
        {text ? (
          <p className="truncate text-sm text-ink-2" title={text}>{text}</p>
        ) : null}
      </div>
    </div>
  )
}

function ReviewRow({ item, language }: { item: AnyRecord; language: AppLanguage }) {
  const title = textOf(item.title, '-')
  const status = textOf(item.status, 'requested')
  const project = textOf(item.project)
  const requestedAt = textOf(item.requestedAt)
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en)
  const variant: BadgeVariant = status === 'requested' ? 'warning' : 'neutral'
  const statusLabel = status === 'requested' ? t('待审', 'In review') : status
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{title}</span>
          <Badge variant={variant}>{statusLabel}</Badge>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
          {project ? <span>{t('项目', 'Project')}: {project}</span> : null}
          {requestedAt ? <span>{t('申请于', 'Requested')} {formatDate(requestedAt, 'short')}</span> : null}
        </div>
      </div>
    </div>
  )
}

/**
 * Reads `GET /api/collaboration` which returns:
 *   { unread[], unreadCount, reviews[] }
 * — `unread[]` (buildUnreadItems) and `reviews[]` (buildReviewQueue).
 */
function CollaborationPanel({ language }: { language: AppLanguage }) {
  const [data, setData] = useState<AnyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await apiGet<AnyRecord>('/api/collaboration')
      setData(next)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [load])

  const unread = asArray<AnyRecord>(data?.unread)
  const reviews = asArray<AnyRecord>(data?.reviews)
  const unreadCount = numberOf(data?.unreadCount, unread.length)
  const retryLabel = t('重试', 'Retry')

  return (
    <Card
      title={t('协作', 'Collaboration')}
      count={loading ? undefined : unreadCount + reviews.length}
      toolbar={
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      }
    >
      {loading ? (
        <LoadingState variant="rows" label={t('加载协作状态中…', 'Loading collaboration…')} rows={3} />
      ) : error ? (
        <ErrorState
          variant="inline"
          title={t('协作状态加载失败', 'Failed to load collaboration')}
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              {retryLabel}
            </Button>
          }
        />
      ) : unread.length === 0 && reviews.length === 0 ? (
        <EmptyState
          title={t('暂无协作活动', 'No collaboration activity')}
          description={t('未读消息与待审队列均为空。', 'Unread messages and review queue are both empty.')}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-ink">{t('待处理', 'Pending')} · {unreadCount}</h3>
            {unread.length === 0 ? (
              <p className="text-sm text-ink-3">{t('没有待处理消息或会话。', 'No pending messages or sessions.')}</p>
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {unread.map((item, index) => (
                  <UnreadRow key={textOf(item.id, `unread-${index}`)} item={item} language={language} />
                ))}
              </div>
            )}
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-ink">{t('待审队列', 'Review queue')} · {reviews.length}</h3>
            {reviews.length === 0 ? (
              <p className="text-sm text-ink-3">{t('没有待审任务或工作流。', 'No pending tasks or workflows.')}</p>
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {reviews.map((item, index) => (
                  <ReviewRow key={textOf(item.id, `review-${index}`)} item={item} language={language} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Card>
  )
}

export default function Settings() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const [settings, setSettings] = useState<AnyRecord>({})
  const [form, setForm] = useState<SettingsForm>(() => createSettingsForm({}))
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<BusyKind>('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const payloadLabels = {
    refreshInterval: copy.refreshInterval,
    snapshotLimit: copy.snapshotLimit,
    coreLimit: copy.coreLimit,
    recentLimit: copy.recentLimit,
    lockStaleMs: copy.lockStaleMs,
    daily: copy.daily,
    weekly: copy.weekly,
    preSync: copy.preSync,
    invalid: copy.invalidSettingsValue
  }

  const load = async () => {
    setBusy('load')
    setError('')
    setSuccess('')
    try {
      const next = await apiGet<AnyRecord>('/api/settings')
      setSettings(next)
      setForm(createSettingsForm(next))
      setLoaded(true)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [])

  const saveSettings = async () => {
    setBusy('save')
    setError('')
    setSuccess('')
    try {
      const result = await apiPost<AnyRecord>('/api/settings', buildSettingsPayload(form, settings, payloadLabels))
      const nextSettings = asRecord(result.settings)
      if (Object.keys(nextSettings).length) {
        setSettings(nextSettings)
        setForm(createSettingsForm(nextSettings))
      }
      setSuccess(copy.settingsSaved)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const updateForm = <K extends keyof SettingsForm>(field: K, value: SettingsForm[K]) => {
    setForm(current => ({ ...current, [field]: value }))
    setSuccess('')
  }

  const dashboard = asRecord(settings.dashboard)
  const sync = asRecord(settings.sync)
  const backupPolicy = asRecord(settings.backupPolicy)
  const hasSettings = Object.keys(settings).length > 0
  const disabled = busy !== ''
  const retryLabel = language === 'zh' ? '重试' : 'Retry'
  const dangerZoneTitle = language === 'zh' ? '危险区' : 'Danger zone'
  const restoreDefaultsLabel = language === 'zh' ? '恢复默认值' : 'Restore defaults'
  const restoreDefaultsNote = language === 'zh'
    ? '只重置下方表单，点击「保存设置」后才会写入本地 config.json。'
    : 'Resets the form below only — nothing is written until you save.'

  if (!loaded) {
    return (
      <>
        <PageHead
          title={dashboardTitles[language].settings}
          subtitle={dashboardSubtitles[language].settings}
          actions={
            <Button variant="secondary" onClick={() => void load()} disabled={disabled}>
              <RefreshCw className={cn('h-4 w-4', busy === 'load' && 'animate-spin')} />
              {copy.refreshSettings}
            </Button>
          }
        />
        {error ? (
          <ErrorState
            title={copy.connectionError}
            description={error}
            action={
              <Button variant="secondary" onClick={() => void load()} disabled={disabled}>
                <RefreshCw className={cn('h-4 w-4', busy === 'load' && 'animate-spin')} />
                {retryLabel}
              </Button>
            }
          />
        ) : (
          <Card title={copy.settingsPanel}>
            <LoadingState variant="skeleton" label={copy.refreshing} rows={4} />
          </Card>
        )}
      </>
    )
  }

  return (
    <>
      <PageHead
        title={dashboardTitles[language].settings}
        subtitle={dashboardSubtitles[language].settings}
        actions={
          <>
            <Button variant="secondary" onClick={() => void load()} disabled={disabled}>
              <RefreshCw className={cn('h-4 w-4', busy === 'load' && 'animate-spin')} />
              {copy.refreshSettings}
            </Button>
            <Button onClick={() => void saveSettings()} disabled={disabled || !hasSettings}>
              <Save className="h-4 w-4" />
              {busy === 'save' ? copy.running : copy.saveSettings}
            </Button>
          </>
        }
      />

      {error ? (
        <AlertBanner
          tone="error"
          title={copy.error}
          description={error}
          onDismiss={() => setError('')}
        />
      ) : null}
      {success ? (
        <AlertBanner
          tone="success"
          title={success}
          onDismiss={() => setSuccess('')}
        />
      ) : null}

      {hasSettings ? (
        <>
          <MetricGrid>
            <MetricCard
              label={copy.snapshotLimit}
              value={formatCount(sync.snapshotLimit)}
              icon={Layers}
            />
            <MetricCard
              label={copy.coreLimit}
              value={formatCount(sync.coreLimit)}
              icon={Database}
            />
            <MetricCard
              label={copy.recentLimit}
              value={formatCount(sync.recentLimit)}
              icon={History}
            />
            <MetricCard
              label={copy.refreshInterval}
              value={formatCount(dashboard.refreshIntervalMs)}
              unit="ms"
              icon={RefreshCw}
            />
            <MetricCard
              label={copy.daily}
              value={formatCount(backupPolicy.daily)}
              icon={Archive}
            />
          </MetricGrid>

          <Card
            title={copy.settingsPanel}
            toolbar={<Badge variant="neutral">{form.theme === 'light' ? copy.lightMode : copy.darkMode}</Badge>}
          >
            <div className={settingsGridClass}>
              <PropertyRow label={copy.memoryDir} value={textOf(settings.memoryDir, '-')} />
              <PropertyRow label={copy.autoRefresh} value={boolSetting(dashboard.autoRefresh, true) ? copy.yes : copy.no} />
              <PropertyRow label={copy.notifications} value={boolSetting(dashboard.notifications, true) ? copy.yes : copy.no} />
              <PropertyRow label={copy.refreshInterval} value={`${formatCount(dashboard.refreshIntervalMs)} ms`} />
              <PropertyRow label={copy.snapshotLimit} value={formatCount(sync.snapshotLimit)} />
              <PropertyRow
                label={copy.backupPolicy}
                value={`${copy.daily} ${formatCount(backupPolicy.daily)} / ${copy.weekly} ${formatCount(backupPolicy.weekly)}`}
              />
              <PropertyRow label={copy.pruneAfterSync} value={boolSetting(backupPolicy.pruneAfterSync, false) ? copy.yes : copy.no} />
              <PropertyRow label={copy.shortcuts} value={boolSetting(asRecord(dashboard.shortcuts).enabled, true) ? copy.yes : copy.no} />
              <PropertyRow label={copy.languageSetting} value={textOf(dashboard.language, '-')} />
            </div>
          </Card>

          <Card title={copy.settingsDashboardSection}>
            <div className="flex flex-col gap-4">
              <div className={settingsGridClass}>
                <NumberField
                  id="settings-refresh-interval"
                  label={`${copy.refreshInterval} (ms)`}
                  value={form.refreshIntervalMs}
                  min={1000}
                  max={60000}
                  step={1000}
                  disabled={disabled}
                  onChange={next => updateForm('refreshIntervalMs', next)}
                />
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="settings-language">{copy.languageSetting}</Label>
                  <select
                    id="settings-language"
                    className={selectClass}
                    value={form.language}
                    disabled={disabled}
                    onChange={event => updateForm('language', event.target.value)}
                  >
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
              <div className={settingsGridClass}>
                <ToggleField
                  id="settings-auto-refresh"
                  label={copy.autoRefresh}
                  checked={form.autoRefresh}
                  disabled={disabled}
                  onChange={next => updateForm('autoRefresh', next)}
                />
                <ToggleField
                  id="settings-notifications"
                  label={copy.notifications}
                  checked={form.notifications}
                  disabled={disabled}
                  onChange={next => updateForm('notifications', next)}
                />
                <ToggleField
                  id="settings-shortcuts"
                  label={copy.shortcuts}
                  checked={form.shortcutsEnabled}
                  disabled={disabled}
                  onChange={next => updateForm('shortcutsEnabled', next)}
                />
              </div>
            </div>
          </Card>

          <Card title={copy.settingsSyncSection}>
            <div className={settingsGridClass}>
              <NumberField
                id="settings-snapshot-limit"
                label={copy.snapshotLimit}
                value={form.snapshotLimit}
                min={1}
                disabled={disabled}
                onChange={next => updateForm('snapshotLimit', next)}
              />
              <NumberField
                id="settings-core-limit"
                label={copy.coreLimit}
                value={form.coreLimit}
                min={1}
                disabled={disabled}
                onChange={next => updateForm('coreLimit', next)}
              />
              <NumberField
                id="settings-recent-limit"
                label={copy.recentLimit}
                value={form.recentLimit}
                min={1}
                disabled={disabled}
                onChange={next => updateForm('recentLimit', next)}
              />
              <NumberField
                id="settings-lock-stale"
                label={`${copy.lockStaleMs} (ms)`}
                value={form.lockStaleMs}
                min={1}
                disabled={disabled}
                onChange={next => updateForm('lockStaleMs', next)}
              />
            </div>
          </Card>

          <Card title={copy.settingsBackupSection}>
            <div className="flex flex-col gap-4">
              <div className={settingsGridClass}>
                <NumberField
                  id="settings-backup-daily"
                  label={copy.daily}
                  value={form.daily}
                  min={1}
                  disabled={disabled}
                  onChange={next => updateForm('daily', next)}
                />
                <NumberField
                  id="settings-backup-weekly"
                  label={copy.weekly}
                  value={form.weekly}
                  min={1}
                  disabled={disabled}
                  onChange={next => updateForm('weekly', next)}
                />
                <NumberField
                  id="settings-backup-presync"
                  label={copy.preSync}
                  value={form.preSync}
                  min={1}
                  disabled={disabled}
                  onChange={next => updateForm('preSync', next)}
                />
              </div>
              <ToggleField
                id="settings-prune-after-sync"
                label={copy.pruneAfterSync}
                checked={form.pruneAfterSync}
                disabled={disabled}
                onChange={next => updateForm('pruneAfterSync', next)}
              />
            </div>
          </Card>

          <Card title={dangerZoneTitle}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-xs text-ink-3">{restoreDefaultsNote}</p>
              <Button
                variant="danger"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  setForm(createSettingsForm({}))
                  setSuccess('')
                }}
              >
                <RotateCcw className="h-4 w-4" />
                {restoreDefaultsLabel}
              </Button>
            </div>
          </Card>
        </>
      ) : (
        <Card title={copy.settingsPanel}>
          <EmptyState
            title={copy.noData}
            description={copy.settingsPanel}
            action={
              <Button variant="secondary" onClick={() => void load()} disabled={disabled}>
                <RefreshCw className="h-4 w-4" />
                {copy.refresh}
              </Button>
            }
          />
        </Card>
      )}

      <PolicyPanel language={language} />
      <CollaborationPanel language={language} />
    </>
  )
}
