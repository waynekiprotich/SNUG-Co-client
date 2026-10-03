import { useState } from 'react'
import { Link } from 'react-router-dom'
import { WhatsAppIcon } from '../components/Icons'
import { Img } from '../components/Img'
import { QuantitySelector } from '../components/product/VariantSelector'
import { EmptyState, ShopperUnavailable } from '../components/States'
import { useListing } from '../hooks/useCatalog'
import { EVENTS, track } from '../lib/analytics'
import { formatPrice } from '../lib/format'
import { describeChange, linesChanged, orderChanges, UNORDERABLE } from '../lib/order'
import { absoluteUrl, useSeo } from '../lib/seo'
import { cartCount, clearCart, loadShopper, refreshShopper, removeFromCart, setCartQuantity, useShopper } from '../lib/shopper'
import { cartMessage, openWhatsApp, whatsappLink } from '../lib/whatsapp'

function choicesText(line) {
  return [line.color, line.size && `Size ${line.size}`, ...Object.entries(line.options || {}).map(([k, v]) => `${k}: ${v}`)]
    .filter(Boolean)
    .join(' · ')
}

// Name, price and availability come from the bag response, which the server never caches. The
// shop listing (possibly this browser's copy) only adds photos and sizes.
function bagItems(cart, products, listed) {
  return cart
    .map((line) => {
      const fresh = products[line.productId]
      const shown = listed.get(line.productId)
      return { line, product: fresh ? { images: [], ...shown, ...fresh } : shown }
    })
    .filter((i) => i.product)
}

const isOrderable = (i) => !UNORDERABLE.has(i.product.availability)

