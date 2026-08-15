import type { ComponentType, ReactNode } from 'react'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DeltaTone = 'good' | 'bad' | 'flat'

/* ----------------------------------------------------------------- Sparkline */
export interface SparklineProps {
  data: number[]
  /** Tailwind text-color class — the stroke inherits `currentColor`. */
  className?: string
  width?: number
  height?: number
}

/**
 * Proto `.spark` — a 100% width, fixed-height SVG line + soft area fill.
 * Values are normalised to the viewBox; no axes, no grid — pure trend glyph.
 */
export function Sparkline({ data, className, width = 100, height = 32 }: SparklineProps) {
  if (data.length < 2) {
    return <svg className={cn('block w-full', className)} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" />
  }
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const stepX = width / (data.length - 1)
  const pts = data.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / span) * (height - 4) - 2
    return [x, y] as const
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width} ${height} L0 ${height} Z`
  const id = `spark-${Math.round(min)}-${Math.round(max)}-${data.length}`
  return (
    <svg className={cn('block w-full', className)} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* ----------------------------------------------------------------- MetricCard */
export interface MetricCardProps {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  icon?: ComponentType<{ className?: string }>
  /** Trend glyph data. */
  spark?: number[]
  /** Signed delta, e.g. "+12%". */
  delta?: ReactNode
  deltaTone?: DeltaTone
  note?: ReactNode
  className?: string
}

export function MetricCard({ label, value, unit, icon: Icon, spark, delta, deltaTone = 'flat', note, className }: MetricCardProps) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border border-line bg-surface p-[var(--card-pad)]', className)}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">{label}</span>
        {Icon ? <Icon className="size-[15px] text-ink-4" aria-hidden="true" /> : null}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-[22px] font-bold leading-none tracking-[-0.01em] text-ink-1 tabular-nums">{value}</span>
        {unit ? <span className="text-[13px] font-medium text-ink-4">{unit}</span> : null}
      </div>
      {spark && spark.length > 1 ? (
        <Sparkline data={spark} className="h-8 text-accent-base" />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {delta !== undefined ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-mono text-xs font-medium',
              deltaTone === 'good' && 'text-success',
              deltaTone === 'bad' && 'text-danger',
              deltaTone === 'flat' && 'text-ink-3'
            )}
          >
            {deltaTone === 'good' ? <TrendingUp className="size-3" /> : null}
            {deltaTone === 'bad' ? <TrendingDown className="size-3" /> : null}
            {deltaTone === 'flat' ? <Minus className="size-3" /> : null}
            {delta}
          </span>
        ) : null}
        {note ? <span className="text-[11.5px] text-ink-4">{note}</span> : null}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- MetricGrid */
export interface MetricGridProps {
  children: ReactNode
  className?: string
}

/**
 * Proto `.metrics` — 5 equal columns at desktop, collapsing to 3 / 2 / 1 as the
 * viewport narrows. Every console page's KPI row rides on this.
 */
export function MetricGrid({ children, className }: MetricGridProps) {
  return (
    <div
      className={cn(
        'grid gap-[var(--section-gap)]',
        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
        className
      )}
    >
      {children}
    </div>
  )
}
