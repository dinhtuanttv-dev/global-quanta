// TOPBAR T1 (docs/TOPBAR_UPGRADE_SPEC.md, duyệt 23/10/2026) — MỘT snapshot cho thanh ngang, mỗi khối có DataMeta riêng
// { source, status, asOf, receivedAt, ageMs, staleAfterMs, reason } (spec §5.1). Thiếu = null, không bao giờ 0 giả.
//   index     VN-Index: snapshot SSI (giá, tham chiếu, thay đổi, KL, GIÁ TRỊ THẬT) + 30 phiên đóng cửa cho sparkline
//   breadth   cùng snapshot SSI: tăng / giảm / đứng / trần / sàn, phạm vi VNINDEX (HOSE)
//   session   lịch Gateway (ngày nghỉ tự quan sát, ATO / LO / nghỉ trưa / ATC / PT) + HK / US theo múi giờ IANA
//   macro     DXY / US10Y / vàng — Yahoo qua Gateway (không còn phụ thuộc Project A / Neon)
//   liquidity lũy kế tới 10:30 so với các phiên trước (cùng khung giờ, ≥ 10 phiên, độ lệch chuẩn MẪU); đo bằng GIÁ TRỊ khi đã
//             ghi đủ 10 phiên (job 10:31), trước đó bằng KHỐI LƯỢNG khớp từ nến phút SSI — ghi rõ thước đo đang dùng
//   regime    Risk-On (DXY/VIX/US10Y) — kiểm định đặt trước KHÔNG ĐẠT -> nhãn "MÔ TẢ", không phải tín hiệu
// Ngưỡng tươi (duyệt): trong phiên ≤ 60 giây LIVE, ≤ 5 phút DELAYED (CHẬM), quá -> STALE (CŨ); ngoài phiên -> CLOSED.
import { currentSession, isTradingDay, lastCompletedSessionDate, vnDate, vnParts } from "../calendar.js";
import { parseQuote } from "../world/worldPulse.js";
import { riskOnIndex } from "../riskOnValidation/riskOnValidate.js";

/** Kết quả kiểm định đặt trước Risk-On (riskOnValidation/RON-prereg.md): KHÔNG ĐẠT -> chỉ mô tả. */
export const REGIME_EVIDENCE = { verdict: "FAIL", note: "Risk-On Index (DXY 40% + VIX 30% + US10Y 30%): kiểm định đặt trước 10 năm KHÔNG ĐẠT (IC +0,05, KTC95 [−0,10; +0,22]) — chỉ mô tả, không phải tín hiệu." };

export const TOPBAR_VERSION = "topbar/T1 1.0.0";
export const FRESH = { liveMs: 60_000, delayedMs: 5 * 60_000 };
export const LIQ = { cutoff: "10:30", minHistory: 10, lookback: 20 };
export const LIQ_VALUE_KV = "topbar:liq1030:value";
const LIQ_VOL_KV = "topbar:liq1030:volume";
const UA = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)" };
export const MACRO = [
  { id: "DXY", label: "DXY", symbol: "DX-Y.NYB", unit: "điểm", digits: 2 },
  { id: "US10Y", label: "US 10Y", symbol: "^TNX", unit: "%", digits: 2 },
  { id: "GOLD", label: "GOLD", symbol: "GC=F", unit: "USD/oz", digits: 0 },
];

const meta = (o) => ({ source: null, status: "empty", asOf: null, receivedAt: null, ageMs: null, staleAfterMs: null, reason: null, ...o });

