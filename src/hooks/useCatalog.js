import { useCallback, useEffect, useReducer, useSyncExternalStore } from 'react'
import {
  forget,
  getVersion,
  homeKey,
  listingKey,
  loadHome,
  loadListing,
  loadProduct,
  NotFoundError,
  peek,
  productKey,
  subscribe,
} from '../lib/catalog'

// status: 'idle' (not asked for yet), 'loading', 'ready', 'missing' (404) or 'error'.
// 'ready' can come from this browser's copy while fresh data loads; the page updates when it lands.
function useResource(key, loader, enabled = true) {
  useSyncExternalStore(subscribe, getVersion)
  const [attempt, retryLoad] = useReducer((n) => n + 1, 0)
  const entry = peek(key)

  useEffect(() => {
    if (!enabled) return
    loader().catch(() => {})
    // loader is derived from key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, attempt])

  const retry = useCallback(() => {
    forget(key)
    retryLoad()
  }, [key])

  const status = entry?.data
    ? 'ready'
    : entry?.error
      ? entry.error instanceof NotFoundError
        ? 'missing'
        : 'error'
      : enabled
        ? 'loading'
        : 'idle'
  return { status, data: entry?.data ?? null, retry }
}

/** Card-sized data for every piece, plus categories and collections. enabled: false waits (menu, search). */
export function useListing(enabled = true) {
  const { data, ...rest } = useResource(listingKey, loadListing, enabled)
  return { ...rest, catalog: data }
}

export function useHome() {
  return useResource(homeKey, loadHome)
}

export function useProduct(slug) {
  return useResource(productKey(slug), () => loadProduct(slug))
}
