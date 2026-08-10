import * as React from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import './shell.css'

/* ------------------------------------------------------------------ types */

export interface FilterOption {
  value: string
  label: string
  /** Optional count rendered on the right of the option row. */
  count?: number
  disabled?: boolean
}

export type FilterControlWidth = 'sm' | 'md' | 'lg'

interface FilterControlBase {
  /** Stable key. Also used to build the popover's element ids. */
  id: string
  /** Visible control label ("Status", "项目" …). Comes from dashboardCopy. */
  label: string
  options: FilterOption[]
  /** Summary shown when nothing is selected — e.g. copy.allProjects. */
  allLabel: string
  /** Show a search box above the option list (use for long project lists). */
  searchable?: boolean
  searchPlaceholder?: string
  /** Copy shown when the in-popover search matches nothing. */
  noMatchesLabel?: string
  /** Trigger width bucket. Defaults to `md` (176px). */
  width?: FilterControlWidth
  /** Skip rendering entirely (e.g. when there are no options yet). */
  hidden?: boolean
}

export interface SingleFilterControl extends FilterControlBase {
  type: 'single'
  /** Currently selected value. Use `''` for "no filter". */
  value: string
  onChange: (value: string) => void
}

export interface MultiFilterControl extends FilterControlBase {
  type: 'multi'
  values: string[]
  onChange: (values: string[]) => void
  /** Builds the trigger summary when >0 selected, e.g. n => `${n} 项已选`. */
  selectedLabel?: (count: number) => string
}

export type FilterControl = SingleFilterControl | MultiFilterControl

export interface FilterBarSearch {
  value: string
  onChange: (value: string) => void
  /** Placeholder inside the box (§4.1 — never a separate label row). */
  placeholder?: string
  /** Accessible name. Required so no copy is hardcoded. */
  label: string
  id?: string
}

export interface FilterBarProps {
  search?: FilterBarSearch
  filters?: FilterControl[]
  /** Clear-all handler. The button is hidden when omitted. */
  onClear?: () => void
  clearLabel?: string
  /**
   * Overrides the computed active-filter count shown next to "clear".
   * By default: 1 for a non-empty search + 1 per non-empty control.
   */
  activeCount?: number
  /** Renders the active count, e.g. n => `${n} 个筛选生效`. */
  activeLabel?: (count: number) => string
  /** Extra trailing controls (sort, view switch …). */
  children?: React.ReactNode
  /**
   * How many controls stay inline before the rest collapse behind a single
   * "more" trigger. Defaults to 3 — beyond that the row stops reading as a
   * filter strip and starts reading as a form.
   */
  maxInline?: number
  /** Label for the overflow trigger, e.g. copy.filters. Required to collapse. */
  moreLabel?: string
  className?: string
  'aria-label'?: string
}

/* ---------------------------------------------------------------- helpers */

const widthClass: Record<FilterControlWidth, string> = {
  sm: 'md:w-36',
  md: 'md:w-44',
  lg: 'md:w-56',
}

function isControlActive(control: FilterControl): boolean {
  return control.type === 'multi' ? control.values.length > 0 : control.value !== ''
}

