const DATA_API_BASE = (process.env.SSI_DATA_API_BASE || "https://fc-data.ssi.com.vn/api/v2").replace(/\/+$/, "");
const TOKEN_REFRESH_SKEW_MS = 60_000;

let cachedToken;
let tokenExpiresAt = 0;
let tokenRequest;

function marketApiBase() {
  return /\/Market$/i.test(DATA_API_BASE) ? DATA_API_BASE : `${DATA_API_BASE}/Market`;
}

function getCredentials() {
  const consumerID = process.env.SSI_CONSUMER_ID;
  const consumerSecret = process.env.SSI_CONSUMER_SECRET;
  if (!consumerID || !consumerSecret) {
    const error = new Error("SSI FC Data credentials are not configured on the backend.");
    error.statusCode = 503;
    throw error;
  }
  return { consumerID, consumerSecret };
}

function jwtExpiryMs(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : Date.now() + 30 * 60_000;
  } catch {
    return Date.now() + 30 * 60_000;
  }
}

async function readSSIResponse(response) {
  const body = await response.json().catch(() => ({}));
  const apiStatus = body.status;
  const failedApiStatus = (typeof apiStatus === "number" && apiStatus >= 400)
    || (typeof apiStatus === "string" && !["success", "200"].includes(apiStatus.toLowerCase()));
  if (!response.ok || failedApiStatus) {
    const error = new Error(body.message || `SSI API returned HTTP ${response.status}`);
    const embeddedStatus = typeof apiStatus === "number"
      ? apiStatus
      : (typeof apiStatus === "string" && /^\d{3}$/.test(apiStatus) ? Number(apiStatus) : undefined);
    error.statusCode = response.status >= 500
      ? 502
      : (response.status === 200 ? (embeddedStatus >= 400 ? embeddedStatus : 502) : response.status);
    throw error;
  }
  return body;
}

export async function getMarketAccessToken() {
  if (cachedToken && tokenExpiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS) return cachedToken;
  if (!tokenRequest) {
    tokenRequest = (async () => {
      const credentials = getCredentials();
      const response = await fetch(`${marketApiBase()}/AccessToken`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(credentials),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await readSSIResponse(response);
      const accessToken = body.data?.accessToken ?? body.accessToken;
      if (!accessToken) throw new Error("SSI FC Data response did not contain an access token.");
      cachedToken = accessToken;
      tokenExpiresAt = jwtExpiryMs(accessToken);
      return cachedToken;
    })().finally(() => { tokenRequest = undefined; });
  }
  return tokenRequest;
}

const ALLOWED_MARKET_ENDPOINTS = new Set([
  "Securities",
  "SecuritiesDetails",
  "IndexComponents",
  "IndexList",
  "DailyOhlc",
  "IntradayOhlc",
  "DailyIndex",
  "DailyStockPrice",
]);

export async function getMarketData(endpoint, query = {}) {
  if (!ALLOWED_MARKET_ENDPOINTS.has(endpoint)) {
    const error = new Error("Unsupported SSI market endpoint.");
    error.statusCode = 404;
    throw error;
  }
  const token = await getMarketAccessToken();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      // SSI V2 market APIs expect the query model under lookupRequest.*.
      params.set(`lookupRequest.${key}`, String(value));
    }
  }
  const serializedParams = params.toString();
  const url = `${marketApiBase()}/${endpoint}${serializedParams ? `?${serializedParams}` : ""}`;
  const makeRequest = (accessToken) => fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  let response = await makeRequest(token);
  if (response.status === 401) {
    // SSI documents an eight-hour access-token lifetime and no refresh-token
    // endpoint. If SSI rejects a token early, evict it and request a new one.
    // Another concurrent request may already have replaced this token, so
    // only evict the cache when it still contains the token that just failed.
    if (cachedToken === token) {
      cachedToken = undefined;
      tokenExpiresAt = 0;
    }
    response = await makeRequest(await getMarketAccessToken());
  }
  return readSSIResponse(response);
}
