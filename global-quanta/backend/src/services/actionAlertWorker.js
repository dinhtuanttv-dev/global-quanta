const PROVIDER = "Yahoo Finance (VN delayed)";
const WORKER_NAME = "action_alert_evaluator";
const POLL_MS = Math.max(30_000, Number(process.env.ALERT_WORKER_INTERVAL_MS || 60_000));
const MAX_QUOTE_AGE_MS = Math.max(60_000, Number(process.env.ALERT_MAX_QUOTE_AGE_MS || 30 * 60_000));
const MAX_RADAR_AGE_MS = Math.max(60_000, Number(process.env.ALERT_MAX_RADAR_AGE_MS || 15 * 60_000));
const RADAR_ALERTS_ENABLED = process.env.ALERT_RADAR_ENABLED === "true";
const REQUEST_TIMEOUT_MS = 8_000;
let timer = null;
let running = false;
let started = false;
let lastCycleAt = null;
let lastSuccessfulCycleAt = null;
let lastCycleFailed = false;

function config() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceKey ? { url: url.replace(/\/+$/, ""), serviceKey } : null;
}

async function request(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function rest(path, init = {}) {
  const cfg = config();
  if (!cfg) throw new Error("Supabase worker credentials are not configured.");
  return request(`${cfg.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: cfg.serviceKey,
      authorization: `Bearer ${cfg.serviceKey}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

async function acquireLease() {
  const now = new Date();
  const until = new Date(now.getTime() + 2 * 60_000);
  const path = `action_alert_worker_leases?name=eq.${WORKER_NAME}&locked_until=lt.${encodeURIComponent(now.toISOString())}&select=name`;
  const response = await rest(path, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ locked_until: until.toISOString() }),
  });
  if (!response.ok) throw new Error(`Unable to acquire worker lease (${response.status}).`);
  return (await response.json()).length > 0;
}

async function releaseLease() {
  await rest(`action_alert_worker_leases?name=eq.${WORKER_NAME}`, {
    method: "PATCH",
    body: JSON.stringify({ locked_until: new Date(0).toISOString() }),
  });
}

