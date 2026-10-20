# Gamestation Rate

Private price and stock dashboard for iTunes, Xbox and Razer. Uses Bitkub USDT/THB quotes, configurable acquisition allowance, and per-product/per-country markups. Read-only supplier integration: no purchases or transfers.

## Railway deployment

1. Create a Railway service from this GitHub repository. The Dockerfile supplies Node.js; PostgreSQL client dependencies are installed during the Docker build.
2. Add a **PostgreSQL** service. In this app service, add `DATABASE_URL` as a reference to the PostgreSQL service's `DATABASE_URL` (Railway UI: Add Reference). Use the private connection within the same project. Attach a **Volume** mounted at `/data`. Use **one replica** and disable server sleeping if scheduled refreshes must run continuously.
3. Generate a public HTTPS domain for the service.
4. Configure Railway Variables (never commit actual values):

| Variable | Value |
| --- | --- |
| `PUBLIC_URL` | Full HTTPS service URL, e.g. `https://your-service.up.railway.app` |
| `APP_USERNAME` | Your dashboard username |
| `APP_PASSWORD` | A unique dashboard password, at least 16 characters |
| `VAULT_KEY` | A random 32-byte key encoded as 64 hex characters |
| `DATA_DIR` | `/data` |
| `DATABASE_URL` | Reference to PostgreSQL service `DATABASE_URL` |

Generate a vault key on your own terminal with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Store it directly in Railway Variables. Keep a private backup; changing it makes the saved encrypted account unreadable.

Railway supplies `PORT`; the app listens on `0.0.0.0` in production. `/healthz` exposes only readiness and does not require authentication. All UI and other API routes require HTTP Basic authentication. Configure production with HTTPS only. The image sets `NODE_ENV=production` and refuses to start without the required configuration.

5. Deploy, open the domain and enter your dashboard username/password when the browser asks.
6. Use the account button to enter the supplier account and save it if automatic re-login is desired. Then refresh inventory.
7. Set markups and the automatic refresh interval in **Setting**, then save.

The supplier password is separate from the dashboard password. It is encrypted with AES-256-GCM in `/data/account.aes`. Settings are stored in PostgreSQL table `gamestation_settings` as one shared configuration. The table is created automatically. On the first database initialization only, valid `/data/settings.json` is imported if present; otherwise defaults are inserted. Existing database settings are never overwritten by the old file. Inventory snapshots and the encrypted supplier account still live on the volume. No local passwords, sessions, inventory captures, or personal pricing settings are included in this repository. Windows DPAPI sessions cannot be moved to Railway: sign in again. Existing local pricing settings may be migrated privately as `/data/settings.json` before starting the service; never upload them to the repository.

Optional variables: `PROMO_EMAIL`, `PROMO_PASSWORD` to initialize supplier credentials; `PROMO_AUTO_SYNC=1` to refresh on startup. These are not necessary when using the account dialog. The app retries supplier session login when it expires. Access from Railway's region still needs verification against the upstream service.

## Local development

Node.js 22 or later: `npm ci`, then `npm start`. Open `http://127.0.0.1:4317/`. Local Windows storage uses DPAPI unless `VAULT_KEY` is set. For local Linux use, supply `VAULT_KEY`. Environment variables are read from the process; `.env.example` is documentation, not automatically loaded.

Run `npm test` for unit and hosting checks. To stop a foreground server, press Ctrl+C.

Railway documentation: https://docs.railway.com/volumes and https://docs.railway.com/deployments/healthchecks

## Settings database behavior

Production requires DATABASE_URL. Startup stops if the database cannot be loaded. A failed save returns an error and leaves active settings unchanged. Pricing allowance, default markup, per-category/country markups, fee and refresh interval are all persisted together. The app remains single-instance/single-account; this is not per-user tenancy. Locally, without DATABASE_URL, settings.json remains supported. Tests use pg-mem for SQL behavior; verify against your Railway PostgreSQL after connecting.

## Database login
When DATABASE_URL is configured, login is stored in gamestation_admin with a salted scrypt hash. APP_USERNAME and APP_PASSWORD initialize the account only when the table is empty (minimum password length 5). Set these bootstrap variables before the first deployment. Existing database credentials are never overwritten on restart. Change the username and password in Setting > บัญชีเข้าโปรแกรม using the current password. The next request requires the new Basic Auth credentials. The supplier account remains separate. Never commit real bootstrap credentials.

