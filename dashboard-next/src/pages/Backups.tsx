import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Database, HardDrive, Layers, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { apiGet, apiPost, asArray, asRecord, formatDate, numberOf, textOf, type AnyRecord } from '../lib/api'
import { dashboardLabels, dashboardSubtitles, dashboardTitles } from '../lib/dashboardCopy'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../components/ui/dialog'
import { EmptyState, ErrorState, LoadingState } from '../components/shell'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import {
  AlertBanner,
  Card,
  ChartRow,
  MetricCard,
  MetricGrid,
  PageHead
} from '@/components/ds'

/**
 * Local backups route (section `backups`), rewritten to the proto-next
 * "bones" composition: page-head -> (alert if issues) -> KPI row ->
 * trend/distribution chart -> panel table. All real data-fetching and
 * actions from the prior version are preserved: load `/api/backups`, and
 * create / restore-preview / delete backups. GitHub data-backup config is
 * intentionally out of scope for this route (matches the source API surface).
 */

type KindFilter = 'all' | 'full' | 'incremental'
type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const KIND_LABELS: Record<AppLanguage, Record<string, string>> = {
  zh: { full: '全量', incremental: '增量' },
  en: { full: 'Full', incremental: 'Incremental' }
}

const STATUS_LABELS: Record<AppLanguage, Record<string, string>> = {
  zh: { keep: '保留', prune: '可清理', success: '成功', failed: '失败', error: '错误', warning: '警告', info: '信息' },
  en: { keep: 'Retained', prune: 'Prune', success: 'Success', failed: 'Failed', error: 'Error', warning: 'Warning', info: 'Info' }
}

function formatNumber(value: unknown): string {
  return numberOf(value).toLocaleString()
}

function deriveKind(item: AnyRecord): string {
  return textOf(item.kind || item.type).toLowerCase()
}

function kindLabel(kind: string, language: AppLanguage): string {
  const normalized = kind.toLowerCase()
  if (KIND_LABELS[language][normalized]) return KIND_LABELS[language][normalized]
  return kind || dashboardLabels[language].manual
}

function statusToken(item: AnyRecord): string {
  return textOf(item.status, textOf(item.retention, 'keep'))
}

function statusTone(token: string): Tone {
  const t = token.toLowerCase()
  if (t === 'keep' || t === 'success') return 'success'
  if (t === 'prune' || t === 'warning') return 'warning'
  if (t === 'failed' || t === 'error') return 'danger'
  if (t === 'info') return 'info'
  return 'neutral'
}

function statusLabel(token: string, language: AppLanguage): string {
  const normalized = token.toLowerCase()
  return STATUS_LABELS[language][normalized] ?? token
}

