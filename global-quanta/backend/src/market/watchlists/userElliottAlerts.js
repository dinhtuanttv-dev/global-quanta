// DW10 (23/10/2026) — CẢNH BÁO KHI GIÁ CHẠM MỐC của cách đếm Elliott (tự động hoặc chỉnh tay), người dùng tự bật.
// Bảng local-only (Railway Volume): market_user_elliott_alerts (cảnh báo) · market_user_elliott_alert_events (lần báo).
// Điều kiện:
//   level — giá chạm / vượt một mức (vd. mốc vô hiệu): side "below" = giá ≤ mức, "above" = giá ≥ mức;
//   zone  — giá vào vùng [low, high] (vd. vùng đích Fibonacci);
//   line  — giá vượt một ĐƯỜNG (kênh) xác định bằng 2 điểm (ngày, giá) trên khung ngày; giá trị hôm nay = nội suy theo SỐ PHIÊN
//           giao dịch (lịch VN), không theo ngày lịch.
// Bộ kiểm tra chạy mỗi 60 giây TRONG PHIÊN (ATO / LO / ATC), giá từ service.getQuotes (luồng SSI / bộ đệm Gateway).
// Có thời gian chờ giữa hai lần báo, mặc định báo một lần rồi tự tắt. Lời báo trung tính — không phải khuyến nghị mua / bán.
// C11 (28/11/2026): GOM CẢNH BÁO VỀ MỘT NƠI — cùng bảng / endpoint, thêm loại "price" (giá chạm mức), "drawing" (giá cắt hình vẽ:
//   đường ngang = level, hình chữ nhật = zone, đường xu hướng / tia = line, khung ngày hoặc tuần), "indicator" (giá cắt EMA / SMA khung ngày):
//   ma    — giá vượt lên / thủng xuống đường trung bình { ma: "ema" | "sma", period } tính trên giá đóng cửa đã điều chỉnh các phiên TRƯỚC
//           hôm nay + giá hiện tại làm điểm hôm nay (cùng công thức với chart).
import { expectsLiveTicks, isTradingDay, vnDate } from "../calendar.js";

export const ALERTS_TABLE = "market_user_elliott_alerts";
export const ALERT_EVENTS_TABLE = "market_user_elliott_alert_events";
export const MAX_ALERTS = 100; // C11: 50 -> 100 (giá + hình vẽ + chỉ báo + Elliott chung một danh sách)
export const MAX_EVENTS = 200;
const SYMBOL_RE = /^[A-Z][A-Z0-9]{2,9}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(["invalidation", "target", "channel", "custom", "price", "drawing", "indicator"]);
/** C11: loại do người dùng tự đặt (không phải mốc Elliott) — lời báo / ghi chú trung tính chung. */
export const USER_KINDS = new Set(["price", "drawing", "indicator"]);
export const ALERT_DISCLAIMER = "Mốc phân tích Elliott (EXPERIMENTAL) — không phải khuyến nghị mua / bán.";
export const USER_ALERT_DISCLAIMER = "Cảnh báo do bạn đặt — chỉ báo tin khi giá chạm điều kiện, không phải khuyến nghị mua / bán.";

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const str = (v, n) => String(v ?? "").slice(0, n);

function sanitizeCondition(c) {
  if (!c || typeof c !== "object") return null;
  if (c.type === "level") {
    const price = num(c.price);
    return price && (c.side === "above" || c.side === "below") ? { type: "level", price, side: c.side } : null;
  }
  if (c.type === "zone") {
    const a = num(c.low), b = num(c.high);
    return a && b ? { type: "zone", low: Math.min(a, b), high: Math.max(a, b) } : null;
  }
  if (c.type === "line") {
    const p = (x) => (x && DATE_RE.test(String(x.date ?? "")) && num(x.price) ? { date: String(x.date), price: Number(x.price) } : null);
    const a = p(c.a), b = p(c.b);
    return a && b && a.date < b.date && (c.side === "above" || c.side === "below") ? { type: "line", a, b, side: c.side } : null;
  }
  if (c.type === "ma") {
    const period = Number(c.period);
    return (c.ma === "ema" || c.ma === "sma") && Number.isInteger(period) && period >= 2 && period <= 400 && (c.side === "above" || c.side === "below")
      ? { type: "ma", ma: c.ma, period, side: c.side } : null;
  }
  return null;
}

