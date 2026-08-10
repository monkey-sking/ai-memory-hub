import * as React from 'react'
import { cn } from '@/lib/utils'
import './shell.css'

export type StatusTabTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

export interface StatusTabItem {
  value: string
  label: string
  /** Rendered inline as a small count chip. `0` is rendered. */
  count?: number
  /** Tints the count chip when the tab is not selected. */
  tone?: StatusTabTone
  disabled?: boolean
}

export type StatusTabsVariant = 'underline' | 'pill'

interface StatusTabsBaseProps {
  items: StatusTabItem[]
  /**
   * Optional leading "all" tab. Its `value` is what `onChange` receives in
   * single mode; in multi mode selecting it clears the selection.
   */
  allItem?: Omit<StatusTabItem, 'tone' | 'disabled'>
  variant?: StatusTabsVariant
  /** Accessible name for the tablist. */
  label: string
  className?: string
}

export interface SingleStatusTabsProps extends StatusTabsBaseProps {
  mode?: 'single'
  value: string
  onChange: (value: string) => void
}

export interface MultiStatusTabsProps extends StatusTabsBaseProps {
  mode: 'multi'
  values: string[]
  onChange: (values: string[]) => void
}

export type StatusTabsProps = SingleStatusTabsProps | MultiStatusTabsProps

const toneChip: Record<StatusTabTone, string> = {
  neutral: 'bg-surface-sunk text-ink-2',
  accent: 'bg-accent-tint-2 text-accent-hover',
  success: 'bg-success-tint text-success-text',
  warning: 'bg-warning-tint text-warning-text',
  danger: 'bg-danger-tint text-danger-text',
  info: 'bg-info-tint text-info-text',
}

/**
 * Lightweight status filter strip (console standard §4.4) — replaces the old
 * grid of large white summary blocks. Counts live inline on each tab so the
 * same statistic is never duplicated into a separate card row.
 *
 * Keyboard: Arrow keys / Home / End move focus, Enter or Space toggles.
 * Selection is manual so multi-select works with the same interaction model.
 */
function StatusTabs(props: StatusTabsProps) {
  const { items, allItem, variant = 'underline', label, className } = props
  const multi = props.mode === 'multi'
  const selectedValues = multi ? props.values : props.value ? [props.value] : []
  const listRef = React.useRef<HTMLDivElement | null>(null)

  const allSelected = multi
    ? selectedValues.length === 0
    : allItem
      ? props.value === allItem.value
      : props.value === ''

  const isSelected = (value: string) => selectedValues.includes(value)

  const toggle = (value: string) => {
    if (props.mode === 'multi') {
      props.onChange(
        props.values.includes(value)
          ? props.values.filter(item => item !== value)
          : [...props.values, value]
      )
      return
    }
    props.onChange(value)
  }

  const selectAll = () => {
    if (props.mode === 'multi') props.onChange([])
    else props.onChange(allItem ? allItem.value : '')
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!keys.includes(event.key)) return
    const tabs = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])
      .filter(tab => !tab.hasAttribute('disabled'))
    if (tabs.length === 0) return
    event.preventDefault()
    const current = tabs.indexOf(document.activeElement as HTMLElement)
    let next = 0
    if (event.key === 'ArrowRight') next = current < 0 ? 0 : (current + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = current <= 0 ? tabs.length - 1 : current - 1
    else if (event.key === 'End') next = tabs.length - 1
    tabs[next]?.focus()
    tabs[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  const renderTab = (item: StatusTabItem, selected: boolean, onSelect: () => void, key: string) => {
    const chipTone = selected ? 'accent' : (item.tone ?? 'neutral')
    return (
      <button
        key={key}
        type="button"
        role="tab"
        aria-selected={selected}
        tabIndex={selected ? 0 : -1}
        disabled={item.disabled}
        onClick={onSelect}
        className={cn(
          'relative inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm transition-colors',
          'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
          'disabled:pointer-events-none disabled:opacity-40',
          variant === 'underline'
            ? cn(
                '-mb-px border-b-2 focus-visible:rounded-t-sm',
                selected
                  ? 'border-accent-base font-semibold text-accent-hover'
                  : 'border-transparent font-medium text-ink-2 hover:border-line-strong hover:text-ink'
              )
            : cn(
                'rounded-md focus-visible:rounded-md',
                selected
                  ? 'bg-accent-tint font-semibold text-accent-hover'
                  : 'font-medium text-ink-2 hover:bg-surface-sunk hover:text-ink'
              )
        )}
      >
        <span>{item.label}</span>
        {item.count !== undefined ? (
          <span
            className={cn(
              'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums',
              toneChip[chipTone]
            )}
          >
            {item.count}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <div
      ref={listRef}
      data-slot="status-tabs"
      data-shell-rail=""
      role="tablist"
      aria-label={label}
      aria-multiselectable={multi || undefined}
      onKeyDown={onKeyDown}
      className={cn(
        'flex w-full min-w-0 items-center gap-1 overflow-x-auto',
        variant === 'underline' && 'border-b border-line',
        className
      )}
    >
      {allItem
        ? renderTab(
            { value: allItem.value, label: allItem.label, count: allItem.count },
            allSelected,
            selectAll,
            '__all__'
          )
        : null}
      {items.map(item =>
        renderTab(item, isSelected(item.value), () => toggle(item.value), item.value)
      )}
    </div>
  )
}
StatusTabs.displayName = 'StatusTabs'

export { StatusTabs }
