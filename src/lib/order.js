// An order as the customer saw it, compared with the server's current data right before it's sent.
// No browser or build APIs here, so `npm test` runs it under Node.

import { formatPrice } from './format.js'

export const UNORDERABLE = new Set(['sold-out', 'coming-soon'])

/**
 * What changed since the customer looked. shown: pieces as displayed ({ id, name, priceKES,
 * availability }). fresh: the server's pieces by id; a missing id means the piece is gone.
 * Only changes that alter the order count: a price, or whether a piece can be ordered at all.
 */
export function orderChanges(shown, fresh) {
  const changes = []
  for (const piece of shown) {
    const now = fresh[piece.id]
    const wasOrderable = !UNORDERABLE.has(piece.availability)
    if (!now) {
      if (wasOrderable) changes.push({ type: 'gone', name: piece.name })
    } else if (UNORDERABLE.has(now.availability)) {
      if (wasOrderable) changes.push({ type: 'unavailable', name: now.name, availability: now.availability })
    } else if (!wasOrderable) {
      changes.push({ type: 'available', name: now.name })
    } else if (now.priceKES !== piece.priceKES) {
      changes.push({ type: 'price', name: now.name, from: piece.priceKES, to: now.priceKES })
    }
  }
  return changes
}

/** True when the bag's lines (pieces and quantities) are no longer what was shown. */
export function linesChanged(shownLines, freshLines) {
  const key = (lines) => lines.map((l) => `${l.key}:${l.quantity}`).join(',')
  return key(shownLines) !== key(freshLines)
}

export function describeChange(change) {
  if (change.type === 'gone') return `${change.name} is no longer available.`
  if (change.type === 'available') return `${change.name} can be ordered again and is now included.`
  if (change.type === 'unavailable') {
    return `${change.name} is ${change.availability === 'sold-out' ? 'now sold out' : 'not available to order yet'}.`
  }
  if (change.to == null) return `${change.name}: the price is now to be confirmed on WhatsApp (was ${formatPrice(change.from)}).`
  return `${change.name} is now ${formatPrice(change.to)} (was ${formatPrice(change.from)}).`
}
