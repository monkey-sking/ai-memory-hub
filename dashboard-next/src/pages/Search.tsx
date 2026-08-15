import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { RefreshCw, Search as SearchIcon, X } from 'lucide-react'
import { apiGet, asArray, asRecord, formatDate, formatRelativeTime, numberOf, textOf } from '../lib/api'
import { dashboardLabels, dashboardSubtitles, dashboardTitles } from '../lib/dashboardCopy'
import type { AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge, type BadgeVariant } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { fieldBaseStyles } from '../components/ui/input'
import {
  AlertBanner,
  Card,
  ChartRow,
  type DonutSegment,
  type DonutTone,
  MetricCard,
  MetricGrid,
  PageHead
} from '@/components/ds'
import {
  EmptyState,
  LoadingState,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetDetailList,
  SheetHeader,
  SheetTitle
} from '../components/shell'

type SearchRecord = Record<string, unknown>
type SearchPayload = {
  count?: unknown
  elapsedMs?: unknown
  facets?: unknown
  results?: unknown
  [key: string]: unknown
}

const TYPES = ['all', 'memory', 'task', 'radio', 'workflow'] as const
const RANGES = ['all', '24h', '7d', '30d', '90d'] as const
const SORTS = ['relevance', 'newest', 'oldest'] as const

const KIND_LABELS: Record<string, string> = {
  memory: '记忆',
  task: '任务',
  radio: 'Radio',
  workflow: '工作流'
}

const KIND_TONE: Record<string, DonutTone> = {
  memory: 'info',
  task: 'success',
  radio: 'warning',
  workflow: 'accent'
}

const selectClass = cn(fieldBaseStyles, 'h-9 w-auto px-3 py-0')

function formatNumber(value: unknown): string {
  return numberOf(value).toLocaleString()
}

function kindVariant(kind: string): BadgeVariant {
  if (kind === 'memory') return 'info'
  if (kind === 'task') return 'success'
  if (kind === 'radio') return 'warning'
  return 'neutral'
}

function KindBadge({ kind }: { kind: string }) {
  return <Badge variant={kindVariant(kind)}>{kind}</Badge>
}

function activateOnKey(handler: () => void) {
  return (event: ReactKeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handler()
    }
  }
}

