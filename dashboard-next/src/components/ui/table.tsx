import * as React from "react"
import { cn } from "@/lib/utils"

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** Classes for the scroll container that wraps the `<table>`. */
  containerClassName?: string
  /**
   * Max height of the scroll container (any CSS length). Set this to make the
   * sticky header actually stick — without it the page scrolls instead.
   */
  maxHeight?: string
  /**
   * The container owns the L1 chrome: `rounded-xl border`, clipped so the
   * sticky head respects the corner radius. Pass `false` only when the table
   * IS a panel body and the panel already provides that frame — two nested
   * borders is the tell-tale of an assembled-looking console.
   */
  bordered?: boolean
}

/**
 * Alignment contract (console standard §9.7): text and badges left; numbers,
 * durations and timestamps right with `tabular-nums` (pass `numeric` to
 * `TableHead`/`TableCell`); an actions column right in a fixed `w-12`.
 * Every non-primary column gets a fixed width and exactly ONE column — the
 * title — absorbs the slack.
 *
 * Row height comes from `h-12` on the row, never from cell padding: two
 * sources of truth for the same number is how densities drift apart. The
 * compact density is exactly two swaps — `h-12`→`h-9` on the row, `px-3`→`px-2`
 * on the cells.
 */
const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerClassName, maxHeight, bordered = true, ...props }, ref) => (
    <div
      data-slot="table-container"
      style={maxHeight ? { maxHeight } : undefined}
      className={cn(
        "relative w-full overflow-auto",
        bordered && "rounded-xl border border-line",
        containerClassName
      )}
    >
      <table
        ref={ref}
        data-slot="table"
        className={cn("w-full caption-bottom border-collapse text-sm", className)}
        {...props}
      />
    </div>
  )
)
Table.displayName = "Table"

/**
 * Sticky by default — pair with `maxHeight` on `<Table>`. The background must
 * stay fully opaque: a translucent head lets rows ghost through as they scroll
 * underneath it.
 */
const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    data-slot="table-header"
    className={cn(
      "sticky top-0 z-10 bg-surface-sunk [&_tr]:h-10 [&_tr]:border-b [&_tr]:border-line [&_tr]:hover:bg-transparent",
      className
    )}
    {...props}
  />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    data-slot="table-body"
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    data-slot="table-footer"
    className={cn(
      "border-t border-line bg-surface-sunk font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    data-slot="table-row"
    className={cn(
      "h-12 border-b border-line transition-colors duration-[var(--dur-fast)] hover:bg-surface-sunk",
      "data-[state=selected]:bg-accent-tint data-[state=selected]:shadow-[inset_2px_0_0_0_var(--color-accent-solid)]",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Right-aligns and applies `tabular-nums`. */
  numeric?: boolean
}

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, numeric = false, ...props }, ref) => (
    <th
      ref={ref}
      data-slot="table-head"
      className={cn(
        "h-10 px-3 py-0 text-left align-middle text-xs font-medium whitespace-nowrap text-ink-3",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        numeric && "text-right tabular-nums",
        className
      )}
      {...props}
    />
  )
)
TableHead.displayName = "TableHead"

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /** Right-aligns and applies `tabular-nums`. */
  numeric?: boolean
}

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, numeric = false, ...props }, ref) => (
    <td
      ref={ref}
      data-slot="table-cell"
      className={cn(
        "px-3 py-0 align-middle text-sm text-ink",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        numeric && "text-right tabular-nums",
        className
      )}
      {...props}
    />
  )
)
TableCell.displayName = "TableCell"

export interface TableEmptyProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Number of columns to span. */
  colSpan: number
}

/** The one correct empty body: a single 96px row, centred, no borders. */
const TableEmpty = React.forwardRef<HTMLTableRowElement, TableEmptyProps>(
  ({ colSpan, className, children, ...props }, ref) => (
    <tr ref={ref} data-slot="table-empty" className={cn("hover:bg-transparent", className)} {...props}>
      <td colSpan={colSpan} className="h-24 px-3 text-center align-middle text-sm text-ink-3">
        {children}
      </td>
    </tr>
  )
)
TableEmpty.displayName = "TableEmpty"

/**
 * §9.1 rule 2 bans margins between siblings in favour of `gap` on the parent.
 * A `<caption>`'s parent is the `<table>`, which is `display: table` and does
 * not support `gap` at all — margin is the only mechanism available here, so
 * this is a deliberate exception rather than an unconverted leftover.
 */
const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    data-slot="table-caption"
    className={cn("mt-3 text-sm text-ink-3", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableCaption,
}
