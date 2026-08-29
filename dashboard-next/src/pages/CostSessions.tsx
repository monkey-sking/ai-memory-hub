/**
 * CostSessions — token usage + estimated cost across native agent sessions.
 *
 * Data source (real, never fabricated):
 *   GET /api/cost-sessions → { totals, byAgent[], trend[] }
 *   (handler: src/index.js → dashboardCostSessions.getCostSessions)
 *
 * Totals come from each runner's native session dirs (codex cumulative
 * total_token_usage, claude per-line message.usage). Cost is an ESTIMATE from
 * reference prices in cost-sessions.js — labelled as such everywhere.
 */

import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Bot, Coins, Database, RefreshCw, TrendingUp } from 'lucide-react'
import { apiGet, asArray, asRecord, formatRelativeTime, numberOf, textOf } from '../lib/api'
import type { AnyRecord } from '../lib/api'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import { Button } from '../components/ui/button'
import { cn } from '@/lib/utils'
import { EmptyState, LoadingState } from '../components/shell'
import {
  AlertBanner,
  Card,
  ChartRow,
  MetricCard,
  MetricGrid,
  PageHead
} from '@/components/ds'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const localCopy = {
  zh: {
    title: '成本会话',
    description: '跨 runner 的真实 token 用量与估算成本，数据来自各 agent 原生会话目录。',
    totalInput: '总输入 Token',
    totalOutput: '总输出 Token',
    estCost: '估算总成本',
    sessions: '总会话',
    runners: '覆盖 Runner',
    trend: '近 30 天趋势',
    costDist: '成本分布',
    runner: 'Runner',
    sessionCount: '会话数',
    input: '输入',
    output: '输出',
    cacheRead: '缓存读',
    cacheWrite: '缓存写',
    cost: '估算成本',
    lastActive: '最近活跃',
    estNote: '估算（参考单价）',
    donutCenter: 'USD 估算',
    pending: '暂未接入',
    noData: '暂无可用会话',
    noDataHint: '当前未检测到任何 runner 的原生 token 用量记录。',
    loadError: '加载失败',
    refresh: '刷新',
    pricingHint: '成本为估算值，基于参考单价（USD / 1M tokens）：codex 按 OpenAI 级、claude 按 Anthropic 级混估，非账单。可在后端 PRICING 覆盖真实价卡。'
  },
  en: {
    title: 'Cost & Sessions',
    description: 'Real token usage and estimated cost across runners, sourced from each agent native session dir.',
    totalInput: 'Total Input Tokens',
    totalOutput: 'Total Output Tokens',
    estCost: 'Est. Cost',
    sessions: 'Sessions',
    runners: 'Runners',
    trend: 'Last 30 days',
    costDist: 'Cost by runner',
    runner: 'Runner',
    sessionCount: 'Sessions',
    input: 'Input',
    output: 'Output',
    cacheRead: 'Cache read',
    cacheWrite: 'Cache write',
    cost: 'Est. cost',
    lastActive: 'Last active',
    estNote: 'est. (ref. price)',
    donutCenter: 'Est. USD',
    pending: 'pending',
    noData: 'No sessions yet',
    noDataHint: 'No runner native token usage records detected.',
    loadError: 'Failed to load',
    refresh: 'Refresh',
    pricingHint: 'Cost is an estimate from reference prices (USD / 1M tokens): codex ~OpenAI tier, claude ~Anthropic tier. Not a bill. Override PRICING in the backend for real rates.'
  }
} as const satisfies Record<AppLanguage, Record<string, string>>

type CostPayload = {
  generatedAt?: string
  pricingNote?: string
  totals?: AnyRecord
  byAgent?: AnyRecord[]
  trend?: AnyRecord[]
}

