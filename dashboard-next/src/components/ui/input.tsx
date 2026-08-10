import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Shared field *skin* for every text control — hairline border, surface bg,
 * text colour, and the hover / focus / invalid / disabled states.
 *
 * Focus is a TWO-PART ring: a 1px solid `--color-focus` border plus a 3px
 * translucent `--color-focus-halo`. Each part does a different job and neither
 * works alone. The solid border carries WCAG 1.4.11 (3:1 against the adjacent
 * surface); the halo is what makes it read as focus rather than as a slightly
 * darker field. The previous version set a solid accent border AND a solid 2px
 * ring flush against it, which composited into a 3px dark slab.
 *
 * It deliberately carries NO height and NO padding: geometry belongs to the
 * call site, because a `<textarea>` and a 32px toolbar `<select>` cannot share
 * one height. Callers must therefore add their own:
 *
 *   - form control:    `flex h-9 px-3 py-0`   (36px — the §9.2 default)
 *   - toolbar control: `flex h-8 px-2 py-0`   (32px)
 *   - multiline:       `min-h-*` + real `py-*` — see `textarea.tsx`
 *
 * Two traps this has already caused, both worth reading before you consume it:
 *
 * 1. `py-0` is REQUIRED on any fixed-height control, not optional tidiness.
 *    `<input>` and `<select>` carry UA vertical padding, so omitting it leaves
 *    the browser as a second source of truth fighting your `h-*` (§9.2: 设了
 *    `height` 就不要再设垂直 `padding`). The rule is scoped to *fixed-height*
 *    controls — `textarea.tsx` keeps `py-2` and is correct, since with no fixed
 *    height there is no second source of truth to conflict with.
 * 2. This string leads with `w-full`. Non-full-width consumers (toolbar
 *    filters) must pass `w-auto`, and must compose via `cn()` for the merge to
 *    actually win — plain template-string concatenation emits both classes and
 *    lets stylesheet order decide.
 */
export const fieldBaseStyles =
  "w-full rounded-md border border-input bg-surface text-sm text-ink shadow-none " +
  "transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-color)] " +
  "placeholder:text-ink-3 hover:border-line-strong " +
  "focus-visible:border-focus focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-field)] " +
  "aria-invalid:border-danger aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:shadow-[var(--shadow-focus-invalid)] " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunk disabled:text-ink-3 disabled:border-line"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          fieldBaseStyles,
          "flex h-9 px-3 py-0",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
