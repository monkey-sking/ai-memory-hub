import * as React from "react"
import { cn } from "@/lib/utils"

const badgeBaseStyles =
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors"

const badgeVariants = {
  default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
  secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
  destructive: "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
  outline: "text-foreground",
} as const

export type BadgeVariant = keyof typeof badgeVariants

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeBaseStyles, badgeVariants[variant], className)}
      {...props}
    />
  )
)
Badge.displayName = "Badge"

export { Badge }
