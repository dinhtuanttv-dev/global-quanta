// B3 (25/10/2026) — "Timeline điểm mua tối ưu" tính NGAY TRÊN GATEWAY: bản chuyển 1:1 của hàm thuần buildBuyTimeline
// (Project A lib/cotuc/timing-v3/buy-timeline.ts + addTradingDays + DEFAULT_GATING). Dùng khi Project A / Vercel không trả được
// Timeline: Gateway đọc cùng dữ liệu đầu vào từ kho Cổ tức (cotucStore) và tính ra CÙNG kết quả — có test đối chiếu khớp từng
// dòng với bản TypeScript (test/fixtures/buy-timeline-parity.json). Không thêm / bớt quy tắc nào: sửa ở đây phải sửa cả hai nơi.

export const DEFAULT_GATING = Object.freeze({ minEvents: 8, maxFdrQValue: 0.1, minOosMeanNetIfAvailable: 0 });

const DAY = 86_400_000;
export function toDayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== Number(m[1]) || dt.getUTCMonth() !== Number(m[2]) - 1 || dt.getUTCDate() !== Number(m[3])) return null;
  return Math.floor(t / DAY);
}
export const dayNumberToIso = (n) => new Date(n * DAY).toISOString().slice(0, 10);

export function addTradingDays(iso, n, cal) {
  let d = toDayNumber(iso);
  if (d === null) throw new Error(`addTradingDays: ngày không hợp lệ ${iso}`);
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  let guard = 0;
  while (left > 0) {
    d += step;
    if (cal.isTradingDay(d)) left--;
    if (++guard > 5000) throw new Error("addTradingDays: vượt giới hạn lặp");
  }
  return dayNumberToIso(d);
}

export function missingConditions(w) {
  const out = [];
  if (w.nEvents < DEFAULT_GATING.minEvents) out.push(`cần ≥ ${DEFAULT_GATING.minEvents} đợt (đang ${w.nEvents})`);
  if (w.fdrQValue > DEFAULT_GATING.maxFdrQValue) out.push(`q-value ${w.fdrQValue.toFixed(2)} > ${DEFAULT_GATING.maxFdrQValue}`);
  if (w.netExpectancyLcb <= 0) out.push("cận dưới lợi nhuận ròng ≤ 0");
  if (w.oosMeanNet !== null && w.oosMeanNet !== undefined && w.oosMeanNet < DEFAULT_GATING.minOosMeanNetIfAvailable) out.push("ngoài mẫu âm");
  return out;
}

export function bestNearWindow(windows) {
  return windows
    .filter((w) => !w.selected && (w.fdrQValue <= 0.2 || w.netExpectancyLcb > 0) && w.winRate >= 0.5 && w.netExpectancy > 0 && w.nEvents >= 4)
    .sort((a, b) => missingConditions(a).length - missingConditions(b).length || a.fdrQValue - b.fdrQValue || b.netExpectancyLcb - a.netExpectancyLcb)[0] ?? null;
}

function firstTradingOnOrAfter(iso, cal) {
  let d = toDayNumber(iso);
  while (!cal.isTradingDay(d)) d++;
  return dayNumberToIso(d);
}

function sessionsBetween(from, to, cal) {
  const a = toDayNumber(from);
  const b = toDayNumber(to);
  if (a === b) return 0;
  const step = b > a ? 1 : -1;
  let n = 0;
  for (let d = a; d !== b; d += step) if (cal.isTradingDay(d + step)) n += step;
  return n;
}

