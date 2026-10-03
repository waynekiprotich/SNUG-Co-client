import { site } from '../config/site'
import { formatPrice } from './format'

const number = site.whatsapp.number.replace(/\D/g, '')

export const whatsappConfigured = number.length > 0

if (!whatsappConfigured && import.meta.env.DEV) {
  console.warn(
    '[Snug & Co.] WhatsApp number is not set. Links open WhatsApp without a recipient. Set VITE_WHATSAPP_NUMBER or site.whatsapp.number.',
  )
}

export function whatsappLink(message) {
  const text = encodeURIComponent(message)
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`
}

export function generalInquiryLink() {
  return whatsappLink(site.whatsapp.generalMessage)
}

/**
 * Open WhatsApp once `prepare` returns its link, or not at all if it returns null (the order
 * changed) or throws. The tab is opened at once, inside the tap, because browsers block tabs
 * opened after waiting on the network; it's closed again if the order can't go ahead. Without a
 * tab (popup blocked), this page goes to WhatsApp instead. Returns true when WhatsApp opened.
 */
export async function openWhatsApp(prepare) {
  const tab = window.open('', '_blank')
  try {
    if (tab) {
      tab.document.title = 'Opening WhatsApp…'
      tab.document.body?.append('Checking your order…')
    }
  } catch {
    // Some browsers don't allow touching the new tab; it just stays blank for a moment.
  }
  let url = null
  try {
    url = await prepare()
  } finally {
    if (!url) tab?.close()
  }
  if (!url) return false
  if (tab) {
    tab.opener = null
    tab.location.replace(url)
  } else {
    window.location.assign(url)
  }
  return true
}

export function orderMessage({ product, selection, productUrl }) {
  const lines = [`Hi ${site.brandName}, I'd like to order the ${product.name}.`, '']

  if (product.colors?.length) lines.push(`Colour: ${selection.color}`)
  if (product.sizes?.length) lines.push(`Size: ${selection.size}`)
  else lines.push('Size: I’ll share my size here')
  for (const option of product.options ?? []) {
    const value = selection.options?.[option.name]
    if (value) lines.push(`${option.name}: ${value}`)
  }
  lines.push(`Quantity: ${selection.quantity}`)
  lines.push(product.priceKES != null ? `Price: ${formatPrice(product.priceKES)}` : 'Price: please confirm')
  lines.push('', 'Is it available?')
  if (productUrl) lines.push(productUrl)

  return lines.join('\n')
}

export function restockMessage({ product, productUrl }) {
  return [`Hi ${site.brandName}, is the ${product.name} coming back?`, productUrl].filter(Boolean).join('\n')
}

/** One message for the whole bag. items: [{ product, line, url }]. */
export function cartMessage(items) {
  const lines = [`Hi ${site.brandName}, I'd like to order these pieces:`, '']
  let total = 0
  let unpriced = 0
  items.forEach(({ product, line, url }, i) => {
    lines.push(`${i + 1}. ${product.name}`)
    const choices = []
    if (line.color) choices.push(`Colour: ${line.color}`)
    if (line.size) choices.push(`Size: ${line.size}`)
    else if (!product.sizes?.length) choices.push('Size: I’ll share my size here')
    for (const [name, value] of Object.entries(line.options || {})) choices.push(`${name}: ${value}`)
    if (choices.length) lines.push(`   ${choices.join(' · ')}`)
    const price = product.priceKES != null ? `${formatPrice(product.priceKES)} each` : 'price to confirm'
    lines.push(`   Quantity: ${line.quantity} · ${price}`)
    if (url) lines.push(`   ${url}`)
    lines.push('')
    if (product.priceKES != null) total += product.priceKES * line.quantity
    else unpriced += line.quantity
  })
  if (total) lines.push(`Total: ${formatPrice(total)}${unpriced ? ` plus ${unpriced} piece${unpriced === 1 ? '' : 's'} to price` : ''}`)
  lines.push('Is everything available?')
  return lines.join('\n')
}