/** Chuẩn hoá danh sách cảnh báo của một tài khoản. `allowTelegram` = tài khoản quản trị (bot gửi về chat của chủ hệ thống). */
export function sanitizeAlerts(raw, { allowTelegram = false, now = new Date() } = {}) {
  if (!Array.isArray(raw)) throw badRequest("alerts phải là mảng.");
  const out = [];
  const ids = new Set();
  for (const a of raw.slice(0, MAX_ALERTS)) {
    if (!a || typeof a !== "object") continue;
    const id = str(a.id, 60).replace(/[^A-Za-z0-9_-]/g, "");
    const symbol = str(a.symbol, 10).toUpperCase();
    const condition = sanitizeCondition(a.condition);
    if (!id || ids.has(id) || !SYMBOL_RE.test(symbol) || !condition) continue;
    // Đường (kênh / hình vẽ) nội suy theo số phiên: khung ngày hoặc tuần (ngày dạng YYYY-MM-DD); EMA / SMA chỉ khung ngày.
    if (condition.type === "line" && a.timeframe && a.timeframe !== "D" && a.timeframe !== "W") continue;
    if (condition.type === "ma" && a.timeframe && a.timeframe !== "D") continue;
    ids.add(id);
    out.push({
      id, symbol, timeframe: ["D", "W", "1H", "15m"].includes(a.timeframe) ? a.timeframe : "D",
      kind: KINDS.has(a.kind) ? a.kind : "custom", label: str(a.label, 120), condition,
      source: a.source === "mine" ? "mine" : "auto",
      channels: { telegram: allowTelegram && a.channels?.telegram === true },
      enabled: a.enabled !== false, oneShot: a.oneShot !== false,
      cooldownMin: Math.min(24 * 60, Math.max(30, Number(a.cooldownMin) || 240)),
      createdAt: typeof a.createdAt === "string" ? a.createdAt.slice(0, 30) : now.toISOString(),
      lastFiredAt: typeof a.lastFiredAt === "string" ? a.lastFiredAt.slice(0, 30) : null,
      firedCount: Number.isInteger(a.firedCount) && a.firedCount >= 0 ? a.firedCount : 0,
    });
  }
  return out;
}

/** Số phiên giao dịch từ ngày a tới ngày b (a < b: dương). */
export function sessionsBetween(a, b) {
  if (a === b) return 0;
  const sign = a < b ? 1 : -1;
  const [from, to] = a < b ? [a, b] : [b, a];
  let n = 0;
  const d = new Date(`${from}T03:00:00Z`);
  while (true) {
    d.setUTCDate(d.getUTCDate() + 1);
    const s = d.toISOString().slice(0, 10);
    if (s > to) break;
    if (isTradingDay(d)) n++;
    if (n > 5000) break;
  }
  return sign * n;
}

/** Giá trị đường kênh tại ngày `date` (nội suy / ngoại suy theo số phiên). */
export function lineValueAt(cond, date) {
  const span = sessionsBetween(cond.a.date, cond.b.date);
  if (!span) return cond.b.price;
  const slope = (cond.b.price - cond.a.price) / span;
  return cond.a.price + slope * sessionsBetween(cond.a.date, date);
}

/**
 * C11: giá trị đường trung bình HÔM NAY khi giá hiện tại = `price`, từ giá đóng cửa các phiên trước (cũ -> mới).
 * SMA = (tổng period − 1 phiên trước + giá) / period; EMA khởi tạo bằng SMA period phiên đầu (giống chart), rồi cập nhật bằng giá.
 */
export function maValueToday(cond, prevCloses, price) {
  const n = cond.period, c = prevCloses.filter((x) => Number.isFinite(x) && x > 0);
  if (cond.ma === "sma") {
    if (c.length < n - 1) return null;
    const tail = c.slice(c.length - (n - 1));
    return (tail.reduce((a, b) => a + b, 0) + price) / n;
  }
  if (c.length < n) return null;
  const k = 2 / (n + 1);
  let e = c.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < c.length; i++) e = c[i] * k + e * (1 - k);
  return price * k + e * (1 - k);
}