/** Trạng thái dữ liệu trong phiên theo tuổi (spec §7.4); ngoài phiên -> closed; asOf thiếu / ở tương lai > 2 phút -> không live. */
export function liveStatus({ asOf, nowMs, inSession }) {
  if (!asOf) return { status: "empty", ageMs: null, reason: "Chưa có thời điểm dữ liệu." };
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return { status: "error", ageMs: null, reason: "Thời điểm dữ liệu không hợp lệ." };
  const age = nowMs - t;
  if (age < -120_000) return { status: "stale", ageMs: 0, reason: "Thời điểm dữ liệu ở tương lai (lệch đồng hồ)." };
  const ageMs = Math.max(0, age);
  if (!inSession) return { status: "closed", ageMs, reason: "Ngoài giờ khớp lệnh — số liệu cuối phiên." };
  if (ageMs <= FRESH.liveMs) return { status: "live", ageMs, reason: null };
  if (ageMs <= FRESH.delayedMs) return { status: "delayed", ageMs, reason: `Chậm ${Math.round(ageMs / 1000)} giây.` };
  return { status: "stale", ageMs, reason: `Không có cập nhật ${Math.round(ageMs / 60_000)} phút.` };
}

// ------------------------------------------------------------------ phiên giao dịch
const VN_PHASES = [
  { at: 8 * 60 + 30, phase: "pre_open", label: "Trước phiên" },
  { at: 9 * 60, phase: "auction", label: "ATO" },
  { at: 9 * 60 + 15, phase: "open", label: "Khớp liên tục" },
  { at: 11 * 60 + 30, phase: "break", label: "Nghỉ trưa" },
  { at: 13 * 60, phase: "open", label: "Khớp liên tục" },
  { at: 14 * 60 + 30, phase: "auction", label: "ATC" },
  { at: 14 * 60 + 45, phase: "closing", label: "Thoả thuận" },
  { at: 15 * 60, phase: "closed", label: "Đóng cửa" },
];
const SESSION_TO_PHASE = { PRE_OPEN: "pre_open", ATO: "auction", LO: "open", BREAK: "break", ATC: "auction", PT: "closing", CLOSED: "closed" };

/** Giờ / phút / thứ ở một múi giờ IANA (Intl -> tự xử lý giờ mùa hè). */
export function zoned(now, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(now).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), minutes: hour * 60 + Number(p.minute), date: `${p.year}-${p.month}-${p.day}` };
}

/** Lần chuyển pha kế tiếp của VN (cùng ngày) -> ISO; null khi đã đóng cửa / ngày nghỉ (UI không đếm ngược). */
function vnNextTransition(now) {
  if (!isTradingDay(now)) return null;
  const { minutes } = vnParts(now);
  const next = VN_PHASES.find((p) => p.at > minutes);
  if (!next) return null;
  return new Date(now.getTime() + (next.at - minutes) * 60_000 - (now.getUTCSeconds() * 1000 + now.getUTCMilliseconds())).toISOString();
}

/** Phiên theo giờ địa phương + lịch tuần (không có lịch nghỉ lễ HK / US -> ghi rõ). */
function foreignSession(now, { exchange, timeZone, segments }) {
  const z = zoned(now, timeZone);
  const weekday = z.weekday >= 1 && z.weekday <= 5;
  const seg = weekday ? segments.find((s) => z.minutes >= s[0] && z.minutes < s[1]) : null;
  const inBreak = weekday && !seg && z.minutes >= segments[0][0] && z.minutes < segments.at(-1)[1];
  const next = weekday ? [...segments.flat()].filter((m) => m > z.minutes).sort((a, b) => a - b)[0] : undefined;
  return {
    exchange, timezone: timeZone, phase: seg ? "open" : inBreak ? "break" : "closed", label: seg ? "Mở cửa" : inBreak ? "Nghỉ trưa" : "Đóng cửa",
    nextTransitionAt: next !== undefined ? new Date(now.getTime() + (next - z.minutes) * 60_000 - now.getUTCSeconds() * 1000).toISOString() : null,
    calendar: "weekday", note: "Chưa có lịch nghỉ lễ — ngày lễ có thể hiện nhầm là mở cửa.",
  };
}

