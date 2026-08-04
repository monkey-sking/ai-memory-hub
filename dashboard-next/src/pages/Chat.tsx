import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AnyRecord } from '../lib/api'
import { apiGet, apiPost, asArray, asRecord, textOf } from '../lib/api'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import './Chat.css'

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

const chatLabels: Record<AppLanguage, {
  title: string
  language: string
  empty: string
  placeholder: string
  send: string
  sending: string
  to: string
  project: string
  toolsUnavailable: string
}> = {
  zh: {
    title: '对话',
    language: 'English',
    empty: '暂无消息',
    placeholder: '输入消息',
    send: '发送',
    sending: '发送中',
    to: '发往',
    project: '项目',
    toolsUnavailable: '暂无可选工具'
  },
  en: {
    title: 'Chat',
    language: '中文',
    empty: 'No messages',
    placeholder: 'Type a message',
    send: 'Send',
    sending: 'Sending',
    to: 'To',
    project: 'Project',
    toolsUnavailable: 'No tools available'
  }
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
  const copy = chatLabels[language]
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
    <div className="chat-page">
      <header className="chat-header">
        <div>
          <p className="eyebrow">Agent Radio</p>
          <h2>{copy.title}</h2>
        </div>
        <button className="btn ghost" type="button" onClick={toggleLanguage}>
          {copy.language}
        </button>
      </header>

      <section className="chat-shell">
        <div className="chat-toolbar">
          {tools.length ? (
            <label htmlFor="chat-to">
              <span>{copy.to}</span>
              <select id="chat-to" value={to} onChange={event => setTo(event.target.value)}>
                {tools.map(tool => (
                  <option key={tool.name} value={tool.name}>{tool.label}</option>
                ))}
              </select>
            </label>
          ) : toolsLoading ? (
            <div className="chat-tool-empty" role="status" aria-live="polite">
              <span className="chat-loading-dot" aria-hidden="true" />
              {language === 'zh' ? '正在加载可用工具…' : 'Loading available tools…'}
            </div>
          ) : (
            <div className="chat-tool-empty" role={toolError ? 'alert' : 'status'}>
              {toolError || copy.toolsUnavailable}
            </div>
          )}
          <label htmlFor="chat-project">
            <span>{copy.project}</span>
            <input id="chat-project" value={project} onChange={event => setProject(event.target.value)} />
          </label>
        </div>

        <div className="chat-messages">
          {messages.length ? messages.map(message => (
            <div key={message.id} className={`message ${message.role}`}>
              <div className="message-content">{message.content}</div>
              <time>{message.timestamp.toLocaleTimeString()}</time>
            </div>
          )) : (
            <div className="chat-empty">{copy.empty}</div>
          )}
        </div>

        <div className="chat-input">
          <input
            type="text"
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && handleSend()}
            placeholder={copy.placeholder}
            disabled={loading}
          />
          <button type="button" onClick={handleSend} disabled={loading || !input.trim()}>
            {loading ? copy.sending : copy.send}
          </button>
        </div>
      </section>
    </div>
  )
}
