import { useEffect, useState, useMemo } from 'react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input, fieldBaseStyles } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from './ui/dialog'
import { Send, Search, X, AlertCircle, Reply, Star } from 'lucide-react'
import type { AnyRecord } from '@/lib/api'
import { formatDate } from '@/lib/api'
import { VirtualizedList } from './VirtualizedList'
import { EmptyState, Panel } from '@/components/shell'
import { ListRow, LIST_ROW_HEIGHT } from './ListRow'
import { cn } from '@/lib/utils'

interface RadioPanelProps {
  radio: AnyRecord[]
  visibleProjects: AnyRecord[]
  copy: {
    recentRadio: string
    broadcastMessage: string
    searchText: string
    searchPlaceholder: string
    from: string
    to: string
    type: string
    project: string
    allSenders: string
    allRecipients: string
    allTypes: string
    allProjects: string
    clear: string
    message: string
    reply: string
    promoteToMemory: string
    thread: string
    replyTo: string
    cancel: string
    running: string
    noData: string
    noMatchesInLoaded: string
    partialScopePrefix: string
    partialScopeSuffix: string
    messageCount: string
    messagePlaceholder: string
    refreshing: string
    loadingMore: string
    loadMore: string
  }
  onRefresh: () => Promise<void>
  hasMore?: boolean
  onLoadMore?: () => Promise<void>
}

