import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Link2, RefreshCw } from 'lucide-react'
import { apiGet, asArray, type AnyRecord } from '@/lib/api'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogClose } from './ui/dialog'
import { dashboardLabels } from '@/lib/dashboardCopy'
import type { AppOutletContext } from '@/lib/i18n'

type EntityRef = { type: string; id: string }
type Relation = { id?: string; from: EntityRef; to: EntityRef; relation?: string; status?: string; confidence?: number; evidence?: AnyRecord }
type RelationResponse = { explicit?: Relation[]; suggestions?: Relation[] }

function label(ref: EntityRef): string {
  return `${ref.type}:${ref.id}`
}

export function RelatedEntities({ entityType, entityId, title }: { entityType: string; entityId: string; title?: string }) {
  const { language } = useOutletContext<AppOutletContext>()
  const copy = dashboardLabels[language]
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<RelationResponse>({})

  useEffect(() => {
    if (!open || !entityId) return
    /* eslint-disable react-hooks/set-state-in-effect -- reset loading/error state before each relation fetch */
    setBusy(true)
    setError('')
    /* eslint-enable react-hooks/set-state-in-effect */
    void apiGet<RelationResponse>(`/api/relations?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
      .then(setData)
      .catch(nextError => setError(nextError instanceof Error ? nextError.message : String(nextError)))
      .finally(() => setBusy(false))
  }, [entityId, entityType, open])

  const explicit = asArray<Relation>(data.explicit)
  const suggestions = asArray<Relation>(data.suggestions)
  const titleText = title ?? copy.relationContext
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Link2 className="mr-1.5 h-3.5 w-3.5" />{titleText}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titleText} · {entityType}:{entityId}</DialogTitle>
          <DialogDescription>{copy.relationContext}</DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        {busy ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />{copy.loadingRelations}</p> : null}
        <div className="space-y-4">
          <RelationList title={copy.confirmedRelations} items={explicit} copy={copy} />
          <section className="space-y-2"><h4 className="text-sm font-medium">{copy.inferredContext}</h4>{suggestions.length ? suggestions.map((item, index) => <div className="rounded-md border p-3 text-sm" key={`${label(item.from)}-${label(item.to)}-${index}`}><div>{label(item.from)} <span className="text-muted-foreground">→ {item.relation || 'related-to'} →</span> {label(item.to)}</div><small className="text-muted-foreground">置信度 {Math.round(Number(item.confidence || 0) * 100)}% · {textOfEvidence(item.evidence, copy.contentContext)}</small></div>) : <p className="text-sm text-muted-foreground">{copy.inferredNone}</p>}</section>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{copy.close}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}

function textOfEvidence(evidence: AnyRecord | undefined, fallback: string): string {
  const field = evidence?.field || evidence?.source || fallback
  return String(field)
}

function RelationList({ title, items, copy }: { title: string; items: Relation[]; copy: typeof dashboardLabels.zh }) {
  return <section className="space-y-2"><h4 className="text-sm font-medium">{title}</h4>{items.length ? <div className="space-y-1">{items.map((item, index) => <div className="rounded-md bg-muted/50 px-3 py-2 text-sm" key={`${item.id || index}`}>{label(item.from)} <span className="text-muted-foreground">→ {item.relation || 'related-to'} →</span> {label(item.to)}</div>)}</div> : <p className="text-sm text-muted-foreground">{copy.noRelations}</p>}</section>
}
