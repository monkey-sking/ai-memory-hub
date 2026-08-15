import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { RefreshCw, Reply, Send, Star } from 'lucide-react'
import { apiGet, apiPost, asArray, boolOf, formatDate, formatRelativeTime, numberOf, textOf } from '../lib/api'
import { dashboardLabels, dashboardSubtitles, dashboardTitles } from '../lib/dashboardCopy'
import type { AnyRecord } from '../lib/api'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge, type BadgeVariant } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input, fieldBaseStyles } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { EmptyState, ErrorState, FilterBar, LoadingState, Panel } from '../components/shell'
import { AlertBanner, Card, ChartRow, MetricCard, MetricGrid, PageHead, SplitRow } from '@/components/ds'
import type { DonutSegment, DonutTone } from '@/components/ds'

const SECTION = 'radio' as const

/** `/api/radio` page shape (src/dashboard/radio.js): a tail window of the ascending log. */
type RadioPage = { messages?: unknown; total?: unknown; offset?: unknown; limit?: unknown; hasMore?: unknown }

type RadioForm = { text: string; from: string; to: string; type: string; project: string; thread: string; replyTo: string }

type DayBucket = { key: string; label: string; items: AnyRecord[] }

/** Message types the hub actually emits (Dashboard's compose select + proto legend). */
const MESSAGE_TYPES = ['note', 'reply', 'review', 'handoff', 'risk', 'request', 'done', 'status'] as const

/** Mirrors proto-next/radio.html `.typetag--*`: note→info, handoff→accent, risk→danger, status→success. */
const typeVariants: Record<string, BadgeVariant> = {
  note: 'info',
  reply: 'neutral',
  review: 'accent',
  handoff: 'accent',
  request: 'accent',
  risk: 'danger',
  done: 'neutral',
  status: 'success'
}

/** Donut tone per message type — drawn from the same mapping as the type badges. */
const donutTone: Record<string, DonutTone> = {
  note: 'info',
  reply: 'neutral',
  review: 'accent',
  handoff: 'accent',
  request: 'accent',
  risk: 'danger',
  done: 'neutral',
  status: 'success'
}

/** Inline copy that has no `dashboardLabels` key. Per the landing contract we keep it local. */
const localCopy = {
  zh: {
    loaded: '已加载',
    totalMessages: '消息总数',
    senders: '发送方',
    types: '类型',
    todayMessages: '今日消息',
    typeDistribution: '消息类型分布',
    live: '实时',
    stream: '消息流',
    compose: '撰写消息',
    target: '发往（agent 或 all）',
    sender: '发送方标识',
    today: '今天',
    yesterday: '昨天',
    unknownTime: '时间未知',
    retry: '重试',
    emptyHint: 'Agent 之间开始交接或广播后，消息会实时出现在这里。',
    composeHint: '消息会写入共享 Radio 日志，所有接入的 agent 都可读取。',
    searchMessages: '搜索消息…',
    replyingTo: '正在回复'
  },
  en: {
    loaded: 'Loaded',
    totalMessages: 'Total messages',
    senders: 'Senders',
    types: 'Types',
    todayMessages: 'Today',
    typeDistribution: 'Message types',
    live: 'Live',
    stream: 'Message stream',
    compose: 'Compose',
    target: 'To (agent or all)',
    sender: 'Sender id',
    today: 'Today',
    yesterday: 'Yesterday',
    unknownTime: 'Unknown time',
    retry: 'Retry',
    emptyHint: 'Once agents hand off or broadcast, their messages show up here.',
    composeHint: 'Messages are appended to the shared radio log every connected agent reads.',
    searchMessages: 'Search messages…',
    replyingTo: 'Replying to'
  }
} as const satisfies Record<AppLanguage, Record<string, string>>

const selectClass = cn(fieldBaseStyles, 'flex h-9 px-3 py-0')

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort()
}