interface PopoverAnchor {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

function measureAnchor(trigger: HTMLElement): PopoverAnchor {
  const rect = trigger.getBoundingClientRect()
  const gutter = 8
  const spaceBelow = window.innerHeight - rect.bottom - gutter
  const spaceAbove = rect.top - gutter
  const openUp = spaceBelow < 200 && spaceAbove > spaceBelow
  const width = Math.min(Math.max(rect.width, 232), window.innerWidth - gutter * 2)
  const left = Math.min(Math.max(gutter, rect.left), window.innerWidth - width - gutter)
  const maxHeight = Math.max(160, Math.min(340, openUp ? spaceAbove : spaceBelow))
  return openUp
    ? { left, width, bottom: window.innerHeight - rect.top + 4, maxHeight }
    : { left, width, top: rect.bottom + 4, maxHeight }
}

/* -------------------------------------------------------- filter dropdown */

interface FilterDropdownProps {
  control: FilterControl
}

function FilterDropdown({ control }: FilterDropdownProps) {
  const [open, setOpen] = React.useState(false)
  const [anchor, setAnchor] = React.useState<PopoverAnchor | null>(null)
  const [query, setQuery] = React.useState('')
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const popoverRef = React.useRef<HTMLDivElement | null>(null)
  const searchRef = React.useRef<HTMLInputElement | null>(null)
  const listId = `${control.id}-filter-list`

  const closeAndRestore = React.useCallback(() => {
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }, [])

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
      setQuery('')
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeAndRestore()
      }
    }
    const reposition = () => {
      if (triggerRef.current) setAnchor(measureAnchor(triggerRef.current))
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, closeAndRestore])

  React.useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      if (control.searchable) searchRef.current?.focus()
      else popoverRef.current?.querySelector<HTMLElement>('[role="option"]')?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, control.searchable])

  if (control.hidden || control.options.length === 0) return null

  const active = isControlActive(control)
  const selectedCount = control.type === 'multi' ? control.values.length : control.value ? 1 : 0
  const summary =
    control.type === 'multi'
      ? selectedCount === 0
        ? control.allLabel
        : control.selectedLabel
          ? control.selectedLabel(selectedCount)
          : String(selectedCount)
      : control.value
        ? (control.options.find(option => option.value === control.value)?.label ?? control.value)
        : control.allLabel

  const needle = query.trim().toLowerCase()
  const visibleOptions = needle
    ? control.options.filter(option => option.label.toLowerCase().includes(needle))
    : control.options

  const toggle = () => {
    if (open) {
      setOpen(false)
      setQuery('')
      return
    }
    if (triggerRef.current) setAnchor(measureAnchor(triggerRef.current))
    setOpen(true)
  }

  const select = (value: string) => {
    if (control.type === 'multi') {
      control.onChange(
        control.values.includes(value)
          ? control.values.filter(item => item !== value)
          : [...control.values, value]
      )
      return
    }
    control.onChange(value)
    closeAndRestore()
  }

  const clearControl = () => {
    if (control.type === 'multi') control.onChange([])
    else control.onChange('')
    if (control.type === 'single') closeAndRestore()
  }

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
    const items = Array.from(
      popoverRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []
    )
    if (items.length === 0) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLElement)
    let next: number
    if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length
    else if (event.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1
    else if (event.key === 'Home') next = 0
    else next = items.length - 1
    items[next]?.focus()
  }

  const isSelected = (value: string) =>
    control.type === 'multi' ? control.values.includes(value) : control.value === value

  return (
    <div className={cn('w-full shrink-0', widthClass[control.width ?? 'md'])}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={toggle}
        className={cn(
          'flex h-8 w-full items-center gap-2 rounded-md border px-3 text-sm transition-colors',
          'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
          active
            ? 'border-accent-base bg-accent-tint text-accent-hover'
            : 'border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-sunk'
        )}
      >
        <span className={cn('shrink-0 text-xs', active ? 'text-accent-hover' : 'text-ink-3')}>
          {control.label}
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-medium">{summary}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && anchor
        ? createPortal(
            <div
              ref={popoverRef}
              style={{
                position: 'fixed',
                left: anchor.left,
                top: anchor.top,
                bottom: anchor.bottom,
                width: anchor.width,
                maxHeight: anchor.maxHeight,
              }}
              className="z-[60] flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm"
              onKeyDown={onListKeyDown}
            >
              {control.searchable ? (
                <div className="shrink-0 border-b border-line p-2">
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={control.searchPlaceholder}
                    aria-label={control.searchPlaceholder ?? control.label}
                    className="h-8 w-full rounded-sm border border-line bg-surface px-2 text-sm text-ink placeholder:text-ink-3 focus-visible:border-focus focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-field)]"
                  />
                </div>
              ) : null}

              <div
                id={listId}
                role="listbox"
                aria-label={control.label}
                aria-multiselectable={control.type === 'multi' || undefined}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={!active}
                  onClick={clearControl}
                  className={cn(
                    'flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:bg-surface-sunk',
                    !active ? 'font-medium text-accent-hover' : 'text-ink hover:bg-surface-sunk'
                  )}
                >
                  <Check
                    className={cn('h-3.5 w-3.5 shrink-0', active && 'invisible')}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{control.allLabel}</span>
                </button>

                {visibleOptions.map(option => {
                  const selected = isSelected(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={option.disabled}
                      onClick={() => select(option.value)}
                      className={cn(
                        'flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm transition-colors',
                        'focus-visible:outline-none focus-visible:bg-surface-sunk',
                        'disabled:pointer-events-none disabled:opacity-50',
                        selected
                          ? 'font-medium text-accent-hover'
                          : 'text-ink hover:bg-surface-sunk'
                      )}
                    >
                      <Check
                        className={cn('h-3.5 w-3.5 shrink-0', !selected && 'invisible')}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.count !== undefined ? (
                        <span className="shrink-0 text-xs tabular-nums text-ink-3">
                          {option.count}
                        </span>
                      ) : null}
                    </button>
                  )
                })}

                {visibleOptions.length === 0 && control.noMatchesLabel ? (
                  <p className="px-2 py-3 text-center text-sm text-ink-3">
                    {control.noMatchesLabel}
                  </p>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

/* -------------------------------------------------------------- filter bar */

/* ------------------------------------------------------- overflow popover */

function FilterOverflow({ label, controls }: { label: string; controls: FilterControl[] }) {
  const [open, setOpen] = React.useState(false)
  const active = controls.filter(isControlActive).length
  return (
    <details
      data-slot="filter-overflow"
      open={open}
      onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      className="relative shrink-0"
    >
      <summary
        className={cn(
          'flex h-8 cursor-pointer list-none items-center gap-2 rounded-md border px-3 text-sm transition-colors',
          'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
          active > 0
            ? 'border-accent-base bg-accent-tint text-accent-hover'
            : 'border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-sunk'
        )}
      >
        <span className="whitespace-nowrap font-medium">{label}</span>
        {active > 0 ? (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-tint-2 px-1 text-xs font-semibold tabular-nums text-accent-hover">
            {active}
          </span>
        ) : null}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </summary>
      <div className="absolute right-0 top-full z-30 mt-1 flex w-64 flex-col gap-2 rounded-xl border border-line bg-surface p-2 shadow-sm">
        {controls.map(control => (
          <FilterDropdown key={control.id} control={control} />
        ))}
      </div>
    </details>
  )
}

/* -------------------------------------------------------------- filter bar */

/**
 * The one filter row for every panel (console standard §4.1).
 *
 * Deliberately CHROME-LESS: no border, no background, no padding of its own.
 * It is designed to drop straight into a `Panel`'s 48px toolbar slot, which
 * already supplies the frame and the 16px left rail — a bordered filter bar
 * inside a bordered panel is a double frame.
 *
 * Every control is 32px (`sm`) so a toolbar row cannot drift taller than 48px.
 * Search comes FIRST and is capped at `max-w-xs`: a full-width search box
 * reads as the page's primary content rather than a filter.
 *
 * Desktop: a single non-wrapping rail that scrolls horizontally when the
 * viewport gets tight. Below `md` the rail stacks vertically.
 * `ml-auto` is the ONLY right-alignment mechanism here — no spacer divs, no
 * `justify-between`.
 */
const FilterBar = React.forwardRef<HTMLDivElement, FilterBarProps>(
  (
    {
      search,
      filters,
      onClear,
      clearLabel,
      activeCount,
      activeLabel,
      children,
      maxInline = 3,
      moreLabel,
      className,
      ...rest
    },
    ref
  ) => {
    const controls = (filters ?? []).filter(control => !control.hidden && control.options.length > 0)
    const collapse = Boolean(moreLabel) && controls.length > maxInline
    const inlineControls = collapse ? controls.slice(0, maxInline) : controls
    const overflowControls = collapse ? controls.slice(maxInline) : []
    const computedActive =
      (search && search.value.trim() ? 1 : 0) + controls.filter(isControlActive).length
    const active = activeCount ?? computedActive

    return (
      <div
        ref={ref}
        data-slot="filter-bar"
        data-shell-rail=""
        role="search"
        className={cn(
          'flex w-full min-w-0 flex-col gap-2',
          'md:flex-row md:flex-nowrap md:items-center md:overflow-x-auto',
          className
        )}
        {...rest}
      >
        {search ? (
          <div className="relative w-full shrink-0 md:w-64 md:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <input
              id={search.id}
              type="search"
              value={search.value}
              onChange={event => search.onChange(event.target.value)}
              placeholder={search.placeholder}
              aria-label={search.label}
              className="h-8 w-full rounded-md border border-line bg-surface pl-8 pr-3 text-sm text-ink transition-colors placeholder:text-ink-3 hover:border-line-strong focus-visible:border-focus focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-field)]"
            />
          </div>
        ) : null}

        {inlineControls.map(control => (
          <FilterDropdown key={control.id} control={control} />
        ))}

        {overflowControls.length && moreLabel ? (
          <FilterOverflow label={moreLabel} controls={overflowControls} />
        ) : null}

        {children}

        {onClear ? (
          <div className="flex shrink-0 items-center gap-2 md:ml-auto md:pl-2">
            {active > 0 && activeLabel ? (
              <span className="hidden whitespace-nowrap text-xs tabular-nums text-ink-3 lg:inline">
                {activeLabel(active)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onClear}
              disabled={active === 0}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
                'text-ink-2 hover:bg-surface-sunk hover:text-ink',
                'disabled:pointer-events-none disabled:opacity-40'
              )}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {clearLabel}
              {active > 0 ? (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-tint-2 px-1 text-xs font-semibold tabular-nums text-accent-hover">
                  {active}
                </span>
              ) : null}
            </button>
          </div>
        ) : null}
      </div>
    )
  }
)
FilterBar.displayName = 'FilterBar'

export { FilterBar }
