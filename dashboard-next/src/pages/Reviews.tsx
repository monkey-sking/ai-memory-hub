import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Ban, CheckCheck, CheckCircle2, Clock, ClipboardCheck, Plus, RefreshCw, XCircle } from 'lucide-react'
import { apiGet, apiPost, asArray, formatRelativeTime, textOf, type AnyRecord } from '@/lib/api'
import { dashboardLabels } from '@/lib/dashboardCopy'
import type { AppLanguage, AppOutletContext } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fieldBaseStyles } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { EmptyState, ErrorState, LoadingState, FilterBar } from '@/components/shell'
import {
  AlertBanner,
  Card,
  ChartRow,
  MetricCard,
  MetricGrid,
  PageHead
} from '@/components/ds'

/**
 * Reviews route rewritten to the proto-next "bones" composition: page-head ->
 * (alert on real error) -> KPI row -> trend/distribution chart -> panel list
 * with filters. All real data-fetching and actions from the prior version are
 * preserved: load `/api/reviews`, request a review, and submit a review result.
 * No numbers are invented — every KPI and chart segment is derived from the
 * already-loaded `reviews` array.
 */

/* ----------------------------------------------------------------- labels */

const REVIEW_STATUS_LABELS: Record<string, [string, string]> = {
  requested: ['待评审', 'Pending review'],
  needs_verification: ['待验证', 'Needs verification'],
  in_review: ['评审中', 'In review'],
  review: ['评审中', 'In review'],
  approved: ['已通过', 'Approved'],
  rejected: ['已驳回', 'Rejected'],
  cancelled: ['已取消', 'Cancelled']
}

const PENDING_STATUSES = ['requested', 'needs_verification', 'review', 'in_review']

function reviewStatusLabel(status: string, t: (zh: string, en: string) => string): string {
  const key = String(status ?? '').toLowerCase()
  const pair = REVIEW_STATUS_LABELS[key]
  if (pair) return t(pair[0], pair[1])
  return key || t('未知', 'Unknown')
}

function reviewStatusVariant(status: string): BadgeVariant {
  const key = String(status ?? '').toLowerCase()
  if (key === 'approved') return 'accent'
  if (key === 'rejected') return 'danger'
  if (key === 'needs_verification' || key === 'review' || key === 'in_review') return 'warning'
  return 'neutral'
}

function reviewTarget(review: AnyRecord, t: (zh: string, en: string) => string): { kind: string; id: string } {
  const taskId = textOf(review.taskId)
  if (taskId) return { kind: t('任务', 'Task'), id: taskId }
  const workflowId = textOf(review.workflowId)
  if (workflowId) return { kind: t('工作流', 'Workflow'), id: workflowId }
  const sessionId = textOf(review.sessionId)
  if (sessionId) return { kind: t('会话', 'Session'), id: sessionId }
  return { kind: t('目标', 'Target'), id: textOf(review.id) }
}

const TARGET_TYPES = [
  { value: 'taskId', labelZh: '任务 ID', labelEn: 'Task ID' },
  { value: 'workflowId', labelZh: '工作流 ID', labelEn: 'Workflow ID' },
  { value: 'sessionId', labelZh: '会话 ID', labelEn: 'Session ID' }
] as const

