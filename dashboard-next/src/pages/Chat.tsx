import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertTriangle, MessageSquare, Radio, Reply, Send } from 'lucide-react'
import type { AnyRecord } from '../lib/api'
import { apiGet, apiPost, asArray, asRecord, textOf } from '../lib/api'
import type { AppOutletContext } from '../lib/i18n'
import { dashboardLabels } from '../lib/dashboardCopy'
import { cn } from '../lib/utils'
import {
  AlertBanner,
  Card,
  ChartRow,
  MetricCard,
  MetricGrid,
  PageHead,
  SplitRow,
  ToolConnectionList
} from '@/components/ds'
import { EmptyState, ErrorState, LoadingState, Panel } from '../components/shell'
import { Button } from '../components/ui/button'
import { Input, fieldBaseStyles } from '../components/ui/input'
import { Label } from '../components/ui/label'

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
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const [messages, setMessages] = useState<Message[]>([])
  const [tools, setTools] = useState<ToolOption[]>([])
  const [toolsLoading, setToolsLoading] = useState(true)
  const [toolError, setToolError] = useState('')
  const [to, setTo] = useState('all')
  const [project, setProject] = useState('ai-memory-hub')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendErrors, setSendErrors] = useState(0)

  /* ---------------------------------------------------------- real fetch */
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

  /* --------------------------------------------------------- real action */
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
      setSendErrors(prev => prev + 1)
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

  const clearMessages = () => setMessages([])

  /* ----------------------------------------------- metrics DERIVED from data */
  const userCount = messages.filter(m => m.role === 'user').length
  const systemCount = messages.filter(m => m.role === 'system').length
  const errorCount = sendErrors + (toolError ? 1 : 0)

  // Cumulative message count over the session — a real series, never invented.
  const trend = useMemo(() => {
    const cum: number[] = []
    for (let i = 0; i < messages.length; i++) {
      cum.push(i + 1)
    }
    const pts = [0, ...cum]
    return pts.length >= 2 ? pts : [0, 0]
  }, [messages])

  const connTitle = t('已接入 Runner', 'Connected runners')

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <Button variant="ghost" onClick={toggleLanguage}>
            {copy.language}
          </Button>
        }
      />

      {toolError ? (
        <AlertBanner
          tone="warning"
          title={t('工具列表加载失败', 'Failed to load tools')}
          description={toolError}
        />
      ) : null}

      <MetricGrid>
        <MetricCard
          label={t('可用 Agent', 'Agents')}
          value={tools.length}
          icon={Radio}
          note={t('可发往的 Runner', 'Reachable runners')}
        />
        <MetricCard
          label={t('消息总数', 'Messages')}
          value={messages.length}
          icon={MessageSquare}
          spark={trend}
        />
        <MetricCard
          label={t('我方', 'Outgoing')}
          value={userCount}
          icon={Send}
          spark={trend}
        />
        <MetricCard
          label={t('系统回复', 'Replies')}
          value={systemCount}
          icon={Reply}
          spark={trend}
        />
        <MetricCard
          label={t('错误', 'Errors')}
          value={errorCount}
          icon={AlertTriangle}
          note={errorCount ? t('需关注', 'Needs attention') : t('运行正常', 'All clear')}
        />
      </MetricGrid>

      <ChartRow
        title={t('消息趋势', 'Message trend')}
        subtitle={t('会话累计消息数', 'Cumulative messages this session')}
        series={[{ label: t('累计消息', 'Cumulative'), points: trend }]}
        donutTitle={t('角色分布', 'Role split')}
        donutCenter={messages.length}
        donutCenterLabel={t('消息', 'messages')}
        segments={[
          { label: t('我方', 'Outgoing'), value: userCount, tone: 'info' },
          { label: t('系统', 'System'), value: systemCount, tone: 'success' }
        ]}
      />

      <SplitRow
        stream={
          <Panel
            title={t('对话', 'Conversation')}
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearMessages}
                  disabled={loading || messages.length === 0}
                >
                  {t('清空', 'Clear')}
                </Button>
                <Button size="sm" onClick={handleSend} disabled={loading || !input.trim()}>
                  {loading ? copy.sending : copy.send}
                </Button>
              </>
            }
            flushBody
            className="h-[60vh] min-h-[420px]"
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
                        : 'self-start border-line bg-surface-sunk'
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
        }
        side={
          toolsLoading ? (
            <Card title={connTitle}>
              <LoadingState variant="rows" label={copy.loadingTools} className="p-4" />
            </Card>
          ) : toolError ? (
            <Card title={connTitle}>
              <ErrorState variant="inline" title={toolError} className="p-4" />
            </Card>
          ) : tools.length ? (
            <ToolConnectionList
              title={connTitle}
              items={tools.map(tool => ({ name: tool.label, meta: tool.name }))}
            />
          ) : (
            <Card title={connTitle}>
              <EmptyState title={copy.toolsUnavailable} />
            </Card>
          )
        }
      />
    </div>
  )
}
