import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Activity, AlertTriangle, Gauge, RefreshCw, ShieldCheck } from 'lucide-react'
import { apiGet, asArray, asRecord, numberOf, textOf, type AnyRecord } from '../lib/api'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { EmptyState, ErrorState, LoadingState } from '../components/shell'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Card, MetricCard, MetricGrid, PageHead } from '@/components/ds'

/**
 * 可观测面板（feature ②）。
 * 只读消费后端 /api/metrics：HTTP 请求量 / 错误率 / 延迟 Top 路径 + 业务吞吐
 * （tasks / workflows / relay / queue / radio / projects）+ 最近失败。5s 自动轮询。
 */

const TITLES: Record<AppLanguage, string> = {
  zh: '可观测',
  en: 'Observability'
}
const SUBTITLES: Record<AppLanguage, string> = {
  zh: '请求延迟、错误率与业务吞吐的实时快照',
  en: 'Live snapshot of request latency, error rate and business throughput'
}

type Tone = 'neutral' | 'info' | 'success' | 'danger' | 'warning'

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ${h % 24}h`
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function formatTs(value: unknown, language: AppLanguage): string {
  const ms = typeof value === 'number' ? value : Date.parse(String(value || ''))
  if (!ms || Number.isNaN(ms)) return '-'
  return new Date(ms).toLocaleString(language === 'zh' ? 'zh-CN' : undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function statusTone(bucket: string): Tone {
  if (bucket.startsWith('2') || bucket.startsWith('3')) return 'success'
  if (bucket.startsWith('4')) return 'warning'
  if (bucket.startsWith('5')) return 'danger'
  return 'neutral'
}

export default function Observability() {
  const { language } = useOutletContext<AppOutletContext>()
  const [data, setData] = useState<AnyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const next = await apiGet<AnyRecord>('/api/metrics')
      setData(next)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [])

  // 监控面板：每 5s 自动刷新快照。
  useEffect(() => {
    void load()
    const timer = window.setInterval(load, 5000)
    return () => window.clearInterval(timer)
  }, [load])

  if (loading && !data) {
    return <LoadingState variant="rows" label={language === 'zh' ? '加载中…' : 'Loading…'} className="p-4" />
  }
  if (error) {
    return (
      <ErrorState
        variant="block"
        title={language === 'zh' ? '加载失败' : 'Failed to load'}
        description={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            {language === 'zh' ? '重试' : 'Retry'}
          </Button>
        }
      />
    )
  }

  const requests = asRecord(data?.requests)
  const topPaths = asArray(requests.topPaths)
  const byStatus = asRecord(requests.byStatus)
  const tasks = asRecord(data?.tasks)
  const workflows = asRecord(data?.workflows)
  const radio = asRecord(data?.radio)
  const projects = asRecord(data?.projects)
  const relay = asRecord(data?.relay)
  const queue = asRecord(data?.queue)
  const recentFailures = asArray(data?.recentFailures)

  const total = numberOf(requests.total)
  const errs = numberOf(requests.errors)
  const errRate = total > 0 ? `${((errs / total) * 100).toFixed(1)}%` : '0%'
  const uptimeMs = numberOf(requests.uptimeMs)
  const failedQueue = numberOf(queue.failed)
  const relaySuccess = textOf(relay.successRate) || '0%'

  const statusEntries = Object.entries(byStatus).sort((a, b) => Number(b[1]) - Number(a[1]))

  return (
    <>
      <PageHead
        title={TITLES[language]}
        subtitle={SUBTITLES[language]}
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {language === 'zh' ? '刷新' : 'Refresh'}
          </Button>
        }
      />

      <MetricGrid className="mb-[var(--section-gap)]">
        <MetricCard
          label={language === 'zh' ? '运行时长' : 'Uptime'}
          value={formatUptime(uptimeMs)}
          icon={Activity}
        />
        <MetricCard
          label={language === 'zh' ? '总请求' : 'Requests'}
          value={total}
          icon={Gauge}
        />
        <MetricCard
          label={language === 'zh' ? '错误数' : 'Errors'}
          value={errs}
          icon={AlertTriangle}
          deltaTone={errs > 0 ? 'bad' : 'good'}
          note={language === 'zh' ? '近会话累计' : 'session累计'}
        />
        <MetricCard
          label={language === 'zh' ? '错误率' : 'Error rate'}
          value={errRate}
          icon={AlertTriangle}
          deltaTone={errs > 0 ? 'bad' : 'flat'}
        />
        <MetricCard
          label={language === 'zh' ? 'Relay 成功率' : 'Relay success'}
          value={relaySuccess}
          icon={ShieldCheck}
          deltaTone={String(relaySuccess).startsWith('0') ? 'bad' : 'good'}
        />
      </MetricGrid>

      <div className="grid grid-cols-1 gap-[var(--section-gap)] lg:grid-cols-2">
        <Card title={language === 'zh' ? '请求延迟 · Top 路径' : 'Request latency · top paths'} count={topPaths.length} flushBody>
          {topPaths.length ? (
            <Table bordered={false} containerClassName="rounded-none" maxHeight="420px">
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'zh' ? '路径' : 'Path'}</TableHead>
                  <TableHead className="text-right">{language === 'zh' ? '次数' : 'Count'}</TableHead>
                  <TableHead className="text-right">{language === 'zh' ? '均耗时' : 'Avg'}</TableHead>
                  <TableHead className="text-right">{language === 'zh' ? '峰耗时' : 'Max'}</TableHead>
                  <TableHead className="text-right">{language === 'zh' ? '错误' : 'Err'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topPaths.map((p, i) => {
                  const path = textOf(p.path)
                  const err = numberOf(p.errors)
                  return (
                    <TableRow key={path || `path-${i}`}>
                      <TableCell className="font-mono text-xs text-ink">{path}</TableCell>
                      <TableCell className="text-right font-mono text-ink-2">{numberOf(p.count)}</TableCell>
                      <TableCell className="text-right font-mono text-ink-2">{numberOf(p.avgMs)}ms</TableCell>
                      <TableCell className="text-right font-mono text-ink-2">{numberOf(p.maxMs)}ms</TableCell>
                      <TableCell className="text-right">
                        {err > 0 ? (
                          <Badge variant="danger" dot>{err}</Badge>
                        ) : (
                          <span className="font-mono text-xs text-ink-4">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<Gauge className="h-5 w-5" />}
              title={language === 'zh' ? '暂无请求数据' : 'No request data yet'}
              description={language === 'zh' ? '调用一些接口后这里会显示延迟分布。' : 'Hit a few endpoints and latency shows up here.'}
              className="p-4"
            />
          )}
        </Card>

        <Card title={language === 'zh' ? 'HTTP 状态分布' : 'HTTP status breakdown'} flushBody>
          <div className="flex flex-wrap gap-2 p-4">
            {statusEntries.length ? (
              statusEntries.map(([bucket, count]) => (
                <Badge key={bucket} variant={statusTone(bucket)} dot>
                  {bucket}: {Number(count)}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-ink-4">{language === 'zh' ? '暂无数据' : 'No data'}</span>
            )}
          </div>
        </Card>
      </div>

      <Card title={language === 'zh' ? '业务吞吐' : 'Business throughput'} flushBody className="mt-[var(--section-gap)]">
        <div className="p-4">
          <MetricGrid>
            <MetricCard label={language === 'zh' ? '任务' : 'Tasks'} value={numberOf(tasks.total)} note={language === 'zh' ? '跨状态合计' : 'all statuses'} />
            <MetricCard label={language === 'zh' ? '工作流' : 'Workflows'} value={numberOf(workflows.total)} />
            <MetricCard label={language === 'zh' ? 'Radio 消息' : 'Radio msgs'} value={numberOf(radio.total)} />
            <MetricCard label={language === 'zh' ? '项目' : 'Projects'} value={numberOf(projects.total)} />
            <MetricCard
              label={language === 'zh' ? '队列失败' : 'Queue failed'}
              value={failedQueue}
              deltaTone={failedQueue > 0 ? 'bad' : 'good'}
            />
          </MetricGrid>
        </div>
      </Card>

      <Card title={language === 'zh' ? '最近失败' : 'Recent failures'} count={recentFailures.length} flushBody className="mt-[var(--section-gap)]">
        {recentFailures.length ? (
          <Table bordered={false} containerClassName="rounded-none" maxHeight="320px">
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'zh' ? '类型' : 'Type'}</TableHead>
                <TableHead>{language === 'zh' ? 'ID' : 'ID'}</TableHead>
                <TableHead>{language === 'zh' ? '错误' : 'Error'}</TableHead>
                <TableHead>{language === 'zh' ? '时间' : 'Time'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentFailures.map((f, i) => (
                <TableRow key={textOf(f.id) || `fail-${i}`}>
                  <TableCell><Badge variant="neutral" dot>{textOf(f.type) || '-'}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-ink">{textOf(f.id) || '-'}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-ink-2" title={textOf(f.error)}>
                    {textOf(f.error) || '-'}
                  </TableCell>
                  <TableCell className="text-ink-2">{formatTs(f.time, language)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title={language === 'zh' ? '无近期失败' : 'No recent failures'}
            description={language === 'zh' ? '最近没有 relay 或队列失败记录。' : 'No recent relay or dispatch-queue failures.'}
            className="p-4"
          />
        )}
      </Card>
    </>
  )
}
