import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Fixed 20px height rather than vertical padding. A badge is a passenger inside
 * 56px list rows and 48px table rows; if its height is derived from its own
 * text metrics it changes the row height whenever a label wraps to a different
 * font, which is what breaks column alignment down a virtualised list.
 */
const badgeBaseStyles =
  "inline-flex h-5 items-center gap-1 rounded-full border px-2 text-xs font-medium leading-4 whitespace-nowrap transition-colors"

/**
 * Semantic tint variants: Radix step-3 background + step-6 border + a
 * dedicated on-tint foreground token.
 *
 * The foreground is `-text`, NOT the plain step-11 token. Radix guarantees
 * step 11 against steps 1-2 (the app background), not against step 3, and on
 * step 3 every variant measures 4.1-4.5 — under AA for 12px text. The `-text`
 * tokens sit between steps 11 and 12: 5.95-6.56 on tint, hue intact.
 *
 * The borders used to be composed as `border-success/20` etc. That looks
 * reasonable and is wrong: a 20% alpha of a saturated hue composited over a
 * near-white tint resolves to a GREY. `#15803d` at 20% over `#eaf6ee` lands on
 * roughly `#cfe1d3`. Every status badge in the product was therefore outlined
 * in grey-green or grey-pink, which is most of the difference between reading
 * as a badge and reading as a badge-shaped blob. The `-line` tokens are real
 * saturated step-6 hexes, so the outline keeps its hue.
 *
 * FOREGROUNDS ARE NOT THE step-11 TOKENS. A previous revision moved them to
 * bare `text-success` / `text-info` etc. on the premise that "Radix designs
 * step 11 to clear 4.5:1 on step 1-3". That is not what Radix guarantees —
 * step 11 is specified against step 1-2 (the app background). Against step 3
 * it lands just under, and measuring it here gave: success 4.19, warning 4.25,
 * info 4.25, accent 4.10 — four failures at 11px, three of which had been
 * passing before that change. Only danger (4.54) and neutral (6.25) survived.
 *
 * So the foreground is the `-text` family, which exists precisely for this
 * case: `--color-*` is the step-11 value for text on WHITE, `--color-*-text`
 * is the darker step for text on that colour's own TINT. Measured on the tint,
 * which is the only measurement that means anything here:
 *
 *   success 6.54   danger 6.56   warning 6.04
 *   info    6.28   accent 5.95   neutral 6.25
 *
 * Do not "simplify" `text-success-text` back to `text-success`. It reads like
 * a redundant suffix and is the exact edit that caused the four failures above.
 *
 * These numbers depend on the tint, not just the ink, so changing any
 * `--color-*-tint` silently invalidates all six. Re-measure rather than
 * assuming a Radix step pairing carries over.
 *
 * The four legacy shadcn variants are kept so existing call sites still work.
 */
const badgeVariants = {
  /* --- semantic ------------------------------------------------------- */
  neutral: "border-line bg-surface-sunk text-ink-2",
  accent: "border-accent-line bg-accent-tint text-accent-text",
  success: "border-success-line bg-success-tint text-success-text",
  warning: "border-warning-line bg-warning-tint text-warning-text",
  danger: "border-danger-line bg-danger-tint text-danger-text",
  info: "border-info-line bg-info-tint text-info-text",
  /* --- legacy shadcn names -------------------------------------------- */
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-line bg-surface-sunk text-ink-2",
  destructive: "border-transparent bg-destructive text-destructive-foreground",
  outline: "border-line bg-surface text-ink",
} as const

export type BadgeVariant = keyof typeof badgeVariants

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  /** Renders a small leading dot in the current text colour. */
  dot?: boolean
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'neutral', dot = false, children, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeBaseStyles, badgeVariants[variant], className)}
      {...props}
    >
      {dot ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  )
)
Badge.displayName = "Badge"

export { Badge }
