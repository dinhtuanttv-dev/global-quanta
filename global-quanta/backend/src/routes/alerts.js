import { Router } from "express";
import { getActionAlertWorkerStatus } from "../services/actionAlertWorker.js";

const router = Router();
const CONDITION_TYPES = new Set(["price_above", "price_below", "change_pct_above", "convergence_at_least"]);
const radarAlertsEnabled = () => process.env.ALERT_RADAR_ENABLED === "true";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && anonKey && serviceKey ? { url: url.replace(/\/$/, ""), anonKey, serviceKey } : null;
}

async function requireUser(req, res, next) {
  const config = supabaseConfig();
  if (!config) return res.status(503).json({ error: "Supabase auth/database is not configured." });
  const token = req.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: "Sign in with a Supabase account to manage alerts." });

  try {
    const response = await fetch(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.anonKey, authorization: `Bearer ${token}` },
    });
    if (!response.ok) return res.status(401).json({ error: "Your session is invalid or expired. Sign in again." });
    const user = await response.json();
    if (!UUID_RE.test(user.id ?? "")) return res.status(401).json({ error: "Invalid authenticated user." });
    req.alertUserId = user.id;
    req.supabaseConfig = config;
    next();
  } catch {
    res.status(502).json({ error: "Could not verify the Supabase session." });
  }
}

async function databaseRequest(req, path, options = {}, table = "action_alerts") {
  const { url, serviceKey } = req.supabaseConfig;
  return fetch(`${url}/rest/v1/${table}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      ...options.headers,
    },
  });
}

router.use(requireUser);

router.get("/status", (_req, res) => {
  res.json(getActionAlertWorkerStatus());
});

router.post("/radar-snapshots", async (req, res) => {
  if (!radarAlertsEnabled()) return res.status(503).json({ error: "Radar convergence alerts are disabled until a verified live Radar provider is configured." });
  const snapshots = req.body?.snapshots;
  const observedAt = typeof req.body?.observedAt === "string" ? new Date(req.body.observedAt) : null;
  if (!Array.isArray(snapshots) || snapshots.length < 1 || snapshots.length > 100 || !observedAt || Number.isNaN(observedAt.getTime())) {
    return res.status(400).json({ error: "Radar snapshot payload is invalid." });
  }
  if (observedAt.getTime() > Date.now() + 60_000 || Date.now() - observedAt.getTime() > 20 * 60_000) {
    return res.status(400).json({ error: "Radar snapshot is outside the accepted freshness window." });
  }
  const unique = new Map();
  for (const item of snapshots) {
    const ticker = typeof item?.ticker === "string" ? item.ticker.trim().toUpperCase() : "";
    const score = item?.convergenceScore;
    if (!/^[A-Z0-9.-]{1,10}$/.test(ticker) || !Number.isInteger(score) || score < 0 || score > 6) {
      return res.status(400).json({ error: "Ticker or convergence score is invalid." });
    }
    unique.set(ticker, { user_id: req.alertUserId, ticker, convergence_score: score, observed_at: observedAt.toISOString() });
  }
  try {
    const response = await fetch(`${req.supabaseConfig.url}/rest/v1/action_alert_radar_snapshots?on_conflict=user_id,ticker`, {
      method: "POST",
      headers: {
        apikey: req.supabaseConfig.serviceKey,
        authorization: `Bearer ${req.supabaseConfig.serviceKey}`,
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([...unique.values()]),
    });
    if (!response.ok) return res.status(502).json({ error: "Could not sync the radar snapshot." });
    res.status(204).end();
  } catch {
    res.status(502).json({ error: "Could not sync the radar snapshot." });
  }
});

router.get("/", async (req, res) => {
  try {
    const response = await databaseRequest(req, `?select=id,ticker,condition,threshold,state,created_at,triggered_at,last_checked_at,last_observed_value&user_id=eq.${req.alertUserId}&order=created_at.desc`);
    if (!response.ok) return res.status(502).json({ error: "Could not load saved alerts." });
    res.json(await response.json());
  } catch {
    res.status(502).json({ error: "Could not load saved alerts." });
  }
});

router.get("/events", async (req, res) => {
  try {
    const response = await databaseRequest(
      req,
      `?select=id,alert_id,ticker,condition,threshold,observed_value,market_price,provider,quote_at,triggered_at&user_id=eq.${req.alertUserId}&order=triggered_at.desc&limit=50`,
      {},
      "action_alert_events",
    );
    if (!response.ok) return res.status(502).json({ error: "Could not load alert events." });
    res.json(await response.json());
  } catch {
    res.status(502).json({ error: "Could not load alert events." });
  }
});

router.post("/", async (req, res) => {
  const ticker = typeof req.body?.ticker === "string" ? req.body.ticker.trim().toUpperCase() : "";
  const condition = req.body?.condition;
  const threshold = Number(req.body?.threshold);
  if (!/^[A-Z0-9.-]{1,10}$/.test(ticker) || !CONDITION_TYPES.has(condition) || !Number.isFinite(threshold)) {
    return res.status(400).json({ error: "Ticker, condition, or threshold is invalid." });
  }
  if (condition === "convergence_at_least" && !radarAlertsEnabled()) {
    return res.status(503).json({ error: "Radar convergence alerts are disabled until a verified live Radar provider is configured." });
  }
  if (condition === "change_pct_above" && (threshold < 0 || threshold > 100)) {
    return res.status(400).json({ error: "Percentage threshold must be from 0 to 100." });
  }
  if (condition === "convergence_at_least" && (!Number.isInteger(threshold) || threshold < 1 || threshold > 6)) {
    return res.status(400).json({ error: "Convergence threshold must be an integer from 1 to 6." });
  }
  if ((condition === "price_above" || condition === "price_below") && (threshold <= 0 || threshold > 1_000_000_000)) {
    return res.status(400).json({ error: "Price threshold is outside the supported range." });
  }

  try {
    const response = await databaseRequest(req, "?select=id,ticker,condition,threshold,state,created_at,triggered_at,last_checked_at,last_observed_value", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: req.alertUserId, ticker, condition, threshold, state: "pending" }),
    });
    if (!response.ok) return res.status(502).json({ error: "Could not save the alert." });
    const [alert] = await response.json();
    res.status(201).json(alert);
  } catch {
    res.status(502).json({ error: "Could not save the alert." });
  }
});

router.delete("/:id", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: "Alert id is invalid." });
  try {
    const response = await databaseRequest(req, `?id=eq.${req.params.id}&user_id=eq.${req.alertUserId}`, { method: "DELETE" });
    if (!response.ok) return res.status(502).json({ error: "Could not delete the alert." });
    res.status(204).end();
  } catch {
    res.status(502).json({ error: "Could not delete the alert." });
  }
});

export default router;