export function sessionsAt(now) {
  const s = currentSession(now);
  const label = VN_PHASES.filter((p) => p.at <= vnParts(now).minutes).at(-1)?.label;
  const vn = {
    exchange: "HOSE", timezone: "Asia/Ho_Chi_Minh", phase: isTradingDay(now) ? SESSION_TO_PHASE[s] ?? "unknown" : "holiday",
    label: !isTradingDay(now) ? ([0, 6].includes(vnParts(now).weekday) ? "Cuối tuần" : "Nghỉ lễ") : s === "CLOSED" ? "Đóng cửa" : label ?? s,
    nextTransitionAt: vnNextTransition(now), calendar: "gateway-observed", note: null,
  };
  return {
    VN: vn,
    HK: foreignSession(now, { exchange: "HKEX", timeZone: "Asia/Hong_Kong", segments: [[9 * 60 + 30, 12 * 60], [13 * 60, 16 * 60]] }),
    US: foreignSession(now, { exchange: "NYSE", timeZone: "America/New_York", segments: [[9 * 60 + 30, 16 * 60]] }),
  };
}

// ------------------------------------------------------------------ thanh khoản 10:30
/** Thống kê so sánh (spec §7.3): mean, độ lệch chuẩn MẪU, % lệch, z; null khi thiếu lịch sử / mean ≤ 0 / std = 0. */
export function liquidityStats(current, history, minHistory = LIQ.minHistory) {
  const xs = history.filter((v) => Number.isFinite(v) && v > 0);
  const n = xs.length;
  if (!(current > 0)) return { n, mean: null, std: null, deviationPct: null, z: null, reason: "Chưa có số liệu phiên hiện tại tới 10:30." };
  if (n < minHistory) return { n, mean: null, std: null, deviationPct: null, z: null, reason: `Mới có ${n}/${minHistory} phiên lịch sử cùng khung giờ.` };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  return {
    n, mean, std: std > 0 ? std : null,
    deviationPct: mean > 0 ? ((current - mean) / mean) * 100 : null,
    z: std > 0 ? (current - mean) / std : null,
    reason: std > 0 ? null : "Độ lệch chuẩn bằng 0 — không tính z.",
  };
}

/** Khối lượng lũy kế tới HH:MM từ nến phút (date "YYYY-MM-DDTHH:mm…" hoặc "YYYY-MM-DD HH:mm"). */
export function cumulativeTo(bars, cutoff = LIQ.cutoff) {
  let v = 0, n = 0;
  for (const b of bars) {
    const t = String(b.date).replace("T", " ").slice(11, 16);
    if (t && t <= cutoff) { v += Number(b.volume) || 0; n++; }
  }
  return n ? v : null;
}

