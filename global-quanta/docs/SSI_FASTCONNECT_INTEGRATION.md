# SSI FastConnect Data integration

## Project architecture

This app uses React/Vite with an Express backend in `backend/`. SSI credentials stay in the backend environment. The browser calls only the app's `/api/ssi` endpoints.

```text
React/Vite ── REST /api/ssi/market/* ──> Express ──> SSI FC Data REST
React/Vite <── SSE /api/ssi/stream/market <── Express <── SSI SignalR WebSocket
```

The REST client obtains and caches the SSI access token in process memory. The backend has an endpoint and query-key allowlist; market GET fields are sent as `lookupRequest.<field>` per SSI's Node sample. The stream uses SSI's Node.js streaming endpoint (`wss://fc-datahub.ssi.com.vn/v2.0` by default), subscribes only to active app symbols, then relays SSI `X` snapshots through SSE. The Sidebar updates from SSI's last matched price and keeps Yahoo polling as a fallback when the SSI stream is disconnected.

No order placement or FC Trading code is included.

## Configure

1. Complete SSI's service registration and confirm FC Data is activated for the credentials. SSI's public guide says to register through a branch/account manager or the stated remote process, create the key in iBoard, then download the client and register the integration.
2. Confirm the account uses the FC Data API described here and allowlist the backend's fixed outbound IP with SSI if required. The current code uses the documented `/api/v2/Market` API and Node.js streaming URL; do not substitute FC Trading/V3 settings.
3. Copy `backend/.env.example` to `backend/.env`. Set `SSI_CONSUMER_ID` and `SSI_CONSUMER_SECRET` there. Do not send credentials through chat, put them in `VITE_*` variables, or commit `.env`.
4. Run the backend from `backend/` using `npm run dev`, then run Vite at the repository root using `npm run dev`. The Vite proxy forwards `/api` to `http://localhost:4000`.
5. In production, keep the frontend and backend behind the same origin or configure `VITE_API_BASE_URL` and the backend's exact `FRONTEND_ORIGIN`. Use static outbound IP egress if SSI requires an IP allowlist.

## Frontend examples

Fetch daily OHLC data through the backend proxy:

```ts
import { fetchSsiMarketData } from './services/api';

const result = await fetchSsiMarketData('DailyOhlc', {
  symbol: 'SSI',
  fromDate: '01/09/2026',
  toDate: '30/09/2026',
  pageIndex: 1,
  pageSize: 100,
});
```

The Sidebar already subscribes to SSI quotes. Other React components can subscribe to selected symbols and must close the EventSource during effect cleanup:

```ts
import { subscribeSsiMarketQuotes } from './services/api';

const unsubscribe = subscribeSsiMarketQuotes(['SSI', 'FPT'], (quote) => {
  console.log(quote);
}, (connected) => console.log('SSI stream connected:', connected));
// Return unsubscribe from the React effect cleanup.
```

The streaming endpoint accepts 1–50 valid symbols per browser subscriber and caps the combined server subscription at 200 symbols. It subscribes SSI's `X` snapshot channel, which includes last price and bid/ask fields.

## Backend token flow

SSI FC Data V2 token request:

```http
POST https://fc-data.ssi.com.vn/api/v2/Market/AccessToken
Content-Type: application/json

{"consumerID":"<server env>","consumerSecret":"<server env>"}
```

The backend calls `https://fc-data.ssi.com.vn/api/v2/Market/<endpoint>` with `Authorization: Bearer <accessToken>`. SSI credentials and the token are never returned to the browser. The token cache reads the JWT expiration and refreshes shortly before expiry. The FC Data token request needs ConsumerID and ConsumerSecret; PrivateKey and PIN/OTP belong to the separate FC Trading flow, which is outside this integration.

REST endpoints currently allowed: `Securities`, `SecuritiesDetails`, `IndexComponents`, `IndexList`, `DailyOhlc`, `IntradayOhlc`, `DailyIndex`, and `DailyStockPrice`. The route forwards only known query keys. Confirm each endpoint's required query fields/date format and page sizes in SSI API Specs.

## CORS, rate limits and operations

- CORS allows one exact frontend origin. CORS is not authentication; apply app authentication/rate limiting if this backend is exposed publicly.
- Avoid rapid REST polling for realtime prices; use the streaming subscription. Handle SSI quota/429 errors and observe the account's rate limit.
- Keep `.env` out of source control. If a key has been exposed, revoke it and issue a new one in SSI iBoard.
- The email link could not be read in this session because no Gmail connector is available and Google rejected the page fetch. Share the email text with all secrets redacted to verify whether it specifies a different endpoint/environment or additional FC Data parameters.

## SSI references

- [FastConnect Data API Specs](https://guide.ssi.com.vn/ssi-products/fastconnect-data/api-specs)
- [FastConnect Data connection guide](https://guide.ssi.com.vn/ssi-products/tieng-viet/fastconnect-data/huong-dan-ket-noi)
- [FastConnect Data streaming guide](https://guide.ssi.com.vn/ssi-products/tieng-viet/fastconnect-data/du-lieu-streaming)
- [SSI Node.js FC Data client sample](https://github.com/SSI-Securities-Corporation/node-fcdata)
- [FastConnect V3 overview](https://developers.ssi.com.vn/docs/faq/service-overview)
