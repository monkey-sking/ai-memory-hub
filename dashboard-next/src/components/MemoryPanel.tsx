import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Plus, AlertCircle, Clock, Tag, User, RefreshCw } from 'lucide-react'
import type { AnyRecord } from '@/lib/api'
import { VirtualizedList } from './VirtualizedList'

interface MemoryPanelProps {
  memory: AnyRecord
  copy: {
    memorySnapshot: string
    recordMemory: string
    pendingEvents: string
    profile: string
    memoryRecords: string
    supersedeMemory: string
    memoryText: string
    kind: string
    source: string
    cancel: string
    save: string
    running: string
    noData: string
  }
  onRefresh: () => Promise<void>
  hasMore?: boolean
  onLoadMore?: () => Promise<void>
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

function formatDate(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatNumber(value: unknown): string {
  const num = Number(value)
  return Number.isNaN(num) ? String(value) : num.toLocaleString()
}

export function MemoryPanel({ memory, copy, onRefresh, hasMore = false, onLoadMore }: MemoryPanelProps) {
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

  useEffect(() => {
    setVisibleCount(60)
  }, [memoryRecords.length])

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
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Memory Snapshot */}
        <Card className="lg:col-span-2">
          <CardHeader className="border-b">
            <CardTitle>记忆总览</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <pre className="text-sm bg-muted p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
              {textOf(memory.memory, copy.noData)}
            </pre>
          </CardContent>
        </Card>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Record Memory Button */}
          <Card>
            <CardContent className="pt-6">
              <Button onClick={() => { setError(''); setRecordOpen(true) }} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                {copy.recordMemory}
              </Button>
            </CardContent>
          </Card>

          {/* Pending Events */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {copy.pendingEvents}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-bold text-yellow-500">
                  {formatNumber(pending.length)}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Profile */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-sm">{copy.profile}</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap">
                {textOf(memory.profile, copy.noData)}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Memory Records */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>记忆记录</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {memoryRecords.length ? (
            <VirtualizedList
              items={visibleRecords}
              itemHeight={190}
              getKey={(record, index) => textOf(record.localEventId || record.id, `memory-${index}`)}
              hasMore={visibleRecords.length < memoryRecords.length || hasMore}
              loading={loadingMore}
              onEndReached={() => void loadMore()}
              className="memory-virtual-list"
              renderItem={record => {
                const metadata = asRecord(record.metadata)
                const kindValue = textOf(record.kind || metadata.kind, 'note')
                const sourceValue = textOf(record.source, '-')
                const timestamp = textOf(record.ts || record.indexedAt)
                const project = textOf(record.project || metadata.project)
                const supersedes = textOf(metadata.supersedes)

                return (
                  <div className="memory-record-item" role="button" tabIndex={0} onClick={(event: React.MouseEvent<HTMLDivElement>) => { if (!(event.target as HTMLElement).closest('button, a, input, textarea, select')) setSelectedRecord(record) }} onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) setSelectedRecord(record) }}><Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <KindBadge kind={kindValue} />
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <User className="w-3 h-3" />
                              {sourceValue}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {formatDate(timestamp)}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openSupersede(record)}
                            className="shrink-0"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                        </div>

                        {/* Text */}
                        <p className="text-sm line-clamp-3">{textOf(record.text, '-')}</p>

                        {/* Footer Tags */}
                        {(project || supersedes) && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {project && (
                              <div className="flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded">
                                <Tag className="w-3 h-3" />
                                {project}
                              </div>
                            )}
                            {supersedes && (
                              <div className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded">
                                <RefreshCw className="w-3 h-3" />
                                {supersedes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card></div>
                )
              }}
            />
          ) : (
            <div className="text-center text-muted-foreground py-8">{copy.noData}</div>
          )}
        </CardContent>
      </Card>

      {selectedRecord ? <Dialog open onOpenChange={open => { if (!open) setSelectedRecord(null) }}>
        <DialogContent className="memory-detail-dialog">
          <DialogHeader><DialogTitle>{textOf(selectedRecord.kind, copy.memoryRecords)} · {formatDate(textOf(selectedRecord.ts || selectedRecord.indexedAt))}</DialogTitle></DialogHeader>
          <div className="memory-detail-content">
            <div className="memory-detail-meta"><KindBadge kind={textOf(selectedRecord.kind, 'note')} /><span>{textOf(selectedRecord.source, '-')}</span><span>{textOf(selectedRecord.project || asRecord(selectedRecord.metadata).project, '-')}</span></div>
            <p className="memory-detail-text">{textOf(selectedRecord.text, '-')}</p>
            <dl className="memory-detail-grid"><div><dt>ID</dt><dd>{textOf(selectedRecord.localEventId || selectedRecord.id, '-')}</dd></div><div><dt>时间</dt><dd>{formatDate(textOf(selectedRecord.ts || selectedRecord.indexedAt))}</dd></div><div><dt>来源</dt><dd>{textOf(selectedRecord.source, '-')}</dd></div><div><dt>项目</dt><dd>{textOf(selectedRecord.project || asRecord(selectedRecord.metadata).project, '-')}</dd></div></dl>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSelectedRecord(null)}>关闭</Button><Button onClick={() => { setSelectedRecord(null); openSupersede(selectedRecord) }}><RefreshCw className="mr-2 h-3.5 w-3.5" />{copy.supersedeMemory}</Button></DialogFooter>
        </DialogContent>
      </Dialog> : null}
      {/* Record Memory Dialog */}
      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.recordMemory}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="memory-text">{copy.memoryText}</Label>
              <Textarea
                id="memory-text"
                value={text}
                onChange={e => setText(e.target.value)}
                rows={5}
                placeholder="输入记忆内容..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="memory-kind">{copy.kind}</Label>
                <select
                  id="memory-kind"
                  value={kind}
                  onChange={e => setKind(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="preference">preference</option>
                  <option value="workflow">workflow</option>
                  <option value="project">project</option>
                  <option value="correction">correction</option>
                  <option value="note">note</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="memory-source">{copy.source}</Label>
                <Input
                  id="memory-source"
                  value={source}
                  onChange={e => setSource(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/10">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordOpen(false)}>
              {copy.cancel}
            </Button>
            <Button onClick={() => void submitMemory()} disabled={saving || !text.trim()}>
              {saving ? copy.running : copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supersede Memory Dialog */}
      {supersedeTarget && (
        <Dialog open={!!supersedeTarget} onOpenChange={() => setSupersedeTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{copy.supersedeMemory}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="supersede-text">{copy.memoryText}</Label>
                <Textarea
                  id="supersede-text"
                  value={supersedeText}
                  onChange={e => setSupersedeText(e.target.value)}
                  rows={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supersede-source">{copy.source}</Label>
                <Input
                  id="supersede-source"
                  value={source}
                  onChange={e => setSource(e.target.value)}
                />
              </div>

              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm">
                  <span className="font-medium">ID:</span>{' '}
                  {textOf(supersedeTarget.localEventId || supersedeTarget.id, '-')}
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/10">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSupersedeTarget(null)}>
                {copy.cancel}
              </Button>
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