/** Điều kiện có thoả với giá hiện tại không (+ mô tả trung tính). `maValue` = giá trị EMA / SMA hôm nay (điều kiện "ma"). */
export function conditionMet(cond, price, today, { maValue = null } = {}) {
  if (!Number.isFinite(price)) return { met: false };
  const f = (v) => Math.round(v).toLocaleString("vi-VN");
  if (cond.type === "ma") {
    if (!Number.isFinite(maValue)) return { met: false };
    const name = `${cond.ma === "ema" ? "EMA" : "SMA"} ${cond.period}`;
    return { met: cond.side === "above" ? price > maValue : price < maValue, text: `${cond.side === "above" ? "vượt lên trên" : "thủng xuống dưới"} ${name} (≈ ${f(maValue)})` };
  }
  if (cond.type === "level") {
    const met = cond.side === "below" ? price <= cond.price : price >= cond.price;
    return { met, text: `${cond.side === "below" ? "chạm/thủng" : "chạm/vượt"} mức ${f(cond.price)}` };
  }
  if (cond.type === "zone") return { met: price >= cond.low && price <= cond.high, text: `vào vùng ${f(cond.low)}–${f(cond.high)}` };
  const v = lineValueAt(cond, today);
  return { met: cond.side === "above" ? price > v : price < v, text: `${cond.side === "above" ? "vượt lên trên" : "thủng xuống dưới"} đường (≈ ${f(v)} hôm nay)` };
}

export async function listUserAlerts(store, userId) {
  const rows = await store.selectRows(ALERTS_TABLE, { eq: { user_id: userId } });
  const alerts = rows.map((r) => r.doc).filter(Boolean).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const ev = (await store.selectRows(ALERT_EVENTS_TABLE, { eq: { user_id: userId } })).map((r) => r.doc).filter(Boolean)
    .sort((a, b) => (a.firedAt < b.firedAt ? 1 : -1)).slice(0, 50);
  return { alerts, events: ev, unread: ev.filter((e) => !e.read).length, disclaimer: ALERT_DISCLAIMER, userDisclaimer: USER_ALERT_DISCLAIMER, maxAlerts: MAX_ALERTS };
}

export async function saveUserAlerts(store, userId, body, { allowTelegram = false, now = new Date() } = {}) {
  const alerts = sanitizeAlerts(body?.alerts, { allowTelegram, now });
  const existing = await store.selectRows(ALERTS_TABLE, { eq: { user_id: userId } });
  const keep = new Set(alerts.map((a) => a.id));
  for (const r of existing) if (!keep.has(r.id)) await store.deleteRows(ALERTS_TABLE, { eq: { user_id: userId, id: r.id } });
  if (alerts.length) await store.upsertRows(ALERTS_TABLE, alerts.map((a) => ({ user_id: userId, id: a.id, doc: a, updated_at: now.toISOString() })), "user_id,id");
  return listUserAlerts(store, userId);
}

export async function markEventsRead(store, userId, ids = null) {
  const rows = await store.selectRows(ALERT_EVENTS_TABLE, { eq: { user_id: userId } });
  const pick = rows.filter((r) => r.doc && !r.doc.read && (!ids || ids.includes(r.id)));
  if (pick.length) await store.upsertRows(ALERT_EVENTS_TABLE, pick.map((r) => ({ ...r, doc: { ...r.doc, read: true } })), "user_id,id");
  return listUserAlerts(store, userId);
}

/**
 * Bộ kiểm tra: mỗi lượt đọc mọi cảnh báo đang bật, lấy giá (≤ 200 mã / lượt), ghi lần báo + Telegram (nếu bật), cập nhật
 * lastFiredAt / tự tắt (oneShot). Chỉ chạy trong phiên. `send(text)` = gửi Telegram (mặc định notifyOps).
 */
