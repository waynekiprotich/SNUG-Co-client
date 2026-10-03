import { registerImages } from './images'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

// Each page loads only its own data (index.html starts that request before the app runs):
//   home     /home             new arrivals, category tiles, His & Hers
//   listing  /products         card-sized data for every piece (shop, search, menu, bag, wishlist)
//   product  /products/<slug>  one piece in full, plus related pieces
// Results are kept for the visit, so going back to a page is instant.
//
// With the API, each response is also kept in this browser for a week. A returning visitor sees
// that copy at once while a fresh one loads in the background, and the page updates if anything
// changed. Prices and availability from a copy are for browsing only: an order is always checked
// against the server before WhatsApp opens (checkOrder in lib/shopper.js).

export class NotFoundError extends Error {}

export const listingKey = 'listing'
export const homeKey = 'home'
export const productKey = (slug) => `product:${slug}`

const store = new Map()
// Card-sized data seen so far, by slug: a product page can show its photo, name and price at once.
const previews = new Map()

let version = 0
const listeners = new Set()

function emit() {
  version += 1
  for (const listener of listeners) listener()
}

/** For useSyncExternalStore: the version changes whenever any page's data does. */
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getVersion = () => version

function remember(products) {
  for (const p of products) previews.set(p.slug, p)
  return products
}

const bySort = (a, b) => a.sortOrder - b.sortOrder

// Raw API responses to what the pages use. Also applied to this browser's copy.
function shape(key, data) {
  registerImages(data.images)
  if (key === listingKey) {
    return {
      products: remember([...data.products].sort(bySort)),
      categories: [...data.categories].sort(bySort),
      collections: data.collections,
    }
  }
  if (key === homeKey) {
    remember(data.newArrivals)
    remember(data.hisAndHers)
    return data
  }
  remember(data.related)
  return data
}

function apiPath(key) {
  if (key === listingKey) return '/products'
  if (key === homeKey) return '/home'
  return `/products/${encodeURIComponent(key.slice('product:'.length))}`
}

// ---- This browser's copy ----------------------------------------------------

// Bump the version when a response's shape changes, so old copies are ignored.
const COPY = 'snug-cache:v1:'
const COPY_MAX_AGE = 7 * 24 * 60 * 60 * 1000
const COPIED_PRODUCTS = 30

function readCopy(key) {
  try {
    const copy = JSON.parse(localStorage.getItem(COPY + key))
    if (copy && typeof copy.body === 'string' && Date.now() - copy.t < COPY_MAX_AGE) return copy.body
  } catch {
    // Storage blocked or a damaged copy: load from the network.
  }
  return null
}

function keepCopy(key, body) {
  try {
    localStorage.setItem(COPY + key, JSON.stringify({ t: Date.now(), body }))
    if (key.startsWith('product:')) trimProductCopies()
  } catch {
    // Storage full or blocked: the next visit loads from the network.
  }
}

function dropCopy(key) {
  try {
    localStorage.removeItem(COPY + key)
  } catch {
    // Nothing to drop.
  }
}

// Keep only the most recently refreshed product pages.
function trimProductCopies() {
  const copies = []
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i)
    if (name?.startsWith(`${COPY}product:`)) copies.push({ name, t: JSON.parse(localStorage.getItem(name))?.t ?? 0 })
  }
  copies
    .sort((a, b) => b.t - a.t)
    .slice(COPIED_PRODUCTS)
    .forEach((copy) => localStorage.removeItem(copy.name))
}

// ---- Loading ----------------------------------------------------------------

function entryFor(key) {
  let entry = store.get(key)
  if (!entry) {
    entry = { data: null, error: null, body: null, promise: null }
    const body = API_URL ? readCopy(key) : null
    if (body) {
      try {
        entry.data = shape(key, JSON.parse(body))
        entry.body = body
      } catch {
        dropCopy(key)
      }
    }
    store.set(key, entry)
  }
  return entry
}

async function fetchBody(path) {
  const res = await fetch(`${API_URL}${path}`)
  if (res.status === 404) throw new NotFoundError('Not found')
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.text()
}

/** Fetch fresh data once per visit. A copy already on screen stays there if the network fails. */
function load(key, local) {
  const entry = entryFor(key)
  entry.promise ??= (async () => {
    try {
      if (!API_URL) {
        entry.data = await local()
        emit()
        return entry.data
      }
      const body = await fetchBody(apiPath(key))
      if (body !== entry.body) {
        entry.data = shape(key, JSON.parse(body))
        entry.body = body
        entry.error = null
        emit()
      }
      keepCopy(key, body)
      return entry.data
    } catch (error) {
      if (error instanceof NotFoundError) {
        entry.data = null
        entry.body = null
        dropCopy(key)
      }
      if (entry.data) return entry.data
      entry.error = error
      emit()
      throw error
    }
  })()
  return entry.promise
}

/** { data, error } once there's something to show (this browser's copy counts), else undefined. */
export function peek(key) {
  const entry = entryFor(key)
  return entry.data || entry.error ? entry : undefined
}

export function forget(key) {
  store.delete(key)
}

const CHECKED_FIELDS = ['name', 'priceKES', 'availability', 'madeToOrder']

