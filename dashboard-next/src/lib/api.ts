export type AnyRecord = Record<string, unknown>

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export async function apiRequest<T>(path: string, method: string, body?: AnyRecord): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export function apiPost<T>(path: string, body: AnyRecord): Promise<T> {
  return apiRequest<T>(path, 'POST', body)
}

export function apiPatch<T>(path: string, body: AnyRecord): Promise<T> {
  return apiRequest<T>(path, 'PATCH', body)
}

export function apiDelete<T>(path: string, body: AnyRecord): Promise<T> {
  return apiRequest<T>(path, 'DELETE', body)
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

/**
 * Shared date formatting presets. `formatDate` keeps the guard behaviour every
 * local copy already had: empty input renders as '-', unparsable input renders
 * the raw value untouched.
 */
export const DATE_FORMAT_PRESETS = {
  /** Locale default, full date + time. */
  full: undefined,
  /** Compact numeric day + time, zh-CN ordering. */
  compact: {
    locale: 'zh-CN',
    options: { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
  },
  /** Short month name + time, user locale. */
  short: {
    locale: undefined,
    options: { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
  }
} as const satisfies Record<string, { locale?: string, options: Intl.DateTimeFormatOptions } | undefined>

export type DateFormatPreset = keyof typeof DATE_FORMAT_PRESETS

export function formatDate(value: string, preset: DateFormatPreset = 'full'): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const format = DATE_FORMAT_PRESETS[preset]
  if (!format) return date.toLocaleString()
  return date.toLocaleString(format.locale, format.options)
}

export function numberOf(value: unknown, fallback = 0): number {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

export function boolOf(value: unknown): boolean {
  return Boolean(value)
}
