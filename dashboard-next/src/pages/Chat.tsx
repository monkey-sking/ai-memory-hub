import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AnyRecord } from '../lib/api'
import { apiPost, asRecord, textOf } from '../lib/api'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import './Chat.css'

interface Message {
  id: string
  role: 'user' | 'system'
  content: string
  timestamp: Date
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
}> = {
  zh: {
    title: '对话',
    language: 'English',
    empty: '暂无消息',
    placeholder: '输入消息',
    send: '发送',
    sending: '发送中',
    to: '发往',
    project: '项目'
  },
  en: {
    title: 'Chat',
    language: '中文',
    empty: 'No messages',
    placeholder: 'Type a message',
    send: 'Send',
    sending: 'Sending',
    to: 'To',
    project: 'Project'
  }
}

export default function Chat() {
  const { language, toggleLanguage } = useOutletContext<AppOutletContext>()
  const copy = chatLabels[language]
  const [messages, setMessages] = useState<Message[]>([])
  const [to, setTo] = useState('claude')
  const [project, setProject] = useState('ai-memory-hub')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

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
        content: `radio:${textOf(message.id, 'sent')} -> ${to}`,
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
          <label>
            <span>{copy.to}</span>
            <select value={to} onChange={event => setTo(event.target.value)}>
              <option value="claude">claude</option>
              <option value="codex">codex</option>
              <option value="gemini">gemini</option>
              <option value="marvis">marvis</option>
              <option value="openclaw">openclaw</option>
            </select>
          </label>
          <label>
            <span>{copy.project}</span>
            <input value={project} onChange={event => setProject(event.target.value)} />
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
