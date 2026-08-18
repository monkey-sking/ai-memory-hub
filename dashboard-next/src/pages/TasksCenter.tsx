import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, PlayCircle, RefreshCw, XCircle } from 'lucide-react'
import { apiGet, apiPost, asArray, numberOf, textOf, type AnyRecord } from '../lib/api'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { EmptyState, ErrorState, LoadingState } from '../components/shell'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Card, PageHead } from '@/components/ds'

/**
 * 后台任务 / 进度中心（feature ①）。
 * 只读消费后台队列（/api/background-tasks），并提供一个入口把 detect / 备份 / 清理 / 修复
 * 等长任务收口到队列（带 ?background=1）。任务状态、进度、取消均走真实端点。
 */

type Status = 'pending' | 'running' | 'done' | 'error' | 'cancelled'

const TITLES: Record<AppLanguage, string> = {
  zh: '任务中心',
  en: 'Task Center'
}
const SUBTITLES: Record<AppLanguage, string> = {
  zh: '后台长任务的进度、状态与取消',
  en: 'Progress, status and cancellation for background jobs'
}

const STATUS_META: Record<AppLanguage, Record<Status, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' | 'warning' }>> = {
  zh: {
    pending: { label: '排队中', tone: 'neutral' },
    running: { label: '执行中', tone: 'info' },
    done: { label: '已完成', tone: 'success' },
    error: { label: '失败', tone: 'danger' },
    cancelled: { label: '已取消', tone: 'warning' }
  },
  en: {
    pending: { label: 'Queued', tone: 'neutral' },
    running: { label: 'Running', tone: 'info' },
    done: { label: 'Done', tone: 'success' },
    error: { label: 'Failed', tone: 'danger' },
    cancelled: { label: 'Cancelled', tone: 'warning' }
  }
}

const TYPE_LABELS: Record<AppLanguage, Record<string, string>> = {
  zh: {
    detect: '扫描工具',
    'backup-create': '创建备份',
    'backup-prune': '清理备份',
    'backup-restore': '恢复备份',
    'health-repair': '修复健康'
  },
  en: {
    detect: 'Detect tools',
    'backup-create': 'Create backup',
    'backup-prune': 'Prune backups',
    'backup-restore': 'Restore backup',
    'health-repair': 'Repair health'
  }
}