function messageTime(message: AnyRecord): string {
  return textOf(message.ts || message.createdAt)
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function dayBucket(value: string, language: AppLanguage): { key: string; label: string } {
  const local = localCopy[language]
  if (!value) return { key: 'unknown', label: local.unknownTime }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { key: 'unknown', label: local.unknownTime }
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
  const key = String(startOfDay(date))
  if (days === 0) return { key, label: local.today }
  if (days === 1) return { key, label: local.yesterday }
  return { key, label: date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en') }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function Radio() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const local = localCopy[language]
  const locale = language === 'zh' ? 'zh-CN' : 'en'
  const composeRef = useRef<HTMLTextAreaElement | null>(null)

  const [messages, setMessages] = useState<AnyRecord[]>([])
  const [total, setTotal] = useState(0)
  const [pageLimit, setPageLimit] = useState(50)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [form, setForm] = useState<RadioForm>({
    text: '',
    from: 'dashboard-next',
    to: 'all',
    type: 'note',
    project: 'ai-memory-hub',
    thread: '',
    replyTo: ''
  })

  const load = async () => {
    setLoading(true)
    try {
      const page = await apiGet<RadioPage>('/api/radio')
      setMessages(asArray<AnyRecord>(page.messages))
      setTotal(numberOf(page.total))
      setPageLimit(numberOf(page.limit, 50) || 50)
      setHasMore(boolOf(page.hasMore))
      setError('')
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [])

  /**
   * The endpoint pages from the END of the log (page 0 = newest tail), so the
   * next page is strictly OLDER and has to be prepended to keep the ascending order.
   */
  const loadMore = async () => {
    if (!hasMore || busy) return
    setBusy('more')
    try {
      const page = await apiGet<RadioPage>(`/api/radio?offset=${messages.length}&limit=${pageLimit}`)
      const older = asArray<AnyRecord>(page.messages)
      setMessages(previous => [...older, ...previous])
      setTotal(numberOf(page.total, total))
      setHasMore(boolOf(page.hasMore))
      setError('')
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setBusy('')
    }
  }

  const senderOptions = useMemo(() => uniqueSorted(messages.map(message => textOf(message.from))), [messages])
  const recipientOptions = useMemo(() => uniqueSorted(messages.map(message => textOf(message.to))), [messages])
  const typeOptions = useMemo(() => uniqueSorted(messages.map(message => textOf(message.type))), [messages])
  const projectOptions = useMemo(() => uniqueSorted(messages.map(message => textOf(message.project))), [messages])
  const targetOptions = useMemo(() => uniqueSorted(['all', ...recipientOptions, ...senderOptions]), [recipientOptions, senderOptions])

  // Derived series — never invented: message counts grouped by day, oldest → newest.
  const daily = useMemo(() => {
    const buckets = new Map<string, { label: string; count: number }>()
    for (const message of messages) {
      const { key, label } = dayBucket(messageTime(message), language)
      const entry = buckets.get(key) ?? { label, count: 0 }
      entry.count += 1
      buckets.set(key, entry)
    }
    return [...buckets.values()]
  }, [messages, language])

  const dailyCounts = useMemo(() => daily.map(entry => entry.count), [daily])
  const dayLabels = useMemo(() => daily.map(entry => entry.label), [daily])

  const todayKey = String(startOfDay(new Date()))
  const todayCount = useMemo(
    () => messages.filter(message => dayBucket(messageTime(message), language).key === todayKey).length,
    [messages, language, todayKey]
  )

  const typeSegments = useMemo<DonutSegment[]>(() => {
    const counts = new Map<string, number>()
    for (const message of messages) {
      const type = textOf(message.type, 'note')
      counts.set(type, (counts.get(type) ?? 0) + 1)
    }
    return [...counts.entries()].map(([label, value]) => ({ label, value, tone: donutTone[label] ?? 'neutral' }))
  }, [messages])

  const senders = useMemo(
    () =>
      [...messages.reduce((map, message) => {
        const from = textOf(message.from)
        if (from) map.set(from, (map.get(from) ?? 0) + 1)
        return map
      }, new Map<string, number>())]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
    [messages]
  )

  const needle = query.trim().toLowerCase()
  const activeFrom = senderOptions.includes(fromFilter) ? fromFilter : ''
  const activeTo = recipientOptions.includes(toFilter) ? toFilter : ''
  const activeType = typeOptions.includes(typeFilter) ? typeFilter : ''
  const activeFilters = (needle ? 1 : 0) + (activeFrom ? 1 : 0) + (activeTo ? 1 : 0) + (activeType ? 1 : 0)

  // Newest first for display; the endpoint hands us the page in ascending order.
  const visible = useMemo(() => messages.filter(message => {
    if (activeFrom && textOf(message.from) !== activeFrom) return false
    if (activeTo && textOf(message.to) !== activeTo) return false
    if (activeType && textOf(message.type) !== activeType) return false
    if (!needle) return true
    return [message.text, message.from, message.to, message.type, message.project, message.thread]
      .some(value => textOf(value).toLowerCase().includes(needle))
  }).reverse(), [messages, activeFrom, activeTo, activeType, needle])

  const buckets = useMemo(() => {
    const groups: DayBucket[] = []
    for (const message of visible) {
      const { key, label } = dayBucket(messageTime(message), language)
      const last = groups[groups.length - 1]
      if (last && last.key === key) last.items.push(message)
      else groups.push({ key, label, items: [message] })
    }
    return groups
  }, [visible, language])

  const scopeNote = `${copy.partialScopePrefix} ${messages.length} ${copy.partialScopeSuffix}`

  const send = async () => {
    const text = form.text.trim()
    if (!text || busy) return
    setBusy('send')
    try {
      await apiPost('/api/radio/send', { ...form, text })
      setForm(previous => ({ ...previous, text: '', thread: '', replyTo: '' }))
      await load()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setBusy('')
    }
  }

  const promote = async (id: string) => {
    if (!id || busy) return
    setBusy(`promote:${id}`)
    try {
      await apiPost('/api/radio/promote', { id })
      await load()
    } catch (nextError) {
      setError(errorText(nextError))
    } finally {
      setBusy('')
    }
  }

  const startReply = (message: AnyRecord) => {
    setError('')
    setForm(previous => ({
      ...previous,
      text: '',
      to: textOf(message.from, 'all'),
      type: 'reply',
      project: textOf(message.project, previous.project),
      thread: textOf(message.thread || message.id),
      replyTo: textOf(message.id)
    }))
    composeRef.current?.focus()
  }

  const clearFilters = () => {
    setQuery('')
    setFromFilter('')
    setToFilter('')
    setTypeFilter('')
  }

  const renderMessage = (message: AnyRecord, index: number) => {
    const id = textOf(message.id)
    const type = textOf(message.type, 'note')
    const from = textOf(message.from, '-')
    const to = textOf(message.to, '-')
    const text = textOf(message.text, '-')
    const project = textOf(message.project)
    const thread = textOf(message.thread)
    const timestamp = messageTime(message)
    return (
      <article
        key={id || `radio-${index}`}
        className="flex min-w-0 flex-col rounded-md border border-line bg-surface transition-colors duration-[var(--dur-fast)] hover:border-line-strong"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2 px-3.5 pt-2.5">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-base" aria-hidden="true" />
            <span className="truncate">{from}</span>
          </span>
          <span className="shrink-0 text-ink-3" aria-hidden="true">→</span>
          <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs font-medium', to === 'all' ? 'text-ink-3' : 'text-ink')}>
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', to === 'all' ? 'bg-ink-3' : 'bg-info')} aria-hidden="true" />
            <span className="truncate">{to}</span>
          </span>
          <Badge variant={typeVariants[type] ?? 'neutral'}>{type}</Badge>
          {timestamp ? (
            <time
              dateTime={timestamp}
              title={formatDate(timestamp, 'full')}
              className="ml-auto shrink-0 font-mono text-xs text-ink-3"
            >
              {formatRelativeTime(timestamp, locale)}
            </time>
          ) : null}
        </div>

        <p className="px-3.5 py-2.5 text-sm leading-relaxed text-ink-2 whitespace-pre-wrap break-words">{text}</p>

        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-line px-3.5 py-2">
          {project ? <Badge variant="neutral">{project}</Badge> : null}
          {thread ? <Badge variant="neutral">#{thread}</Badge> : null}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => startReply(message)}>
              <Reply className="h-3.5 w-3.5" />
              {copy.reply}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!id || busy === `promote:${id}`}
              onClick={() => void promote(id)}
            >
              <Star className="h-3.5 w-3.5" />
              {copy.promoteToMemory}
            </Button>
          </div>
        </div>
      </article>
    )
  }

  const feedToolbar = (
    <FilterBar
      search={{
        id: 'radio-search',
        value: query,
        onChange: setQuery,
        placeholder: local.searchMessages,
        label: copy.searchText
      }}
      filters={[
        {
          type: 'single',
          id: 'radio-from',
          label: copy.from,
          allLabel: copy.allSenders,
          value: activeFrom,
          onChange: setFromFilter,
          options: senderOptions.map(option => ({ value: option, label: option }))
        },
        {
          type: 'single',
          id: 'radio-to',
          label: copy.to,
          allLabel: copy.allRecipients,
          value: activeTo,
          onChange: setToFilter,
          options: recipientOptions.map(option => ({ value: option, label: option }))
        },
        {
          type: 'single',
          id: 'radio-type',
          label: copy.type,
          allLabel: copy.allTypes,
          value: activeType,
          onChange: setTypeFilter,
          options: typeOptions.map(option => ({ value: option, label: option }))
        }
      ]}
      onClear={clearFilters}
      clearLabel={copy.clear}
      activeCount={activeFilters}
    />
  )

  const feedBody = () => {
    if (!visible.length) {
      return (
        <EmptyState
          title={activeFilters ? copy.noMatchesInLoaded : copy.noData}
          description={activeFilters ? scopeNote : local.emptyHint}
          action={activeFilters ? <Button variant="secondary" onClick={clearFilters}>{copy.clear}</Button> : null}
        />
      )
    }
    return (
      <>
        <div className="flex flex-col gap-5">
          {buckets.map(bucket => (
            <section key={bucket.key} className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-3">{bucket.label}</span>
                <span className="h-px flex-1 bg-line" aria-hidden="true" />
                <span className="shrink-0 font-mono text-xs tabular-nums text-ink-3">{bucket.items.length}</span>
              </div>
              {bucket.items.map(renderMessage)}
            </section>
          ))}
        </div>
        {hasMore ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-ink-3">{scopeNote}</span>
            <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => void loadMore()}>
              {busy === 'more' ? copy.loadingMore : copy.loadMore}
            </Button>
          </div>
        ) : null}
      </>
    )
  }

  const retryButton = (
    <Button variant="secondary" onClick={() => void load()}>
      <RefreshCw className="h-4 w-4" />
      {local.retry}
    </Button>
  )

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHead
        title={dashboardTitles[language][SECTION]}
        subtitle={dashboardSubtitles[language][SECTION]}
        actions={
          <>
            <Badge variant="accent" dot>{local.live}</Badge>
            <Button variant="secondary" onClick={() => void load()} disabled={loading || Boolean(busy)}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              {loading ? copy.refreshing : copy.refresh}
            </Button>
          </>
        }
      />

      {loading && !messages.length ? (
        <LoadingState variant="rows" label={copy.refreshing} rows={5} />
      ) : error && !messages.length ? (
        <ErrorState
          variant="block"
          title={copy.error}
          description={copy.connectionError}
          detail={error}
          detailLabel={copy.error}
          action={retryButton}
        />
      ) : !messages.length ? (
        <EmptyState title={copy.noData} description={local.emptyHint} />
      ) : (
        <>
          {error ? (
            <AlertBanner
              tone="error"
              title={copy.error}
              description={error}
              onDismiss={() => setError('')}
            />
          ) : null}

          <MetricGrid>
            <MetricCard
              label={local.loaded}
              value={messages.length}
              spark={dailyCounts}
              note={`${visible.length} / ${messages.length} ${copy.messageCount}`}
            />
            <MetricCard
              label={local.totalMessages}
              value={total}
              note={hasMore ? scopeNote : ''}
            />
            <MetricCard label={local.senders} value={senderOptions.length} />
            <MetricCard label={local.types} value={typeOptions.length} />
            <MetricCard label={local.todayMessages} value={todayCount} />
          </MetricGrid>

          <ChartRow
            title={local.stream}
            series={[{ label: local.stream, points: dailyCounts }]}
            xLabels={dayLabels}
            donutTitle={local.typeDistribution}
            donutCenter={messages.length}
            donutCenterLabel={copy.messageCount}
            segments={typeSegments}
          />

          <SplitRow
            stream={
              <Panel
                title={`${copy.recentRadio} · ${local.stream}`}
                count={`${visible.length} ${copy.messageCount}`}
                toolbar={feedToolbar}
                footer={hasMore ? (
                  <>
                    <span className="min-w-0 truncate">{scopeNote}</span>
                    <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => void loadMore()}>
                      {busy === 'more' ? copy.loadingMore : copy.loadMore}
                    </Button>
                  </>
                ) : undefined}
              >
                {feedBody()}
              </Panel>
            }
            side={
              <Card title={local.senders} count={senders.length} flushBody>
                <ul className="px-[var(--card-pad)] py-1.5">
                  {senders.map(({ name, count }) => (
                    <li
                      key={name}
                      className="flex items-center gap-2 border-b border-line py-2 last:border-b-0"
                    >
                      <span className="size-2 shrink-0 rounded-full bg-accent-base" aria-hidden="true" />
                      <span className="min-w-0 truncate font-mono text-[13px] text-ink-1">{name}</span>
                      <span className="ml-auto shrink-0 font-mono text-[12px] tabular-nums text-ink-3">{count}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            }
          />

          <Panel title={local.compose} footer={<span className="min-w-0 truncate">{local.composeHint}</span>}>
            <div className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="radio-text">{copy.message}</Label>
                <Textarea
                  id="radio-text"
                  ref={composeRef}
                  rows={4}
                  value={form.text}
                  placeholder={copy.messagePlaceholder}
                  onChange={event => setForm(previous => ({ ...previous, text: event.target.value }))}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="grid gap-2">
                  <Label htmlFor="radio-to-field">{local.target}</Label>
                  <select
                    id="radio-to-field"
                    className={selectClass}
                    value={targetOptions.includes(form.to) ? form.to : 'all'}
                    onChange={event => setForm(previous => ({ ...previous, to: event.target.value }))}
                  >
                    {targetOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="radio-type-field">{copy.type}</Label>
                  <select
                    id="radio-type-field"
                    className={selectClass}
                    value={form.type}
                    onChange={event => setForm(previous => ({ ...previous, type: event.target.value }))}
                  >
                    {MESSAGE_TYPES.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="radio-from-field">{local.sender}</Label>
                  <Input
                    id="radio-from-field"
                    value={form.from}
                    list="radio-sender-options"
                    onChange={event => setForm(previous => ({ ...previous, from: event.target.value }))}
                  />
                  <datalist id="radio-sender-options">
                    {senderOptions.map(option => <option key={option} value={option} />)}
                  </datalist>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="radio-project-field">{copy.project}</Label>
                  <Input
                    id="radio-project-field"
                    value={form.project}
                    list="radio-project-options"
                    onChange={event => setForm(previous => ({ ...previous, project: event.target.value }))}
                  />
                  <datalist id="radio-project-options">
                    {projectOptions.map(option => <option key={option} value={option} />)}
                  </datalist>
                </div>
              </div>

              {form.replyTo || form.thread ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-sunk px-3 py-2 text-xs text-ink-2">
                  <span className="font-medium text-ink-3">{local.replyingTo}</span>
                  {form.replyTo ? <Badge variant="accent">{copy.replyTo}: {form.replyTo}</Badge> : null}
                  {form.thread ? <Badge variant="neutral">{copy.thread}: {form.thread}</Badge> : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => setForm(previous => ({ ...previous, thread: '', replyTo: '', type: 'note' }))}
                  >
                    {copy.cancel}
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void send()} disabled={!form.text.trim() || busy === 'send'}>
                  <Send className="h-4 w-4" />
                  {busy === 'send' ? copy.running : copy.broadcastMessage}
                </Button>
              </div>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
