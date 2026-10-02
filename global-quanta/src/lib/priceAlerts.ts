import { useSyncExternalStore } from "react";

// Cảnh báo giá thật: theo dõi bằng giá realtime (MarketFeed), báo bằng toast + thông báo trình duyệt.
// Lưu trong trình duyệt (localStorage, đồng bộ giữa các tab); mỗi cảnh báo kích hoạt MỘT lần rồi chuyển sang "đã kích hoạt".

export type AlertKind = "above" | "below";
export interface PriceAlert {
  id: string; ticker: string; kind: AlertKind; price: number;
  /** Nhãn gợi nhớ: "Dừng lỗ gợi ý", "Đỉnh 20 phiên", "MA20"… */
  label: string | null;
  createdAt: string;
  triggeredAt: string | null;
  triggeredPrice: number | null;
}

const KEY = "gq.priceAlerts.v1";
const EVENT = "gq:priceAlerts";
export const MAX_ALERTS = 100;
const EMPTY: PriceAlert[] = [];
let memory: PriceAlert[] | null = null;
let cachedRaw: string | null = null;
let cached: PriceAlert[] = EMPTY;

function read(): PriceAlert[] {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(KEY); } catch { /* bỏ qua */ }
  if (raw === null) return memory ?? EMPTY;
  if (raw === cachedRaw) return cached;
  try {
    const parsed = JSON.parse(raw);
    cached = Array.isArray(parsed) ? parsed.filter((a) => a && typeof a.ticker === "string" && Number.isFinite(a.price)) : EMPTY;
    cachedRaw = raw;
    return cached;
  } catch {
    return memory ?? EMPTY;
  }
}

function write(next: PriceAlert[]) {
  memory = next;
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* chỉ giữ trong phiên */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
}

export const alertActions = {
  add(ticker: string, kind: AlertKind, price: number, label: string | null = null): PriceAlert | null {
    if (!(price > 0)) return null;
    const list = read();
    const t = ticker.toUpperCase();
    const p = Math.round(price);
    if (list.some((a) => !a.triggeredAt && a.ticker === t && a.kind === kind && a.price === p)) return null;
    const alert: PriceAlert = { id: `${t}-${kind}-${p}-${Date.now().toString(36)}`, ticker: t, kind, price: p, label, createdAt: new Date().toISOString(), triggeredAt: null, triggeredPrice: null };
    write([...list, alert].slice(-MAX_ALERTS));
    return alert;
  },
  remove(id: string) { write(read().filter((a) => a.id !== id)); },
  clearTriggered(ticker?: string) { write(read().filter((a) => !a.triggeredAt || (ticker !== undefined && a.ticker !== ticker))); },
  markTriggered(hits: { id: string; price: number }[], at = new Date().toISOString()) {
    if (!hits.length) return;
    const byId = new Map(hits.map((h) => [h.id, h.price]));
    write(read().map((a) => (byId.has(a.id) && !a.triggeredAt ? { ...a, triggeredAt: at, triggeredPrice: byId.get(a.id)! } : a)));
  },
};

export function usePriceAlerts(): PriceAlert[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function readAlerts(): PriceAlert[] { return read(); }

/** Cảnh báo đang chờ bị chạm bởi giá hiện tại (hàm thuần). */
export function checkAlerts(alerts: PriceAlert[], prices: Record<string, { price: number } | undefined>): { alert: PriceAlert; price: number }[] {
  const out: { alert: PriceAlert; price: number }[] = [];
  for (const a of alerts) {
    if (a.triggeredAt) continue;
    const price = prices[a.ticker]?.price;
    if (!price || !(price > 0)) continue;
    if ((a.kind === "above" && price >= a.price) || (a.kind === "below" && price <= a.price)) out.push({ alert: a, price });
  }
  return out;
}

export function alertText(a: PriceAlert, price?: number | null): string {
  const lv = a.price.toLocaleString("vi-VN");
  const now = price ? ` (giá ${price.toLocaleString("vi-VN")})` : "";
  return `${a.ticker} ${a.kind === "above" ? "≥" : "≤"} ${lv}${a.label ? ` · ${a.label}` : ""}${now}`;
}

export function resetPriceAlertsForTest() { memory = null; cachedRaw = null; cached = EMPTY; }

// ---------- Thông báo trình duyệt (dùng chung cho cảnh báo giá và sự kiện radar) ----------

export function notifyPermission(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

export async function requestNotifyPermission(): Promise<NotificationPermission | "unsupported"> {
  if (notifyPermission() === "unsupported") return "unsupported";
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

export function browserNotify(title: string, body: string, tag?: string) {
  if (notifyPermission() !== "granted") return;
  try { new Notification(title, { body, tag }); } catch { /* một số trình duyệt di động chỉ cho phép qua Service Worker */ }
}
