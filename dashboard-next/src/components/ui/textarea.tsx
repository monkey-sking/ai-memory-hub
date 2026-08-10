import * as React from "react"
import { cn } from "@/lib/utils"
import { fieldBaseStyles } from "./input"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        data-slot="textarea"
        className={cn(
          fieldBaseStyles,
          "flex min-h-[72px] resize-y px-3 py-2 leading-5",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
