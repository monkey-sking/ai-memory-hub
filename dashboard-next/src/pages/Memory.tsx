import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertTriangle, FileText, Folder, Layers, RefreshCw, Tags } from 'lucide-react'
import { apiGet, asArray, asRecord, formatDate, formatRelativeTime, numberOf, textOf } from '../lib/api'
import { dashboardLabels, dashboardSubtitles, dashboardTitles } from '../lib/dashboardCopy'
import type { AnyRecord } from '../lib/api'
import type { AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDetailList,
  SheetHeader,
  SheetRawBlock,
  SheetTitle
} from '../components/shell'
import type { FilterControl } from '../components/shell'
import {
  AlertBanner,
  Card,
  ChartRow,
  MetricCard,
  MetricGrid,
  PageHead
} from '@/components/ds'

type MemoryRecord = AnyRecord

const PAGE_LIMIT = 200

/* ----------------------------------------------------------- field accessors
   The `/api/memory` collection returns a `records` array. Each record carries
   real fields we map defensively so a missing field degrades to a placeholder
   instead of throwing. Namespace/status are read from the record when present
   (falling back to `project` / `metadata`); we never fabricate values. */
function recordId(record: MemoryRecord): string {
  return textOf(record.localEventId ?? record.id, '-')
}
function recordKind(record: MemoryRecord): string {
  const metadata = asRecord(record.metadata)
  return textOf(record.kind ?? metadata.kind, '-')
}
function recordNamespace(record: MemoryRecord): string {
  const metadata = asRecord(record.metadata)
  return textOf(record.namespace ?? record.project ?? metadata.project, '-')
}
function recordStatus(record: MemoryRecord): string {
  const metadata = asRecord(record.metadata)
  return textOf(record.status ?? record.syncStatus ?? metadata.status, '')
}
function recordTime(record: MemoryRecord): string {
  return textOf(record.ts ?? record.indexedAt ?? record.updatedAt ?? record.updated ?? record.createdAt, '')
}
function recordSource(record: MemoryRecord): string {
  const metadata = asRecord(record.metadata)
  return textOf(record.source ?? metadata.source, '-')
}

type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

/* Maps a real status string to a Plan A token variant. Unknown/empty stays
   neutral — we display whatever the endpoint returned, never an invented label. */
function statusVariant(status: string): StatusVariant {
  const value = status.toLowerCase()
  if (value === 'synced' || value === 'ok' || value === 'okay') return 'success'
  if (value === 'pending' || value === 'queued') return 'warning'
  if (value === 'conflict' || value === 'error' || value === 'failed') return 'danger'
  if (value === 'stale' || value === 'outdated' || value === 'syncing' || value === 'in_progress') return 'info'
  return 'neutral'
}

const STATUS_LABELS: Record<StatusVariant, { zh: string; en: string }> = {
  success: { zh: '已同步', en: 'Synced' },
  info: { zh: '同步中', en: 'Syncing' },
  warning: { zh: '待同步', en: 'Pending' },
  danger: { zh: '异常', en: 'Error' },
  neutral: { zh: '未知', en: 'Unknown' }
}

type SortKey = 'updated' | 'id' | 'kind'