export function createElliottAlertEvaluator({ store, service, send, now = () => new Date(), log = console }) {
  let timer = null;
  let running = false;
  // C11: giá đóng cửa điều chỉnh các phiên TRƯỚC hôm nay (≤ 450 phiên) — bộ đệm theo mã + ngày, lỗi nguồn -> bỏ qua cảnh báo lượt này.
  const closeCache = new Map();
  async function prevCloses(symbol, today) {
    const key = `${symbol}:${today}`;
    if (closeCache.has(key)) return closeCache.get(key);
    let closes = null;
    try {
      const r = await service.getOhlcv({ symbol, resolution: "1D", limit: 450, adjusted: "true" });
      closes = (r?.bars ?? []).filter((b) => b.date < today).map((b) => Number(b.close));
    } catch (e) { log.warn?.(`[alerts] ${symbol}: ${e.message}`); }
    if (closeCache.size > 300) closeCache.clear();
    closeCache.set(key, closes);
    return closes;
  }
  async function tick({ force = false } = {}) {
    const t = now();
    if (running || (!force && !expectsLiveTicks(t))) return { skipped: true };
    running = true;
    try {
      const rows = (await store.selectRows(ALERTS_TABLE, {})).filter((r) => r.doc?.enabled);
      if (!rows.length) return { checked: 0, fired: 0 };
      const symbols = [...new Set(rows.map((r) => r.doc.symbol))].slice(0, 200);
      const { quotes } = await service.getQuotes(symbols);
      const today = vnDate(t);
      let fired = 0;
      for (const r of rows) {
        const a = r.doc, q = quotes[a.symbol];
        const price = Number(q?.price ?? q?.close);
        if (!Number.isFinite(price) || price <= 0) continue;
        if (a.lastFiredAt && t.getTime() - Date.parse(a.lastFiredAt) < a.cooldownMin * 60_000) continue;
        let maValue = null;
        if (a.condition.type === "ma") {
          const closes = await prevCloses(a.symbol, today);
          maValue = closes ? maValueToday(a.condition, closes, price) : null;
        }
        const m = conditionMet(a.condition, price, today, { maValue });
        if (!m.met) continue;
        fired++;
        const firedAt = t.toISOString();
        const userKind = USER_KINDS.has(a.kind);
        const message = `${userKind ? "Cảnh báo" : "Elliott"} ${a.symbol}: giá ${Math.round(price).toLocaleString("vi-VN")} ${m.text}${a.label ? ` — ${a.label}` : ""}.`;
        const evId = `${a.id}-${t.getTime().toString(36)}`;
        await store.upsertRows(ALERT_EVENTS_TABLE, [{ user_id: r.user_id, id: evId, doc: { id: evId, alertId: a.id, symbol: a.symbol, kind: a.kind, price, message, firedAt, read: false } }], "user_id,id");
        const next = { ...a, lastFiredAt: firedAt, firedCount: a.firedCount + 1, enabled: a.oneShot ? false : a.enabled };
        await store.upsertRows(ALERTS_TABLE, [{ ...r, doc: next, updated_at: firedAt }], "user_id,id");
        if (a.channels?.telegram && send) await Promise.resolve(send(`${message} ${userKind ? USER_ALERT_DISCLAIMER : ALERT_DISCLAIMER}`, a.id)).catch(() => {});
        // giữ tối đa MAX_EVENTS lần báo / tài khoản
        const evs = await store.selectRows(ALERT_EVENTS_TABLE, { eq: { user_id: r.user_id } });
        if (evs.length > MAX_EVENTS) for (const x of evs.sort((p, q2) => (p.doc.firedAt < q2.doc.firedAt ? -1 : 1)).slice(0, evs.length - MAX_EVENTS)) await store.deleteRows(ALERT_EVENTS_TABLE, { eq: { user_id: r.user_id, id: x.id } });
      }
      return { checked: rows.length, fired };
    } catch (e) {
      log.warn?.(`[elliott-alerts] ${e.message}`);
      return { error: e.message };
    } finally {
      running = false;
    }
  }
  return {
    tick,
    start(intervalMs = 60_000) { if (!timer) { timer = setInterval(() => void tick(), intervalMs); timer.unref?.(); } },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}
