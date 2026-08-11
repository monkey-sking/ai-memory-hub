import { useState } from 'react'
import { EmptyState, Panel, SheetRawBlock } from '@/components/shell'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input, fieldBaseStyles } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from './ui/dialog'
import { RelatedEntities } from './RelatedEntities'
import { Plus, AlertCircle, Tag, User, RefreshCw } from 'lucide-react'
import type { AnyRecord } from '@/lib/api'
import type { AppLanguage } from '@/lib/i18n'
import { formatDate, formatRelativeTime } from '@/lib/api'
import { cn } from '@/lib/utils'
import { VirtualizedList } from './VirtualizedList'
import { ListRow, LIST_ROW_HEIGHT } from './ListRow'

interface MemoryPanelProps {
  memory: AnyRecord
  copy: {
    memorySnapshot: string
    recordMemory: string
    pendingEvents: string
    profile: string
    memoryRecords: string
    memoryOverview: string
    supersedeMemory: string
    memoryText: string
    kind: string
    source: string
    cancel: string
    save: string
    close: string
    id: string
    time: string
    running: string
    noData: string
    project: string
    refreshing: string
    loadingMore: string
  }
  onRefresh: () => Promise<void>
  hasMore?: boolean
  onLoadMore?: () => Promise<void>
  language: AppLanguage
}

function textOf(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  return []
}

function asRecord(value: unknown): AnyRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as AnyRecord
  return {}
}

function formatNumber(value: unknown): string {
  const num = Number(value)
  return Number.isNaN(num) ? String(value) : num.toLocaleString()
}

