import * as React from "react"
import { cn } from "@/lib/utils"

const buttonBaseStyles = [
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
  "transition-[background-color,border-color,color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
  "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]",
  "disabled:pointer-events-none disabled:opacity-45",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0",
].join(" ")

/**
 * Four real variants + the legacy shadcn aliases. Every variant defines its own
 * hover / active / focus-visible / disabled treatment — no variant relies on
 * opacity alone to signal state.
 *
 * No variant carries a shadow. Per the layout contract (§9.3) shadow means
 * "floating above the page" and is reserved for L2 popovers and L3 dialogs;
 * `secondary`/`outline` are literally the L1 recipe (border-line + bg-surface),
 * where border + shadow together is explicitly forbidden. State is carried by
 * background and border colour instead, which survives dark mode and print.
 */
const buttonVariants = {
  primary:
    "border border-transparent bg-accent-base text-white hover:bg-accent-hover active:bg-accent-active",
  secondary:
    "border border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-sunk active:bg-surface-sunk",
  ghost:
    "border border-transparent bg-transparent text-ink-2 hover:bg-surface-sunk hover:text-ink active:bg-accent-tint active:text-accent-hover",
  danger:
    "border border-transparent bg-danger text-white hover:bg-danger/90 active:bg-danger/80",
  /* --- legacy shadcn names -------------------------------------------- */
  default:
    "border border-transparent bg-accent-base text-white hover:bg-accent-hover active:bg-accent-active",
  destructive:
    "border border-transparent bg-danger text-white hover:bg-danger/90 active:bg-danger/80",
  outline:
    "border border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-sunk active:bg-surface-sunk",
  link:
    "border border-transparent bg-transparent text-accent-base underline-offset-4 hover:text-accent-hover hover:underline",
} as const

/** Heights follow §9.2: sm 32 / default 36 / lg 40, icon buttons 32 square. */
const buttonSizes = {
  sm: "h-8 px-3 text-sm [&_svg]:size-3.5",
  md: "h-9 px-4 text-sm [&_svg]:size-4",
  lg: "h-10 px-6 text-base [&_svg]:size-4",
  /**
   * §9.2 fixes icon buttons at 32×32. Toolbar inputs are also 32, so an icon
   * button sits flush beside them. Next to a 36px form input, pass an explicit
   * `h-9 w-9` rather than reintroducing a second icon size here.
   */
  icon: "h-8 w-8 p-0 [&_svg]:size-4",
  "icon-sm": "h-8 w-8 p-0 [&_svg]:size-3.5",
  /* --- legacy shadcn name --------------------------------------------- */
  default: "h-9 px-4 text-sm [&_svg]:size-4",
} as const

export type ButtonVariant = keyof typeof buttonVariants
export type ButtonSize = keyof typeof buttonSizes

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-slot="button"
      data-variant={variant}
      className={cn(buttonBaseStyles, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  )
)
Button.displayName = "Button"

export { Button }
