type PagedDashboardCollection = 'memory' | 'tasks' | 'radio'

export function mergeDashboardPage<T>(
  collection: PagedDashboardCollection,
  currentItems: T[],
  nextItems: T[],
  getKey: (item: T) => string
): T[] {
  const orderedItems = collection === 'radio'
    ? [...nextItems, ...currentItems]
    : [...currentItems, ...nextItems]
  const seen = new Set<string>()
  return orderedItems.filter(item => {
    const key = getKey(item)
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
