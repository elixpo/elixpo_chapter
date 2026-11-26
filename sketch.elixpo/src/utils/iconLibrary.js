import { getSharedIconLibrary, shouldPrefetchIndex } from '@elixpo/lixsketch/src/core/IconLibrary.js'

let configured = false

async function serverSearch({ q = '', category = '' } = {}) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (category) params.set('category', category)
  const res = await fetch(`/api/icons/search?${params}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.results || []
}

/** App-wide icon library: client-side index, server search as fallback. */
export function getIconLibrary() {
  const library = getSharedIconLibrary()
  if (!configured) {
    library.setSearchFallback(serverSearch)
    configured = true
  }
  return library
}

/**
 * Download the icon index in idle time so the icon tool opens with results
 * already searchable. Skipped on data-saver / 2G connections; the tool then
 * loads the index on first open instead.
 */
export function prefetchIconIndex() {
  if (typeof window === 'undefined' || !shouldPrefetchIndex()) return () => {}
  const run = () => getIconLibrary().loadIndex().catch(() => {})
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 })
    return () => window.cancelIdleCallback?.(id)
  }
  const id = setTimeout(run, 1500)
  return () => clearTimeout(id)
}