export default function Memory() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const locale = language === 'zh' ? 'zh-CN' : 'en'
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const [items, setItems] = useState<MemoryRecord[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [initialBusy, setInitialBusy] = useState(true)
  const [error, setError] = useState('')

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [namespaceFilter, setNamespaceFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<MemoryRecord | null>(null)

  const load = async (append = false) => {
    setBusy(true)
    if (!append) setInitialBusy(true)
    try {
      const url = append
        ? `/api/memory?offset=${items.length}&limit=${PAGE_LIMIT}`
        : `/api/memory?offset=0&limit=${PAGE_LIMIT}`
      const payload = await apiGet<AnyRecord>(url)
      const next = asArray<MemoryRecord>(payload.records ?? payload.memory ?? payload.items ?? payload.data)
      setItems(append ? [...items, ...next] : next)
      setTotal(numberOf(payload.total, next.length))
      setHasMore(Boolean(payload.hasMore))
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
      setInitialBusy(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [])

  const loadMore = () => {
    if (hasMore && !busy) void load(true)
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(previous => (previous === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'updated' ? 'desc' : 'asc')
    }
  }

  // Distinct values for the filter bar + namespace tree, derived from real data.
  const statusOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of items) {
      const value = recordStatus(record)
      if (!value) continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return [...counts.entries()].map(([value, count]) => ({ value, label: value, count }))
  }, [items])

  const kindOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of items) {
      const value = recordKind(record)
      if (value === '-') continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return [...counts.entries()].map(([value, count]) => ({ value, label: value, count }))
  }, [items])

  const namespaceOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of items) {
      const value = recordNamespace(record)
      if (value === '-') continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return [...counts.entries()].map(([value, count]) => ({ value, label: value, count }))
  }, [items])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter(record => {
      if (statusFilter && recordStatus(record).toLowerCase() !== statusFilter.toLowerCase()) return false
      if (kindFilter && recordKind(record).toLowerCase() !== kindFilter.toLowerCase()) return false
      if (namespaceFilter && recordNamespace(record) !== namespaceFilter) return false
      if (needle) {
        const haystack = `${recordId(record)} ${recordKind(record)} ${recordNamespace(record)} ${recordSource(record)} ${textOf(record.text)}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [items, query, statusFilter, kindFilter, namespaceFilter])

  const sorted = useMemo(() => {
    const rows = [...filtered]
    rows.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'updated') {
        const ta = new Date(recordTime(a)).getTime()
        const tb = new Date(recordTime(b)).getTime()
        cmp = (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb)
      } else if (sortKey === 'id') {
        cmp = recordId(a).localeCompare(recordId(b))
      } else {
        cmp = recordKind(a).localeCompare(recordKind(b))
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [filtered, sortKey, sortDir])

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-ink-5">↕</span>
    return <span className="text-accent-hover">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const clearFilters = () => {
    setQuery('')
    setStatusFilter('')
    setKindFilter('')
    setNamespaceFilter('')
  }

  /* KPIs + chart data derived entirely from the already-loaded records. We never
     invent counts — every number below is computed from `items`. */
  const statusCounts = useMemo(() => {
    const counts: Record<StatusVariant, number> = { success: 0, info: 0, warning: 0, danger: 0, neutral: 0 }
    for (const record of items) {
      counts[statusVariant(recordStatus(record))] += 1
    }
    return counts
  }, [items])

  const dangerCount = statusCounts.danger
  const warningCount = statusCounts.warning
  const needsAttention = dangerCount + warningCount

  // Per-day timeline (real `updatedAt`/`ts` buckets) → line chart + sparkline.
  const timeline = useMemo(() => {
    const byDay = new Map<string, number>()
    const order: string[] = []
    for (const record of items) {
      const raw = recordTime(record)
      if (!raw) continue
      const date = new Date(raw)
      if (Number.isNaN(date.getTime())) continue
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      if (!byDay.has(key)) {
        byDay.set(key, 0)
        order.push(key)
      }
      byDay.set(key, (byDay.get(key) ?? 0) + 1)
    }
    const points = order.map(day => byDay.get(day) ?? 0)
    const labels = order.map(day => day.slice(5))
    let peakAt: number | undefined
    let peakLabel: string | undefined
    if (points.length >= 2) {
      let maxIndex = 0
      points.forEach((value, index) => {
        if (value > points[maxIndex]) maxIndex = index
      })
      peakAt = maxIndex
      peakLabel = `${labels[maxIndex]} · ${points[maxIndex]}`
    }
    return { points, labels, peakAt, peakLabel }
  }, [items])

  // Donut of real status distribution (only variants present in the data).
  const statusSegments = useMemo(() => {
    const order: StatusVariant[] = ['success', 'info', 'warning', 'danger', 'neutral']
    return order
      .filter(variant => statusCounts[variant] > 0)
      .map(variant => ({
        label: STATUS_LABELS[variant][language],
        value: statusCounts[variant],
        tone: variant
      }))
  }, [statusCounts, language])

  // Alert banner surfaces real problem states only (conflict/error or pending).
  const alert = useMemo(() => {
    if (dangerCount > 0) {
      return {
        tone: 'error' as const,
        title: t(`${dangerCount} 条记忆同步失败或冲突`, `${dangerCount} memory records failed or conflict`),
        description: t('存在同步失败或冲突的记忆，请检查详情。', 'Some memories failed to sync or conflict; review their details.')
      }
    }
    if (warningCount > 0) {
      return {
        tone: 'warning' as const,
        title: t(`${warningCount} 条记忆待同步`, `${warningCount} memory records pending`),
        description: t('存在待同步或已过期状态的记忆。', 'Some memories are pending or stale.')
      }
    }
    return null
  }, [dangerCount, warningCount, language])

  const showCharts = timeline.points.length >= 2
  const spark = timeline.points.length > 1 ? timeline.points : undefined

  const filters: FilterControl[] = [
    {
      id: 'memory-status',
      type: 'single',
      label: copy.status,
      allLabel: copy.allStatuses,
      value: statusFilter,
      onChange: setStatusFilter,
      options: statusOptions
    },
    {
      id: 'memory-kind',
      type: 'single',
      label: copy.kind,
      allLabel: t('全部类型', 'All kinds'),
      value: kindFilter,
      onChange: setKindFilter,
      options: kindOptions
    }
  ]

  return (
    <>
      <PageHead
        title={dashboardTitles[language]['memory']}
        subtitle={dashboardSubtitles[language]['memory']}
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={busy}>
            <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
            {copy.refresh}
          </Button>
        }
      />

      {alert ? (
        <AlertBanner tone={alert.tone} title={alert.title} description={alert.description} />
      ) : null}

      <MetricGrid>
        <MetricCard
          label={copy.memoryRecords}
          value={total.toLocaleString()}
          icon={Layers}
          spark={spark}
          note={hasMore ? t('服务器总数', 'server total') : undefined}
        />
        <MetricCard
          label={t('已加载', 'Loaded')}
          value={items.length.toLocaleString()}
          icon={FileText}
        />
        <MetricCard
          label={t('命名空间', 'Namespaces')}
          value={namespaceOptions.length.toLocaleString()}
          icon={Folder}
        />
        <MetricCard label={copy.kind} value={kindOptions.length.toLocaleString()} icon={Tags} />
        <MetricCard
          label={t('需要关注', 'Needs attention')}
          value={needsAttention.toLocaleString()}
          icon={AlertTriangle}
          note={dangerCount > 0 ? t(`含 ${dangerCount} 条异常`, `${dangerCount} errors`) : undefined}
        />
      </MetricGrid>

      {showCharts ? (
        <ChartRow
          title={t('记忆时间分布', 'Memory timeline')}
          subtitle={t('按天统计的记忆记录数', 'Memory records per day')}
          series={[{ label: copy.memoryRecords, points: timeline.points }]}
          xLabels={timeline.labels.length ? timeline.labels : undefined}
          peakAt={timeline.peakAt}
          peakLabel={timeline.peakLabel}
          donutTitle={t('状态分布', 'Status distribution')}
          donutCenter={items.length}
          donutCenterLabel={copy.memoryRecords}
          segments={statusSegments}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        {/* Namespace tree — derived from real project/namespace fields. */}
        <Card
          title={t('命名空间', 'Namespaces')}
          count={namespaceOptions.length}
          flushBody
          className="lg:max-h-[640px]"
          bodyClassName="overflow-y-auto"
        >
          <div className="flex flex-col py-1">
            <button
              type="button"
              onClick={() => setNamespaceFilter('')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors',
                'hover:bg-surface-sunk',
                !namespaceFilter && 'bg-surface-sunk text-ink'
              )}
            >
              <span className="font-medium">{t('全部', 'All')}</span>
              <span className="ml-auto tabular-nums text-ink-3">{items.length}</span>
            </button>
            {namespaceOptions.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setNamespaceFilter(option.value)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors',
                  'hover:bg-surface-sunk',
                  namespaceFilter === option.value && 'bg-surface-sunk text-ink'
                )}
              >
                <span className="min-w-0 flex-1 truncate">{option.value}</span>
                <span className="shrink-0 tabular-nums text-ink-3">{option.count}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* High-density record table. */}
        <Card
          title={copy.memoryRecords}
          count={filtered.length}
          flushBody
          toolbar={
            <FilterBar
              search={{
                id: 'memory-search',
                value: query,
                onChange: setQuery,
                placeholder: t('搜索记忆 ID / 内容', 'Search memory ID / content'),
                label: t('搜索记忆', 'Search memory')
              }}
              filters={filters}
              onClear={clearFilters}
              clearLabel={t('清除筛选', 'Clear filters')}
            />
          }
        >
          {error && items.length > 0 ? (
            <div className="px-4 py-2">
              <ErrorState
                variant="inline"
                title={copy.error}
                description={error}
                action={
                  <Button size="sm" variant="secondary" onClick={() => void load()}>
                    {copy.refresh}
                  </Button>
                }
              />
            </div>
          ) : null}

          {error && items.length === 0 ? (
            <ErrorState
              variant="block"
              title={copy.error}
              description={error}
              action={
                <Button variant="secondary" onClick={() => void load()}>
                  {copy.refresh}
                </Button>
              }
            />
          ) : initialBusy ? (
            <LoadingState variant="rows" label={copy.refreshing} className="p-4" />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={copy.noData}
              description={t('未检索到匹配的记忆记录。', 'No memory records matched your filters.')}
              action={
                <Button variant="secondary" size="sm" onClick={() => void load()}>
                  {copy.refresh}
                </Button>
              }
            />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5 font-medium">
                    <button type="button" onClick={() => toggleSort('id')} className="inline-flex items-center gap-1 hover:text-ink">
                      {copy.id} {sortIndicator('id')}
                    </button>
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    <button type="button" onClick={() => toggleSort('kind')} className="inline-flex items-center gap-1 hover:text-ink">
                      {copy.kind} {sortIndicator('kind')}
                    </button>
                  </th>
                  <th className="px-4 py-2.5 font-medium">{t('命名空间', 'Namespace')}</th>
                  <th className="px-4 py-2.5 font-medium">{copy.status}</th>
                  <th className="px-4 py-2.5 font-medium">
                    <button type="button" onClick={() => toggleSort('updated')} className="inline-flex items-center gap-1 hover:text-ink">
                      {copy.time} {sortIndicator('updated')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(record => {
                  const id = recordId(record)
                  const kind = recordKind(record)
                  const namespace = recordNamespace(record)
                  const status = recordStatus(record)
                  const time = recordTime(record)
                  const variant = statusVariant(status)
                  return (
                    <tr
                      key={id}
                      onClick={() => setSelected(record)}
                      className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-sunk"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-accent-hover">{id}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="neutral">{kind}</Badge>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-ink-2">{namespace}</td>
                      <td className="px-4 py-2.5">
                        {status ? (
                          <Badge variant={variant}>{status}</Badge>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-3">
                        {time ? formatRelativeTime(time, locale) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          <div className="flex w-full items-center justify-between gap-3 border-t border-line px-4 py-2.5">
            <span className="truncate text-xs text-ink-3">
              {filtered.length}
              {total > 0 ? ` / ${total}` : ''}
              {t(' 条', ' records')}
              {hasMore ? t(' · 还有更多', ' · more available') : ''}
            </span>
            <Button variant="secondary" size="sm" onClick={loadMore} disabled={!hasMore || busy}>
              <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
              {copy.loadMore}
            </Button>
          </div>
        </Card>
      </div>

      {/* Detail drawer. */}
      <Sheet open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null) }}>
        <SheetContent side="right" aria-describedby={undefined}>
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-sm">{recordId(selected)}</SheetTitle>
                <p className="text-xs text-ink-3">
                  {recordKind(selected)} · {recordNamespace(selected)}
                </p>
              </SheetHeader>
              <SheetBody>
                <SheetDetailList>
                  <dt>{copy.id}</dt>
                  <dd className="font-mono">{recordId(selected)}</dd>
                  <dt>{copy.kind}</dt>
                  <dd>{recordKind(selected)}</dd>
                  <dt>{t('命名空间', 'Namespace')}</dt>
                  <dd>{recordNamespace(selected)}</dd>
                  <dt>{copy.source}</dt>
                  <dd>{recordSource(selected)}</dd>
                  <dt>{copy.status}</dt>
                  <dd>{recordStatus(selected) || '—'}</dd>
                  <dt>{copy.time}</dt>
                  <dd className="font-mono">{recordTime(selected) ? formatDate(recordTime(selected), 'compact') : '—'}</dd>
                </SheetDetailList>
                {textOf(selected.text) ? (
                  <div className="mt-4">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">{t('内容', 'Content')}</p>
                    <p className="whitespace-pre-wrap text-sm text-ink-2">{textOf(selected.text)}</p>
                  </div>
                ) : null}
                <SheetRawBlock label={t('原始 JSON', 'Raw JSON')} className="mt-4">
                  {JSON.stringify(selected, null, 2)}
                </SheetRawBlock>
              </SheetBody>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
