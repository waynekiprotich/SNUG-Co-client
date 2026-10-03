import { useEffect, useSyncExternalStore } from 'react'

// Wishlist and cart live in a signed, HttpOnly cookie set by the API (/api/shopper).
// This module mirrors them in memory so every component sees the same counts.
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export const shopperEnabled = Boolean(API_URL)

// Set once this browser has saved something, so first-time visitors skip the request.
const HINT = 'snug-shopper'

export class ShopperError extends Error {
  constructor(message, fields) {
    super(message)
    this.fields = fields || {}
  }
}

// error: set when the first load failed, so pages can say so instead of showing "empty".
// products: the server's current name, price and availability of every saved piece, by id.
let state = { wishlist: [], cart: [], products: {}, ready: false, error: null }
const listeners = new Set()

function publish(next) {
  state = {
    wishlist: next.wishlist,
    cart: next.cart,
    products: next.products ?? state.products,
    ready: true,
    error: next.error ?? null,
  }
  for (const listener of listeners) listener()
}

function hasSaved() {
  try {
    return localStorage.getItem(HINT) === '1'
  } catch {
    return true
  }
}

function rememberSaved(data) {
  try {
    if (data.wishlist.length || data.cart.length) localStorage.setItem(HINT, '1')
    else localStorage.removeItem(HINT)
  } catch {
    // Storage blocked: the next visit just asks the API.
  }
}

async function send(path = '', { method = 'GET', json } = {}) {
  const headers = { Accept: 'application/json' }
  if (method !== 'GET') headers['X-Requested-With'] = 'snug-shop'
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(`${API_URL}/shopper${path}`, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
      credentials: 'include',
      cache: 'no-store',
    })
  } catch {
    throw new ShopperError('Can’t reach the shop right now. Check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || !Array.isArray(data.wishlist)) {
    // 404 or 405 on /shopper means the site is newer than the server it talks to. The server's own
    // 404s (a piece or bag line that's gone) say "That piece ...".
    const missing = (res.status === 404 || res.status === 405) && !String(data?.error).startsWith('That piece')
    const message = missing
      ? 'Wishlist and bag aren’t available on the server yet. Try again in a few minutes.'
      : data?.error || 'Something went wrong. Try again.'
    throw new ShopperError(message, data?.fields)
  }
  rememberSaved(data)
  loadedAt = Date.now()
  publish(data)
  return data
}

// When the server last answered. The bag and wishlist pages ask again on open, but not if the
// header asked a moment ago.
let loadedAt = 0
const FRESH_FOR = 10_000

// One request at a time, in the order they were made. Each reply sets the cookie the next
// request needs, so two quick taps (heart on, heart off) can't overwrite each other.
let chain = Promise.resolve()
function request(path, options) {
  const run = () => send(path, options)
  const result = chain.then(run, run)
  chain = result.catch(() => {})
  return result
}

let loading = null

/** Load the wishlist and cart. force: ask the API even if this browser saved nothing. */
export function loadShopper({ force = false } = {}) {
  const recent = Date.now() - loadedAt < FRESH_FOR
  if (!shopperEnabled || (state.ready && !state.error && (!force || recent))) return Promise.resolve(state)
  if (!force && !state.error && !hasSaved()) {
    publish({ wishlist: [], cart: [] })
    return Promise.resolve(state)
  }
  loading ??= request()
    .catch((err) => publish({ wishlist: state.wishlist, cart: state.cart, error: err.message }))
    .finally(() => {
      loading = null
    })
  return loading
}

export async function toggleWishlist(productId) {
  const saved = state.wishlist.includes(productId)
  const without = state.wishlist.filter((id) => id !== productId)
  // Update at once; undo this one piece if the API refuses.
  publish({ ...state, wishlist: saved ? without : [productId, ...without] })
  try {
    await request(`/wishlist/${encodeURIComponent(productId)}`, { method: saved ? 'DELETE' : 'PUT' })
  } catch (err) {
    publish({ ...state, wishlist: saved ? [productId, ...without] : without })
    throw err
  }
  return !saved
}

/** The bag again, straight from the server. Throws if it can't be reached. */
export const refreshShopper = () => request()

/**
 * The server's current price and availability for these pieces (never cached), by id. A piece
 * that's been hidden or deleted is missing from the result. Used right before an order is sent.
 */
export async function checkOrder(ids) {
  let res
  try {
    res = await fetch(`${API_URL}/shopper/check?ids=${ids.map(encodeURIComponent).join(',')}`, { cache: 'no-store' })
  } catch {
    throw new ShopperError('Can’t reach the shop to confirm your order. Check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.products) throw new ShopperError(data?.error || 'We couldn’t confirm your order. Try again.')
  return data.products
}

export const addToCart = (line) => request('/cart', { method: 'POST', json: line })
export const setCartQuantity = (key, quantity) => request(`/cart/${key}`, { method: 'PATCH', json: { quantity } })
export const removeFromCart = (key) => request(`/cart/${key}`, { method: 'DELETE' })
export const clearCart = () => request('/cart', { method: 'DELETE' })

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** { wishlist: [productId], cart: [line], ready, error }. force: always ask the API (cart and wishlist pages). */
export function useShopper({ force = false } = {}) {
  const current = useSyncExternalStore(subscribe, () => state)
  useEffect(() => {
    loadShopper({ force })
  }, [force])
  return current
}

export const cartCount = (cart) => cart.reduce((sum, line) => sum + line.quantity, 0)

// A short message shown at the bottom of the page ("Saved to wishlist", or why something failed).
let notice = null
const noticeListeners = new Set()
let noticeId = 0

export function showNotice(message, { to, linkLabel, error = false } = {}) {
  notice = { id: ++noticeId, message, to, linkLabel, error }
  for (const listener of noticeListeners) listener()
}

export function dismissNotice() {
  notice = null
  for (const listener of noticeListeners) listener()
}

export function useNotice() {
  return useSyncExternalStore(
    (listener) => {
      noticeListeners.add(listener)
      return () => noticeListeners.delete(listener)
    },
    () => notice,
  )
}