## iTunes sales text API

Create an API key in Setting > API ข้อความขายแยกสินค้า and copy it immediately. Only its SHA-256 hash is stored in PostgreSQL. Rotating it revokes the old key; deploying does not reset it.

GET /api/sales/itunes
Authorization: Bearer YOUR_API_KEY

Successful response: HTTP 200, Content-Type: application/json; charset=utf-8, exactly {"text":"..."}. Newlines are JSON-escaped as \n and become line breaks when parsed. The text matches the iTunes account sales copy view, with THB prices rounded upward to four significant digits (27.30, 1.523, 0.1990), country-specific 1+/5+/9+ markup, and blank out-of-stock age lines.

This endpoint serves the latest successful stock snapshot and the current usable Bitkub quote; it does not trigger supplier calls. Configure the automatic inventory update interval in Setting. A snapshot can be older if the latest sync failed. No timestamp is appended to the sales text.

Missing/invalid key: 401. Unsupported method: 405. Missing inventory/USDT conversion or expired Bitkub quote: 503 with Retry-After: 30. Error bodies contain an error field, not sales text. Sales API keys only read the sales endpoints; they cannot access settings, supplier sessions, or admin routes. Intended for server-to-server clients; no cross-origin browser access is enabled.

Example:

```sh
curl -H "Authorization: Bearer YOUR_API_KEY" https://price-project-production.up.railway.app/api/sales/itunes
```


## Multiple suppliers and external inventory

See [EXTERNAL-API.md](EXTERNAL-API.md) for the input contract and examples.

The existing supplier adapter remains independently synced. External sources are push-fed and persisted in PostgreSQL (`gamestation_sources`). Inventory rows carry sourceId and their own USD/USDT conversion, so a supplier conversion never changes another supplier's cost. Settings remain per product/country (plus iTunes age), shared across suppliers. Supplier credentials are not part of inventory feeds.

Sales endpoints: `/api/sales/itunes`, `/api/sales/itunes-recharge`, `/api/sales/xbox`, `/api/sales/razer`, `/api/sales/mycard`. The existing sales key reads all of these. Optional `?source=supplier-a` selects one source (`promo` selects the original supplier). Unknown/unavailable product inventory returns 503; unknown product routes return 404. Output stays exactly `{ "text": "..." }`. A new product requires registering its slug in PRODUCTS, the settings validator and UI selectors.

External data expires at expiresAt and is excluded from inventory and sales after expiry. Original supplier snapshots retain the existing last-successful-sync behavior. The UI source selector supports both inventory and sales. Multiple-source account/card entries remain separate; we do not sum their stocks or assume duplicate offers are separate stock. Identical recharge sale lines are deduplicated. No automatic cheapest-supplier selection is enabled. Additional website scraping/login adapters are not included until their API contracts are known.


## Stock and recharge separation

Each product (itunes, xbox, razer, mycard) supports GET `/api/sales/{product}/stock` and `/api/sales/{product}/recharge`, with the same sales Bearer key and optional `?source=...`. Stock returns only accounts/cards with stock quantities; recharge returns only top-up rates. JSON stays `{ "text": "..." }`. An unavailable type returns 503 without falling back to the other type.

Legacy URLs remain unchanged: `/api/sales/itunes` is stock, `/api/sales/itunes-recharge` is recharge, and the old xbox/razer/mycard URLs retain their combined output. Country codes (including US/us) and four-significant-digit rounding are unchanged.

Setting now includes independent stock/recharge markup per product and country, stored in `fulfillmentMarkups` (example keys `xbox:US:stock`, `xbox:US:recharge`). Blank inherits the previous category/country markup, then legacy iTunes country markup, then global markup; zero is a valid override. iTunes stock age overrides 1+/5+/9+ take precedence over stock markup. Existing saved settings are not reset. Old clients omitting fulfillmentMarkups preserve the saved map.

External input contract stays the same: kind=account or card maps to stock; kind=recharge maps to recharge. No external feed migration is needed.
