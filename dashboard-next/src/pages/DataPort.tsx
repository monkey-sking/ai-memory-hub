import { useCallback, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Download, Upload, Eye, PlayCircle, FileJson } from 'lucide-react'
import { apiGet, apiPost, asArray, asRecord, numberOf, textOf, type AnyRecord } from '../lib/api'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { EmptyState, ErrorState } from '../components/shell'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Card, PageHead } from '@/components/ds'

/**
 * 数据导入 / 导出与迁移（feature ③）。
 * - 导出：把 memory 核心存储打包成单个可移植 JSON 包（/api/data/export），前端下载。
 * - 导入：贴入或选择包文件 → 先干跑预览计划（apply=false）→ 执行（apply=true，后端先自动安全备份再原子写回）。
 * 全部走真实端点，复用后台队列（?background=1）做长导入。
 */

const TITLES: Record<AppLanguage, string> = {
  zh: '数据迁移',
  en: 'Data Migration'
}
const SUBTITLES: Record<AppLanguage, string> = {
  zh: '把记忆中枢导出为可移植包，或把包导入到本机（导入前自动安全备份）',
  en: 'Export the memory hub to a portable bundle, or import a bundle (auto safety backup before apply)'
}

type PlanRow = {
  rel: string
  exists: boolean
  bytes: number
  changed: boolean
  skipped?: boolean
  reason?: string
}

