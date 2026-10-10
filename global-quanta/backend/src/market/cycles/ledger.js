// Cycle Fingerprint v2 (CF4) — SỔ THEO DÕI THỰC TẾ. Mỗi ngày giao dịch (sau khi dựng thư viện) ghi MỘT bản chụp dự báo 20 phiên
// cho mọi mã trong thư viện vào KV; chấm điểm khi đã đủ 21 phiên sau (vào lệnh đóng cửa t+1, giữ 20 phiên — đúng định nghĩa CF3).
// Không sửa bản chụp đã ghi. Thước đo giống CF3: IC hạng theo ngày, đúng hướng, Brier, độ phủ khoảng 80%, nhóm 20% cao − thấp sau phí.
import { spearman } from "./core.js";
import { excessLog } from "./library.js";

export const LEDGER_INDEX_KV = "cycles:ledger:index";
export const ledgerKv = (date) => `cycles:ledger:${date}`;
const MAX_DATES = 400;
const H = 20, COST = 0.003, MIN_PER_DATE = 20;
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/** Dòng bản chụp từ kết quả truy vấn (log-units, để chấm điểm đúng thang của engine). */
export function snapshotRow(symbol, q) {
  const f = q.forecast.horizons.find((x) => x.h === H);
  const log = (p) => (p == null ? null : Math.log1p(p / 100));
  return { t: symbol, p: r4(log(f.excessPct)), u: f.pOutperform, lo: r4(log(q.forecast.interval80.loPct)), hi: r4(log(q.forecast.interval80.hiPct)), n: q.forecast.nEff };
}

/** Ghi bản chụp cho ngày `date` nếu chưa có. Trả { written, rows }. */
export async function recordSnapshot(store, { date, engine, sha256, rows }) {
  const idx = (await store.getKv(LEDGER_INDEX_KV))?.value ?? { dates: [] };
  if (idx.dates.includes(date)) return { written: false, rows: 0 };
  await store.setKv(ledgerKv(date), { date, engine, sha256, recordedAt: new Date().toISOString(), rows });
  const dates = [...idx.dates, date].sort().slice(-MAX_DATES);
  await store.setKv(LEDGER_INDEX_KV, { dates, updatedAt: new Date().toISOString() });
  return { written: true, rows: rows.length };
}

/** Lợi suất vượt VN-Index thực tế 20 phiên (log) của mã sau ngày `date`, theo chuỗi của ngữ cảnh hiện tại; null nếu chưa đủ. */
function realized(ctx, ticker, date) {
  const k = ctx.index.get(ticker); if (k == null) return null;
  const s = ctx.prep.prepared[k];
  let lo = 0, hi = s.dates.length - 1, e = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (s.dates[m] === date) { e = m; break; } if (s.dates[m] < date) lo = m + 1; else hi = m - 1; }
  return e < 0 ? null : excessLog(s, e, H, ctx.cal);
}

/** Chấm điểm toàn sổ trên ngữ cảnh hiện tại. `docs` = các bản chụp đã đọc từ KV. */
export function scoreLedger(ctx, docs, { symbol = null } = {}) {
  const perDate = [];
  let rows = 0, pending = 0, hit = 0, brier = 0, inside = 0, withInt = 0;
  const mine = [];
  for (const d of docs) {
    const scored = [];
    for (const r of d.rows) {
      const y = realized(ctx, r.t, d.date);
      if (symbol && r.t === symbol) mine.push({ date: d.date, excessPct: r.p == null ? null : r4(Math.expm1(r.p) * 100), pOutperform: r.u, realizedPct: y == null ? null : r4(Math.expm1(y) * 100) });
      if (y == null || r.p == null) { pending++; continue; }
      scored.push({ ...r, y });
    }
    if (!scored.length) continue;
    for (const r of scored) {
      rows++;
      if ((r.p > 0) === (r.y > 0)) hit++;
      brier += ((r.u ?? 0.5) - (r.y > 0 ? 1 : 0)) ** 2;
      if (r.lo != null && r.hi != null) { withInt++; if (r.y >= r.lo && r.y <= r.hi) inside++; }
    }
    if (scored.length >= MIN_PER_DATE) {
      const ic = spearman(scored.map((r) => r.p), scored.map((r) => r.y));
      const s = [...scored].sort((a, b) => a.p - b.p), k = Math.max(1, Math.floor(s.length * 0.2));
      const spread = mean(s.slice(-k).map((r) => r.y)) - mean(s.slice(0, k).map((r) => r.y)) - COST;
      perDate.push({ date: d.date, n: scored.length, ic: r4(ic), spread: r4(spread) });
    }
  }
  const ics = perDate.map((x) => x.ic).filter((x) => x != null);
  return {
    snapshots: docs.length, firstDate: docs[0]?.date ?? null, lastDate: docs.at(-1)?.date ?? null,
    maturedDates: perDate.length, scoredRows: rows, pendingRows: pending,
    meanIc: r4(mean(ics)), positiveIcShare: ics.length ? r4(ics.filter((x) => x > 0).length / ics.length) : null,
    hitRate: rows ? r4(hit / rows) : null, brier: rows ? r4(brier / rows) : null,
    coverage80: withInt ? r4(inside / withInt) : null, meanSpreadNet: r4(mean(perDate.map((x) => x.spread))),
    recent: perDate.slice(-12),
    mine: mine.slice(-15),
  };
}