export default function Search() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const title = dashboardTitles[language]['search']
  const subtitle = dashboardSubtitles[language]['search']

  const [query, setQuery] = useState('')
  const [type, setType] = useState<(typeof TYPES)[number]>('all')
  const [range, setRange] = useState<(typeof RANGES)[number]>('all')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('relevance')
  const [tag, setTag] = useState('')
  const [payload, setPayload] = useState<SearchPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchRecord | null>(null)

  // Facets (`limit=0`) load on mount so the command panel has real options,
  // but they must NOT render as "no results" — before a real query the results
  // area stays a neutral prompt.
  const loadFacets = useCallback(async () => {
    try {
      const nextPayload = await apiGet<SearchPayload>('/api/search?limit=0')
      setPayload(nextPayload)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial facet load on mount
  useEffect(() => { void loadFacets() }, [loadFacets])

  const runSearch = useCallback(async (overrides: Partial<{ query: string; type: string; range: string; sort: string; tag: string }> = {}) => {
    const nextQuery = overrides.query ?? query
    const nextType = overrides.type ?? type
    const nextRange = overrides.range ?? range
    const nextSort = overrides.sort ?? sort
    const nextTag = overrides.tag ?? tag
    setLoading(true)
    setSearched(true)
    setError('')
    try {
      const params = new URLSearchParams({ q: nextQuery, type: nextType, range: nextRange, sort: nextSort, tag: nextTag, limit: '80' })
      setPayload(await apiGet<SearchPayload>(`/api/search?${params.toString()}`))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [query, type, range, sort, tag])

  const clearSearch = () => {
    setQuery('')
    setType('all')
    setRange('all')
    setSort('relevance')
    setTag('')
    void runSearch({ query: '', type: 'all', range: 'all', sort: 'relevance', tag: '' })
  }

  const refresh = () => {
    if (searched) void runSearch()
    else void loadFacets()
  }

  const results = useMemo(() => asArray<SearchRecord>(payload?.results), [payload])

  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const result of results) {
      const kind = textOf(result.kind, 'result')
      counts[kind] = (counts[kind] ?? 0) + 1
    }
    return counts
  }, [results])

  // Relevance profile: each matched result's score, sorted high → low. Derived
  // purely from loaded real data — never invented.
  const scoreSeries = useMemo(
    () => results.map(result => numberOf(result.score)).sort((a, b) => b - a),
    [results]
  )

  const segments = useMemo<DonutSegment[]>(() => {
    return (['memory', 'task', 'radio', 'workflow'] as const)
      .filter(kind => (kindCounts[kind] ?? 0) > 0)
      .map(kind => ({
        label: KIND_LABELS[kind] ?? kind,
        value: kindCounts[kind],
        tone: KIND_TONE[kind] ?? 'neutral'
      }))
  }, [kindCounts])

  const groups = useMemo(() => {
    const buckets = new Map<string, SearchRecord[]>()
    for (const result of results) {
      const kind = textOf(result.kind, 'result')
      const bucket = buckets.get(kind) ?? []
      bucket.push(result)
      buckets.set(kind, bucket)
    }
    return [...buckets.entries()]
  }, [results])

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        title={title}
        subtitle={subtitle}
        actions={
          <Button variant="secondary" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {copy.refreshing}
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 p-[var(--card-pad)]">
          {/* Big search input */}
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') void runSearch() }}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchText}
              className={cn(fieldBaseStyles, 'h-12 pl-12 pr-28 text-[15px]')}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Button size="sm" onClick={() => void runSearch()} disabled={loading}>
                <SearchIcon className={cn('h-4 w-4', loading && 'animate-spin')} />
                {loading ? copy.running : copy.globalSearch}
              </Button>
            </div>
          </div>

          {/* Filters: type chips + range + sort + tag */}
          <div className="flex flex-wrap items-center gap-2">
            {TYPES.map(option => (
              <button
                key={option}
                type="button"
                aria-pressed={type === option}
                onClick={() => setType(option)}
                className={cn(
                  'h-8 rounded-full border px-3 text-sm font-medium transition-colors',
                  type === option
                    ? 'border-accent-base bg-accent-base text-accent-fg'
                    : 'border-line bg-surface-sunk text-ink-2 hover:bg-surface-raised hover:text-ink-1'
                )}
              >
                {option === 'all' ? copy.allTypes : KIND_LABELS[option] ?? option}
              </button>
            ))}
            <select
              aria-label={copy.range}
              value={range}
              onChange={event => setRange(event.target.value as (typeof RANGES)[number])}
              className={selectClass}
            >
              {RANGES.map(option => (
                <option key={option} value={option}>
                  {option === 'all' ? copy.allRanges : option === '24h' ? copy.last24h : option === '7d' ? copy.last7d : option === '30d' ? copy.last30d : copy.last90d}
                </option>
              ))}
            </select>
            <select
              aria-label={copy.sort}
              value={sort}
              onChange={event => setSort(event.target.value as (typeof SORTS)[number])}
              className={selectClass}
            >
              {SORTS.map(option => (
                <option key={option} value={option}>
                  {option === 'relevance' ? copy.relevance : option === 'newest' ? copy.newest : copy.oldest}
                </option>
              ))}
            </select>
            <input
              value={tag}
              onChange={event => setTag(event.target.value)}
              placeholder={copy.tags}
              aria-label={copy.tags}
              className={cn(fieldBaseStyles, 'h-9 w-40 px-3 py-0')}
            />
            <Button variant="ghost" size="sm" onClick={clearSearch} disabled={loading}>
              <X className="h-4 w-4" />
              {copy.clear}
            </Button>
          </div>

          <p className="text-xs text-ink-3">{copy.searchPromptHint}</p>
        </div>
      </Card>

      {error ? (
        <AlertBanner
          tone="error"
          title={copy.error}
          description={error}
          onDismiss={() => setError('')}
        />
      ) : null}

      {loading ? (
        <LoadingState variant="rows" label={copy.refreshing} className="p-4" />
      ) : !searched ? (
        <EmptyState icon={null} title={copy.searchPrompt} description={copy.searchPromptHint} />
      ) : results.length === 0 ? (
        <EmptyState icon={null} title={copy.noData} description={copy.searchPromptHint} />
      ) : (
        <>
          <MetricGrid>
            <MetricCard label={copy.resultCount} value={formatNumber(payload?.count)} />
            <MetricCard label={copy.elapsed} value={`${formatNumber(payload?.elapsedMs)} ms`} />
            <MetricCard label={KIND_LABELS.memory} value={kindCounts.memory ?? 0} />
            <MetricCard label={KIND_LABELS.task} value={kindCounts.task ?? 0} />
            <MetricCard label={KIND_LABELS.radio} value={kindCounts.radio ?? 0} />
          </MetricGrid>

          <ChartRow
            title={copy.results}
            subtitle={copy.score}
            series={[{ label: copy.score, points: scoreSeries }]}
            donutTitle={copy.type}
            segments={segments}
          />

          <div className="flex flex-col gap-6">
            {groups.map(([kind, items]) => (
              <Card key={kind} title={textOf(kind)} count={items.length} flushBody>
                <div className="flex flex-col">
                  {items.map((result, index) => {
                    const meta = asRecord(result.meta)
                    const resultTitle = textOf(result.title, '-')
                    const resultText = textOf(result.text || result.preview)
                    return (
                      <article
                        key={`${textOf(result.kind)}-${textOf(meta.id)}-${index}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${textOf(result.kind, 'result')}: ${resultTitle} · ${formatDate(textOf(result.ts))}`}
                        onClick={() => setSelectedResult(result)}
                        onKeyDown={activateOnKey(() => setSelectedResult(result))}
                        className="flex cursor-pointer flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-surface-raised"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <KindBadge kind={textOf(result.kind, 'result')} />
                            <span className="truncate text-sm font-medium text-ink">{resultTitle}</span>
                          </div>
                          <span className="truncate text-xs text-ink-3">{resultText}</span>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-ink-3">
                          <span className="font-mono">{formatRelativeTime(textOf(result.ts))}</span>
                          <span className="font-mono">{textOf(meta.project)}</span>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Sheet open={selectedResult !== null} onOpenChange={open => { if (!open) setSelectedResult(null) }}>
        <SheetContent side="right" closeLabel={copy.close}>
          <SheetHeader>
            <SheetTitle>{textOf(selectedResult?.title, copy.results)}</SheetTitle>
            <SheetDescription>{formatDate(textOf(selectedResult?.ts))}</SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4">
            {selectedResult ? (
              <>
                <div className="flex items-center gap-2">
                  <KindBadge kind={textOf(selectedResult.kind, 'result')} />
                  <span className="text-xs text-ink-3">{formatDate(textOf(selectedResult.ts))}</span>
                </div>
                <p className="m-0 break-words text-sm leading-relaxed text-ink-2">{textOf(selectedResult.text || selectedResult.preview, '-')}</p>
                <SheetDetailList>
                  <dt>{copy.project}</dt>
                  <dd>{textOf(asRecord(selectedResult.meta).project, '-')}</dd>
                  <dt>{copy.score}</dt>
                  <dd className="tabular-nums">{formatNumber(selectedResult.score)}</dd>
                </SheetDetailList>
              </>
            ) : null}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}
