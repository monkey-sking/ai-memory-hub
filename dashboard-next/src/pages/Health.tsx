import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Activity, AlertTriangle, Copy, Database, HardDrive, RefreshCw } from 'lucide-react'
import { apiGet, asArray, asRecord, formatDate, numberOf, textOf } from '../lib/api'
import { dashboardLabels, dashboardSubtitles, dashboardTitles } from '../lib/dashboardCopy'
import type { AppOutletContext } from '../lib/i18n'
import type { BadgeVariant } from '../components/ui/badge'
import { cn } from '@/lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { EmptyState, ErrorState, LoadingState } from '../components/shell'
import {
  AlertBanner,
  Card,
  ChartRow,
  MetricCard,
  MetricGrid,
  PageHead,
  SplitRow,
  type DonutTone
} from '@/components/ds'

type HealthReport = {
  ok?: boolean
  analysis?: unknown
  stdout?: string
  report?: string
}

type HealthIssue = {
  level?: string
  title?: string
  detail?: string
}

type StorageItem = {
  label?: string
  display?: string
  bytes?: number
}

type GrowthPoint = {
  date?: string
  count?: number
}

/** Map any status/level string onto a Plan A badge variant. */
function toVariant(value: unknown): BadgeVariant {
  const token = String(value ?? '')
    .toLowerCase()
    .trim()
  if (['ok', 'healthy', 'green', 'pass', 'success', 'up', 'normal', '正常'].includes(token)) return 'success'
  if (['degraded', 'warn', 'warning', 'yellow', 'partial', '降级'].includes(token)) return 'warning'
  if (['critical', 'error', 'danger', 'red', 'down', 'fail', 'failed', '异常', '严重'].includes(token)) return 'danger'
  if (['info', 'debug', 'note'].includes(token)) return 'info'
  return 'neutral'
}

const STATUS_LABELS: Record<BadgeVariant, { zh: string; en: string }> = {
  success: { zh: '正常', en: 'Healthy' },
  warning: { zh: '降级', en: 'Degraded' },
  danger: { zh: '异常', en: 'Critical' },
  info: { zh: '信息', en: 'Info' },
  neutral: { zh: '未知', en: 'Unknown' },
  accent: { zh: '关注', en: 'Notice' },
  default: { zh: '未知', en: 'Unknown' },
  secondary: { zh: '未知', en: 'Unknown' },
  destructive: { zh: '未知', en: 'Unknown' },
  outline: { zh: '未知', en: 'Unknown' }
}

// Storage donut/detail — one segment per real storage item, keyed by its real
// `label` field (there is no `type` field). Tones cycle the semantic palette.
const STORAGE_TONES: DonutTone[] = ['accent', 'info', 'success', 'warning', 'neutral']
const TONE_CSS: Record<DonutTone, string> = {
  accent: 'var(--color-accent-base)',
  info: 'var(--color-info)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  neutral: 'var(--color-ink-4)',
  danger: 'var(--color-danger)'
}