function shortDate(value: unknown): string {
  const date = new Date(textOf(value))
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/* ------------------------------------------------------------- component */

export default function Reviews() {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const [reviews, setReviews] = useState<AnyRecord[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const [requestOpen, setRequestOpen] = useState(false)
  const [resultState, setResultState] = useState<AnyRecord | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setMessage('')
    try {
      const data = await apiGet<AnyRecord>('/api/reviews')
      setReviews(asArray<AnyRecord>((data as AnyRecord).reviews))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const review of reviews) {
      const key = textOf(review.status, 'unknown').toLowerCase()
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [reviews])

  const statusItems = useMemo(
    () =>
      Array.from(statusCounts.keys()).map(key => ({
        value: key,
        label: reviewStatusLabel(key, t),
        count: statusCounts.get(key) ?? 0
      })),
    [statusCounts, t]
  )

  const normalizedQuery = query.trim().toLowerCase()
  const filteredReviews = useMemo(
    () =>
      reviews.filter(review => {
        if (statusFilter !== 'all' && textOf(review.status, 'unknown').toLowerCase() !== statusFilter) return false
        if (!normalizedQuery) return true
        return [review.title, review.taskId, review.workflowId, review.sessionId, review.project, review.id]
          .some(value => textOf(value).toLowerCase().includes(normalizedQuery))
      }),
    [reviews, statusFilter, normalizedQuery]
  )

  // All KPIs derived strictly from the loaded `reviews` array.
  const total = reviews.length
  const pendingCount = reviews.filter(review =>
    PENDING_STATUSES.includes(textOf(review.status, '').toLowerCase())
  ).length
  const approvedCount = reviews.filter(
    review => textOf(review.status, '').toLowerCase() === 'approved'
  ).length
  const rejectedCount = reviews.filter(
    review => textOf(review.status, '').toLowerCase() === 'rejected'
  ).length
  const cancelledCount = reviews.filter(
    review => textOf(review.status, '').toLowerCase() === 'cancelled'
  ).length

  // Cumulative review volume over time, built only from real `requestedAt`.
  const trend = useMemo(() => {
    const dated = reviews
      .map(review => ({ review, time: new Date(textOf(review.requestedAt)).getTime() }))
      .filter(item => !Number.isNaN(item.time))
      .sort((a, b) => a.time - b.time)
    let cumulative = 0
    const points = dated.map(() => (cumulative += 1))
    const labels = dated.map(item => shortDate(item.review.requestedAt))
    return { points, labels }
  }, [reviews])

  const statusSegments = useMemo(
    () =>
      [
        { label: t('待评审', 'Pending'), value: pendingCount, tone: 'warning' as const },
        { label: t('已通过', 'Approved'), value: approvedCount, tone: 'success' as const },
        { label: t('已驳回', 'Rejected'), value: rejectedCount, tone: 'danger' as const },
        { label: t('已取消', 'Cancelled'), value: cancelledCount, tone: 'neutral' as const }
      ].filter(segment => segment.value > 0),
    [pendingCount, approvedCount, rejectedCount, cancelledCount, t]
  )

  const hasChart = trend.points.length >= 2 && statusSegments.length > 0

  const openResult = (review: AnyRecord) => {
    if (!textOf(review.taskId)) return
    setResultState(review)
  }

  return (
    <>
      <PageHead
        title={t('代码评审', 'Reviews')}
        subtitle={t('查看 AMH 的代码评审请求与结果，并发起新的评审。', 'View AMH code review requests and results, and start a new review.')}
        actions={
          <>
            <Button variant="secondary" onClick={() => void load()} disabled={busy}>
              <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
              {copy.refresh}
            </Button>
            <Button onClick={() => setRequestOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('发起评审', 'New review')}
            </Button>
          </>
        }
      />

      {message ? (
        <AlertBanner
          tone="error"
          title={t('加载失败', 'Failed to load')}
          description={message}
        />
      ) : null}

      <MetricGrid>
        <MetricCard
          label={t('评审总数', 'Total reviews')}
          value={total}
          icon={ClipboardCheck}
        />
        <MetricCard
          label={t('待评审', 'Pending')}
          value={pendingCount}
          icon={Clock}
        />
        <MetricCard
          label={t('已通过', 'Approved')}
          value={approvedCount}
          icon={CheckCircle2}
        />
        <MetricCard
          label={t('已驳回', 'Rejected')}
          value={rejectedCount}
          icon={XCircle}
        />
        <MetricCard
          label={t('已取消', 'Cancelled')}
          value={cancelledCount}
          icon={Ban}
        />
      </MetricGrid>

      {hasChart ? (
        <ChartRow
          title={t('评审趋势', 'Review trend')}
          subtitle={t('累计评审请求数（按请求时间）', 'Cumulative review requests over time')}
          series={[{ label: t('累计评审', 'Cumulative reviews'), points: trend.points }]}
          xLabels={trend.labels.length ? trend.labels : undefined}
          donutTitle={t('状态分布', 'Status distribution')}
          donutCenter={total}
          donutCenterLabel={t('评审', 'Reviews')}
          segments={statusSegments}
        />
      ) : null}

      <Card
        title={t('代码评审', 'Code reviews')}
        count={filteredReviews.length}
        flushBody
      >
        <div className="border-b border-line px-[var(--card-pad)] py-2.5">
          <FilterBar
            search={{
              id: 'review-search',
              value: query,
              onChange: setQuery,
              placeholder: t('搜索标题、ID、项目…', 'Search title, ID, project…'),
              label: t('搜索评审', 'Search reviews')
            }}
            filters={[
              {
                id: 'review-status',
                type: 'single',
                label: copy.status,
                value: statusFilter,
                onChange: setStatusFilter,
                allLabel: copy.allOption,
                options: statusItems.map(item => ({
                  value: item.value,
                  label: item.label,
                  count: item.count
                }))
              }
            ]}
            onClear={() => {
              setQuery('')
              setStatusFilter('all')
            }}
            clearLabel={copy.clear}
          />
        </div>

        {busy && reviews.length === 0 ? (
          <LoadingState variant="rows" label={t('正在加载评审…', 'Loading reviews…')} className="p-4" />
        ) : filteredReviews.length ? (
          <div className="flex flex-col gap-3 p-4">
            {filteredReviews.map(review => {
              const id = textOf(review.id)
              const status = textOf(review.status, 'unknown')
              const title = textOf(review.title, t('（无标题）', '(Untitled)'))
              const project = textOf(review.project)
              const target = reviewTarget(review, t)
              const hasTask = Boolean(textOf(review.taskId))
              return (
                <article
                  key={id}
                  className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-medium text-ink">{title}</h3>
                        <Badge variant={reviewStatusVariant(status)}>{reviewStatusLabel(status, t)}</Badge>
                      </div>
                      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                        <div className="flex gap-1">
                          <dt className="font-medium">{target.kind}</dt>
                          <dd className="font-mono">#{target.id}</dd>
                        </div>
                        {project ? (
                          <div className="flex gap-1">
                            <dt className="font-medium">{t('项目', 'Project')}</dt>
                            <dd>{project}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-ink-3">
                      {t('请求时间：', 'Requested at: ')}{formatRelativeTime(textOf(review.requestedAt))}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {hasTask ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openResult(review)}
                          disabled={busy}
                        >
                          <CheckCheck className="h-4 w-4" />
                          {t('提交结果', 'Submit result')}
                        </Button>
                      ) : (
                        <span className="text-xs text-ink-3">{t('工作流级评审（结果随工作流状态更新）', 'Workflow-level review (updates with workflow status)')}</span>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyState
            title={reviews.length ? t('没有匹配的评审', 'No matching reviews') : t('暂无评审', 'No reviews yet')}
            description={reviews.length ? t('试着调整筛选或搜索条件。', 'Try adjusting the filters or search.') : t('点击下方「发起评审」提交第一个代码评审请求。', 'Click “New review” below to submit the first code review request.')}
          />
        )}
      </Card>

      {requestOpen ? (
        <RequestReviewDialog
          busy={busy}
          language={language}
          onClose={() => setRequestOpen(false)}
          onSubmitted={() => {
            setRequestOpen(false)
            void load()
          }}
        />
      ) : null}

      {resultState ? (
        <SubmitResultDialog
          review={resultState}
          busy={busy}
          language={language}
          onClose={() => setResultState(null)}
          onSubmitted={() => {
            setResultState(null)
            void load()
          }}
        />
      ) : null}
    </>
  )
}

/* ----------------------------------------------------- request dialog */

function RequestReviewDialog({
  busy: parentBusy,
  onClose,
  onSubmitted,
  language
}: {
  busy: boolean
  onClose: () => void
  onSubmitted: () => void
  language: AppLanguage
}) {
  const [targetType, setTargetType] = useState<string>('taskId')
  const [targetId, setTargetId] = useState('')
  const [reviewer, setReviewer] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const submit = async () => {
    const id = targetId.trim()
    if (!id) {
      setError(t('请填写目标 ID（任务 / 工作流 / 会话）。', 'Please provide a target ID (task / workflow / session).'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const body: AnyRecord = {
        [targetType]: id,
        to: reviewer.trim() || 'all',
        text: note.trim() || 'Review requested.',
        by: 'dashboard'
      }
      await apiPost('/api/reviews/request', body)
      onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent className="review-request-dialog" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('发起评审', 'New review')}</DialogTitle>
          <DialogDescription>
            {t('指定一个任务、工作流或会话，向评审人发起代码评审请求。', 'Pick a task, workflow, or session and send a code review request to a reviewer.')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="review-target-type">{t('目标类型', 'Target type')}</Label>
            <select
              id="review-target-type"
              value={targetType}
              onChange={event => setTargetType(event.target.value)}
              className={cn(fieldBaseStyles, 'h-9 px-3 py-0')}
            >
              {TARGET_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {t(type.labelZh, type.labelEn)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="review-target-id">{t('目标 ID', 'Target ID')}</Label>
            <input
              id="review-target-id"
              value={targetId}
              onChange={event => setTargetId(event.target.value)}
              placeholder={t('例如 task-123 / wf-456 / session-789', 'e.g. task-123 / wf-456 / session-789')}
              className={cn(fieldBaseStyles, 'h-9 px-3 py-0 font-mono')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="review-reviewer">{t('评审人', 'Reviewer')}</Label>
            <input
              id="review-reviewer"
              value={reviewer}
              onChange={event => setReviewer(event.target.value)}
              placeholder={t('留空则通知所有人（all）', 'Leave empty to notify everyone (all)')}
              className={cn(fieldBaseStyles, 'h-9 px-3 py-0')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="review-note">{t('备注', 'Note')}</Label>
            <Textarea
              id="review-note"
              className="font-normal"
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder={t('评审说明、关注点、上下文…', 'Review notes, focus areas, context…')}
            />
          </div>
          {error ? <ErrorState variant="inline" title={error} /> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy || parentBusy}>
              {t('取消', 'Cancel')}
            </Button>
          </DialogClose>
          <Button onClick={() => void submit()} disabled={busy || parentBusy}>
            {busy ? t('提交中…', 'Submitting…') : t('发起评审', 'New review')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------------------------------- result dialog */

function SubmitResultDialog({
  review,
  busy: parentBusy,
  onClose,
  onSubmitted,
  language
}: {
  review: AnyRecord
  busy: boolean
  onClose: () => void
  onSubmitted: () => void
  language: AppLanguage
}) {
  const taskId = textOf(review.taskId)
  const [decision, setDecision] = useState('approved')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const submit = async () => {
    if (!taskId) {
      setError(t('该评审缺少关联的任务 ID，无法提交结果。', 'This review is missing its linked task ID and cannot submit a result.'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await apiPost('/api/reviews/result', {
        taskId,
        decision,
        note: note.trim(),
        by: 'dashboard'
      })
      onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent className="review-result-dialog" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('提交评审结果', 'Submit review result')}</DialogTitle>
          <DialogDescription>
            {textOf(review.title, t('（无标题）', '(Untitled)'))} · {t('任务', 'Task')} #{taskId}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="review-decision">{t('决定', 'Decision')}</Label>
            <select
              id="review-decision"
              value={decision}
              onChange={event => setDecision(event.target.value)}
              className={cn(fieldBaseStyles, 'h-9 px-3 py-0')}
            >
              <option value="approved">{t('通过', 'Approve')}</option>
              <option value="rejected">{t('驳回', 'Reject')}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="review-result-note">{t('备注', 'Note')}</Label>
            <Textarea
              id="review-result-note"
              className="font-normal"
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder={t('评审意见、修改建议…（可选）', 'Review comments, suggestions… (optional)')}
            />
          </div>
          {error ? <ErrorState variant="inline" title={error} /> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy || parentBusy}>
              {t('取消', 'Cancel')}
            </Button>
          </DialogClose>
          <Button onClick={() => void submit()} disabled={busy || parentBusy}>
            {busy ? t('提交中…', 'Submitting…') : t('提交结果', 'Submit result')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
