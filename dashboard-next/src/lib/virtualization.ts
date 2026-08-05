interface VirtualRangeOptions {
  itemCount: number
  itemHeight: number
  scrollTop: number
  viewportHeight: number
  overscan: number
}

export function getVirtualRange({
  itemCount,
  itemHeight,
  scrollTop,
  viewportHeight,
  overscan
}: VirtualRangeOptions) {
  const safeItemCount = Math.max(0, Math.floor(itemCount))
  const safeItemHeight = Math.max(1, itemHeight)
  const safeScrollTop = Math.max(0, scrollTop)
  const safeViewportHeight = Math.max(0, viewportHeight)
  const safeOverscan = Math.max(0, Math.floor(overscan))

  return {
    firstVisible: Math.max(0, Math.floor(safeScrollTop / safeItemHeight) - safeOverscan),
    lastVisible: Math.min(safeItemCount, Math.ceil((safeScrollTop + safeViewportHeight) / safeItemHeight) + safeOverscan)
  }
}

export function createEndReachedGate() {
  let entered = false
  return {
    tryEnter() {
      if (entered) return false
      entered = true
      return true
    },
    reset() {
      entered = false
    }
  }
}