export function MemoryPanel({ memory, copy, onRefresh, hasMore = false, onLoadMore, language }: MemoryPanelProps) {
  const locale = language === 'zh' ? 'zh-CN' : 'en'
  const pending = asArray<AnyRecord>(memory.pending)
  const memoryRecords = asArray<AnyRecord>(memory.records)
  const [text, setText] = useState('')
  const [kind, setKind] = useState('note')
  const [source, setSource] = useState('dashboard-next')
  const [recordOpen, setRecordOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<AnyRecord | null>(null)
  const [supersedeTarget, setSupersedeTarget] = useState<AnyRecord | null>(null)
  const [supersedeText, setSupersedeText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [visibleCount, setVisibleCount] = useState(60)
  const [loadingMore, setLoadingMore] = useState(false)

  const visibleRecords = memoryRecords.slice(0, visibleCount)
  const loadMore = async () => {
    if (visibleRecords.length < memoryRecords.length) {
      setVisibleCount(value => Math.min(value + 60, memoryRecords.length))
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

  const submitMemory = async () => {
    const nextText = text.trim()
    if (!nextText || saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: nextText, kind, source })
      })
      if (!response.ok) throw new Error('Failed to save memory')
      setText('')
      await onRefresh()
      setRecordOpen(false)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setSaving(false)
    }
  }

  const openSupersede = (record: AnyRecord) => {
    setError('')
    setSupersedeTarget(record)
    setSupersedeText(textOf(record.text))
  }

  const supersedeMemory = async () => {
    const target = asRecord(supersedeTarget)
    const metadata = asRecord(target.metadata)
    const nextText = supersedeText.trim()
    const targetId = textOf(target.localEventId || target.id)
    if (!targetId || !nextText || saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/memory/supersede', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetId,
          text: nextText,
          kind: textOf(target.kind || metadata.kind, 'note'),
          project: textOf(target.project || metadata.project),
          source,
          supersedes: textOf(metadata.supersedes)
        })
      })
      if (!response.ok) throw new Error('Failed to supersede memory')
      setSupersedeTarget(null)
      setSupersedeText('')
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Memory Snapshot */}
        <Panel title={copy.memoryOverview} className="lg:col-span-2">
          {/* Raw markdown snapshot — collapse it (per shell SheetRawBlock intent:
              stops a giant <pre> from being the panel's primary content). */}
          <SheetRawBlock label={`${copy.memoryOverview} (Markdown)`}>
            {textOf(memory.memory, copy.noData)}
          </SheetRawBlock>
        </Panel>

        {/* Right Sidebar */}
        <div className="flex flex-col gap-6">
          {/* Record Memory Button */}
          <Panel>
            <Button onClick={() => { setError(''); setRecordOpen(true) }} className="w-full">
              <Plus className="h-4 w-4" />
              {copy.recordMemory}
            </Button>
          </Panel>

          {/* Pending Events */}
          <Panel title={copy.pendingEvents}>
            <div className="text-3xl font-bold text-warning">
              {formatNumber(pending.length)}
            </div>
          </Panel>

          {/* Profile */}
          <Panel title={copy.profile}>
            <SheetRawBlock label={`${copy.profile} (Markdown)`}>
              {textOf(memory.profile, copy.noData)}
            </SheetRawBlock>
          </Panel>
        </div>
      </div>

      {/* Memory Records */}
      <Panel title={copy.memoryRecords} flushBody>
        {memoryRecords.length ? (
          <div aria-busy={loadingMore}>
          <VirtualizedList
            items={visibleRecords}
            itemHeight={LIST_ROW_HEIGHT}
            getKey={(record, index) => textOf(record.localEventId || record.id, `memory-${index}`)}
            hasMore={visibleRecords.length < memoryRecords.length || hasMore}
            loading={loadingMore}
            loadingLabel={copy.loadingMore}
            onEndReached={() => void loadMore()}
            className="memory-virtual-list"
            renderItem={record => {
              const metadata = asRecord(record.metadata)
              const kindValue = textOf(record.kind || metadata.kind, 'note')
              const sourceValue = textOf(record.source, '-')
              const timestamp = textOf(record.ts || record.indexedAt)
              const project = textOf(record.project || metadata.project)

              return (
                <ListRow
                  onOpen={() => setSelectedRecord(record)}
                  ariaLabel={textOf(record.text, copy.memoryRecords)}
                  leading={<KindBadge kind={kindValue} />}
                  title={textOf(record.text, '-')}
                  subtitle={
                    <span className="inline-flex items-center gap-2">
                      <User className="h-3 w-3 shrink-0" />
                      {sourceValue}
                      {project ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <Tag className="h-3 w-3 shrink-0" />
                          {project}
                        </>
                      ) : null}
                      {timestamp ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <time dateTime={timestamp}>{formatRelativeTime(timestamp, locale)}</time>
                        </>
                      ) : null}
                    </span>
                  }
                  actions={
                    <Button variant="ghost" size="sm" onClick={() => openSupersede(record)} aria-label={copy.supersedeMemory}>
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  }
                />
              )
            }}
          />
          </div>
        ) : (
          <EmptyState title={copy.noData} />
        )}
      </Panel>

      {selectedRecord ? <Dialog open onOpenChange={open => { if (!open) setSelectedRecord(null) }}>
        <DialogContent className="memory-detail-dialog" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{textOf(selectedRecord.kind, copy.memoryRecords)} · {formatDate(textOf(selectedRecord.ts || selectedRecord.indexedAt), 'compact')}</DialogTitle></DialogHeader>
          <div className="memory-detail-content">
            <div className="memory-detail-meta"><KindBadge kind={textOf(selectedRecord.kind, 'note')} /><span>{textOf(selectedRecord.source, '-')}</span><span>{textOf(selectedRecord.project || asRecord(selectedRecord.metadata).project, '-')}</span><RelatedEntities entityType="memory" entityId={textOf(selectedRecord.localEventId || selectedRecord.id)} /></div>
            <p className="memory-detail-text">{textOf(selectedRecord.text, '-')}</p>
            <dl className="memory-detail-grid"><div><dt>{copy.id}</dt><dd>{textOf(selectedRecord.localEventId || selectedRecord.id, '-')}</dd></div><div><dt>{copy.time}</dt><dd>{formatDate(textOf(selectedRecord.ts || selectedRecord.indexedAt), 'compact')}</dd></div><div><dt>{copy.source}</dt><dd>{textOf(selectedRecord.source, '-')}</dd></div><div><dt>{copy.project}</dt><dd>{textOf(selectedRecord.project || asRecord(selectedRecord.metadata).project, '-')}</dd></div></dl>
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline">{copy.close}</Button></DialogClose><Button onClick={() => { setSelectedRecord(null); openSupersede(selectedRecord) }}><RefreshCw className="mr-2 h-3.5 w-3.5" />{copy.supersedeMemory}</Button></DialogFooter>
        </DialogContent>
      </Dialog> : null}
      {/* Record Memory Dialog */}
      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="dialog-scroll-shell">
          <DialogHeader>
            <DialogTitle>{copy.recordMemory}</DialogTitle>
            <DialogDescription>{copy.memoryText}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 dialog-scroll-body">
            <div className="grid gap-2">
              <Label htmlFor="memory-text">{copy.memoryText}</Label>
              <Textarea
                id="memory-text"
                value={text}
                onChange={e => setText(e.target.value)}
                rows={5}
                placeholder={copy.memoryText}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="memory-kind">{copy.kind}</Label>
                <select
                  id="memory-kind"
                  value={kind}
                  onChange={e => setKind(e.target.value)}
                  className={cn(fieldBaseStyles, 'flex h-9 px-3 py-0')}
                >
                  <option value="preference">preference</option>
                  <option value="workflow">workflow</option>
                  <option value="project">project</option>
                  <option value="correction">correction</option>
                  <option value="note">note</option>
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="memory-source">{copy.source}</Label>
                <Input
                  id="memory-source"
                  value={source}
                  onChange={e => setSource(e.target.value)}
                />
              </div>
            </div>

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
            <Button onClick={() => void submitMemory()} disabled={saving || !text.trim()}>
              {saving ? copy.running : copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supersede Memory Dialog */}
      {supersedeTarget && (
        <Dialog open={!!supersedeTarget} onOpenChange={() => setSupersedeTarget(null)}>
          <DialogContent className="dialog-scroll-shell">
            <DialogHeader>
              <DialogTitle>{copy.supersedeMemory}</DialogTitle>
              <DialogDescription>{copy.memoryText}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 dialog-scroll-body">
              <div className="grid gap-2">
                <Label htmlFor="supersede-text">{copy.memoryText}</Label>
                <Textarea
                  id="supersede-text"
                  value={supersedeText}
                  onChange={e => setSupersedeText(e.target.value)}
                  rows={6}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="supersede-source">{copy.source}</Label>
                <Input
                  id="supersede-source"
                  value={source}
                  onChange={e => setSource(e.target.value)}
                />
              </div>

              <div className="p-3 rounded-sm bg-muted">
                <p className="text-sm">
                  <span className="font-medium">ID:</span>{' '}
                  {textOf(supersedeTarget.localEventId || supersedeTarget.id, '-')}
                </p>
              </div>

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
            <Button onClick={() => void supersedeMemory()} disabled={saving || !supersedeText.trim()}>
              {saving ? copy.running : copy.supersedeMemory}
            </Button>
          </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function KindBadge({ kind }: { kind: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    preference: { variant: 'default' },
    workflow: { variant: 'default' },
    project: { variant: 'secondary' },
    correction: { variant: 'destructive' },
    note: { variant: 'outline' }
  }

  const config = variants[kind] || variants.note
  return <Badge variant={config.variant}>{kind}</Badge>
}
