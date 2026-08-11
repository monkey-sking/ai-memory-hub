import type { BadgeVariant } from '@/components/ui/badge'

/**
 * Single source of truth for status → Badge variant, shared by every panel so
 * a given status reads the same colour everywhere (Tasks, Workflows, Overview,
 * Backups, …). Faithful to the colours the old hand-rolled `.status-badge`
 * CSS used:
 *   teal/accent  → done · completed · active · in_progress
 *   red/danger   → failed · blocked · missing · cancelled · urgent · high
 *   amber/warning→ claimed · pending · needs_verification · planned · review
 *   everything else → neutral (the old base grey)
 */
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  done: 'accent',
  completed: 'accent',
  active: 'accent',
  in_progress: 'accent',
  failed: 'danger',
  blocked: 'danger',
  missing: 'danger',
  cancelled: 'danger',
  urgent: 'danger',
  high: 'danger',
  claimed: 'warning',
  pending: 'warning',
  needs_verification: 'warning',
  planned: 'warning',
  review: 'warning',
}

const PRIORITY_VARIANT: Record<string, BadgeVariant> = {
  urgent: 'danger',
  high: 'danger',
}

export function statusBadgeVariant(status: string): BadgeVariant {
  return STATUS_VARIANT[String(status ?? '').toLowerCase()] ?? 'neutral'
}

export function priorityBadgeVariant(priority: string): BadgeVariant {
  return PRIORITY_VARIANT[String(priority ?? '').toLowerCase()] ?? 'neutral'
}
