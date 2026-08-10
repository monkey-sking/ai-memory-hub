import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import "@/components/shell/shell.css"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn("fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px]", className)}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="dialog-title"
    className={cn("text-lg font-semibold text-ink", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-slot="dialog-description"
    className={cn("text-sm text-ink-3", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Set to false to opt out of the built-in close button. */
  showCloseButton?: boolean
  /** Accessible name for the built-in close button. */
  closeLabel?: string
}

/**
 * Viewport-capped dialog surface (console standard §4.2).
 *
 * Structure: the shell is `p-0 gap-0` and every *slot* owns its own padding
 * (`px-4`, per §9.2). That is the whole point — with padding on the shell the
 * header rule and the footer rule cannot span edge to edge, and the dialog
 * reads as "a box with stuff in it" instead of a composed surface.
 *
 * The surface is a flex column capped at `100dvh - 24px`. `DialogHeader` and
 * `DialogFooter` never shrink; every other direct child becomes the single
 * scroll region and picks up the slot padding automatically (see shell.css),
 * which keeps the legacy `.dialog-scroll-shell` / `.dialog-scroll-body`
 * patches in Dashboard.css redundant but harmless.
 *
 * Elevation L3: `shadow-lg` + `rounded-2xl` (18px) — the only tier above the
 * border-only L1 panels, and a visible step above the 14px card radius.
 *
 * Widths: `sm:max-w-md` confirm · `sm:max-w-lg` form · `sm:max-w-xl` sheet-ish
 * · `sm:max-w-3xl` sheet-with-table. Wider than that should be a route.
 * Anything variable-length (a record inspector, a raw JSON dump) belongs in
 * `shell/Sheet.tsx`, not here.
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, showCloseButton = true, closeLabel = "Close", ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      data-slot="dialog-content"
      className={cn(
        "fixed left-1/2 top-1/2 z-50 flex w-[calc(100vw-24px)] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
        "max-h-[calc(100dvh-24px)] rounded-2xl border border-line bg-surface shadow-lg",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogPrimitive.Close
          data-slot="dialog-close"
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-sunk hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:pointer-events-none"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{closeLabel}</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

/** Slot padding lives here, not on the shell, so the rule spans edge to edge. */
const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn("flex flex-col gap-1 border-b border-line px-4 py-4 pr-12 text-left", className)}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

/**
 * Optional explicit scroll region. Not required — any direct child of
 * `DialogContent` that is neither the header nor the footer already scrolls
 * and already carries the slot padding — but preferred for new dialogs
 * because it is self-documenting.
 *
 * `max-h-[60vh]` stacks with the shell's `100dvh - 24px` cap so tall content
 * can never push the footer off screen.
 */
const DialogBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="dialog-body"
      className={cn(
        "min-h-0 max-h-[60vh] flex-1 overflow-y-auto overscroll-contain px-4 py-4",
        className
      )}
      {...props}
    />
  )
)
DialogBody.displayName = "DialogBody"

/**
 * The action zone. Sitting on `bg-surface-sunk` above a hairline is what makes
 * it read as a separate region rather than more body content.
 *
 * `flex-col-reverse` at mobile is deliberate: the primary action is the LAST
 * DOM child, so it lands on the right on desktop and on TOP on mobile, within
 * thumb reach.
 */
const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn(
      "flex flex-col-reverse gap-2 border-t border-line bg-surface-sunk px-4 py-2",
      "sm:flex-row sm:items-center sm:justify-end",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