function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(Math.round(n))
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0'
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`
  return `$${n.toFixed(2)}`
}

const DONUT_TONES = ['accent', 'success', 'warning', 'info', 'neutral'] as const

export default function CostSessions() {
  const { language } = useOutletContext<AppOutletContext>()
  const local = localCopy[language]

  const [data, setData] = useState<CostPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const page = await apiGet<CostPayload>('/api/cost-sessions')
      setData(page)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
  useEffect(() => { void load() }, [])

  const totals = asRecord(data?.totals)
  const byAgent = useMemo(() => asArray<AnyRecord>(data?.byAgent), [data])
  const trend = useMemo(() => asArray<AnyRecord>(data?.trend), [data])

  const totalInput = numberOf(totals.inputTokens)
  const totalOutput = numberOf(totals.outputTokens)
  const totalCost = numberOf(totals.estCostUsd)
  const sessionCount = numberOf(totals.sessionCount)
  const runnersWithData = numberOf(totals.runnersWithData)

  const tokenSeries = useMemo(() => trend.map((t) => numberOf(t.totalTokens)), [trend])
  const costSeries = useMemo(() => trend.map((t) => numberOf(t.estCostUsd)), [trend])
  const xLabels = useMemo(() => {
    if (trend.length === 0) return []
    const last = trend.length - 1
    const idxs = Array.from(new Set([0, 6, 12, 18, 24, last].filter((i) => i >= 0 && i <= last)))
    return trend.map((t, i) => (idxs.includes(i) ? textOf(t.date).slice(5) : ''))
  }, [trend])

  const donutSegments = useMemo(
    () =>
      byAgent
        .filter((a) => a.available && !a.mirrorOf && numberOf(a.estCostUsd) > 0)
        .map((a, i) => ({
          label: textOf(a.agent),
          value: Math.round(numberOf(a.estCostUsd) * 100) / 100,
          tone: DONUT_TONES[i % DONUT_TONES.length]
        })),
    [byAgent]
  )

  const hasData = byAgent.some((a) => a.available && numberOf(a.sessionCount) > 0)

  const banner = !loading
    ? error
      ? { tone: 'error' as const, title: local.loadError, description: error }
      : !hasData
        ? { tone: 'info' as const, title: local.noData, description: local.noDataHint }
        : null
    : null

  return (
    <div className="flex flex-col gap-[var(--section-gap)]">
      <PageHead
        title={local.title}
        subtitle={local.description}
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {local.refresh}
          </Button>
        }
      />

      {banner ? (
        <AlertBanner tone={banner.tone} title={banner.title} description={banner.description} />
      ) : null}

      <MetricGrid>
        <MetricCard label={local.totalInput} value={formatTokens(totalInput)} icon={Database} />
        <MetricCard label={local.totalOutput} value={formatTokens(totalOutput)} icon={Bot} />
        <MetricCard label={local.estCost} value={formatUsd(totalCost)} icon={Coins} note={local.estNote} />
        <MetricCard label={local.sessions} value={sessionCount} icon={TrendingUp} />
        <MetricCard label={local.runners} value={`${runnersWithData} / ${byAgent.length || '-'}`} icon={Coins} />
      </MetricGrid>

      {hasData ? (
        <ChartRow
          title={local.trend}
          subtitle={local.estNote}
          series={[
            { label: local.totalInput, points: tokenSeries },
            { label: local.estCost, points: costSeries }
          ]}
          xLabels={xLabels}
          donutTitle={local.costDist}
          donutCenter={formatUsd(totalCost)}
          donutCenterLabel={local.donutCenter}
          segments={donutSegments}
        />
      ) : null}

      <Card title={local.title} count={byAgent.length} flushBody>
        {loading && byAgent.length === 0 ? (
          <LoadingState variant="rows" label={local.refresh} className="p-4" />
        ) : byAgent.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{local.runner}</TableHead>
                <TableHead numeric>{local.sessionCount}</TableHead>
                <TableHead numeric>{local.input}</TableHead>
                <TableHead numeric>{local.output}</TableHead>
                <TableHead numeric>{local.cacheRead}</TableHead>
                <TableHead numeric>{local.cacheWrite}</TableHead>
                <TableHead numeric>{local.cost}</TableHead>
                <TableHead numeric>{local.lastActive}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byAgent.map((a) => {
                const available = Boolean(a.available)
                const agent = textOf(a.agent)
                if (!available) {
                  return (
                    <TableRow key={agent} className="opacity-60">
                      <TableCell colSpan={8}>
                        <span className="font-medium text-ink-2">{agent}</span>
                        <span className="ml-2 text-xs text-ink-4">{local.pending}</span>
                        {textOf(a.reason) ? <span className="ml-2 text-xs text-ink-4">· {textOf(a.reason)}</span> : null}
                      </TableCell>
                    </TableRow>
                  )
                }
                const lastActive = textOf(a.lastActive)
                const mirrorOf = textOf(a.mirrorOf)
                const note = textOf(a.note)
                return (
                  <TableRow key={agent}>
                    <TableCell>
                      <span className="font-medium text-ink">{agent}</span>
                      {textOf(a.model) ? <span className="ml-2 text-xs text-ink-4">{textOf(a.model)}</span> : null}
                      {mirrorOf ? (
                        <span className="ml-2 rounded bg-info-weak px-1.5 py-0.5 text-[10px] font-medium text-info">
                          同源 {mirrorOf}
                        </span>
                      ) : null}
                      {note ? <div className="mt-1 text-xs text-ink-4">{note}</div> : null}
                    </TableCell>
                    <TableCell numeric>{numberOf(a.sessionCount)}</TableCell>
                    <TableCell numeric>{formatTokens(numberOf(a.inputTokens))}</TableCell>
                    <TableCell numeric>{formatTokens(numberOf(a.outputTokens))}</TableCell>
                    <TableCell numeric>{formatTokens(numberOf(a.cacheReadTokens))}</TableCell>
                    <TableCell numeric>{formatTokens(numberOf(a.cacheWriteTokens))}</TableCell>
                    <TableCell numeric>{formatUsd(numberOf(a.estCostUsd))}</TableCell>
                    <TableCell numeric className="text-ink-3">
                      {lastActive ? formatRelativeTime(lastActive, language === 'zh' ? 'zh-CN' : 'en') : '-'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title={local.noData} description={local.noDataHint} />
        )}
      </Card>

      {!error && textOf(data?.pricingNote) ? (
        <p className="flex items-start gap-1.5 text-xs text-ink-4">
          <Coins className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{local.pricingHint}</span>
        </p>
      ) : null}
    </div>
  )
}
