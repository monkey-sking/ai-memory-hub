export type AnyRecord = Record<string, unknown>

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: AnyRecord): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {}
}

export function asArray<T = AnyRecord>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

export function textOf(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

export function numberOf(value: unknown, fallback = 0): number {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

export function boolOf(value: unknown): boolean {
  return Boolean(value)
}