/**
 * Put the server's current name, price and availability (from checkOrder) into every page that
 * shows the piece. `fresh` null means the piece is gone: its own page then says so, and lists
 * drop it.
 */
export function applyOrderCheck(id, fresh) {
  const patch = (p) => (p.id === id ? { ...p, ...Object.fromEntries(CHECKED_FIELDS.map((f) => [f, fresh[f]])) } : p)
  const update = fresh ? (list) => list.map(patch) : (list) => list.filter((p) => p.id !== id)
  for (const [key, entry] of store) {
    const data = entry.data
    if (!data) continue
    if (key === listingKey) entry.data = { ...data, products: update(data.products) }
    else if (key === homeKey) entry.data = { ...data, newArrivals: update(data.newArrivals), hisAndHers: update(data.hisAndHers) }
    else if (data.product.id !== id) entry.data = { ...data, related: update(data.related) }
    else if (fresh) entry.data = { ...data, product: patch(data.product), related: update(data.related) }
    else {
      entry.data = null
      entry.error = new NotFoundError('Not found')
      entry.body = null
      dropCopy(key)
    }
  }
  for (const [slug, p] of previews) {
    if (p.id !== id) continue
    if (fresh) previews.set(slug, patch(p))
    else previews.delete(slug)
  }
  emit()
}

// No API (local preview only): the bundled catalog, loaded on demand so it never ships in the main bundle.
let local = null
function localCatalog() {
  local ??= Promise.all([import('../data/products'), import('../data/categories')]).then(([p, c]) => ({
    products: [...p.products].sort(bySort),
    categories: [...c.categories].sort(bySort),
    collections: [...c.collections],
  }))
  return local
}

// The functions passed to load() build each page's data from the bundled catalog. They only run
// without an API; with one, load() fetches the page's API route instead.
export function loadListing() {
  return load(listingKey, async () => shape(listingKey, await localCatalog()))
}

export function loadHome() {
  return load(homeKey, async () => {
    const { products, categories } = await localCatalog()
    const counts = {}
    for (const p of products) counts[p.category] = (counts[p.category] || 0) + 1
    return {
      newArrivals: products.filter((p) => p.newArrival).slice(0, 4),
      hisAndHers: products.filter((p) => p.collections.includes('his-and-hers') && p.images.length).slice(0, 2),
      categories: categories.filter((c) => counts[c.slug]).map((c) => ({ ...c, productCount: counts[c.slug] })),
    }
  })
}

export function loadProduct(slug) {
  return load(productKey(slug), async () => {
    const catalog = await localCatalog()
    const product = catalog.products.find((p) => p.slug === slug)
    if (!product) throw new NotFoundError('Not found')
    return {
      product,
      category: catalog.categories.find((c) => c.slug === product.category),
      related: relatedProducts(catalog.products, product),
    }
  })
}

/** Start loading a product page's data ahead of a likely tap. */
export function prefetchProduct(slug) {
  loadProduct(slug).catch(() => {})
}

/** Card-sized data for a product already seen on another page, or undefined. */
export function productPreview(slug) {
  return previews.get(slug)
}

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
]

export function sortProducts(list, sort = 'featured') {
  const items = [...list]
  const price = (p, fallback) => (p.priceKES == null ? fallback : p.priceKES)
  switch (sort) {
    case 'newest':
      return items.sort((a, b) => a.recency - b.recency)
    case 'price-asc':
      return items.sort((a, b) => price(a, Infinity) - price(b, Infinity) || a.sortOrder - b.sortOrder)
    case 'price-desc':
      return items.sort((a, b) => price(b, -Infinity) - price(a, -Infinity) || a.sortOrder - b.sortOrder)
    default:
      return items.sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder)
  }
}

export function filterProducts(list, { category, collection, newOnly } = {}) {
  return list.filter(
    (p) =>
      (!category || p.category === category) &&
      (!collection || p.collections.includes(collection)) &&
      (!newOnly || p.newArrival),
  )
}

const normalise = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')

export function searchProducts(catalog, query) {
  const terms = normalise(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const categoryName = Object.fromEntries(catalog.categories.map((c) => [c.slug, c.name]))
  const collectionName = Object.fromEntries(catalog.collections.map((c) => [c.slug, c.name]))

  return catalog.products
    .map((p) => {
      const fields = {
        name: normalise(p.name),
        meta: normalise(
          [categoryName[p.category], ...p.collections.map((c) => collectionName[c]), ...p.tags].join(' '),
        ),
        description: normalise(p.description),
      }
      let score = 0
      for (const term of terms) {
        if (fields.name.includes(term)) score += 3
        else if (fields.meta.includes(term)) score += 2
        else if (fields.description.includes(term)) score += 1
        else return null
      }
      return { product: p, score }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.product.sortOrder - b.product.sortOrder)
    .map((r) => r.product)
}

// Same scoring as the API's related_to(); used only without an API.
function relatedProducts(products, product, limit = 4) {
  const score = (p) =>
    (p.collections.some((c) => product.collections.includes(c)) ? 2 : 0) + (p.category === product.category ? 1 : 0)
  return products
    .filter((p) => p.id !== product.id)
    .map((p) => ({ p, s: score(p) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.p.sortOrder - b.p.sortOrder)
    .slice(0, limit)
    .map((r) => r.p)
}
