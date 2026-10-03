# Snug & Co. website

The storefront for SNUG & Co. (@snug_co_ke), a Nairobi clothing brand. Customers browse the collection, pick a piece and its options, then order through a prefilled WhatsApp message. It is built to the PRD in `../prd.md`.

Stack: React 19, Vite, JavaScript, Tailwind CSS 4, React Router. It works on its own with the bundled catalog, and it can read the catalog from the Flask API in `../server`, which adds the admin at `/admin` (see `../server/README.md`).

## Run it

```bash
npm install
cp .env.example .env    # then set VITE_WHATSAPP_NUMBER and VITE_SITE_URL
npm run dev             # http://localhost:5173
npm run build           # production build in dist/
npm run preview         # serve dist/ locally
```

## Where things live

| Path | What it holds |
| --- | --- |
| `src/config/site.js` | Brand, WhatsApp, Instagram, address, opening hours, announcement, policies. Every component reads these from here. |
| `src/data/products.js` | The bundled product catalog. Used when `VITE_API_URL` is empty. With the API, the admin manages the catalog instead. |
| `src/admin/` | The admin screens (sign in, products, photos, categories, collections, account). Loaded only at `/admin`. |
| `src/data/categories.js` | Categories (Lounge sets, Tracksuits, Jackets, Sweatshirts & tops) and collections (Kenya, Matchday, His & Hers). |
| `src/data/social.js` | Instagram gallery tiles and testimonials. |
| `src/lib/catalog.js` | Loads each page's data (home, card-sized product list, one product) from the API when `VITE_API_URL` is set, otherwise from the bundled data. `index.html` starts the current page's request before the app loads. Each response is also kept in the browser for a week (`snug-cache:v1:*`), so a returning visitor sees the last copy at once while fresh data loads. |
| `src/lib/images.js` | Finds a photo by id, whether it is bundled or uploaded through the admin. |
| `src/lib/whatsapp.js` | Builds the order message and wa.me links. `openWhatsApp` opens WhatsApp only after the order has been checked. |
| `src/lib/order.js` | Compares an order as shown with the server's current prices and availability (`npm test`). |
| `src/lib/shopper.js` | Wishlist and bag (kept by the API in a cookie), plus `checkOrder`, which asks the server for current prices right before an order is sent. |
| `src/lib/analytics.js` | Provider-agnostic events (`whatsapp_order_clicked`, `product_viewed`, …) pushed to `window.dataLayer`. |
| `src/lib/seo.js` | Per-page title, description, canonical, Open Graph and JSON-LD. |

## Content sources

All product names, prices, materials, sizes and photos come from SNUG's own Instagram posts. The brand colours are sampled from the logo. The About page uses SNUG's own published words.

## Before launch: confirm with SNUG

These are placeholders in the code and must not go live unconfirmed (PRD §55–56):

- **WhatsApp number.** Not published anywhere. Until it is set, order buttons open WhatsApp and the customer has to choose the chat.
- **Prices.** Only three prices are published (Tropical Vibes Short Set, Striped Short Set and Club Puff Jacket, each KSh 4,500). Every other piece shows "Price on request".
- **Sizes.** Only the Argentina Jersey has a published size range (S–XXL). The other pieces ask the customer to share their size on WhatsApp.
- **Availability.** Everything defaults to `available`.
- **Product names** where `nameConfirmed: false`: Colour-Block Short Set, Beige Lounge Set, Green Tracksuit, Club Puff Jacket, Argentina Jersey and Manchester United Retro Jacket.
- **Colour names** for the Green Tracksuit (Bottle green and Teal green).
- **Address.** Taken from the Instagram bio.
- **Opening hours, phone, email.** Not published, so they are hidden.
- **Delivery, collection, payment and returns policies.** Not published. The Orders page asks customers to confirm on WhatsApp.
- **Testimonials.** Kept empty until SNUG supplies approved quotes. The section links to the Instagram Feedback highlight instead.
- **Matchday pieces.** These carry football club, federation and sportswear marks. Confirm that SNUG wants them listed on a public website.
- **About copy, logo files and official colours.**

## Adding or editing a product

Use `/admin`. `src/data/products.js` is the fallback catalog used only when `VITE_API_URL` is empty.

## Deploying

Two ways to host this, depending on where the Flask API (`../server`) runs:

- **Vercel (production):** set `VITE_API_URL=/api`. `vercel.json` proxies `/api/*` to `https://snug-co-api.onrender.com/api/*` and falls back to `index.html` for page routes, so the browser only talks to the site's own domain and admin cookies stay same-site. Product photos load straight from Cloudinary.
- **Same domain as the API:** Flask serves the built site itself and falls back to `index.html` for page routes (see `server/README.md`). No extra setup here.

Either way, set `VITE_SITE_URL` so canonical and share links use the real domain.

A Vercel production build (`VERCEL_ENV=production`) stops with a clear error unless these are set. Other builds only warn.

- `VITE_API_URL` set to `/api`, or the shop shows the bundled sample catalog.
- `VITE_WHATSAPP_NUMBER` in international format without the leading 0, or orders have no recipient.
- `VITE_SITE_URL` as the live `https://` address with no trailing slash. The build puts it in the share-preview image URL in `index.html` and the `Sitemap:` line of the generated `robots.txt`.

`/sitemap.xml` is proxied to the API, which lists every published product. Set `SITE_URL` on Render to the same address, or the sitemap lists the Render host instead.

Share previews on WhatsApp and Facebook read the static tags in `index.html`, because those crawlers don't run JavaScript. If you need a separate preview for each product, prerender those pages at build time. That is a later enhancement.

Deploy the server before this site whenever both change: orders are checked against `/api/shopper/check`, which older servers don't have.

The build adds a Content-Security-Policy `<meta>` tag to `index.html` (see `vite.config.js`). It allows the site's own files and `/api`, Google Fonts and `res.cloudinary.com` photos, and the two inline scripts in `index.html` by hash. Loading anything from another domain (an analytics script, photos from another host) means adding that domain there first. Vercel's preview toolbar is blocked by it on preview deployments.
