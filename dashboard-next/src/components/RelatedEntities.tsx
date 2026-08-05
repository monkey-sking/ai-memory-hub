import { useEffect, useState } from 'react'
import { Link2, RefreshCw } from 'lucide-react'
import { apiGet, apiPost, asArray, type AnyRecord } from '@/lib/api'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'

type EntityRef = { type: string; id: string }
type Relation = { id?: string; from: EntityRef; to: EntityRef; relation?: string; status?: string; evidence?: AnyRecord }
type RelationResponse = { explicit?: Relation[]; suggestions?: Relation[] }

function label(ref: EntityRef): string {
  return `${ref.type}:${ref.id}`
}

export function RelatedEntities({ entityType, entityId, title = '关联上下文' }: { entityType: string; entityId: string; title?: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<RelationResponse>({})

  useEffect(() => {
    if (!open || !entityId) return
    setBusy(true)
    setError('')
    void apiGet<RelationResponse>(`/api/relations?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
      .then(setData)
      .catch(nextError => setError(nextError instanceof Error ? nextError.message : String(nextError)))
      .finally(() => setBusy(false))
  }, [entityId, entityType, open])

  const accept = async (suggestion: Relation) => {
    setBusy(true)
    try {
      await apiPost('/api/relations', { from: suggestion.from, to: suggestion.to, relation: suggestion.relation || 'related-to', evidence: { ...(suggestion.evidence || {}), source: 'dashboard-confirmed-suggestion' } })
      setData(await apiGet<RelationResponse>(`/api/relations?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy(false)
    }
  }

  const explicit = asArray<Relation>(data.explicit)
  const suggestions = asArray<Relation>(data.suggestions)
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Link2 className="mr-1.5 h-3.5 w-3.5" />{title}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{title} · {entityType}:{entityId}</DialogTitle></DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {busy ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />读取关联中…</p> : null}
        <div className="space-y-4">
          <RelationList title="已确认关联" items={explicit} />
          <section className="space-y-2"><h4 className="text-sm font-medium">待确认建议</h4>{suggestions.length ? suggestions.map((item, index) => <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm" key={`${label(item.from)}-${label(item.to)}-${index}`}><span>{label(item.from)} <span className="text-muted-foreground">→ {item.relation || 'related-to'} →</span> {label(item.to)}</span><Button size="sm" disabled={busy} onClick={() => void accept(item)}>确认</Button></div>) : <p className="text-sm text-muted-foreground">暂无可确认建议</p>}</section>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>关闭</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}

function RelationList({ title, items }: { title: string; items: Relation[] }) {
  return <section className="space-y-2"><h4 className="text-sm font-medium">{title}</h4>{items.length ? <div className="space-y-1">{items.map((item, index) => <div className="rounded-md bg-muted/50 px-3 py-2 text-sm" key={`${item.id || index}`}>{label(item.from)} <span className="text-muted-foreground">→ {item.relation || 'related-to'} →</span> {label(item.to)}</div>)}</div> : <p className="text-sm text-muted-foreground">暂无</p>}</section>
}