function shortDate(value: unknown): string {
  const date = new Date(textOf(value))
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function Health() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const [report, setReport] = useState<HealthReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [alertDismissed, setAlertDismissed] = useState(false)

  const load = async () => {
    setBusy(true)
    setError('')
    setAlertDismissed(false)
    try {
      const next = await apiGet<HealthReport>('/api/health')
      setReport(next)
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

  const analysis = asRecord(report?.analysis)
  const issues = asArray<HealthIssue>(analysis.issues)
  const storage = asRecord(analysis.storage)
  const storageItems = asArray<StorageItem>(storage.items)
  const growthTrend = asArray<GrowthPoint>(analysis.growthTrend)

  const storageSegments = storageItems
    .map((item, index) => ({
      label: textOf(item.label, copy.noData),
      display: textOf(item.display),
      value: numberOf(item.bytes),
      tone: STORAGE_TONES[index % STORAGE_TONES.length]
    }))
    .filter((segment) => segment.value > 0)

  const score = numberOf(analysis.score)
  const totalRecords = numberOf(analysis.totalRecords)
  const duplicateRecords = numberOf(analysis.duplicateRecords)
  const corruptedRecordsCount = numberOf(analysis.corruptedRecordsCount)

  const rawStatus = textOf(analysis.status)
  const derivedStatus: BadgeVariant =
    score >= 90 ? 'success' : score >= 70 ? 'warning' : 'danger'
  const statusVariant: BadgeVariant = rawStatus ? toVariant(rawStatus) : derivedStatus
  // Corruption is always actionable, even when the headline score is high.
  const effectiveStatus: BadgeVariant = corruptedRecordsCount > 0 ? 'danger' : statusVariant
  const statusLabel = STATUS_LABELS[effectiveStatus][language]

  const duplicateRate = totalRecords > 0 ? (duplicateRecords / totalRecords) * 100 : 0
  const growthPoints = growthTrend.map((point) => numberOf(point.count))

  // Alert banner fires only on a real problem state, surfacing derived facts.
  const problem = effectiveStatus !== 'success'
  const alert =
    !alertDismissed && problem
      ? {
          tone: (effectiveStatus === 'danger' ? 'error' : 'warning') as 'error' | 'warning',
          title: statusLabel,
          description:
            language === 'zh'
              ? `健康分 ${score} · ${issues.length} 个健康问题` +
                (corruptedRecordsCount > 0 ? ` · 检测到 ${corruptedRecordsCount} 条损坏记录` : '')
              : `Health score ${score} · ${issues.length} issue(s)` +
                (corruptedRecordsCount > 0 ? ` · ${corruptedRecordsCount} corrupted records` : '')
        }
      : null

  return (
    <>
      <PageHead
        title={dashboardTitles[language]['health']}
        subtitle={dashboardSubtitles[language]['health']}
        actions={
          <>
            {analysis.generatedAt ? (
              <span className="text-xs text-ink-3">
                {copy.generatedAt} · {formatDate(textOf(analysis.generatedAt))}
              </span>
            ) : null}
            <Badge variant={effectiveStatus} dot>
              {statusLabel}
            </Badge>
            <Button variant="secondary" onClick={() => void load()} disabled={busy}>
              <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
              {busy ? copy.refreshing : copy.refreshHealth}
            </Button>
          </>
        }
      />

      {error ? (
        <ErrorState
          variant="block"
          title={copy.error}
          description={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
              {copy.refreshHealth}
            </Button>
          }
        />
      ) : !report ? (
        busy ? (
          <LoadingState variant="skeleton" label={copy.refreshing} rows={4} />
        ) : (
          <EmptyState title={copy.noData} />
        )
      ) : (
        <>
          {alert ? (
            <AlertBanner
              tone={alert.tone}
              title={alert.title}
              description={alert.description}
              onDismiss={() => setAlertDismissed(true)}
            />
          ) : null}

          <MetricGrid>
            <MetricCard
              label={copy.healthScore}
              value={score ? score : '-'}
              icon={Activity}
              note={statusLabel}
            />
            <MetricCard
              label={copy.totalRecords}
              value={totalRecords ? totalRecords.toLocaleString() : '-'}
              icon={Database}
              spark={growthPoints.length > 1 ? growthPoints : undefined}
            />
            <MetricCard
              label={copy.duplicateRecords}
              value={duplicateRecords ? duplicateRecords.toLocaleString() : '0'}
              icon={Copy}
              note={language === 'zh' ? `重复率 ${duplicateRate.toFixed(1)}%` : `Rate ${duplicateRate.toFixed(1)}%`}
            />
            <MetricCard
              label={copy.corruptedRecords}
              value={corruptedRecordsCount ? corruptedRecordsCount.toLocaleString() : '0'}
              icon={AlertTriangle}
              note={corruptedRecordsCount > 0 ? STATUS_LABELS.danger[language] : undefined}
            />
            <MetricCard
              label={t('存储占用', 'Storage used')}
              value={textOf(storage.totalDisplay, '-')}
              icon={HardDrive}
            />
          </MetricGrid>

          {growthTrend.length >= 2 ? (
            <ChartRow
              title={t('增长趋势', 'Growth trend')}
              subtitle={language === 'zh' ? '记录数随时间变化' : 'Record count over time'}
              series={[{ label: copy.totalRecords, points: growthPoints }]}
              xLabels={growthTrend.map((point) => shortDate(point.date))}
              donutTitle={t('存储占用', 'Storage used')}
              donutCenter={textOf(storage.totalDisplay, '0 B')}
              donutCenterLabel={language === 'zh' ? '总占用' : 'Total'}
              segments={storageSegments.map((segment) => ({
                label: segment.label,
                value: segment.value,
                tone: segment.tone
              }))}
            />
          ) : (
            <Card title={t('增长趋势', 'Growth trend')}>
              <EmptyState size="sm" title={copy.noData} />
            </Card>
          )}

          <SplitRow
            stream={
              <Card title={copy.healthIssues} count={issues.length || undefined} flushBody>
                {busy && !issues.length ? (
                  <LoadingState variant="rows" label={copy.refreshing} className="p-4" />
                ) : issues.length ? (
                  <ul className="flex flex-col">
                    {issues.map((issue, index) => {
                      const variant = toVariant(issue.level)
                      return (
                        <li
                          key={`${textOf(issue.title)}-${index}`}
                          className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <Badge variant={variant} dot>
                                {textOf(issue.level, STATUS_LABELS[variant][language])}
                              </Badge>
                              <span className="truncate text-sm font-medium text-ink">
                                {textOf(issue.title, copy.noData)}
                              </span>
                            </div>
                            {issue.detail ? (
                              <p className="text-xs leading-relaxed text-ink-3">{textOf(issue.detail)}</p>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <EmptyState size="sm" title={copy.noHealthIssues} />
                )}
              </Card>
            }
            side={
              <Card title={t('存储明细', 'Storage breakdown')} count={storageItems.length || undefined} flushBody>
                {busy && !storageItems.length && !storage.totalDisplay ? (
                  <LoadingState variant="rows" label={copy.refreshing} className="p-4" />
                ) : storageSegments.length ? (
                  <ul className="flex flex-col gap-1 p-4">
                    {storageSegments.map((segment, index) => {
                      const total = storageSegments.reduce((sum, next) => sum + next.value, 0) || 1
                      const pct = ((segment.value / total) * 100).toFixed(1)
                      return (
                        <li
                          key={`${segment.label}-${index}`}
                          className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: TONE_CSS[segment.tone] }}
                              aria-hidden="true"
                            />
                            <span className="truncate text-sm text-ink-2">{segment.label}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-ink-4">{pct}%</span>
                            <span className="font-mono text-sm tabular-nums text-ink">{segment.display || '0 B'}</span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <EmptyState size="sm" title={copy.noData} />
                )}
              </Card>
            }
          />
        </>
      )}
    </>
  )
}
