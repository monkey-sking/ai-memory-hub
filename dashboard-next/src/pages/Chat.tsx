import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import type { AnyRecord } from '../lib/api'
import { apiGet, apiPost, asArray, asRecord, textOf } from '../lib/api'
import type { AppOutletContext } from '../lib/i18n'
import { dashboardLabels } from '../lib/dashboardCopy'
import { EmptyState, ErrorState, LoadingState, PageShell, Panel } from '../components/shell'
import { Button } from '../components/ui/button'
import { Input, fieldBaseStyles } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { cn } from '../lib/utils'

interface Message {
  id: string
  role: 'user' | 'system'
  content: string
  timestamp: Date
}

interface ToolOption {
  name: string
  label: string
}

function formatToolOptions(payload: AnyRecord): ToolOption[] {
  return asArray<AnyRecord>(payload.tools)
    .map(tool => {
      const name = textOf(tool.name).trim()
      const label = textOf(tool.displayName || tool.label || tool.name).trim()
      return name ? { name, label: label || name } : null
    })
    .filter((tool): tool is ToolOption => Boolean(tool))
}

function formatRadioReceipt(message: AnyRecord, fallbackTo: string): string {
  const id = textOf(message.id, 'sent')
  const recipient = textOf(message.to, fallbackTo || 'all')
  const messageText = textOf(message.text).trim()
  const returnedText = textOf(message.reply || message.response || message.result || messageText).trim()

  return returnedText ? `radio:${id} -> ${recipient}\n${returnedText}` : `radio:${id} -> ${recipient}`
}

export default function Chat() {
  const { language, toggleLanguage } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language].chat
  const [messages, setMessages] = useState<Message[]>([])
  const [tools, setTools] = useState<ToolOption[]>([])
  const [toolsLoading, setToolsLoading] = useState(true)
  const [toolError, setToolError] = useState('')
  const [to, setTo] = useState('all')
  const [project, setProject] = useState('ai-memory-hub')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true

    apiGet<AnyRecord>('/api/tools')
      .then(payload => {
        if (!active) return
        const nextTools = formatToolOptions(payload)
        setTools(nextTools)
        setToolError('')
        setTo(current => current === 'all' && nextTools[0] ? nextTools[0].name : current)
      })
      .catch(error => {
        if (!active) return
        setTools([])
        setToolError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (active) setToolsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const handleSend = async () => {
    const content = input.trim()
    if (!content || loading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const result = await apiPost<AnyRecord>('/api/radio/send', {
        from: 'dashboard-next',
        to,
        type: 'request',
        project,
        text: content
      })
      const message = asRecord(result.message)
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: formatRadioReceipt(message, to),
        timestamp: new Date()
      }])
    } catch (error) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageShell
      title={copy.title}
      description={copy.subtitle}
      actions={
        /* Language is a page-level preference, not an action on the Agent Radio
           panel, so it lives in the PageShell action row at the default 36px —
           a panel header would require `size="sm"` (32px). */
        <Button variant="ghost" onClick={toggleLanguage}>
          {copy.language}
        </Button>
      }
    >
      <Panel
        title="Agent Radio"
        toolbar={
          <>
            {tools.length ? (
              <>
                <Label htmlFor="chat-to" className="shrink-0">{copy.to}</Label>
                <select
                  id="chat-to"
                  value={to}
                  onChange={event => setTo(event.target.value)}
                  className={cn(fieldBaseStyles, 'h-8 w-auto min-w-40 shrink-0 px-2 py-0')}
                >
                  {tools.map(tool => (
                    <option key={tool.name} value={tool.name}>{tool.label}</option>
                  ))}
                </select>
              </>
            ) : toolsLoading ? (
              <LoadingState
                size="sm"
                label={copy.loadingTools}
                className="shrink-0 flex-row gap-2 py-0 text-sm"
              />
            ) : toolError ? (
              <ErrorState variant="inline" title={toolError} className="min-w-0 py-1" />
            ) : (
              <span role="status" className="shrink-0 text-sm text-ink-3">{copy.toolsUnavailable}</span>
            )}
            <Label htmlFor="chat-project" className="ml-2 shrink-0">{copy.project}</Label>
            <Input
              id="chat-project"
              value={project}
              onChange={event => setProject(event.target.value)}
              className="h-8 w-auto max-w-56 min-w-0 px-2"
            />
          </>
        }
        footer={
          <>
            <Input
              type="text"
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && handleSend()}
              placeholder={copy.placeholder}
              aria-label={copy.placeholder}
              disabled={loading}
              className="h-8 min-w-0 flex-1 px-2"
            />
            <Button size="sm" onClick={handleSend} disabled={loading || !input.trim()}>
              {loading ? copy.sending : copy.send}
            </Button>
          </>
        }
        flushBody
        /* The body is the panel's only scroll container, so the panel needs a
           bounded height: the app shell's `<main>` scrolls on content, and
           without this the message list would grow the page instead of the
           stream. The subtrahend is the chrome above and below it (topbar +
           shell and main padding, plus the PageShell heading block and its
           24px gap), rounded up so the page itself never scrolls too. Below
           `sm` the heading block stacks above the action row instead of
           sitting beside it, which costs another 16px. */
        className="h-[calc(100svh-16rem)] min-h-96 sm:h-[calc(100svh-15rem)]"
      >
        {messages.length ? (
          <div className="flex flex-col gap-3 p-4">
            {messages.map(message => (
              <div
                key={message.id}
                className={cn(
                  'flex max-w-[min(760px,86%)] flex-col gap-1.5 rounded-md border px-3.5 py-3',
                  message.role === 'user'
                    ? 'self-end border-accent-line bg-accent-tint'
                    : 'self-start border-line bg-fill'
                )}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink wrap-anywhere">
                  {message.content}
                </p>
                <time dateTime={message.timestamp.toISOString()} className="text-xs text-ink-3">{message.timestamp.toLocaleTimeString()}</time>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            className="h-full"
            icon={<MessageSquare className="h-5 w-5" />}
            title={copy.empty}
          />
        )}
      </Panel>
    </PageShell>
  )
}