export default function Cart() {
  useSeo({ title: 'Your bag', path: '/cart' })
  const { catalog } = useListing()
  const shopper = useShopper({ force: true })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [changes, setChanges] = useState([])
  const [checking, setChecking] = useState(false)

  const listed = new Map((catalog?.products ?? []).map((p) => [p.id, p]))
  const items = bagItems(shopper.cart, shopper.products, listed)
  const orderable = items.filter(isOrderable)
  const total = orderable.reduce((sum, i) => sum + (i.product.priceKES ?? 0) * i.line.quantity, 0)
  const unpriced = orderable.filter((i) => i.product.priceKES == null).length
  const loading = !shopper.ready
  const failed = shopper.ready && shopper.error

  const run = async (task) => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      await task()
    } catch (err) {
      setMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  // The bag is fetched again right before WhatsApp opens. If a price, an availability or the bag
  // itself changed since it was shown, nothing is sent: the page updates and says what changed.
  const checkout = () =>
    run(async () => {
      setChanges([])
      setChecking(true)
      const shownLines = shopper.cart
      const shownItems = items.map((i) => i.product)
      try {
        const opened = await openWhatsApp(async () => {
          const fresh = await refreshShopper()
          // No current prices in the reply (an older server): don't send anything unchecked.
          if (!fresh.products) throw new Error('We couldn’t confirm your order. Try again in a moment.')
          const found = orderChanges(shownItems, fresh.products)
          if (found.length || linesChanged(shownLines, fresh.cart)) {
            setChanges(found.length ? found.map(describeChange) : ['Your bag was changed in another window.'])
            return null
          }
          const ordered = bagItems(fresh.cart, fresh.products, listed).filter(isOrderable)
          if (!ordered.length) return null
          return whatsappLink(
            cartMessage(ordered.map(({ product, line }) => ({ product, line, url: absoluteUrl(`/product/${product.slug}`) }))),
          )
        })
        if (opened) {
          track(EVENTS.whatsappCartOrderClicked, { pieces: cartCount(orderable.map((i) => i.line)), total, unpriced })
        }
      } finally {
        setChecking(false)
      }
    })

  return (
    <div className="shell pb-24 pt-10 lg:pb-28 lg:pt-16">
      <h1 className="type-display">Your bag</h1>

      {loading && <div className="skeleton mt-10 h-40" aria-label="Loading your bag" role="status" />}
      {failed && (
        <div className="mt-10">
          <ShopperUnavailable message={shopper.error} onRetry={() => loadShopper({ force: true })} />
        </div>
      )}

      {!loading && !failed && items.length === 0 && (
        <div className="mt-10">
          <EmptyState
            title="Your bag is empty."
            body="Add pieces from the shop, then send the whole order to us on WhatsApp in one message."
            actions={
              <>
                <Link to="/shop" className="chip">
                  Shop all
                </Link>
                {shopper.wishlist.length > 0 && (
                  <Link to="/wishlist" className="chip">
                    Your wishlist
                  </Link>
                )}
              </>
            }
          />
        </div>
      )}

      {!loading && !failed && items.length > 0 && (
        <div className="mt-10 grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-8">
            <ul className="border-t border-line">
              {items.map(({ line, product }) => {
                const unavailable = UNORDERABLE.has(product.availability)
                return (
                  <li key={line.key} className="grid grid-cols-[6rem_1fr] gap-4 border-b border-line py-6 sm:grid-cols-[8rem_1fr] sm:gap-6">
                    <Link to={`/product/${product.slug}`} className="block">
                      <Img id={product.images[0]?.id} alt={product.images[0]?.alt ?? product.name} sizes="128px" ladder="small" />
                    </Link>
                    <div className="flex min-w-0 flex-col gap-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <Link to={`/product/${product.slug}`} className="text-[1.0625rem] hover:underline hover:underline-offset-4">
                          {product.name}
                        </Link>
                        <p className={product.priceKES == null ? 'text-stone' : ''}>
                          {product.priceKES == null ? formatPrice(null) : formatPrice(product.priceKES * line.quantity)}
                        </p>
                      </div>
                      {choicesText(line) && <p className="text-sm text-stone">{choicesText(line)}</p>}
                      {unavailable ? (
                        <p className="text-sm font-medium text-alert">No longer available to order. It won’t be included.</p>
                      ) : (
                        <QuantitySelector
                          value={line.quantity}
                          onChange={(q) => run(() => setCartQuantity(line.key, q))}
                        />
                      )}
                      <button
                        type="button"
                        className="link tap self-start text-sm"
                        disabled={busy}
                        onClick={() => run(() => removeFromCart(line.key))}
                        aria-label={`Remove ${product.name} from your bag`}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <Link to="/shop" className="link tap mt-6 inline-block text-[0.9375rem]">
              Continue shopping
            </Link>
          </div>

          <aside className="lg:col-span-4" aria-labelledby="summary-title">
            <div className="border border-line p-5 lg:sticky lg:top-24">
              <h2 id="summary-title" className="type-h3">
                Summary
              </h2>
              <dl className="mt-4 space-y-2 text-[0.9375rem]">
                <div className="flex justify-between gap-4">
                  <dt className="text-stone">Pieces</dt>
                  <dd className="tabular-nums">{cartCount(orderable.map((i) => i.line))}</dd>
                </div>
                {unpriced < orderable.length && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-stone">{unpriced ? 'Priced pieces' : 'Total'}</dt>
                    <dd className="tabular-nums">{formatPrice(total)}</dd>
                  </div>
                )}
              </dl>
              {unpriced > 0 && (
                <p className="mt-3 text-sm text-stone">
                  {unpriced === orderable.length
                    ? 'We’ll confirm the prices on WhatsApp.'
                    : `${unpriced === 1 ? 'One piece has' : `${unpriced} pieces have`} a price we’ll confirm on WhatsApp.`}
                </p>
              )}
              {changes.length > 0 && (
                <div role="alert" className="mt-5 border-l-2 border-alert pl-4 text-sm">
                  <p className="font-medium text-alert">Your bag changed since you opened it:</p>
                  <ul className="mt-2 space-y-1">
                    {changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-stone">Your bag now shows the current details. Check it, then tap Order on WhatsApp again.</p>
                </div>
              )}
              <button
                type="button"
                className="btn btn-primary mt-6 min-h-14 w-full text-base"
                disabled={busy || orderable.length === 0}
                onClick={checkout}
              >
                <WhatsAppIcon />
                {checking ? 'Checking your order…' : 'Order on WhatsApp'}
              </button>
              <p className="mt-3 text-sm text-stone">
                We open WhatsApp with your whole bag in one message. You’ll confirm availability, payment and delivery with us
                there.{' '}
                <Link to="/shipping-and-orders" className="link">
                  How ordering works
                </Link>
              </p>
              <button type="button" className="link tap mt-5 text-sm" disabled={busy} onClick={() => run(clearCart)}>
                Empty bag
              </button>
              <p role="status" className="mt-3 text-sm text-alert">
                {message}
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