function textOf(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function uniqueSorted(items: string[]): string[] {
  return Array.from(new Set(items)).sort()
}

const selectFieldClass = cn(fieldBaseStyles, 'flex h-9 px-3 py-0')

export function RadioPanel({ radio, visibleProjects, copy, onRefresh, hasMore = false, onLoadMore }: RadioPanelProps) {
  const [form, setForm] = useState({
    text: '',
    from: 'dashboard-next',
    to: 'all',
    type: 'note',
    project: 'ai-memory-hub',
    thread: '',
    replyTo: ''
  })
  const [query, setQuery] = useState('')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [selectedMessage, setSelectedMessage] = useState<AnyRecord | null>(null)
  const [visibleCount, setVisibleCount] = useState(60)
  const [loadingMore, setLoadingMore] = useState(false)

  const senderOptions = useMemo(
    () => uniqueSorted(radio.map(message => textOf(message.from)).filter(Boolean)),
    [radio]
  )
  const recipientOptions = useMemo(
    () => uniqueSorted(radio.map(message => textOf(message.to)).filter(Boolean)),
    [radio]
  )
  const typeOptions = useMemo(
    () => uniqueSorted(radio.map(message => textOf(message.type)).filter(Boolean)),
    [radio]
  )
  const projectOptions = useMemo(
    () => uniqueSorted(radio.map(message => textOf(message.project)).filter(Boolean)),
    [radio]
  )
  const formProjectOptions = useMemo(
    () =>
      uniqueSorted([
        ...visibleProjects.map(project => textOf(project.id || project.name || project.displayName)).filter(Boolean),
        ...projectOptions
      ]),
    [visibleProjects, projectOptions]
  )

  const cleanQuery = query.trim().toLowerCase()
  const activeFromFilter = senderOptions.includes(fromFilter) ? fromFilter : ''
  const activeToFilter = recipientOptions.includes(toFilter) ? toFilter : ''
  const activeTypeFilter = typeOptions.includes(typeFilter) ? typeFilter : ''
  const activeProjectFilter = projectOptions.includes(projectFilter) ? projectFilter : ''

  const filteredMessages = radio
    .filter(message => {
      if (activeFromFilter && textOf(message.from) !== activeFromFilter) return false
      if (activeToFilter && textOf(message.to) !== activeToFilter) return false
      if (activeTypeFilter && textOf(message.type) !== activeTypeFilter) return false
      if (activeProjectFilter && textOf(message.project) !== activeProjectFilter) return false
      if (!cleanQuery) return true
      return [message.text, message.thread, message.project, message.from, message.to, message.type].some(value =>
        textOf(value).toLowerCase().includes(cleanQuery)
      )
    })
    .slice()
    .reverse()

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset load-more window when filters change
    setVisibleCount(60)
  }, [cleanQuery, activeFromFilter, activeToFilter, activeTypeFilter, activeProjectFilter])

  const visibleMessages = filteredMessages.slice(0, visibleCount)
  // A radio page is only the 50 newest messages, so filtering searches a small slice of
  // the log. `total` is not passed into this component, so the note states the scope
  // actually searched rather than implying a denominator we do not have.
  const partialScopeNote = `${copy.partialScopePrefix} ${radio.length} ${copy.partialScopeSuffix}`
  const loadMore = async () => {
    if (visibleMessages.length < filteredMessages.length) {
      setVisibleCount(value => Math.min(value + 60, filteredMessages.length))
      return
    }
    if (!hasMore || !onLoadMore || loadingMore) return
    setLoadingMore(true)
    try {
      await onLoadMore()
    } finally {
      setLoadingMore(false)
    }
  }

  const submitRadio = async () => {
    const text = form.text.trim()
    if (!text || busy) return
    setBusy('send')
    setError('')
    try {
      const response = await fetch('/api/radio/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, text })
      })
      if (!response.ok) throw new Error('Failed to send message')
      setForm(value => ({ ...value, text: '', thread: '', replyTo: '' }))
      setComposeOpen(false)
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const promote = async (id: string) => {
    if (!id) return
    setBusy(`promote:${id}`)
    setError('')
    try {
      const response = await fetch('/api/radio/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (!response.ok) throw new Error('Failed to promote message')
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const startReply = (message: AnyRecord) => {
    setError('')
    setForm(value => ({
      ...value,
      text: '',
      to: textOf(message.from, 'all'),
      type: 'reply',
      project: textOf(message.project, value.project),
      thread: textOf(message.thread || message.id),
      replyTo: textOf(message.id)
    }))
    setComposeOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Panel (h2) rather than Card (CardTitle renders h3): /radio has a page h1, so
          a card title here skipped a heading level (WCAG 1.3.1). The "N 条消息" line
          becomes the header count pill and the partial-scope note becomes the footer.
          The body keeps its p-4 so the list's `-mx-4` bleed still lands on the edge. */}
      <Panel
        title={copy.recentRadio}
        count={`${filteredMessages.length} ${copy.messageCount}`}
        actions={
          /* Panel.tsx:9 — buttons in a panel header MUST be size="sm" (32px). */
          <Button size="sm" onClick={() => { setError(''); setComposeOpen(true) }}>
            <Send className="h-4 w-4" />
            {copy.broadcastMessage}
          </Button>
        }
        footer={hasMore && filteredMessages.length > 0 ? (
          // With the sentinel gate fixed, a short filtered result cannot scroll far
          // enough to auto-load the next page — so the ask has to be a real control.
          <>
            <span>{partialScopeNote}</span>
            <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? copy.loadingMore : copy.loadMore}</Button>
          </>
        ) : undefined}
        bodyClassName="flex flex-col gap-6"
      >
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="grid gap-2">
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="search" value={query} onChange={e => setQuery(e.target.value)} className="pl-8" placeholder={copy.searchPlaceholder} aria-label={copy.searchText} />
              </div>
            </div>

            {senderOptions.length > 0 && <div className="grid gap-2">
              <Label htmlFor="from-filter">{copy.from}</Label>
              <select
                id="from-filter"
                value={activeFromFilter}
                onChange={e => setFromFilter(e.target.value)}
                className={selectFieldClass}
              >
                <option value="">{copy.allSenders}</option>
                {senderOptions.map(option => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>}

            {recipientOptions.length > 0 && <div className="grid gap-2">
              <Label htmlFor="to-filter">{copy.to}</Label>
              <select
                id="to-filter"
                value={activeToFilter}
                onChange={e => setToFilter(e.target.value)}
                className={selectFieldClass}
              >
                <option value="">{copy.allRecipients}</option>
                {recipientOptions.map(option => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>}

            {typeOptions.length > 0 && <div className="grid gap-2">
              <Label htmlFor="type-filter">{copy.type}</Label>
              <select
                id="type-filter"
                value={activeTypeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className={selectFieldClass}
              >
                <option value="">{copy.allTypes}</option>
                {typeOptions.map(option => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>}

            {projectOptions.length > 0 && <div className="grid gap-2">
              <Label htmlFor="project-filter">{copy.project}</Label>
              <select
                id="project-filter"
                value={activeProjectFilter}
                onChange={e => setProjectFilter(e.target.value)}
                className={selectFieldClass}
              >
                <option value="">{copy.allProjects}</option>
                {projectOptions.map(option => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>}

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('')
                  setFromFilter('')
                  setToFilter('')
                  setTypeFilter('')
                  setProjectFilter('')
                }}
                className="w-full"
              >
                <X className="h-4 w-4" />
                {copy.clear}
              </Button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-sm border border-danger-line bg-danger-tint" role="alert">
              <AlertCircle className="w-4 h-4 text-danger shrink-0" />
              <p className="text-sm text-danger-text">{error}</p>
            </div>
          )}

          {/* Messages Stream */}
          <div className="-mx-4 border-t border-border">
            {filteredMessages.length ? (
            <div aria-live="polite" aria-busy={loadingMore}>
              <VirtualizedList
                items={visibleMessages}
                itemHeight={LIST_ROW_HEIGHT}
                getKey={(message, index) => textOf(message.id, `message-${index}`)}
                hasMore={visibleMessages.length < filteredMessages.length || hasMore}
                loading={loadingMore}
                loadingLabel={copy.loadingMore}
                onEndReached={() => void loadMore()}
                className="radio-virtual-list"
                renderItem={message => {
                const type = textOf(message.type, 'note')
                const from = textOf(message.from, '-')
                const to = textOf(message.to, '-')
                const text = textOf(message.text, '-')
                const project = textOf(message.project, '-')
                const thread = textOf(message.thread)
                const timestamp = textOf(message.ts || message.createdAt)
                const messageId = textOf(message.id)

                return (
                  <ListRow
                    onOpen={() => setSelectedMessage(message)}
                    ariaLabel={text}
                    leading={<TypeBadge type={type} />}
                    title={text}
                    subtitle={<span className="inline-flex items-center gap-2">{from} <span aria-hidden="true">→</span> {to}</span>}
                    meta={
                      <>
                        <Badge variant="secondary">{project}</Badge>
                        {thread ? <Badge variant="outline">#{thread}</Badge> : null}
                      </>
                    }
                    timestamp={timestamp}
                    actions={
                      <>
                        <Button variant="ghost" size="sm" onClick={() => startReply(message)} aria-label={copy.reply}>
                          <Reply className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === `promote:${messageId}`}
                          onClick={() => void promote(messageId)}
                          aria-label={copy.promoteToMemory}
                        >
                          <Star className="h-3 w-3" />
                        </Button>
                      </>
                    }
                  />
                )
                }}
              />
            </div>
            ) : hasMore ? (
              // Without this branch the list unmounts on an empty filter result, and with
              // it the end marker that is the only caller of `loadMore` — leaving "no
              // data" permanent while unsearched pages still sit on the server.
              <div aria-live="polite" aria-busy={loadingMore}>
                <EmptyState
                  title={copy.noMatchesInLoaded}
                  description={partialScopeNote}
                  action={<Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? copy.loadingMore : copy.loadMore}</Button>}
                />
              </div>
            ) : (
              <EmptyState title={copy.noData} />
            )}
          </div>
      </Panel>

      {/* Compose Dialog */}
      {selectedMessage ? (
        <Dialog open onOpenChange={open => { if (!open) setSelectedMessage(null) }}>
          <DialogContent className="radio-detail-dialog">
            <DialogHeader>
              <DialogTitle>{copy.message}</DialogTitle>
              <DialogDescription>{copy.message}</DialogDescription>
            </DialogHeader>
            <div className="radio-detail-content">
              <div className="radio-detail-route">
                <TypeBadge type={textOf(selectedMessage.type, 'note')} />
                <strong>{textOf(selectedMessage.from, '-')}</strong>
                <span aria-hidden="true">→</span>
                <strong>{textOf(selectedMessage.to, '-')}</strong>
                <time>{formatDate(textOf(selectedMessage.ts || selectedMessage.createdAt), 'compact')}</time>
              </div>
              <p className="radio-detail-text">{textOf(selectedMessage.text, '-')}</p>
              <div className="radio-detail-meta">
                <span>{copy.project}: {textOf(selectedMessage.project, '-')}</span>
                <span>{copy.thread}: {textOf(selectedMessage.thread || selectedMessage.id, '-')}</span>
              </div>
            </div>
            <DialogFooter className="radio-detail-actions">
              <DialogClose asChild><Button variant="outline">{copy.cancel}</Button></DialogClose>
              <Button onClick={() => { startReply(selectedMessage); setSelectedMessage(null) }}><Reply className="w-3 h-3 mr-1" />{copy.reply}</Button>
              <Button variant="outline" onClick={() => void promote(textOf(selectedMessage.id))}><Star className="w-3 h-3 mr-1" />{copy.promoteToMemory}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-2xl dialog-scroll-shell">
          <DialogHeader>
            <DialogTitle>{copy.broadcastMessage}</DialogTitle>
            <DialogDescription>{copy.broadcastMessage}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 dialog-scroll-body">
            <div className="grid gap-2">
              <Label htmlFor="message-text">{copy.message}</Label>
              <Textarea
                id="message-text"
                value={form.text}
                onChange={e => setForm(v => ({ ...v, text: e.target.value }))}
                rows={4}
                placeholder={copy.messagePlaceholder}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="message-from">{copy.from}</Label>
                <Input id="message-from" value={form.from} onChange={e => setForm(v => ({ ...v, from: e.target.value }))} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="message-to">{copy.to}</Label>
                <Input
                  id="message-to"
                  value={form.to}
                  onChange={e => setForm(v => ({ ...v, to: e.target.value }))}
                  list="radio-recipient-options"
                />
                <datalist id="radio-recipient-options">
                  {recipientOptions.map(to => (
                    <option value={to} key={to} />
                  ))}
                </datalist>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="message-type">{copy.type}</Label>
                <select
                  id="message-type"
                  value={form.type}
                  onChange={e => setForm(v => ({ ...v, type: e.target.value }))}
                  className={selectFieldClass}
                >
                  <option value="note">note</option>
                  <option value="reply">reply</option>
                  <option value="review">review</option>
                  <option value="handoff">handoff</option>
                  <option value="risk">risk</option>
                  <option value="request">request</option>
                  <option value="done">done</option>
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="message-project">{copy.project}</Label>
                <Input
                  id="message-project"
                  value={form.project}
                  onChange={e => setForm(v => ({ ...v, project: e.target.value }))}
                  list="radio-project-options"
                />
                <datalist id="radio-project-options">
                  {formProjectOptions.map(project => (
                    <option value={project} key={project} />
                  ))}
                </datalist>
              </div>
            </div>

            {(form.thread || form.replyTo) && (
              <div className="grid grid-cols-2 gap-4 p-3 rounded-sm bg-muted">
                <div>
                  <p className="text-sm font-medium">{copy.thread}</p>
                  <p className="text-sm text-muted-foreground">{form.thread || '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">{copy.replyTo}</p>
                  <p className="text-sm text-muted-foreground">{form.replyTo || '-'}</p>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-sm border border-danger-line bg-danger-tint" role="alert">
                <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                <p className="text-sm text-danger-text">{error}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">
                {copy.cancel}
              </Button>
            </DialogClose>
            <Button onClick={() => void submitRadio()} disabled={busy === 'send' || !form.text.trim()}>
              {busy === 'send' ? copy.running : copy.broadcastMessage}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    note: { variant: 'secondary' },
    reply: { variant: 'outline' },
    review: { variant: 'default' },
    handoff: { variant: 'default' },
    risk: { variant: 'destructive' },
    request: { variant: 'default' },
    done: { variant: 'outline' }
  }

  const config = variants[type] || variants.note
  return <Badge variant={config.variant}>{type}</Badge>
}
