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
  onEndReached
}: VirtualizedListProps<T>) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(height)
  const frameRef = useRef<number | null>(null)
  const endReachedGateRef = useRef(createEndReachedGate())
  const previousItemCountRef = useRef(items.length)

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
    if (!end || !viewport || !hasMore || !onEndReached || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !loading && endReachedGateRef.current.tryEnter()) onEndReached()
    }, { root: viewport, rootMargin: `${itemHeight * overscan}px` })
    observer.observe(end)
    return () => observer.disconnect()
  }, [hasMore, itemHeight, loading, onEndReached, overscan])

  useEffect(() => {
    if (previousItemCountRef.current !== items.length) {
      previousItemCountRef.current = items.length
      endReachedGateRef.current.reset()
    }
  }, [items.length])

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
      <div className="virtual-list-content" style={containerStyle}>
        {visibleItems.map((item, offset) => {
          const index = firstVisible + offset
          return <div className="virtual-list-item" key={getKey(item, index)} style={{ height: itemHeight, transform: `translateY(${index * itemHeight}px)` }}>{renderItem(item, index)}</div>
        })}
        {hasMore ? <div ref={endRef} className="virtual-list-end-marker" style={{ top: `${Math.max(totalHeight - 1, 0)}px` }} aria-hidden="true" /> : null}
      </div>
      {loading ? <div className="virtual-list-loading" role="status" aria-live="polite">加载中...</div> : null}
    </div>
  )
}