function shortDate(value: unknown): string {
  const date = new Date(textOf(value))
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function sizeOf(item: AnyRecord): number {
  return numberOf(item.bytes) || numberOf(item.size)
}

export default function Backups() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]

  const [backups, setBackups] = useState<AnyRecord>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [reason, setReason] = useState('dashboard-manual')

  const [restoreName, setRestoreName] = useState('')
  const [restorePlan, setRestorePlan] = useState<AnyRecord | null>(null)

  const [deleteName, setDeleteName] = useState('')

  const [busy, setBusy] = useState('')
  const [dialogError, setDialogError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await apiGet<AnyRecord>('/api/backups')
      setBackups(next)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const backupList = asArray<AnyRecord>(backups.backups)
  const retention = asRecord(backups.retention)

  const total = numberOf(backups.count) || backupList.length
  const storageUsed = textOf(backups.totalDisplay, '-')
  const retained = numberOf(retention.keep)
  const pruneCandidates = numberOf(retention.prune)

  const visibleList = useMemo(() => {
    if (kindFilter === 'all') return backupList
    return backupList.filter(item => deriveKind(item) === kindFilter)
  }, [backupList, kindFilter])

  const fullCount = useMemo(
    () => backupList.filter(item => deriveKind(item) === 'full').length,
    [backupList]
  )
  const incrementalCount = useMemo(
    () => backupList.filter(item => deriveKind(item) === 'incremental').length,
    [backupList]
  )
  const failedCount = useMemo(
    () => backupList.filter(item => {
      const t = statusToken(item)
      return t === 'failed' || t === 'error'
    }).length,
    [backupList]
  )

  // Trend + distribution derived entirely from the loaded real backup list.
  const trend = useMemo(() => {
    const sorted = [...backupList]
      .map(item => ({ item, t: new Date(textOf(item.createdAt)).getTime() }))
      .filter(x => !Number.isNaN(x.t))
      .sort((a, b) => a.t - b.t)
      .map(x => x.item)
    const points = sorted.map(sizeOf)
    const labels = sorted.map(item => shortDate(item.createdAt))
    let peakAt: number | undefined
    let peakLabel: string | undefined
    if (points.length >= 2) {
      let maxIndex = 0
      points.forEach((value, index) => {
        if (value > points[maxIndex]) maxIndex = index
      })
      peakAt = maxIndex
      peakLabel = textOf(sorted[maxIndex].display, formatNumber(points[maxIndex]))
    }
    return { points, labels, peakAt, peakLabel }
  }, [backupList])

  const createBackup = async () => {
    const nextReason = reason.trim() || 'dashboard-manual'
    setBusy('create')
    setDialogError('')
    try {
      const result = await apiPost<AnyRecord>('/api/backups/create', { reason: nextReason })
      setBackups(asRecord(result.backups))
      setReason(nextReason)
      setCreateOpen(false)
      await load()
    } catch (nextError) {
      setDialogError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const openRestore = async (name: string) => {
    if (!name) return
    setBusy(`restore:${name}`)
    setDialogError('')
    setRestorePlan(null)
    try {
      const result = await apiPost<AnyRecord>('/api/backups/restore', { name, apply: false })
      setRestorePlan(asRecord(result.plan))
      setRestoreName(name)
    } catch (nextError) {
      setDialogError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const confirmDelete = async () => {
    if (!deleteName || busy === 'delete') return
    setBusy('delete')
    setDialogError('')
    try {
      await apiPost<AnyRecord>('/api/backups/delete', { names: [deleteName], apply: true })
      setDeleteName('')
      await load()
    } catch (nextError) {
      setDialogError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const restoreSummary = asRecord(restorePlan?.summary)

  // Alert banner surfaces real issues only (failed sets or prune candidates).
  const alert = !loading && !error
    ? failedCount > 0
      ? {
          tone: 'error' as const,
          title: language === 'zh' ? `${failedCount} 个备份集恢复失败` : `${failedCount} backup sets failed`,
          description:
            language === 'zh'
              ? '请检查最近的备份任务，必要时重新创建备份。'
              : 'Inspect recent backup runs and recreate if needed.'
        }
      : pruneCandidates > 0
        ? {
            tone: 'warning' as const,
            title:
              language === 'zh'
                ? `${pruneCandidates} 个备份集可清理`
                : `${pruneCandidates} backup sets can be pruned`,
            description:
              language === 'zh'
                ? '这些备份集已超出保留策略，建议复核后清理。'
                : 'These sets exceed the retention policy; review before pruning.'
          }
        : null
    : null

  return (
    <>
      <PageHead
        title={dashboardTitles[language]['backups']}
        subtitle={dashboardSubtitles[language]['backups']}
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {copy.refresh}
          </Button>
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
              {copy.refresh}
            </Button>
          }
        />
      ) : (
        <>
          {alert ? (
            <AlertBanner tone={alert.tone} title={alert.title} description={alert.description} />
          ) : null}

          <MetricGrid>
            <MetricCard
              label={copy.backupSets}
              value={formatNumber(total)}
              icon={HardDrive}
            />
            <MetricCard
              label={copy.storageUsed}
              value={storageUsed}
              icon={Database}
              spark={trend.points.length > 1 ? trend.points : undefined}
            />
            <MetricCard label={copy.retained} value={formatNumber(retained)} />
            <MetricCard label={copy.pruneCandidates} value={formatNumber(pruneCandidates)} icon={Trash2} />
            <MetricCard
              label={kindLabel('incremental', language)}
              value={formatNumber(incrementalCount)}
              icon={Layers}
            />
          </MetricGrid>

          {backupList.length >= 2 ? (
            <ChartRow
              title={copy.backupStorage}
              subtitle={language === 'zh' ? '各备份集大小（按时间）' : 'Backup size over time'}
              series={[{ label: copy.backupStorage, points: trend.points }]}
              xLabels={trend.labels.length ? trend.labels : undefined}
              peakAt={trend.peakAt}
              peakLabel={trend.peakLabel}
              donutTitle={
                language === 'zh' ? '备份类型分布' : 'Backup type distribution'
              }
              donutCenter={total}
              donutCenterLabel={copy.backupSets}
              segments={[
                { label: kindLabel('full', language), value: fullCount, tone: 'neutral' },
                { label: kindLabel('incremental', language), value: incrementalCount, tone: 'info' }
              ]}
            />
          ) : null}

          <Card
            title={copy.backupSets}
            count={visibleList.length}
            flushBody
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => { setDialogError(''); setCreateOpen(true) }} disabled={loading}>
                  <Plus className="h-4 w-4" />
                  {copy.createBackup}
                </Button>
                <div
                  role="tablist"
                  aria-label={copy.kind}
                  className="inline-flex rounded-md border border-line bg-surface-sunk p-0.5"
                >
                  {(['all', 'full', 'incremental'] as const).map(option => (
                    <button
                      key={option}
                      type="button"
                      role="tab"
                      aria-selected={kindFilter === option}
                      onClick={() => setKindFilter(option)}
                      className={cn(
                        'h-7 rounded px-3 text-xs font-medium transition-colors',
                        kindFilter === option ? 'bg-surface text-ink' : 'text-ink-3 hover:text-ink'
                      )}
                    >
                      {option === 'all' ? copy.allOption : kindLabel(option, language)}
                    </button>
                  ))}
                </div>
              </div>
            }
          >
            {loading && !backupList.length ? (
              <LoadingState variant="rows" label={copy.refreshing} className="p-4" />
            ) : visibleList.length ? (
              <Table bordered={false} containerClassName="rounded-none" maxHeight="460px">
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.id}</TableHead>
                    <TableHead>{copy.kind}</TableHead>
                    <TableHead numeric>{copy.bytes}</TableHead>
                    <TableHead>{copy.created}</TableHead>
                    <TableHead>{copy.status}</TableHead>
                    <TableHead className="text-right">{copy.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleList.map(item => {
                    const name = textOf(item.name)
                    const token = statusToken(item)
                    return (
                      <TableRow key={name || `backup-${textOf(item.createdAt)}`}>
                        <TableCell>
                          <span className="font-mono text-ink">{name || '-'}</span>
                        </TableCell>
                        <TableCell className="text-ink-2">{kindLabel(deriveKind(item), language)}</TableCell>
                        <TableCell numeric>
                          <span className="font-mono">{textOf(item.display, '-')}</span>
                        </TableCell>
                        <TableCell className="text-ink-2">{formatDate(textOf(item.createdAt), 'compact')}</TableCell>
                        <TableCell>
                          <Badge variant={statusTone(token)} dot>
                            {statusLabel(token, language)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy === `restore:${name}`}
                              onClick={() => void openRestore(name)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              {copy.previewRestore}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy === 'delete'}
                              onClick={() => { setDialogError(''); setDeleteName(name) }}
                              aria-label={`${copy.deleteSelected} ${name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-danger" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={<HardDrive className="h-5 w-5" />}
                title={copy.noData}
                action={
                  <Button size="sm" onClick={() => { setDialogError(''); setCreateOpen(true) }}>
                    <Plus className="h-4 w-4" />
                    {copy.createBackup}
                  </Button>
                }
              />
            )}
          </Card>
        </>
      )}

      {/* Create backup dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={open => {
          if (!open) {
            setCreateOpen(false)
            setDialogError('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.createBackup}</DialogTitle>
            <DialogDescription>{copy.createBackupHint}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-2">{copy.backupReason}</span>
              <input
                value={reason}
                onChange={event => setReason(event.target.value)}
                className="h-9 rounded-md border border-line bg-surface-sunk px-3 text-sm text-ink outline-none focus:border-accent-base"
              />
            </label>
            {dialogError ? <ErrorState variant="inline" title={dialogError} /> : null}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                {copy.cancel}
              </Button>
            </DialogClose>
            <Button size="sm" disabled={busy === 'create'} onClick={() => void createBackup()}>
              {busy === 'create' ? copy.running : copy.createBackup}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore preview dialog */}
      <Dialog
        open={Boolean(restoreName)}
        onOpenChange={open => {
          if (!open) {
            setRestoreName('')
            setRestorePlan(null)
            setDialogError('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.previewRestore}</DialogTitle>
            <DialogDescription className="font-mono">{restoreName}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            {restorePlan ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <TinyStat label={copy.changed} value={formatNumber(restoreSummary.changed)} />
                <TinyStat label={copy.different} value={formatNumber(restoreSummary.different)} />
                <TinyStat label={copy.missingCurrent} value={formatNumber(restoreSummary.missingCurrent)} />
                <TinyStat label={copy.unchanged} value={formatNumber(restoreSummary.unchanged)} />
                <TinyStat label={copy.bytes} value={textOf(restoreSummary.display, '-')} />
                <TinyStat label={copy.id} value={textOf(restorePlan.name, '-')} />
              </div>
            ) : dialogError ? (
              <ErrorState variant="inline" title={dialogError} />
            ) : (
              <LoadingState variant="spinner" label={copy.refreshing} />
            )}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                {copy.close}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={Boolean(deleteName)}
        onOpenChange={open => {
          if (!open) {
            setDeleteName('')
            setDialogError('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.deleteConfirmTitle}</DialogTitle>
            <DialogDescription>{copy.deleteConfirmBody.replace('{n}', '1')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <p className="truncate font-mono text-sm text-ink">{deleteName}</p>
            {dialogError ? <ErrorState variant="inline" title={dialogError} /> : null}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                {copy.cancel}
              </Button>
            </DialogClose>
            <Button variant="danger" size="sm" disabled={busy === 'delete'} onClick={() => void confirmDelete()}>
              {busy === 'delete' ? copy.running : copy.deleteSelected}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function TinyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-sunk px-3 py-2">
      <span className="text-xs text-ink-3">{label}</span>
      <span className="font-mono text-sm text-ink">{value}</span>
    </div>
  )
}
