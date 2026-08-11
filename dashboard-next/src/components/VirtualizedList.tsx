import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createEndReachedGate, getVirtualRange } from '@/lib/virtualization'

interface VirtualizedListProps<T> {
  items: T[]
  itemHeight: number
  renderItem: (item: T, index: number) => ReactNode
  getKey: (item: T, index: number) => string
  height?: number
  overscan?: number
  className?: string
  hasMore?: boolean
  loading?: boolean
  /** Localized label announced while the next page loads. */
  loadingLabel: string
  onEndReached?: () => void
}

export function VirtualizedList<T>({
  items,
  itemHeight,
  renderItem,
  getKey,
  height = 620,
  overscan = 4,
  className = '',
  hasMore = false,
  loading = false,
  loadingLabel,
  onEndReached
}: VirtualizedListProps<T>) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(height)
  const frameRef = useRef<number | null>(null)
  const endReachedGateRef = useRef(createEndReachedGate())
  // The observer must not be rebuilt on every render (callers pass an inline
  // `onEndReached`) and must not read a stale `loading`, so both go through refs.
  const onEndReachedRef = useRef(onEndReached)
  const loadingRef = useRef(loading)

  useEffect(() => {
    onEndReachedRef.current = onEndReached
    loadingRef.current = loading
  }, [onEndReached, loading])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const updateHeight = () => setViewportHeight(viewport.clientHeight || height)
    updateHeight()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateHeight)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [height])

  useEffect(() => {
    const end = endRef.current
    const viewport = viewportRef.current
    if (!end || !viewport || !hasMore || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      // The gate re-arms when the marker LEAVES the viewport, never on "more items
      // arrived". A filtered result set is shorter than the viewport, so the marker
      // stays visible after a page lands; re-arming on item count meant every load
      // immediately triggered the next one and one filter click walked the whole
      // table (50 -> 650 rows). Leaving the viewport is the only honest signal that
      // the user scrolled far enough to ask for more.
      if (!entries.some(entry => entry.isIntersecting)) {
        endReachedGateRef.current.reset()
        return
      }
      // A load already in flight owns the current entry; firing again would queue a
      // duplicate page request for the same sentinel crossing.
      if (loadingRef.current) return
      if (endReachedGateRef.current.tryEnter()) onEndReachedRef.current?.()
    }, { root: viewport, rootMargin: `${itemHeight * overscan}px` })
    observer.observe(end)
    return () => observer.disconnect()
  }, [hasMore, itemHeight, overscan])

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
  }, [])

  const onScroll = () => {
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      setScrollTop(viewportRef.current?.scrollTop || 0)
    })
  }

  const totalHeight = items.length * itemHeight
  const { firstVisible, lastVisible } = getVirtualRange({
    itemCount: items.length,
    itemHeight,
    scrollTop,
    viewportHeight,
    overscan
  })
  const visibleItems = items.slice(firstVisible, lastVisible)
  const containerStyle: CSSProperties = { height: `${Math.max(totalHeight, 1)}px`, position: 'relative' }

  return (
    <div ref={viewportRef} className={`virtual-list-viewport ${className}`} style={{ height }} onScroll={onScroll}>
      <div className="virtual-list-content" style={containerStyle} role="list">
        {visibleItems.map((item, offset) => {
          const index = firstVisible + offset
          return <div className="virtual-list-item" key={getKey(item, index)} style={{ height: itemHeight, transform: `translateY(${index * itemHeight}px)` }} role="listitem" aria-setsize={hasMore ? -1 : items.length} aria-posinset={index + 1}>{renderItem(item, index)}</div>
        })}
        {hasMore ? <div ref={endRef} className="virtual-list-end-marker" style={{ top: `${Math.max(totalHeight - 1, 0)}px` }} aria-hidden="true" /> : null}
      </div>
      {loading ? <div className="virtual-list-loading" role="status" aria-live="polite">{loadingLabel}</div> : null}
    </div>
  )
}
