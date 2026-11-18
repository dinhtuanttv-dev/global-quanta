// PX0 + PX-L (18/11/2026) — dịch vụ vòng đời đợt pha loãng: pha theo mã cho bảng quyết định, hồ sơ một mã (lịch sử + độ trễ niêm yết),
// và SỔ THEO DÕI TIẾN PX-L: mỗi đợt pha loãng ≥ 10% có GDKHQ từ 19/11/2026 trong vũ trụ bảng E1 được ghi TRƯỚC khi có kết quả, chấm ở
// 10 / 20 / 30 phiên sau phiên ex+1 so với đối chứng cùng ngày (trung bình vũ trụ, giá điều chỉnh) — cùng định nghĩa PX-r1. Chỉ hiển thị.
import { dilutionHistory, dilutionPhase, dilutiveEvents, linkListing, listingLags, marketListingLag, PX_R1, PX_RULES, PX_VERSION, sessionClock } from "./dilution.js";

export const PXL_START = "2026-11-19";
export const PXL_KV = "local:elite:px:ledger";
const H = [10, 20, 30];
const r6 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null);

export function pxLedgerSummary(entries) {
  const out = { registered: entries.length, listed: entries.filter((e) => e.listing && e.listingSeen).length };
  for (const h of H) {
    const xs = entries.map((e) => e.x?.[h]).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    out[h] = xs.length ? { n: xs.length, mean: r6(xs.reduce((a, b) => a + b, 0) / xs.length), median: r6(xs[Math.floor(xs.length / 2)]), pos: r6(xs.filter((x) => x > 0).length / xs.length) } : { n: 0 };
  }
  return out;
}

export function createDilution({ store, corpEvents, panel, adjustedCloses = null, pricesOf = () => null, isTradingDay, log = console }) {
  const clock = sessionClock(isTradingDay);
  const allEvents = () => corpEvents?.doc?.()?.events ?? [];
  let byTMemo = null;
  const byTicker = () => {
    const ev = allEvents(); if (byTMemo?.src === ev) return byTMemo.map;
    const m = new Map(); for (const e of ev) { if (!m.has(e.t)) m.set(e.t, []); m.get(e.t).push(e); }
    byTMemo = { src: ev, map: m }; return m;
  };
  const lagMemo = new Map();
  const mLag = (date) => { if (!lagMemo.has(date)) lagMemo.set(date, marketListingLag(allEvents(), date, clock)); return lagMemo.get(date); };

  /** Pha của các mã tại phiên `date` (chỉ mã có pha khác NONE). */
  function phases(date, tickers) {
    const m = byTicker(), lag = mLag(date).lag, out = {};
    for (const t of tickers) { const ev = m.get(t); if (!ev) continue; const p = dilutionPhase({ asOf: date, events: ev, clock, marketLag: lag }); if (p.phase !== "NONE") out[t] = p; }
    return out;
  }

  async function loadLedger() { return (await store.getKv(PXL_KV))?.value ?? { version: PX_VERSION, start: PXL_START, entries: [], updatedAt: null }; }

  /** Ghi đợt mới + chấm kết quả tới phiên E1 mới nhất. Gọi mỗi khi có bảng E1 mới. */
  async function tick() {
    const p = await panel.panel(); if (!p?.date) return null;
    const date = p.date, uni = new Set(p.rows.map((r) => r.ticker));
    const led = await loadLedger(); const have = new Set(led.entries.map((e) => e.id));
    const m = byTicker();
    for (const t of uni) for (const ev of dilutiveEvents(m.get(t) ?? [], date)) {
      if (ev.ex < PXL_START || have.has(ev.id)) continue;
      // Ghi trước khi có kết quả: chỉ nhận đợt chưa qua phiên vào (ex+1).
      if (clock.between(ev.ex, date) > 1) continue;
      led.entries.push({ id: ev.id, t, ex: ev.ex, cat: ev.cat, ratio: ev.ratio, disclosed: ev.disclosed ?? null, registeredAt: date, entry: clock.shift(ev.ex, 1), listing: null, listingSeen: null, x: {} });
      have.add(ev.id);
    }
    for (const e of led.entries) {
      const l = linkListing(e, m.get(e.t) ?? [], date); if (l && l.date !== e.listing) { e.listing = l.date; e.listingSeen = date; }
    }
    const due = led.entries.filter((e) => H.some((h) => e.x[h] == null && clock.shift(e.entry, h) <= date));
    if (due.length && adjustedCloses) {
      const px = await adjustedCloses([...uni], date);
      const at = (t, d) => { const rows = px?.get(t); if (!rows) return null; const r = rows.find((x) => x[0] === d); return r && r[1] > 0 ? r[1] : null; };
      const ctrl = new Map();
      const control = (d, h) => {
        const k = `${d}:${h}`; if (ctrl.has(k)) return ctrl.get(k);
        const end = clock.shift(d, h); let s = 0, n = 0;
        for (const t of uni) { const a = at(t, d), b = at(t, end); if (a && b) { s += Math.log(b / a); n++; } }
        const v = n >= 50 ? s / n : null; ctrl.set(k, v); return v;
      };
      for (const e of due) for (const h of H) {
        if (e.x[h] != null) continue; const end = clock.shift(e.entry, h); if (end > date) continue;
        const a = at(e.t, e.entry), b = at(e.t, end), c = control(e.entry, h);
        if (a && b && c != null) e.x[h] = r6(Math.log(b / a) - c);
      }
    }
    led.updatedAt = date; led.version = PX_VERSION;
    await store.setKv(PXL_KV, led);
    return { date, entries: led.entries.length, due: due.length };
  }

  async function ledger() { const led = await loadLedger(); return { version: led.version, start: led.start, updatedAt: led.updatedAt, label: "THĂM DÒ — sổ theo dõi tiến, không phải quy tắc", pxR1: PX_R1, summary: pxLedgerSummary(led.entries), entries: led.entries.slice(-60).reverse() }; }

  /** Hồ sơ một mã: pha hiện tại, đợt đang chạy, lịch sử các đợt (kết quả vượt VN-Index), độ trễ niêm yết của mã và thị trường. */
  async function ticker(t, date = null) {
    const p = date ? null : await panel.panel(); const asOf = date ?? p?.date; if (!asOf) return null;
    const ev = byTicker().get(t) ?? [], lagM = mLag(asOf);
    const px = pricesOf(t), vn = pricesOf("VNINDEX"), mkt = new Map((vn ?? []).map((r) => [r[0], r[1]]));
    const lags = listingLags(ev, asOf, clock);
    const led = await loadLedger();
    return {
      version: PX_VERSION, asOf, ticker: t, rules: PX_RULES, pxR1: PX_R1,
      phase: dilutionPhase({ asOf, events: ev, clock, marketLag: lagM.lag }),
      ownLags: lags.slice(-6), marketLag: lagM,
      history: px && vn ? dilutionHistory(ev, asOf, px, mkt, clock).slice(0, 8) : [],
      historyNote: px && vn ? null : "Chưa có chuỗi giá VNDirect của mã — không tính được kết quả các đợt trước.",
      ledger: led.entries.filter((e) => e.t === t),
    };
  }

  return { phases, tick, ledger, ticker, marketLag: mLag, clock };
}
