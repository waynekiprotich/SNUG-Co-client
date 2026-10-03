import { useEffect, useSyncExternalStore } from 'react'
import { site } from '../config/site'
import { registerImages } from './images'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

// Fallback photos until the admin picks some.
export const DEFAULT_VISUALS = {
  heroImage: 'colour-block-short-set-2',
  heroAlt: 'Two models in Snug & Co. sets: a brown and cream short set and a black trouser set',
  featureImage: 'kenya-bomber-jacket-1',
  featureImageSmall: 'kenya-cosy-jersey-1',
}

// The last settings this browser saw. Repeat visits draw the hero and announcement at once
// instead of waiting for the API; fresh settings replace them as soon as they arrive.
const STORED = 'snug-settings'

function withDefaults(data) {
  const out = { ...data }
  for (const [key, value] of Object.entries(DEFAULT_VISUALS)) out[key] = data[key] || value
  return out
}

function readStored() {
  if (!API_URL) return null
  try {
    const data = JSON.parse(localStorage.getItem(STORED))
    if (!data || typeof data !== 'object') return null
    registerImages(data.images)
    return withDefaults(data)
  } catch {
    return null
  }
}

let settings = readStored()
let request = null
const listeners = new Set()

function publish(data) {
  settings = withDefaults(data)
  for (const listener of listeners) listener()
}

async function fetchSettings() {
  // A plain request, so the browser can reuse the copy index.html preloaded.
  const res = await fetch(`${API_URL}/settings`)
  if (!res.ok) throw new Error(`Settings request failed (${res.status})`)
  const data = await res.json()
  registerImages(data.images)
  try {
    localStorage.setItem(STORED, JSON.stringify(data))
  } catch {
    // Storage blocked: the next visit waits for the API again.
  }
  return data
}

/** Fresh settings (once per visit). Falls back to what this browser saw last, then to the defaults. */
export function loadSettings() {
  request ??= API_URL
    ? fetchSettings().then(publish, () => publish(settings || {}))
    : Promise.resolve(publish({ announcementText: site.announcement?.text || null, announcementHref: site.announcement?.href || null }))
  return request.then(() => settings)
}

/**
 * Resolves once settings are known, or after `ms` at the latest. Used before the first render on a
 * first visit, so the announcement bar doesn't push the page down a moment after it appears.
 */
export function settingsReady(ms) {
  if (settings) return Promise.resolve()
  return Promise.race([loadSettings(), new Promise((resolve) => setTimeout(resolve, ms))])
}

export function resetSettingsCache() {
  request = null
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Site settings, or null until they first load. */
export function useSettings() {
  const current = useSyncExternalStore(subscribe, () => settings)
  useEffect(() => {
    loadSettings()
  }, [])
  return current
}