export default function DataPort() {
  const { language } = useOutletContext<AppOutletContext>()
  const isZh = language === 'zh'

  const [exporting, setExporting] = useState(false)
  const [exportMeta, setExportMeta] = useState<{ storeCount: number; exportedAt: string } | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const [bundleText, setBundleText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [plan, setPlan] = useState<PlanRow[] | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [background, setBackground] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<AnyRecord | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const doExport = useCallback(async () => {
    setExporting(true)
    setExportError(null)
    setExportMeta(null)
    try {
      const data = await apiGet<AnyRecord>('/api/data/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `amh-port-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setExportMeta({ storeCount: numberOf(data.storeCount), exportedAt: textOf(data.exportedAt) })
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }, [])

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setBundleText(String(reader.result || ''))
    reader.readAsText(f)
  }, [])

  const previewPlan = useCallback(async () => {
    setParseError(null)
    setPlanError(null)
    let bundle: AnyRecord
    try {
      bundle = JSON.parse(bundleText)
    } catch {
      setParseError(isZh ? 'JSON 解析失败，请检查包内容' : 'Invalid JSON, check the bundle')
      return
    }
    setPlanning(true)
    setPlan(null)
    try {
      const res = await apiPost<AnyRecord>('/api/data/import', { bundle, apply: false })
      const rows = asArray(res.plan).map((r) => ({
        rel: textOf(r.rel),
        exists: Boolean(r.exists),
        bytes: numberOf(r.bytes),
        changed: Boolean(r.changed),
        skipped: Boolean(r.skipped),
        reason: textOf(r.reason)
      }))
      setPlan(rows)
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : String(e))
    } finally {
      setPlanning(false)
    }
  }, [bundleText, isZh])

  const applyImport = useCallback(async () => {
    setApplyError(null)
    let bundle: AnyRecord
    try {
      bundle = JSON.parse(bundleText)
    } catch {
      setApplyError(isZh ? 'JSON 解析失败，请检查包内容' : 'Invalid JSON, check the bundle')
      return
    }
    setApplying(true)
    setResult(null)
    try {
      const path = background ? '/api/data/import?background=1' : '/api/data/import'
      const res = await apiPost<AnyRecord>(path, { bundle, apply: true })
      if (background && (res as any).background) {
        // 后台任务：轮询直到终态。
        const taskId = textOf((res as any).task?.id)
        const startedAt = Date.now()
        while (Date.now() - startedAt < 30000) {
          await new Promise((r) => setTimeout(r, 800))
          const t = await apiGet<AnyRecord>(`/api/background-tasks/${taskId}`)
          const task = asRecord(t.task)
          if (textOf(task.status) === 'done' || textOf(task.status) === 'error') {
            setResult(asRecord((task as any).result))
            break
          }
        }
      } else {
        setResult(res)
      }
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e))
    } finally {
      setApplying(false)
    }
  }, [bundleText, background, isZh])

  const changedCount = plan ? plan.filter((p) => p.changed && !p.skipped).length : 0

  return (
    <>
      <PageHead title={TITLES[language]} subtitle={SUBTITLES[language]} />
      <div className="flex flex-col gap-6 p-4">
        {/* 导出 */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Download className="h-4 w-4" />
            <span className="font-medium">{isZh ? '导出可移植包' : 'Export portable bundle'}</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {isZh
              ? '把记忆中枢的核心存储（记忆/任务/项目/工作流/凭证/广播等）打包成一个 JSON 文件，不含运行时锁与可重建索引。'
              : 'Bundle core stores (memories/tasks/projects/workflows/credentials/radio…) into one JSON file. Excludes runtime locks and regenerable indexes.'}
          </p>
          <Button onClick={doExport} disabled={exporting}>
            {exporting ? (isZh ? '导出中…' : 'Exporting…') : (isZh ? '导出并下载' : 'Export & download')}
          </Button>
          {exportMeta && (
            <p className="text-xs text-muted-foreground mt-2">
              {isZh ? `已导出 ${exportMeta.storeCount} 个存储文件（${exportMeta.exportedAt}）` : `Exported ${exportMeta.storeCount} stores (${exportMeta.exportedAt})`}
            </p>
          )}
          {exportError && <ErrorState title={isZh ? '导出失败' : 'Export failed'} detail={exportError} />}
        </Card>

        {/* 导入 */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Upload className="h-4 w-4" />
            <span className="font-medium">{isZh ? '导入可移植包' : 'Import portable bundle'}</span>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={onFile}
                className="text-sm"
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} className="hidden">
                {isZh ? '选择文件' : 'Choose file'}
              </Button>
            </div>
            <textarea
              value={bundleText}
              onChange={(e) => setBundleText(e.target.value)}
              placeholder={isZh ? '在此粘贴导出的 JSON 包内容…' : 'Paste the exported JSON bundle here…'}
              rows={6}
              className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
            />
            {parseError && <ErrorState title={isZh ? '解析失败' : 'Parse failed'} detail={parseError} />}
            <div className="flex items-center gap-3">
              <Button onClick={previewPlan} disabled={planning || !bundleText.trim()}>
                <Eye className="h-4 w-4 mr-1" />
                {planning ? (isZh ? '预览中…' : 'Previewing…') : (isZh ? '预览导入计划' : 'Preview plan')}
              </Button>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} />
                {isZh ? '后台执行（长导入不卡界面）' : 'Run in background (no UI block)'}
              </label>
            </div>
            {planError && <ErrorState title={isZh ? '预览失败' : 'Preview failed'} detail={planError} />}
            {plan && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <FileJson className="h-4 w-4" />
                  <span>
                    {isZh
                      ? `共 ${plan.length} 项，其中 ${changedCount} 项有变更`
                      : `${plan.length} entries, ${changedCount} will change`}
                  </span>
                </div>
                <div className="max-h-80 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{isZh ? '路径' : 'Path'}</TableHead>
                        <TableHead>{isZh ? '状态' : 'Status'}</TableHead>
                        <TableHead className="text-right">{isZh ? '字节' : 'Bytes'}</TableHead>
                        <TableHead>{isZh ? '是否变更' : 'Changed'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plan.map((row) => (
                        <TableRow key={row.rel}>
                          <TableCell className="font-mono text-xs break-all">{row.rel}</TableCell>
                          <TableCell>
                            {row.skipped ? (
                              <Badge variant="destructive">{row.reason || (isZh ? '跳过' : 'skip')}</Badge>
                            ) : row.exists ? (
                              <Badge variant="secondary">{isZh ? '已存在' : 'exists'}</Badge>
                            ) : (
                              <Badge variant="outline">{isZh ? '新建' : 'new'}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.bytes}</TableCell>
                          <TableCell>
                            {row.skipped ? (
                              <span className="text-muted-foreground">—</span>
                            ) : row.changed ? (
                              <Badge variant="default">{isZh ? '是' : 'yes'}</Badge>
                            ) : (
                              <span className="text-muted-foreground">{isZh ? '否' : 'no'}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button
                  onClick={applyImport}
                  disabled={applying || changedCount === 0}
                  className={cn(applying && 'opacity-70')}
                >
                  <PlayCircle className="h-4 w-4 mr-1" />
                  {applying ? (isZh ? '导入中…' : 'Importing…') : (isZh ? '执行导入（先安全备份）' : 'Apply import (safety backup first)')}
                </Button>
                {applyError && <ErrorState title={isZh ? '导入失败' : 'Import failed'} detail={applyError} />}
                {result && (() => {
                  const r = result as any
                  return (
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={r.ok ? 'default' : 'destructive'}>
                        {r.ok ? (isZh ? '成功' : 'ok') : (isZh ? '失败' : 'failed')}
                      </Badge>
                      {r.applied != null && (
                        <span className="text-muted-foreground">
                          {isZh ? `已写入 ${numberOf(r.written)} 个文件` : `wrote ${numberOf(r.written)} files`}
                        </span>
                      )}
                    </div>
                    {textOf(r.backup) && (
                      <p className="text-xs text-muted-foreground">
                        {isZh ? '安全备份：' : 'Safety backup: '}
                        <span className="font-mono">{textOf(r.backup)}</span>
                      </p>
                    )}
                    {textOf(r.error) && <p className="text-xs text-danger">{textOf(r.error)}</p>}
                  </div>
                  )
                })()}
              </div>
            )}
            {!plan && !planError && (
              <EmptyState
                title={isZh ? '尚未预览导入计划' : 'No plan yet'}
                description={isZh ? '贴入或选择包后点「预览导入计划」' : 'Paste or choose a bundle, then preview the plan'}
              />
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
