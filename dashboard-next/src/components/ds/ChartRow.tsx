import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card } from './Card'

/* ------------------------------------------------------------------ LineChart */
export interface LineSeries {
  label: string
  points: number[]
  dashed?: boolean
}

export interface LineChartProps {
  series: LineSeries[]
  xLabels?: string[]
  yLabels?: string[]
  /** Index of the peak point to annotate. */
  peakAt?: number
  peakLabel?: ReactNode
  height?: number
}

const TONE_VAR: Record<string, string> = {
  accent: 'var(--color-accent-base)',
  neutral: 'var(--color-ink-5)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  info: 'var(--color-info)'
}

function buildPath(points: number[], w: number, h: number, padTop: number, padBottom: number) {
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const stepX = w / (points.length - 1)
  return points.map((v, i) => {
    const x = i * stepX
    const y = padTop + (h - padTop - padBottom) * (1 - (v - min) / span)
    return [x, y] as const
  })
}

export function LineChart({ series, xLabels, yLabels, peakAt, peakLabel, height = 240 }: LineChartProps) {
  const W = 100
  const H = 100
  const padTop = 6
  const padBottom = 10
  return (
    <div className="relative mt-3" style={{ height }}>
      <div
        className="absolute inset-x-10 inset-y-[14px] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_calc(33.333%-1px),var(--color-line)_33.333%)] opacity-60"
        aria-hidden="true"
      />
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {series.map((s, si) => {
          const pts = buildPath(s.points, W, H, padTop, padBottom)
          const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
          const area = `${line} L${W} ${H - padBottom} L0 ${H - padBottom} Z`
          const color = TONE_VAR[si === 0 ? 'accent' : 'neutral']
          return (
            <g key={s.label}>
              {si === 0 ? <path d={area} fill={color} fillOpacity={0.12} /> : null}
              <path
                d={line}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? '4 4' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )
        })}
        {peakAt !== undefined && series[0] && peakAt < series[0].points.length ? (
          (() => {
            const pts = buildPath(series[0].points, W, H, padTop, padBottom)
            const [px, py] = pts[peakAt]
            return <circle cx={px} cy={py} r={1.6} fill="var(--color-accent-base)" vectorEffect="non-scaling-stroke" />
          })()
        ) : null}
      </svg>
      {yLabels ? (
        <div className="absolute bottom-[26px] left-1.5 top-[14px] flex flex-col justify-between font-mono text-[10px] text-ink-5">
          {yLabels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      ) : null}
      {xLabels ? (
        <div className="absolute inset-x-10 bottom-1.5 flex justify-between font-mono text-[10px] text-ink-5">
          {xLabels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      ) : null}
      {peakAt !== undefined && peakLabel && series[0] && peakAt < series[0].points.length ? (
        (() => {
          const pts = buildPath(series[0].points, W, H, padTop, padBottom)
          const [px, py] = pts[peakAt]
          return (
            <div
              className="absolute z-10 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-sm border border-accent-base bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-1 shadow-floating"
              style={{ left: `${px}%`, top: `${py}%` }}
            >
              {peakLabel}
            </div>
          )
        })()
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------------- Donut */
export type DonutTone = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral'

export interface DonutSegment {
  label: string
  value: number
  tone: DonutTone
}

export interface DonutProps {
  segments: DonutSegment[]
  center?: ReactNode
  centerLabel?: ReactNode
}

export function Donut({ segments, center, centerLabel }: DonutProps) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  const r = 70
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="relative mx-auto my-1.5 h-[160px] w-[160px]">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-line)" strokeWidth={14} />
        {segments.map((seg, i) => {
          const len = (seg.value / total) * c
          const el = (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={TONE_VAR[seg.tone]}
              strokeWidth={14}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              style={{ transition: 'stroke-dashoffset 140ms cubic-bezier(.4,0,.2,1)' }}
            />
          )
          offset += len
          return el
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[26px] font-bold text-ink-1">{center}</span>
        {centerLabel ? <span className="text-[11px] uppercase tracking-[0.05em] text-ink-3">{centerLabel}</span> : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ ChartRow */
export interface ChartRowProps {
  title?: ReactNode
  subtitle?: ReactNode
  series: LineSeries[]
  xLabels?: string[]
  yLabels?: string[]
  peakAt?: number
  peakLabel?: ReactNode
  legend?: ReactNode
  donutTitle?: ReactNode
  donutCenter?: ReactNode
  donutCenterLabel?: ReactNode
  segments: DonutSegment[]
  className?: string
}

/**
 * Proto `.charts` — 2.2fr main (line chart) + 1fr side (status donut + legend).
 * Collapses to a single column on narrow viewports.
 */
export function ChartRow({
  title,
  subtitle,
  series,
  xLabels,
  yLabels,
  peakAt,
  peakLabel,
  legend,
  donutTitle,
  donutCenter,
  donutCenterLabel,
  segments,
  className
}: ChartRowProps) {
  return (
    <div className={cn('grid gap-[var(--section-gap)] xl:grid-cols-[2.2fr_1fr]', className)}>
      <Card title={title} subtitle={subtitle} toolbar={legend}>
        <LineChart series={series} xLabels={xLabels} yLabels={yLabels} peakAt={peakAt} peakLabel={peakLabel} />
      </Card>
      <Card title={donutTitle}>
        <Donut segments={segments} center={donutCenter} centerLabel={donutCenterLabel} />
        <ul className="flex flex-col gap-1.5 px-[var(--card-pad)] pb-[var(--card-pad)]">
          {segments.map((seg, i) => (
            <li key={i} className="flex items-center gap-2 text-[13px] text-ink-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: TONE_VAR[seg.tone] }} />
              <span>{seg.label}</span>
              <span className="ml-auto font-mono text-[12px] font-semibold text-ink-1">{seg.value}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
