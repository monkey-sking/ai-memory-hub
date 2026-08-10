import type { ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import { X, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { dashboardLabels } from '@/lib/dashboardCopy'
import type { AppOutletContext } from '@/lib/i18n'

interface ToastMessage {
  id: string
  tone: 'success' | 'error'
  message: string
}

interface ToastStackProps {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

function ToastItem({
  toast,
  tone,
  icon,
  onDismiss,
  closeLabel
}: {
  toast: ToastMessage
  tone: 'success' | 'error'
  icon: ReactNode
  onDismiss: (id: string) => void
  closeLabel: string
}) {
  return (
    <div
      className={cn(
        // The stack itself is click-through (see below), so each toast has to opt
        // its own box back in or its dismiss button would be unclickable.
        'toast pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg',
        tone === 'success'
          ? 'bg-card border-primary/20'
          : 'bg-danger-tint border-danger-line'
      )}
    >
      {icon}
      <p className="text-sm flex-1">{toast.message}</p>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 shrink-0"
        aria-label={closeLabel}
        onClick={() => onDismiss(toast.id)}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  )
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  const { language } = useOutletContext<AppOutletContext>()
  const closeLabel = dashboardLabels[language].close
  const successToasts = toasts.filter(t => t.tone === 'success')
  const errorToasts = toasts.filter(t => t.tone === 'error')

  return (
    // This container is always mounted, and `.toast-stack` (Dashboard.css:10) pins it
    // with `top: 18px` while the utility below sets `bottom: 1rem` — an auto-height
    // box with both edges pinned stretches, so it covered a ~360px-wide, full-height
    // column on the right and ate every click there even with zero toasts.
    <div className="toast-stack pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      <div aria-live="polite" role="status" className="contents">
        {successToasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} tone="success" icon={<CheckCircle2 className="w-5 h-5 text-primary shrink-0" />} onDismiss={onDismiss} closeLabel={closeLabel} />
        ))}
      </div>
      <div role="alert" className="contents">
        {errorToasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} tone="error" icon={<XCircle className="w-5 h-5 text-danger shrink-0" />} onDismiss={onDismiss} closeLabel={closeLabel} />
        ))}
      </div>
    </div>
  )
}
