export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed'

type RealtimeEnvelope = {
  type?: unknown
  snapshot?: unknown
}

type RealtimeOptions = {
  onSnapshot: (snapshot: Record<string, unknown>) => void
  onStatus?: (status: RealtimeStatus) => void
  reconnectBaseMs?: number
  reconnectMaxMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getRealtimeUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

export function createDashboardRealtimeClient({
  onSnapshot,
  onStatus,
  reconnectBaseMs = 250,
  reconnectMaxMs = 5000
}: RealtimeOptions) {
  let socket: WebSocket | null = null
  let reconnectTimer: number | null = null
  let reconnectAttempt = 0
  let closed = false
  let connectionId = 0

  const notifyStatus = (status: RealtimeStatus) => {
    onStatus?.(status)
  }

  const clearReconnectTimer = () => {
    if (reconnectTimer === null) return
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const scheduleReconnect = () => {
    if (closed || reconnectTimer !== null) return
    const delay = Math.min(reconnectMaxMs, reconnectBaseMs * (2 ** Math.min(reconnectAttempt, 5)))
    reconnectAttempt += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  const handleMessage = (event: MessageEvent<unknown>) => {
    if (typeof event.data !== 'string') return

    let envelope: RealtimeEnvelope
    try {
      envelope = JSON.parse(event.data) as RealtimeEnvelope
    } catch {
      return
    }

    if ((envelope.type !== 'hello' && envelope.type !== 'snapshot') || !isRecord(envelope.snapshot)) {
      return
    }
    onSnapshot(envelope.snapshot)
  }

  const connect = () => {
    if (closed) return
    const currentConnectionId = ++connectionId
    notifyStatus(reconnectAttempt ? 'reconnecting' : 'connecting')

    let nextSocket: WebSocket
    try {
      nextSocket = new WebSocket(getRealtimeUrl())
    } catch {
      notifyStatus('reconnecting')
      scheduleReconnect()
      return
    }
    socket = nextSocket

    nextSocket.onopen = () => {
      if (currentConnectionId !== connectionId) return
      reconnectAttempt = 0
      notifyStatus('connected')
    }
    nextSocket.onmessage = event => {
      if (currentConnectionId === connectionId) handleMessage(event)
    }
    nextSocket.onerror = () => {
      if (currentConnectionId === connectionId) notifyStatus('reconnecting')
    }
    nextSocket.onclose = () => {
      if (currentConnectionId !== connectionId) return
      socket = null
      if (closed) {
        notifyStatus('closed')
        return
      }
      notifyStatus('reconnecting')
      scheduleReconnect()
    }
  }

  connect()

  return {
    close() {
      if (closed) return
      closed = true
      clearReconnectTimer()
      connectionId += 1
      const currentSocket = socket
      socket = null
      if (currentSocket) currentSocket.close()
      notifyStatus('closed')
    }
  }
}
