import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeChange, linesChanged, orderChanges } from './order.js'

const shown = [
  { id: 'p1', name: 'Kenya Bomber Jacket', priceKES: 4500, availability: 'available' },
  { id: 'p2', name: 'Green Tracksuit', priceKES: 5000, availability: 'low-stock' },
  { id: 'p3', name: 'Club Puff Jacket', priceKES: null, availability: 'available' },
]

test('nothing changed', () => {
  const fresh = Object.fromEntries(shown.map((p) => [p.id, { ...p }]))
  assert.deepEqual(orderChanges(shown, fresh), [])
})

test('a price change, a sell-out and a removed piece are all reported', () => {
  const fresh = {
    p1: { ...shown[0], priceKES: 5200 },
    p2: { ...shown[1], availability: 'sold-out' },
  }
  assert.deepEqual(orderChanges(shown, fresh), [
    { type: 'price', name: 'Kenya Bomber Jacket', from: 4500, to: 5200 },
    { type: 'unavailable', name: 'Green Tracksuit', availability: 'sold-out' },
    { type: 'gone', name: 'Club Puff Jacket' },
  ])
})

test('a piece that gets a price, or loses one, is a change', () => {
  const fresh = {
    p1: { ...shown[0], priceKES: null },
    p2: { ...shown[1] },
    p3: { ...shown[2], priceKES: 3900 },
  }
  assert.deepEqual(
    orderChanges(shown, fresh).map((c) => [c.name, c.from, c.to]),
    [
      ['Kenya Bomber Jacket', 4500, null],
      ['Club Puff Jacket', null, 3900],
    ],
  )
})

test('stock changes that still allow ordering are not changes', () => {
  const fresh = { p1: { ...shown[0], availability: 'low-stock' }, p2: { ...shown[1], availability: 'available' }, p3: shown[2] }
  assert.deepEqual(orderChanges(shown, fresh), [])
})

test('a piece shown as unavailable that can be ordered again is a change; staying unavailable is not', () => {
  const soldOut = { id: 'p4', name: 'Matchday Jersey', priceKES: 3000, availability: 'sold-out' }
  assert.deepEqual(orderChanges([soldOut], { p4: { ...soldOut, availability: 'available' } }), [
    { type: 'available', name: 'Matchday Jersey' },
  ])
  assert.deepEqual(orderChanges([soldOut], { p4: { ...soldOut, priceKES: 3500 } }), [])
  assert.deepEqual(orderChanges([soldOut], {}), [])
})

test('bag lines: added, removed or re-counted lines are noticed', () => {
  const lines = [
    { key: 'a', quantity: 1 },
    { key: 'b', quantity: 2 },
  ]
  assert.equal(linesChanged(lines, [...lines]), false)
  assert.equal(linesChanged(lines, [lines[0]]), true)
  assert.equal(linesChanged(lines, [lines[0], { key: 'b', quantity: 3 }]), true)
})

test('changes read as plain sentences', () => {
  assert.equal(
    describeChange({ type: 'price', name: 'Kenya Bomber Jacket', from: 4500, to: 5200 }),
    'Kenya Bomber Jacket is now KSh 5,200 (was KSh 4,500).',
  )
  assert.equal(describeChange({ type: 'unavailable', name: 'Green Tracksuit', availability: 'sold-out' }), 'Green Tracksuit is now sold out.')
  assert.equal(describeChange({ type: 'gone', name: 'Club Puff Jacket' }), 'Club Puff Jacket is no longer available.')
})
