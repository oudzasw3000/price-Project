# External inventory API

## Set up

1. Open Setting > แหล่งข้อมูลภายนอก.
2. Choose a unique id such as `supplier-a` and a display name, then create the source.
3. Copy the source key immediately. Only a SHA-256 hash is saved in PostgreSQL.
4. Send a complete inventory snapshot to the PUT endpoint below on each refresh.

The source key can only replace that source's inventory. It cannot read sales, settings or supplier sessions. The sales read key cannot upload inventory. Create/rotate source keys through the authenticated administrator UI. To revoke an old key, enter its source id and select rotate. Deployments do not reset keys or feeds.

## Write inventory

```http
PUT /api/sources/supplier-a/inventory
Authorization: Bearer SOURCE_WRITE_KEY
Content-Type: application/json
```

```json
{
  "expiresAt": "2026-10-19T18:00:00.000Z",
  "items": [
    {
      "id": "xbox-us-standard",
      "product": "xbox",
      "kind": "recharge",
      "country": "US",
      "label": "Xbox US",
      "channel": "standard",
      "denomination": 100,
      "costUsdt": 80
    },
    {
      "id": "mycard-tw-1000",
      "product": "mycard",
      "kind": "card",
      "country": "TW",
      "label": "MyCard TW 1000",
      "denomination": 1000,
      "costUsdt": 28,
      "stock": 12
    },
    {
      "id": "itunes-us-500-9",
      "product": "itunes",
      "kind": "account",
      "country": "US",
      "label": "iTunes US 500 9+",
      "denomination": 500,
      "costUsdt": 400,
      "age": "9+",
      "stock": 3
    }
  ]
}
```

Replace expiresAt with a future UTC ISO timestamp, at most 24 hours ahead. For example `new Date(Date.now() + 15 * 60 * 1000).toISOString()` expires the feed in 15 minutes. An external scheduler must refresh it; the dashboard's supplier refresh button does not fetch external sources.

- costUsdt is the **total cost for one account/card or the given recharge denomination**, not the cost per unit. The application divides by denomination when displaying unit rates, adds the configured acquisition allowance and markup, then rounds sale rates upward to four significant digits.
- Product values: itunes, xbox, razer, mycard. Country uses uppercase codes, e.g. US, UK, TW, MX (not MXN).
- kind account is currently iTunes only and requires age and stock. Ages: 0-1, 1-5, 5-9, 9+. Age 0-1 is excluded from sales copy.
- kind card supports Xbox, Razer and MyCard; stock is a nonnegative integer. kind recharge requires a nonempty channel and displays rates without customer quantities or stock.
- id must be unique in this source snapshot. It is namespaced by source; matching ids from other sources do not overwrite it.
- Every PUT replaces **all products for that source** atomically. Include all current products; omitted rows disappear. Sending items: [] clears that source inventory. Retrying the same body does not duplicate inventory.
- Maximum 2,000 items and 1 MB JSON body per request. Invalid payloads keep the old snapshot. No account passwords, activation codes, personal details, or secrets belong in this feed.

Success: `200 {"ok":true,"items":3,"expiresAt":"..."}`. Invalid key: 401. Invalid payload: 400. Wrong method: 405. Wrong content type: 415. Authentication database unavailable: 503. A storage error during replacement returns 400 and retains the old snapshot; retry with backoff.

## Read sales text

```http
GET /api/sales/mycard?source=supplier-a
Authorization: Bearer SALES_READ_KEY
```

Available endpoints: itunes (accounts), itunes-recharge, xbox, razer, mycard. Response: `{"text":"..."}`. Omitting source includes all sources; using source=promo selects the original supplier. Stock is never summed across sources. If your suppliers may share the same stock, select one source to avoid presenting duplicate offers.

Unavailable/expired product data or unusable exchange rate returns 503, never a fabricated price. A zero-stock iTunes category still shows blank age lines. Configure product/country and iTunes age markups in Setting as before.

These APIs are server-to-server; CORS browser access is not enabled. Example client:

```js
const base = process.env.RATE_API_URL;
const response = await fetch(`${base}/api/sources/supplier-a/inventory`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${process.env.SOURCE_WRITE_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    items: [{ id: 'xbox-us', product: 'xbox', kind: 'recharge', country: 'US',
      label: 'Xbox US', channel: 'standard', denomination: 100, costUsdt: 80 }]
  })
});
if (!response.ok) throw new Error(`Inventory upload failed: ${response.status}`);
```
