import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EVENTS, track } from '../../lib/analytics'
import { applyOrderCheck } from '../../lib/catalog'
import { AVAILABILITY_LABEL, formatPrice } from '../../lib/format'
import { describeChange, orderChanges } from '../../lib/order'
import { absoluteUrl } from '../../lib/seo'
import { addToCart, checkOrder, shopperEnabled } from '../../lib/shopper'
import { openWhatsApp, orderMessage, restockMessage, whatsappLink } from '../../lib/whatsapp'
import { BagIcon, WhatsAppIcon } from '../Icons'
import { WishlistButton } from '../WishlistButton'
import { ChoiceGroup, QuantitySelector, TextOption } from './VariantSelector'

const OUT_OF_REACH = new Set(['sold-out', 'coming-soon'])

export function OrderPanel({ product }) {
  const [color, setColor] = useState(product.colors?.length === 1 ? product.colors[0].name : null)
  const [size, setSize] = useState(product.sizes?.length === 1 ? product.sizes[0] : null)
  const [options, setOptions] = useState({})
  const [quantity, setQuantity] = useState(1)
  const [errors, setErrors] = useState({})
  const [ctaVisible, setCtaVisible] = useState(true)
  const [bag, setBag] = useState({ busy: false, message: null, added: false })
  const [checking, setChecking] = useState(false)
  const [orderNote, setOrderNote] = useState(null)

  const refs = { color: useRef(null), size: useRef(null) }
  const optionRefs = useRef({})
  const ctaRef = useRef(null)

  const unavailable = OUT_OF_REACH.has(product.availability)
  const productUrl = absoluteUrl(`/product/${product.slug}`)
  const selection = { color, size, options, quantity }

  const restockHref = whatsappLink(restockMessage({ product, productUrl }))

  useEffect(() => {
    const el = ctaRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setCtaVisible(entry.isIntersecting), { rootMargin: '0px 0px -40px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  function validate() {
    const next = {}
    if (product.colors?.length && !color) next.color = 'Choose a colour to continue.'
    if (product.sizes?.length && !size) next.size = 'Choose a size to continue.'
    for (const option of product.options ?? []) {
      if (option.required && !options[option.name]?.trim()) {
        next[`option:${option.name}`] = option.type === 'text' ? `Tell us the ${option.name.toLowerCase()}.` : `Choose a ${option.name.toLowerCase()}.`
      }
    }
    setErrors(next)
    const first = Object.keys(next)[0]
    if (first) {
      const target = first.startsWith('option:') ? optionRefs.current[first.slice(7)] : refs[first].current
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      target?.focus({ preventScroll: true })
    }
    return !first
  }

  // The page's price may come from this browser's copy or the CDN, so the server is asked for the
  // current price and availability right before WhatsApp opens. If either changed, nothing is
  // sent: the page shows the new details and says what changed.
  async function handleOrder(placement) {
    if (checking || !validate()) return
    setChecking(true)
    setOrderNote(null)
    const link = (current) => whatsappLink(orderMessage({ product: current, selection, productUrl }))
    try {
      const opened = await openWhatsApp(async () => {
        if (!shopperEnabled) return link(product) // no API (local preview): nothing to check against
        const fresh = (await checkOrder([product.id]))[product.id]
        const changes = orderChanges([product], fresh ? { [product.id]: fresh } : {})
        if (changes.length) {
          const next = changes.every((c) => c.type === 'price') ? ' Check the details, then tap Order again.' : ''
          setOrderNote(`${changes.map(describeChange).join(' ')}${next}`)
          applyOrderCheck(product.id, fresh ?? null)
          return null
        }
        return link({ ...product, ...fresh })
      })
      if (opened) {
        track(EVENTS.whatsappOrderClicked, { product: product.slug, price: product.priceKES, color, size, quantity, placement })
      }
    } catch (err) {
      setOrderNote(err.message)
    } finally {
      setChecking(false)
    }
  }

  const trackRestock = () => track(EVENTS.whatsappClicked, { placement: 'restock', product: product.slug })

  async function handleAddToBag() {
    if (!validate()) return
    setBag({ busy: true, message: null, added: false })
    try {
      await addToCart({ productId: product.id, color, size, options, quantity })
      track(EVENTS.addedToCart, { product: product.slug, price: product.priceKES, color, size, quantity })
      setBag({ busy: false, message: 'Added to your bag.', added: true })
    } catch (err) {
      setErrors(err.fields || {})
      setBag({ busy: false, message: err.message, added: false })
    }
  }

  const setOption = (name, value) => {
    setOptions((o) => ({ ...o, [name]: value }))
    setErrors((e) => ({ ...e, [`option:${name}`]: undefined }))
  }

  const ctaLabel = unavailable ? 'Ask about restock' : 'Order on WhatsApp'
  const availabilityText = product.madeToOrder && !unavailable ? 'Made on order' : AVAILABILITY_LABEL[product.availability]

  return (
    <div>
      <p className={`text-[1.25rem] ${product.priceKES == null ? 'text-stone' : ''}`} style={{ fontStretch: '104%' }}>
        {formatPrice(product.priceKES)}
        {product.compareAtPriceKES && product.priceKES != null && (
          <s className="ml-3 text-base text-stone">{formatPrice(product.compareAtPriceKES)}</s>
        )}
      </p>
      <p className={`mt-1 text-sm ${unavailable ? 'font-medium text-alert' : 'text-stone'}`}>{availabilityText}</p>

      <div className="mt-8 space-y-7">
        {product.colors?.length > 0 && (
          <ChoiceGroup
            label="Colour"
            name={`${product.slug}-colour`}
            values={product.colors.map((c) => c.name)}
            swatches={Object.fromEntries(product.colors.map((c) => [c.name, c.swatch]))}
            value={color}
            onChange={(v) => {
              setColor(v)
              setErrors((e) => ({ ...e, color: undefined }))
            }}
            error={errors.color}
            groupRef={refs.color}
          />
        )}

        {product.sizes?.length > 0 ? (
          <ChoiceGroup
            label="Size"
            name={`${product.slug}-size`}
            values={product.sizes}
            value={size}
            onChange={(v) => {
              setSize(v)
              setErrors((e) => ({ ...e, size: undefined }))
            }}
            error={errors.size}
            groupRef={refs.size}
          />
        ) : (
          <div className="border-l-2 border-taupe pl-4 text-[0.9375rem]">
            <p>Size</p>
            <p className="mt-1 text-stone">{product.sizesNote || 'Tell us your size on WhatsApp and we’ll confirm the fit.'}</p>
          </div>
        )}

        {(product.options ?? []).map((option) =>
          option.type === 'text' ? (
            <TextOption
              key={option.name}
              label={option.name}
              placeholder={option.placeholder}
              value={options[option.name] ?? ''}
              onChange={(v) => setOption(option.name, v)}
              error={errors[`option:${option.name}`]}
              inputRef={(el) => (optionRefs.current[option.name] = el)}
            />
          ) : (
            <ChoiceGroup
              key={option.name}
              label={option.name}
              name={`${product.slug}-${option.name}`}
              values={option.values}
              value={options[option.name] ?? null}
              onChange={(v) => setOption(option.name, v)}
              error={errors[`option:${option.name}`]}
              groupRef={(el) => (optionRefs.current[option.name] = el)}
            />
          ),
        )}

        {!unavailable && <QuantitySelector value={quantity} onChange={setQuantity} />}
      </div>

      <div ref={ctaRef} className="mt-8">
        {unavailable ? (
          <a href={restockHref} target="_blank" rel="noopener noreferrer" onClick={trackRestock} className="btn btn-primary min-h-14 w-full text-base">
            <WhatsAppIcon />
            {ctaLabel}
          </a>
        ) : (
          <button
            type="button"
            onClick={() => handleOrder('panel')}
            disabled={checking}
            className="btn btn-primary min-h-14 w-full text-base"
          >
            <WhatsAppIcon />
            {checking ? 'Checking your order…' : ctaLabel}
          </button>
        )}
        {orderNote && (
          <p role="alert" className="mt-3 border-l-2 border-alert pl-4 text-sm font-medium text-alert">
            {orderNote}
          </p>
        )}
        <div className="mt-3 flex gap-3">
          {shopperEnabled && !unavailable && (
            <button type="button" className="btn btn-secondary min-h-12 flex-1" onClick={handleAddToBag} disabled={bag.busy}>
              <BagIcon width={18} height={18} />
              {bag.busy ? 'Adding…' : 'Add to bag'}
            </button>
          )}
          <WishlistButton product={product} label className={`btn btn-secondary min-h-12 ${unavailable ? 'flex-1' : ''}`} />
        </div>
        <p role="status" className={`text-sm ${bag.message ? 'mt-3' : ''} ${bag.added ? '' : 'text-alert'}`}>
          {bag.message}{' '}
          {bag.added && (
            <Link to="/cart" className="link">
              View bag
            </Link>
          )}
        </p>
        <p className="mt-3 text-sm text-stone">
          {unavailable
            ? 'We’ll let you know on WhatsApp when it’s back.'
            : 'You’ll confirm availability, payment and delivery with us on WhatsApp.'}{' '}
          <Link to="/shipping-and-orders" className="link">
            How ordering works
          </Link>
        </p>
      </div>

      {/* After the button, so the choices and the order button sit together on a phone. */}
      <p className="mt-8 max-w-md text-[1.0625rem] leading-relaxed">{product.description}</p>

      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 py-3 transition-transform duration-300 lg:hidden ${
          ctaVisible ? 'translate-y-full' : 'translate-y-0'
        }`}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        aria-hidden={ctaVisible}
        inert={ctaVisible ? true : undefined}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{product.name}</p>
            <p className={`text-sm ${product.priceKES == null ? 'text-stone' : ''}`}>{formatPrice(product.priceKES)}</p>
          </div>
          {unavailable ? (
            <a href={restockHref} target="_blank" rel="noopener noreferrer" onClick={trackRestock} className="btn btn-primary shrink-0 px-5">
              <WhatsAppIcon width={18} height={18} />
              Ask about restock
            </a>
          ) : (
            <button type="button" onClick={() => handleOrder('sticky')} disabled={checking} className="btn btn-primary shrink-0 px-5">
              <WhatsAppIcon width={18} height={18} />
              {checking ? 'Checking…' : 'Order'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
