import { X, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

interface ToastMessage {
  id: string
  tone: 'success' | 'error'
  message: string
}

interface ToastStackProps {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg animate-in slide-in-from-right',
            toast.tone === 'success' ? 'bg-card border-primary/20' : 'bg-destructive/10 border-destructive/20'
          )}
        >
          {toast.tone === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-destructive shrink-0" />
          )}
          <p className="text-sm flex-1">{toast.message}</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0"
            onClick={() => onDismiss(toast.id)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}