function typeLabel(type: string, language: AppLanguage): string {
  return TYPE_LABELS[language][type] ?? type
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

function ProgressBar({ value, tone }: { value: number; tone: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((Number(value) || 0) * 100)))
  const barTone =
    tone === 'success'
      ? 'bg-[var(--color-success)]'
      : tone === 'danger'
        ? 'bg-[var(--color-danger)]'
        : 'bg-[var(--accent-base)]'
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-sunk"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn('h-full rounded-full transition-all', barTone)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function TasksCenter() {
  const { language } = useOutletContext<AppOutletContext>()

  const [tasks, setTasks] = useState<AnyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const next = await apiGet<AnyRecord>('/api/background-tasks')
      setTasks(asArray<AnyRecord>(next.tasks))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [])

  // Poll while there are active (non-terminal) tasks; cheap read against the hub.
  useEffect(() => {
    void load()
    const hasActive = tasks.some(task => {
      const status = textOf(task.status)
      return status === 'pending' || status === 'running'
    })
    if (!hasActive) return
    const timer = window.setInterval(load, 1500)
    return () => window.clearInterval(timer)
  }, [load, tasks])

  const runStart = async (key: string, fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(key)
    setError('')
    try {
      await fn()
      await load()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const startDetect = () =>
    runStart('detect', () => apiGet<AnyRecord>('/api/detect?background=1'))
  const startBackupCreate = () =>
    runStart('backup-create', () => apiPost<AnyRecord>('/api/backups/create?background=1', { reason: 'tasks-center' }))
  const startPrune = () =>
    runStart('backup-prune', () => apiPost<AnyRecord>('/api/backups/prune?background=1', { apply: true }))
  const startRepair = () =>
    runStart('health-repair', () => apiPost<AnyRecord>('/api/health/repair?background=1', { apply: false }))

  const cancelTask = (id: string) =>
    runStart(`cancel:${id}`, () => apiPost<AnyRecord>(`/api/background-tasks/${id}/cancel`, {}))

  const activeCount = tasks.filter(task => {
    const status = textOf(task.status)
    return status === 'pending' || status === 'running'
  }).length

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

      {error ? (
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
      ) : (
        <>
          <Card
            title={language === 'zh' ? '发起后台任务' : 'Start a background job'}
            flushBody
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => void startDetect()} disabled={busy === 'detect'}>
                  <PlayCircle className="h-4 w-4" />
                  {language === 'zh' ? '扫描工具' : 'Detect tools'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void startBackupCreate()} disabled={busy === 'backup-create'}>
                  <PlayCircle className="h-4 w-4" />
                  {language === 'zh' ? '创建备份' : 'Create backup'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void startPrune()} disabled={busy === 'backup-prune'}>
                  <PlayCircle className="h-4 w-4" />
                  {language === 'zh' ? '按策略清理' : 'Prune backups'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void startRepair()} disabled={busy === 'health-repair'}>
                  <PlayCircle className="h-4 w-4" />
                  {language === 'zh' ? '修复健康' : 'Repair health'}
                </Button>
              </div>
            }
          >
            <div className="px-4 py-2.5 text-sm text-ink-2">
              {language === 'zh'
                ? `当前 ${activeCount} 个任务在执行中；进度每 1.5 秒自动刷新。`
                : `${activeCount} job(s) active; progress refreshes every 1.5s.`}
            </div>
          </Card>

          <Card
            title={language === 'zh' ? '任务列表' : 'Task list'}
            count={tasks.length}
            flushBody
          >
            {loading && !tasks.length ? (
              <LoadingState variant="rows" label={language === 'zh' ? '加载中…' : 'Loading…'} className="p-4" />
            ) : tasks.length ? (
              <Table bordered={false} containerClassName="rounded-none" maxHeight="520px">
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'zh' ? '类型' : 'Type'}</TableHead>
                    <TableHead>{language === 'zh' ? '标签' : 'Label'}</TableHead>
                    <TableHead>{language === 'zh' ? '状态' : 'Status'}</TableHead>
                    <TableHead className="w-48">{language === 'zh' ? '进度' : 'Progress'}</TableHead>
                    <TableHead>{language === 'zh' ? '信息' : 'Message'}</TableHead>
                    <TableHead>{language === 'zh' ? '开始' : 'Started'}</TableHead>
                    <TableHead className="text-right">{language === 'zh' ? '操作' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map(task => {
                    const id = textOf(task.id)
                    const status = (textOf(task.status) || 'pending') as Status
                    const meta = STATUS_META[language][status] ?? STATUS_META[language].pending
                    const isActive = status === 'pending' || status === 'running'
                    return (
                      <TableRow key={id || `task-${textOf(task.createdAt)}`}>
                        <TableCell className="text-ink-2">{typeLabel(textOf(task.type), language)}</TableCell>
                        <TableCell>
                          <span className="font-mono text-ink">{textOf(task.label) || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={meta.tone} dot>
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={numberOf(task.progress)} tone={meta.tone} />
                            <span className="w-10 shrink-0 text-right font-mono text-xs text-ink-2">
                              {Math.round((numberOf(task.progress) || 0) * 100)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-ink-2" title={textOf(task.message)}>
                          {textOf(task.message) || '-'}
                        </TableCell>
                        <TableCell className="text-ink-2">{formatTs(task.startedAt, language)}</TableCell>
                        <TableCell className="text-right">
                          {isActive ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy === `cancel:${id}`}
                              onClick={() => void cancelTask(id)}
                              aria-label={`${language === 'zh' ? '取消' : 'Cancel'} ${id}`}
                            >
                              <XCircle className="h-3.5 w-3.5 text-danger" />
                              {language === 'zh' ? '取消' : 'Cancel'}
                            </Button>
                          ) : (
                            <span className="text-xs text-ink-4">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={<Loader2 className="h-5 w-5" />}
                title={language === 'zh' ? '暂无后台任务' : 'No background tasks yet'}
                description={
                  language === 'zh'
                    ? '用上方按钮把长任务收口到后台队列，进度会显示在这里。'
                    : 'Use the buttons above to run long jobs in the background; progress shows here.'
                }
                action={
                  <Button size="sm" onClick={() => void startDetect()}>
                    <PlayCircle className="h-4 w-4" />
                    {language === 'zh' ? '扫描工具' : 'Detect tools'}
                  </Button>
                }
              />
            )}
          </Card>
        </>
      )}
    </>
  )
}