export function createTopbarService({ service, store, fetchImpl = globalThis.fetch, now = Date.now, tradingDatesBack }) {
  let macroCache = null, vixCache = null;

  async function yahooDaily(symbol) {
    const r = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`, { headers: UA, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
    const json = await r.json();
    const q = parseQuote(json);
    const res = json?.chart?.result?.[0];
    const series = (res?.timestamp ?? []).map((t, i) => ({ time: new Date(t * 1000).toISOString().slice(0, 10), value: res.indicators?.quote?.[0]?.close?.[i] })).filter((p) => Number.isFinite(p.value) && p.value > 0);
    return { q, series };
  }

  async function macroBlock() {
    if (macroCache && now() - macroCache.at < 5 * 60_000) return macroCache.value;
    const value = await Promise.all(MACRO.map(async (m) => {
      const receivedAt = new Date(now()).toISOString();
      try {
        const { q, series } = await yahooDaily(m.symbol);
        if (!q) return { data: null, meta: meta({ source: `Yahoo:${m.symbol}`, status: "empty", receivedAt, reason: "Yahoo không trả giá." }) };
        const ageMs = Math.max(0, now() - Date.parse(q.time));
        // Yahoo chậm ~15 phút với HĐ tương lai / chỉ số; phiên cuối đã qua > 1 giờ -> "giá đóng cửa gần nhất".
        const status = ageMs <= 60 * 60_000 ? "delayed" : "closed";
        return {
          data: { symbol: m.id, label: m.label, value: q.value, unit: m.unit, digits: m.digits, change: q.prevClose ? q.value - q.prevClose : null, changePct: q.changePct, series },
          meta: meta({ source: `Yahoo:${m.symbol}`, status, asOf: q.time, receivedAt, ageMs, staleAfterMs: 60 * 60_000, reason: status === "closed" ? `Giá đóng cửa phiên ${q.date}.` : "Yahoo chậm khoảng 15 phút." }),
        };
      } catch (e) {
        return { data: null, meta: meta({ source: `Yahoo:${m.symbol}`, status: "error", receivedAt, reason: e.message }) };
      }
    }));
    macroCache = { at: now(), value };
    return value;
  }

  /** Risk-On (mô tả) từ DXY / US10Y của khối vĩ mô + VIX; thiếu thành phần -> unknown (không mặc định Trung lập). */
  async function regimeBlock(macro, receivedAt) {
    const val = (id) => macro.find((m) => m.data?.symbol === id)?.data?.value ?? null;
    let vix = null, vixAsOf = null;
    // VIX đệm 5 phút như khối vĩ mô (trước đây gọi Yahoo mỗi lần dựng snapshot -> ~1 giây / lượt).
    if (vixCache && now() - vixCache.at < 5 * 60_000) ({ vix, vixAsOf } = vixCache);
    else {
      try { const { q } = await yahooDaily("^VIX"); vix = q?.value ?? null; vixAsOf = q?.time ?? null; } catch { vix = null; }
      vixCache = { at: now(), vix, vixAsOf };
    }
    const x = { dxy: val("DXY"), vix, treasury10y: val("US10Y") };
    const asOfs = [...macro.map((m) => m.meta.asOf), vixAsOf].filter(Boolean).sort();
    if ([x.dxy, x.vix, x.treasury10y].some((v) => v === null)) {
      return { data: { state: "UNKNOWN", score: null, evidence: REGIME_EVIDENCE }, meta: meta({ source: "Yahoo (DXY, VIX, US10Y)", status: "empty", receivedAt, reason: "Thiếu một trong DXY / VIX / US10Y — chưa xác định." }) };
    }
    const ro = riskOnIndex(x);
    return {
      data: { state: ro.status, score: ro.score, inputs: x, label: "MÔ TẢ", evidence: REGIME_EVIDENCE },
      meta: meta({ source: "Yahoo (DXY, VIX, US10Y) — Risk-On heuristic", status: "delayed", asOf: asOfs[0] ?? null, receivedAt, reason: REGIME_EVIDENCE.note }),
    };
  }

  /** Lũy kế tới 10:30 các phiên trước — đệm KV theo ngày (số liệu phiên đã đóng không đổi). */
  async function volumeHistory(today) {
    const dates = tradingDatesBack(lastCompletedSessionDate(new Date(now())), LIQ.lookback + 1).filter((d) => d < today).slice(-LIQ.lookback);
    const kv = (await store.getKv(LIQ_VOL_KV).catch(() => null))?.value ?? {};
    let changed = false;
    for (const d of dates) {
      if (kv[d] !== undefined) continue;
      try {
        const r = await service.getOhlcv({ symbol: "VNINDEX", resolution: "1m", to: d });
        kv[d] = cumulativeTo(r.bars ?? []);
        changed = true;
      } catch { /* thử lại lần sau */ }
    }
    if (changed) {
      const keep = Object.fromEntries(Object.entries(kv).sort().slice(-60));
      await store.setKv(LIQ_VOL_KV, keep).catch(() => {});
    }
    return dates.map((d) => ({ date: d, v: kv[d] ?? null }));
  }

  async function liquidityBlock(nowDate, snap) {
    const today = vnDate(nowDate);
    const trading = isTradingDay(nowDate);
    const { minutes } = vnParts(nowDate);
    const receivedAt = nowDate.toISOString();
    const valueRows = (await store.getKv(LIQ_VALUE_KV).catch(() => null))?.value ?? [];
    const pastValues = valueRows.filter((r) => r.date < today).slice(-LIQ.lookback);
    const useValue = pastValues.length >= LIQ.minHistory;
    // Phiên hiện tại: đã qua 10:30 -> lấy bản ghi 10:30 (giá trị) hoặc nến phút (khối lượng); chưa tới -> chưa có.
    const reached = trading && minutes >= 10 * 60 + 30;
    let current = null, currentDate = null;
    if (useValue) {
      const row = valueRows.find((r) => r.date === today);
      if (reached && row) { current = row.value; currentDate = today; }
      const st = liquidityStats(current, pastValues.map((r) => r.value));
      return {
        data: { measure: "value", unit: "VND", cutoff: LIQ.cutoff, date: currentDate, current, history: pastValues.map((r) => ({ date: r.date, v: r.value })), ...st },
        meta: meta({ source: "SSI VN-Index snapshot ghi lúc 10:31", status: current === null ? (reached ? "empty" : "closed") : "live", asOf: current === null ? null : `${today}T03:31:00.000Z`, receivedAt, reason: current === null ? (reached ? "Chưa ghi được giá trị 10:30 hôm nay." : "Chưa tới 10:30.") : st.reason }),
      };
    }
    const hist = await volumeHistory(today);
    if (reached) {
      try { current = cumulativeTo((await service.getOhlcv({ symbol: "VNINDEX", resolution: "1m", to: today })).bars ?? []); currentDate = today; } catch { current = null; }
    }
    const st = liquidityStats(current, hist.map((h) => h.v));
    return {
      data: { measure: "volume", unit: "cổ phiếu", cutoff: LIQ.cutoff, date: currentDate, current, history: hist, ...st, valueSessionsRecorded: pastValues.length },
      meta: meta({ source: "SSI IntradayOhlc VNINDEX (khối lượng khớp)", status: current === null ? (reached ? "empty" : "closed") : "live", asOf: current === null ? null : `${today}T03:30:00.000Z`, receivedAt,
        reason: [current === null ? (reached ? "Chưa có nến phút hôm nay." : "Chưa tới 10:30 — chưa có số liệu phiên này.") : st.reason,
          `Đo theo KHỐI LƯỢNG (nến phút SSI không có giá trị); chuyển sang GIÁ TRỊ khi đã ghi đủ ${LIQ.minHistory} phiên (hiện ${pastValues.length}).`].filter(Boolean).join(" ") }),
    };
  }

  return {
    /** Snapshot toàn thanh. Mỗi khối lỗi độc lập (spec §10: hỏng một nguồn không làm mất thanh). */
    async snapshot() {
      const nowDate = new Date(now());
      const nowMs = nowDate.getTime();
      const receivedAt = nowDate.toISOString();
      const session = currentSession(nowDate);
      const inSession = ["ATO", "LO", "ATC"].includes(session);
      const out = { version: TOPBAR_VERSION, generatedAt: receivedAt, freshness: FRESH };

      // VN-Index + độ rộng: CÙNG một snapshot SSI (spec §7.5 — đồng bộ trong một thẻ).
      let snap = null;
      try { snap = await service.getIndexSnapshot("VNINDEX"); } catch (e) { out.indexError = e.message; }
      let series = [];
      try {
        const r = await service.getOhlcv({ symbol: "VNINDEX", limit: 30 });
        series = (r.bars ?? []).filter((b) => !b.partial && b.close > 0).map((b) => ({ time: b.date, value: b.close }));
      } catch { series = []; }
      const asOf = snap?.provenance?.asOf ?? snap?.time ?? null;
      const ls = liveStatus({ asOf, nowMs, inSession });
      const src = snap?.provenance?.source ?? null;
      const fallback = snap?.provenance?.fallbackReason ? "fallback" : null;
      if (snap?.value > 0) {
        const reference = snap.change != null ? snap.value - snap.change : null;
        out.index = {
          data: { code: "VNINDEX", value: snap.value, reference, change: snap.change ?? null, changePct: snap.changePct ?? null,
            volumeShares: snap.totalVolume ?? null, valueVnd: snap.totalValue ?? null, unit: "điểm",
            series: series.filter((p) => p.time < String(asOf ?? "").slice(0, 10)).concat([{ time: String(asOf ?? "").slice(0, 10) || vnDate(nowDate), value: snap.value }]).slice(-30),
            partialSession: inSession },
          meta: meta({ source: src, status: fallback ?? ls.status, asOf, receivedAt, ageMs: ls.ageMs, staleAfterMs: FRESH.delayedMs, reason: fallback ? `Nguồn dự phòng: ${snap.provenance.fallbackReason}` : ls.reason }),
        };
        const A = snap.advances, D = snap.declines, U = snap.noChanges;
        const ok = [A, D, U].every(Number.isFinite) && A + D + U > 0;
        out.breadth = {
          data: ok ? { universe: "VNINDEX (HOSE)", advances: A, declines: D, unchanged: U, ceilings: snap.ceilings ?? null, floors: snap.floors ?? null, total: A + D + U,
            advanceShare: A / (A + D + U), declineShare: D / (A + D + U), netBreadth: (A - D) / (A + D + U), adRatio: D > 0 ? A / D : null } : null,
          meta: meta({ source: src, status: ok ? (fallback ?? ls.status) : "empty", asOf, receivedAt, ageMs: ls.ageMs, staleAfterMs: FRESH.delayedMs, reason: ok ? ls.reason : "SSI chưa trả số mã tăng / giảm / đứng." }),
        };
      } else {
        out.index = { data: null, meta: meta({ source: src, status: out.indexError ? "error" : "empty", receivedAt, reason: out.indexError ?? "Chưa có giá VN-Index." }) };
        out.breadth = { data: null, meta: meta({ source: src, status: out.index.meta.status, receivedAt, reason: out.index.meta.reason }) };
      }
      delete out.indexError;

      out.sessions = { data: sessionsAt(nowDate), meta: meta({ source: "Lịch giao dịch Gateway (ngày nghỉ tự quan sát) + múi giờ IANA", status: "live", asOf: receivedAt, receivedAt, ageMs: 0 }) };
      out.macro = await macroBlock();
      out.regime = await regimeBlock(out.macro, receivedAt);
      try { out.liquidity = await liquidityBlock(nowDate, snap); } catch (e) { out.liquidity = { data: null, meta: meta({ status: "error", receivedAt, reason: e.message }) }; }
      return out;
    },

    /** Job 10:31 ngày giao dịch: ghi giá trị khớp VN-Index tới 10:30 (snapshot SSI) để so sánh theo GIÁ TRỊ (≥ 10 phiên). */
    async recordLiquidity1030() {
      const nowDate = new Date(now());
      if (!isTradingDay(nowDate)) return { skipped: "Không phải ngày giao dịch" };
      const snap = await service.getIndexSnapshot("VNINDEX");
      if (!(snap?.totalValue > 0)) throw new Error("Snapshot VN-Index không có tổng giá trị.");
      const today = vnDate(nowDate);
      const rows = ((await store.getKv(LIQ_VALUE_KV).catch(() => null))?.value ?? []).filter((r) => r.date !== today);
      rows.push({ date: today, value: snap.totalValue, volume: snap.totalVolume ?? null, asOf: snap.provenance?.asOf ?? null, recordedAt: nowDate.toISOString() });
      await store.setKv(LIQ_VALUE_KV, rows.sort((a, b) => a.date.localeCompare(b.date)).slice(-120));
      return { date: today, value: snap.totalValue, sessions: rows.length };
    },
  };
}

export const TOPBAR_SCHEDULE = [{ name: "recordLiquidity1030", at: "10:31", tradingDayOnly: true }];