/** { today, cal: { isTradingDay(dayNumber) }, decisions, seasonality, sectors: Map, horizonDays? } -> TimelineRow[] */
export function buildBuyTimeline(input) {
  const { today, cal, sectors } = input;
  const horizon = dayNumberToIso(toDayNumber(today) + (input.horizonDays ?? 180));
  const rows = [];

  const push = (base, anchor) => {
    const entryFromDate = addTradingDays(anchor, base.entryFrom, cal);
    const entryToDate = addTradingDays(anchor, base.entryTo, cal);
    const exitDate = addTradingDays(anchor, base.exitOffset, cal);
    if (exitDate < today || entryFromDate > horizon) return;
    const status = today < entryFromDate ? "UPCOMING" : today <= entryToDate ? "IN_WINDOW" : "PASSED";
    rows.push({ ...base, status, entryFromDate, entryToDate, exitDate, sessionsToEntry: sessionsBetween(today, entryFromDate, cal) });
  };

  for (const d of input.decisions) {
    if (!d.exDate) continue;
    const anchor = d.exDate.value;
    const selected = d.windows.find((w) => w.selected) ?? null;
    const near = selected ? null : bestNearWindow(d.windows);
    const w = selected ?? near;
    if (!w) continue;
    push({
      id: `${d.ticker}:DIV:${w.id}:${anchor}`, ticker: d.ticker, sector: sectors.get(d.ticker) ?? null, kind: "DIVIDEND",
      tier: selected ? "VALIDATED" : "NEAR", eventLabel: "GDKHQ", eventDate: anchor, eventDateBasis: d.exDate.status,
      windowId: w.id, windowLabel: w.label, entryFrom: w.entryFrom, entryTo: w.entryTo, exitOffset: w.exitOffset,
      nEvents: w.nEvents, winRate: w.winRate, probability: selected ? d.dividendProbability : null,
      netExpectancy: w.netExpectancy, netExpectancyLcb: w.netExpectancyLcb, fdrQValue: w.fdrQValue,
      decisionLevel: d.decisionLevel, missing: selected ? [] : missingConditions(w),
    }, anchor);
  }

  for (const s of input.seasonality) {
    const e = s.earnings;
    if (!e) continue;
    const q = /^Q([1-4])\//.exec(e.quarterLabel)?.[1];
    const st = q ? s.stats?.[q] ?? null : null;
    if (!st) continue;
    const day0 = firstTradingOnOrAfter(e.expectedAnnounce.date, cal);
    const selected = st.selectedWindowId ? st.windows.find((w) => w.id === st.selectedWindowId && w.selected) ?? null : null;
    const w = selected ?? bestNearWindow(st.windows);
    if (!w) continue;
    push({
      id: `${s.ticker}:EARN:${e.quarterLabel}:${w.id}`, ticker: s.ticker, sector: sectors.get(s.ticker) ?? null, kind: "EARNINGS",
      tier: selected ? "VALIDATED" : "NEAR", eventLabel: `Công bố KQKD ${e.quarterLabel}`, eventDate: day0, eventDateBasis: e.expectedAnnounce.method,
      windowId: w.id, windowLabel: w.label, entryFrom: w.entryFrom, entryTo: w.entryTo, exitOffset: w.exitOffset,
      nEvents: w.nEvents, winRate: w.winRate, probability: st.reactionProbability?.mean ?? null,
      netExpectancy: w.netExpectancy, netExpectancyLcb: w.netExpectancyLcb, fdrQValue: w.fdrQValue,
      decisionLevel: null, missing: selected ? [] : missingConditions(w),
    }, day0);
  }

  const order = { IN_WINDOW: 0, UPCOMING: 1, PASSED: 2 };
  return rows.sort((a, b) =>
    order[a.status] - order[b.status]
    || a.entryFromDate.localeCompare(b.entryFromDate)
    || (a.tier === b.tier ? 0 : a.tier === "VALIDATED" ? -1 : 1)
    || b.netExpectancyLcb - a.netExpectancyLcb);
}

/** Dòng kho -> đầu vào Timeline (giống hệt buildBody của route Project A). */
export function timelineInputs(decisionRows, seasonRows) {
  const decisions = decisionRows.map((r) => {
    const s = r.snapshot ?? {};
    const windows = (s.backtest ?? []).filter((w) => typeof w.entryFrom === "number" && typeof w.netExpectancy === "number");
    return {
      ticker: r.ticker, exDate: s.exDate ?? null, decisionLevel: s.decision?.level ?? "AVOID",
      dividendProbability: s.signals?.find((x) => x.name === "Cổ tức" && x.used)?.probability ?? null, windows,
    };
  });
  const seasonality = seasonRows.map((r) => ({ ticker: r.ticker, earnings: r.earningsSignal ?? null, stats: r.stats ?? null }));
  return { decisions, seasonality };
}

/** Thân phản hồi cùng hợp đồng /api/cotuc/buy-timeline. */
export function timelineBody({ today, cal, decisionRows, seasonRows, sectors, universeSize }) {
  const { decisions, seasonality } = timelineInputs(decisionRows, seasonRows);
  const rows = buildBuyTimeline({ today, cal, decisions, seasonality, sectors });
  const latest = (dates) => dates.filter(Boolean).reduce((m, d) => (!m || Date.parse(d) > Date.parse(m) ? d : m), null);
  const iso = (d) => (d ? new Date(d).toISOString() : null);
  return {
    today,
    asOf: { decisions: iso(latest(decisionRows.map((r) => r.computedAt))), seasonality: iso(latest(seasonRows.map((r) => r.finalizedAt))) },
    coverage: { decisions: decisionRows.length, seasonality: seasonRows.length, universe: universeSize },
    counts: {
      validated: rows.filter((r) => r.tier === "VALIDATED").length, near: rows.filter((r) => r.tier === "NEAR").length,
      inWindow: rows.filter((r) => r.status === "IN_WINDOW").length, upcoming: rows.filter((r) => r.status === "UPCOMING").length,
    },
    rows,
  };
}
