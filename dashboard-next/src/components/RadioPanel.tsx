import { useState, useMemo, type KeyboardEvent, type MouseEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Send, Search, X, AlertCircle, Clock, Reply, Star } from 'lucide-react'
import type { AnyRecord } from '@/lib/api'

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
  }
  onRefresh: () => Promise<void>
}

function textOf(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function uniqueSorted(items: string[]): string[] {
  return Array.from(new Set(items)).sort()
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

export function RadioPanel({ radio, visibleProjects, copy, onRefresh }: RadioPanelProps) {
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
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{copy.recentRadio}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">共 {filteredMessages.length} 条消息</p>
            </div>
            <Button onClick={() => { setError(''); setComposeOpen(true) }}>
              <Send className="w-4 h-4 mr-2" />
              {copy.broadcastMessage}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
            <div className="space-y-2">
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="search" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" placeholder={copy.searchPlaceholder} aria-label={copy.searchText} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="from-filter">{copy.from}</Label>
              <select
                id="from-filter"
                value={activeFromFilter}
                onChange={e => setFromFilter(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">{copy.allSenders}</option>
                {senderOptions.map(option => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="to-filter">{copy.to}</Label>
              <select
                id="to-filter"
                value={activeToFilter}
                onChange={e => setToFilter(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">{copy.allRecipients}</option>
                {recipientOptions.map(option => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type-filter">{copy.type}</Label>
              <select
                id="type-filter"
                value={activeTypeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">{copy.allTypes}</option>
                {typeOptions.map(option => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-filter">{copy.project}</Label>
              <select
                id="project-filter"
                value={activeProjectFilter}
                onChange={e => setProjectFilter(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">{copy.allProjects}</option>
                {projectOptions.map(option => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

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
                <X className="w-4 h-4 mr-2" />
                {copy.clear}
              </Button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg border border-destructive/20 bg-destructive/10">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Messages Stream */}
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {filteredMessages.length ? (
              filteredMessages.map((message, idx) => {
                const type = textOf(message.type, 'note')
                const from = textOf(message.from, '-')
                const to = textOf(message.to, '-')
                const text = textOf(message.text, '-')
                const project = textOf(message.project, '-')
                const thread = textOf(message.thread)
                const timestamp = textOf(message.ts || message.createdAt)
                const messageId = textOf(message.id)

                return (
                  <div className="radio-message-row" role="button" tabIndex={0} onClick={(event: MouseEvent<HTMLDivElement>) => { if (!(event.target as HTMLElement).closest('button, a, input, textarea, select')) setSelectedMessage(message) }} onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) setSelectedMessage(message) }}><Card key={messageId || idx} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <TypeBadge type={type} />
                            <span className="text-sm text-muted-foreground">
                              {from} → {to}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {formatDate(timestamp)}
                          </div>
                        </div>

                        {/* Message Text */}
                        <p className="text-sm">{text}</p>

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{project}</Badge>
                            {thread && <Badge variant="outline">#{thread}</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => startReply(message)}>
                              <Reply className="w-3 h-3 mr-1" />
                              {copy.reply}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy === `promote:${messageId}`}
                              onClick={() => void promote(messageId)}
                            >
                              <Star className="w-3 h-3 mr-1" />
                              {copy.promoteToMemory}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                )
              })
            ) : (
              <div className="text-center text-muted-foreground py-8">{copy.noData}</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Compose Dialog */}
      {selectedMessage ? <Dialog open onOpenChange={open => { if (!open) setSelectedMessage(null) }}><DialogContent className="radio-detail-dialog"><DialogHeader><DialogTitle>{copy.message}</DialogTitle></DialogHeader><div className="radio-detail-content"><div className="radio-detail-route"><TypeBadge type={textOf(selectedMessage.type, 'note')} /><strong>{textOf(selectedMessage.from, '-')}</strong><span>→</span><strong>{textOf(selectedMessage.to, '-')}</strong><time>{formatDate(textOf(selectedMessage.ts || selectedMessage.createdAt))}</time></div><p className="radio-detail-text">{textOf(selectedMessage.text, '-')}</p><div className="radio-detail-meta"><span>{copy.project}: {textOf(selectedMessage.project, '-')}</span><span>{copy.thread}: {textOf(selectedMessage.thread || selectedMessage.id, '-')}</span></div><div className="radio-detail-actions"><Button onClick={() => { startReply(selectedMessage); setSelectedMessage(null) }}><Reply className="w-3 h-3 mr-1" />{copy.reply}</Button><Button variant="outline" onClick={() => void promote(textOf(selectedMessage.id))}><Star className="w-3 h-3 mr-1" />{copy.promoteToMemory}</Button></div></div></DialogContent></Dialog> : null}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy.broadcastMessage}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="message-text">{copy.message}</Label>
              <Textarea
                id="message-text"
                value={form.text}
                onChange={e => setForm(v => ({ ...v, text: e.target.value }))}
                rows={4}
                placeholder="输入消息内容..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="message-from">{copy.from}</Label>
                <Input id="message-from" value={form.from} onChange={e => setForm(v => ({ ...v, from: e.target.value }))} />
              </div>

              <div className="space-y-2">
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

              <div className="space-y-2">
                <Label htmlFor="message-type">{copy.type}</Label>
                <select
                  id="message-type"
                  value={form.type}
                  onChange={e => setForm(v => ({ ...v, type: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
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

              <div className="space-y-2">
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
              <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-muted">
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
              <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/10">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>
              {copy.cancel}
            </Button>
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
