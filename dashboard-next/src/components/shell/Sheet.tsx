import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import './shell.css'

/**
 * Side / bottom sheet, built on the same Radix Dialog primitives as
 * `ui/dialog.tsx`.
 *
 * WHICH CONTAINER DO I USE?
 *   Confirm, or a short form of four fields or fewer  → Dialog.
 *   Inspect a row, a long form, anything variable-length → Sheet.
 * A centered dialog wrapping a raw JSON dump is always wrong: the content has
 * no natural height, so the modal either overflows the viewport or leaves a
 * band of dead space. A sheet is full-height by construction and scrolls in
 * one region.
 *
 * Structure mirrors Dialog exactly: the content shell is `p-0 gap-0` so the
 * header and footer rules span edge to edge, and each slot owns `px-4`. The
 * body is the ONLY scroll container. Header and footer are `shrink-0`.
 *
 * Elevation L3 (`shadow-lg`) and radius 18px, matching Dialog — only the
 * edges that are not flush with the viewport are rounded.
 */
const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetPortal = DialogPrimitive.Portal
const SheetClose = DialogPrimitive.Close

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="sheet-overlay"
    className={cn('fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px]', className)}
    {...props}
  />
))
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

export type SheetSide = 'right' | 'bottom'

const sheetSideClasses: Record<SheetSide, string> = {
  right:
    'inset-y-0 right-0 h-full w-full border-l border-line rounded-l-2xl sm:max-w-xl',
  bottom:
    'inset-x-0 bottom-0 max-h-[85dvh] w-full border-t border-line rounded-t-2xl',
}

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** `right` on desktop, `bottom` under md. Defaults to `right`. */
  side?: SheetSide
  /** Set to false to opt out of the built-in close button. */
  showCloseButton?: boolean
  /** Accessible name for the built-in close button. */
  closeLabel?: string
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(
  (
    { className, children, side = 'right', showCloseButton = true, closeLabel = 'Close', ...props },
    ref
  ) => (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="sheet-content"
        data-side={side}
        // See dialog.tsx: aria-hidden never hides an [aria-live] ancestor, so the
        // page behind this sheet stays reachable without an explicit aria-modal.
        aria-modal="true"
        className={cn(
          'fixed z-50 flex flex-col gap-0 overflow-hidden bg-surface p-0 shadow-lg',
          sheetSideClasses[side],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="sheet-close"
            className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-sunk hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:pointer-events-none"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </SheetPortal>
  )
)
SheetContent.displayName = 'SheetContent'

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="sheet-header"
    className={cn('flex flex-col gap-1 border-b border-line px-4 py-4 pr-12 text-left', className)}
    {...props}
  />
)
SheetHeader.displayName = 'SheetHeader'

/**
 * Optional explicit scroll region. Any direct child of `SheetContent` that is
 * neither header nor footer already scrolls and already carries the slot
 * padding (see shell.css) — this is just the self-documenting form.
 */
const SheetBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="sheet-body"
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4', className)}
      {...props}
    />
  )
)
SheetBody.displayName = 'SheetBody'

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="sheet-title"
    className={cn('truncate text-base font-semibold text-ink', className)}
    {...props}
  />
))
SheetTitle.displayName = DialogPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-slot="sheet-description"
    className={cn('text-sm text-ink-3', className)}
    {...props}
  />
))
SheetDescription.displayName = DialogPrimitive.Description.displayName

/** Primary action is the LAST child so it lands right on desktop, top on mobile. */
const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="sheet-footer"
    className={cn(
      'flex flex-col-reverse gap-2 border-t border-line bg-surface-sunk px-4 py-2',
      'sm:flex-row sm:items-center sm:justify-end',
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = 'SheetFooter'

/**
 * Definition grid for the "inspect a record" case: a fixed 120px label rail so
 * every value starts on the same line. Values must carry `truncate` or wrap.
 */
const SheetDetailList = React.forwardRef<HTMLDListElement, React.HTMLAttributes<HTMLDListElement>>(
  ({ className, ...props }, ref) => (
    <dl
      ref={ref}
      data-slot="sheet-detail-list"
      className={cn(
        'grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm',
        '[&>dt]:min-w-0 [&>dt]:truncate [&>dt]:text-ink-3',
        '[&>dd]:m-0 [&>dd]:min-w-0 [&>dd]:break-words [&>dd]:text-ink',
        className
      )}
      {...props}
    />
  )
)
SheetDetailList.displayName = 'SheetDetailList'

export interface SheetRawBlockProps extends React.HTMLAttributes<HTMLDetailsElement> {
  /** Summary label. Defaults to "Raw JSON". */
  label?: React.ReactNode
  /** Serialized payload. */
  children: React.ReactNode
}

/**
 * Collapsed raw payload. The reason this exists is to stop `<pre>{JSON…}</pre>`
 * from being the primary content of a modal: it is reference material, so it
 * ships closed, capped at 256px, and scrolls on its own.
 */
const SheetRawBlock = React.forwardRef<HTMLDetailsElement, SheetRawBlockProps>(
  ({ className, label = 'Raw JSON', children, ...props }, ref) => (
    <details
      ref={ref}
      data-slot="sheet-raw-block"
      className={cn('overflow-hidden rounded-md border border-line', className)}
      {...props}
    >
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-sunk">
        {label}
      </summary>
      <pre className="max-h-64 overflow-auto border-t border-line bg-surface-sunk p-3 text-xs leading-relaxed text-ink-2">
        {children}
      </pre>
    </details>
  )
)
SheetRawBlock.displayName = 'SheetRawBlock'

export {
  Sheet,
  SheetTrigger,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
  SheetDetailList,
  SheetRawBlock,
}
