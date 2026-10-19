# Gamestation Rate

Private price and stock dashboard for iTunes, Xbox and Razer. Uses Bitkub USDT/THB quotes, configurable acquisition allowance, and per-product/per-country markups. Read-only supplier integration: no purchases or transfers.

## Railway deployment

1. Create a Railway service from this GitHub repository. The Dockerfile supplies Node.js; no npm dependencies are required at runtime.
2. Attach a **Volume** mounted at `/data`. Use **one replica** and disable server sleeping if scheduled refreshes must run continuously.
3. Generate a public HTTPS domain for the service.
4. Configure Railway Variables (never commit actual values):

| Variable | Value |
| --- | --- |
| `PUBLIC_URL` | Full HTTPS service URL, e.g. `https://your-service.up.railway.app` |
| `APP_USERNAME` | Your dashboard username |
| `APP_PASSWORD` | A unique dashboard password, at least 16 characters |
| `VAULT_KEY` | A random 32-byte key encoded as 64 hex characters |
| `DATA_DIR` | `/data` |

Generate a vault key on your own terminal with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Store it directly in Railway Variables. Keep a private backup; changing it makes the saved encrypted account unreadable.

Railway supplies `PORT`; the app listens on `0.0.0.0` in production. `/healthz` exposes only readiness and does not require authentication. All UI and other API routes require HTTP Basic authentication. Configure production with HTTPS only. The image sets `NODE_ENV=production` and refuses to start without the required configuration.

5. Deploy, open the domain and enter your dashboard username/password when the browser asks.
6. Use the account button to enter the supplier account and save it if automatic re-login is desired. Then refresh inventory.
7. Set markups and the automatic refresh interval in **Setting**, then save.

The supplier password is separate from the dashboard password. It is encrypted with AES-256-GCM in `/data/account.aes`. Settings and inventory snapshots live on the same volume. No local passwords, sessions, inventory captures, or personal pricing settings are included in this repository. Windows DPAPI sessions cannot be moved to Railway: sign in again. Existing local pricing settings may be migrated privately as `/data/settings.json` before starting the service; never upload them to the repository.

Optional variables: `PROMO_EMAIL`, `PROMO_PASSWORD` to initialize supplier credentials; `PROMO_AUTO_SYNC=1` to refresh on startup. These are not necessary when using the account dialog. The app retries supplier session login when it expires. Access from Railway's region still needs verification against the upstream service.

## Local development

Node.js 22 or later: `npm start`. Open `http://127.0.0.1:4317/`. Local Windows storage uses DPAPI unless `VAULT_KEY` is set. For local Linux use, supply `VAULT_KEY`. Environment variables are read from the process; `.env.example` is documentation, not automatically loaded.

Run `npm test` for unit and hosting checks. To stop a foreground server, press Ctrl+C.

Railway documentation: https://docs.railway.com/volumes and https://docs.railway.com/deployments/healthchecks