async function loadPendingAlerts() {
  const all = [];
  const pageSize = 250;
  for (let offset = 0; ; offset += pageSize) {
    const response = await rest(
      `action_alerts?select=id,user_id,ticker,condition,threshold,state&state=in.(pending,active)&condition=in.(price_above,price_below,change_pct_above${RADAR_ALERTS_ENABLED ? ",convergence_at_least" : ""})&order=created_at.asc`,
      { headers: { Range: `${offset}-${offset + pageSize - 1}` } },
    );
    if (!response.ok) throw new Error(`Unable to load pending alerts (${response.status}).`);
    const page = await response.json();
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

async function loadRadarSnapshots(alerts) {
  const radarAlerts = alerts.filter((alert) => alert.condition === "convergence_at_least");
  if (radarAlerts.length === 0) return new Map();
  const userIds = [...new Set(radarAlerts.map((alert) => alert.user_id))];
  const tickers = [...new Set(radarAlerts.map((alert) => alert.ticker))];
  const path = `action_alert_radar_snapshots?select=user_id,ticker,convergence_score,observed_at&user_id=in.(${userIds.join(",")})&ticker=in.(${tickers.join(",")})`;
  const response = await rest(path);
  if (!response.ok) throw new Error(`Unable to load radar snapshots (${response.status}).`);
  const rows = await response.json();
  return new Map(rows.map((row) => [`${row.user_id}:${row.ticker}`, row]));
}

async function fetchQuote(ticker) {
  const symbol = encodeURIComponent(`${ticker}.VN`);
  const response = await request(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`, {
    headers: { accept: "application/json", "user-agent": "GlobalQuanta-AlertWorker/1.0" },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const meta = payload?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  const previousClose = Number(meta?.previousClose ?? meta?.chartPreviousClose);
  const quoteAt = Number(meta?.regularMarketTime);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quoteAt)) return null;
  if (quoteAt * 1000 > Date.now() + 60_000) return null;
  const quoteAtIso = new Date(quoteAt * 1000).toISOString();
  if (Date.now() - quoteAt * 1000 > MAX_QUOTE_AGE_MS) return null;
  return {
    price,
    previousClose: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : null,
    quoteAt: quoteAtIso,
  };
}

function observedValue(alert, quote) {
  if (alert.condition === "price_above" || alert.condition === "price_below") return quote.price;
  if (alert.condition === "change_pct_above" && quote.previousClose) {
    return ((quote.price - quote.previousClose) / quote.previousClose) * 100;
  }
  return null;
}

async function evaluateAlert(alert, value, quote, observedAt, provider) {
  if (value === null) return false;
  const response = await rest("rpc/trigger_action_alert", {
    method: "POST",
    body: JSON.stringify({
      p_alert_id: alert.id,
      p_observed_value: value,
      p_market_price: quote?.price ?? null,
      p_provider: provider,
      p_quote_at: observedAt,
    }),
  });
  if (!response.ok) throw new Error(`Unable to evaluate alert (${response.status}).`);
  return Boolean(await response.json());
}

async function runCycle() {
  if (running || !config()) return;
  running = true;
  lastCycleAt = new Date().toISOString();
  lastCycleFailed = false;
  let locked = false;
  try {
    locked = await acquireLease();
    if (!locked) {
      lastSuccessfulCycleAt = new Date().toISOString();
      return;
    }
    const alerts = await loadPendingAlerts();
    if (alerts.length === 0) {
      lastSuccessfulCycleAt = new Date().toISOString();
      return;
    }

    const tickers = [...new Set(alerts.filter((alert) => alert.condition !== "convergence_at_least").map((alert) => alert.ticker))];
    const radarSnapshots = await loadRadarSnapshots(alerts);
    const quotes = new Map();
    for (let offset = 0; offset < tickers.length; offset += 5) {
      const batch = await Promise.all(tickers.slice(offset, offset + 5).map(async (ticker) => {
        try { return [ticker, await fetchQuote(ticker)]; }
        catch { return [ticker, null]; }
      }));
      batch.forEach(([ticker, quote]) => { if (quote) quotes.set(ticker, quote); });
    }

    let checked = 0;
    let triggered = 0;
    for (const alert of alerts) {
      if (alert.condition === "convergence_at_least") {
        const snapshot = radarSnapshots.get(`${alert.user_id}:${alert.ticker}`);
        if (!snapshot || Date.now() - Date.parse(snapshot.observed_at) > MAX_RADAR_AGE_MS) continue;
        checked++;
        try {
          if (await evaluateAlert(alert, snapshot.convergence_score, null, snapshot.observed_at, "Client Radar snapshot")) triggered++;
        } catch (error) {
          console.warn(`[action-alert-worker] skipped alert ${alert.id}:`, error instanceof Error ? error.message : "evaluation error");
        }
        continue;
      }
      const quote = quotes.get(alert.ticker);
      if (!quote) continue;
      checked++;
      try {
        if (await evaluateAlert(alert, observedValue(alert, quote), quote, quote.quoteAt, PROVIDER)) triggered++;
      } catch (error) {
        console.warn(`[action-alert-worker] skipped alert ${alert.id}:`, error instanceof Error ? error.message : "evaluation error");
      }
    }
    if (checked || triggered) console.info(`[action-alert-worker] checked=${checked} triggered=${triggered}`);
    lastSuccessfulCycleAt = new Date().toISOString();
  } catch (error) {
    lastCycleFailed = true;
    console.error("[action-alert-worker] cycle failed:", error instanceof Error ? error.message : "unknown error");
  } finally {
    if (locked) {
      try { await releaseLease(); }
      catch { console.error("[action-alert-worker] failed to release worker lease"); }
    }
    running = false;
  }
}

export function startActionAlertWorker() {
  if (process.env.ALERT_WORKER_ENABLED !== "true" || timer) return;
  if (!config()) {
    console.warn("[action-alert-worker] disabled: Supabase server credentials are missing");
    return;
  }
  void runCycle();
  started = true;
  timer = setInterval(() => void runCycle(), POLL_MS);
  console.info(`[action-alert-worker] started; poll interval=${POLL_MS}ms`);
}

export function getActionAlertWorkerStatus() {
  return {
    enabled: process.env.ALERT_WORKER_ENABLED === "true",
    radarAlertsEnabled: RADAR_ALERTS_ENABLED,
    configured: Boolean(config()),
    started,
    running,
    lastCycleAt,
    lastSuccessfulCycleAt,
    lastCycleFailed,
    pollIntervalMs: POLL_MS,
    maxQuoteAgeMs: MAX_QUOTE_AGE_MS,
    maxRadarAgeMs: MAX_RADAR_AGE_MS,
  };
}
