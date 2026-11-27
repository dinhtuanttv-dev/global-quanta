// MV-L1 (27/11/2026) — "Hiện tại" cho thẻ Nhịp vĩ mô: điểm NGÀY mới nhất của các biến có giá ngày, CÙNG nguồn / cùng cơ sở với chuỗi
// tháng đã đóng (không trộn giá giao ngay với giá hợp đồng tương lai):
//   OIL  <- FRED DCOILBRENTEU (Brent giao ngay, ngày; FRED công bố trễ vài ngày)   DXY <- Yahoo DX-Y.NYB (ngày)
//   EX   <- Yahoo VND=X (ngày)                                                       VNINDEX <- lịch sử ngày của Gateway (HOSE)
// Chỉ để HIỂN THỊ. Mô hình vĩ mô vẫn chỉ dùng tháng đã đóng (không đổi số liệu đầu vào, không đổi kết quả).
import { getText, parseFredCsv } from "./macroGlobalFeeds.js";

export const LIVE_FEEDS = Object.freeze({
  OIL: { kind: "fred", id: "DCOILBRENTEU", source: "FRED:DCOILBRENTEU · giao ngay, ngày" },
  DXY: { kind: "yahoo", id: "DX-Y.NYB", source: "Yahoo:DX-Y.NYB · ngày" },
  EX: { kind: "yahoo", id: "VND=X", source: "Yahoo:VND=X · ngày" },
});

/** Nến ngày Yahoo -> [{ date, value }] (bỏ ô null). Ngày theo múi giờ sàn (gmtoffset) để không lệch một ngày. */
export function parseYahooDaily(json) {
  const r = json?.chart?.result?.[0];
  const ts = r?.timestamp ?? [], close = r?.indicators?.quote?.[0]?.close ?? [];
  const off = Number(r?.meta?.gmtoffset) || 0;
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const v = close[i];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out.push({ date: new Date((ts[i] + off) * 1000).toISOString().slice(0, 10), value: v });
  }
  return out;
}

/** Điểm ngày mới nhất của từng biến. Lỗi một nguồn -> { error } cho biến đó, không chặn biến khác. */
export async function fetchLivePoints({ fetchImpl = globalThis.fetch, history = null, todayIso, feeds = LIVE_FEEDS } = {}) {
  const out = {};
  const since = new Date(Date.parse(`${todayIso}T00:00:00Z`) - 45 * 86_400_000).toISOString().slice(0, 10);
  await Promise.all(Object.entries(feeds).map(async ([id, f]) => {
    try {
      const pts = f.kind === "fred"
        ? parseFredCsv(await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(f.id)}&cosd=${since}`, fetchImpl))
        : parseYahooDaily(JSON.parse(await getText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(f.id)}?range=2mo&interval=1d`, fetchImpl)));
      const last = pts.filter((p) => p.date <= todayIso).at(-1);
      out[id] = last ? { date: last.date, value: last.value, source: f.source } : { error: "nguồn trả rỗng", source: f.source };
    } catch (e) {
      out[id] = { error: String(e?.message ?? e).slice(0, 160), source: f.source };
    }
  }));
  if (history?.get) {
    try {
      const bars = (await history.get("VNINDEX", { years: 1 }))?.bars ?? [];
      const last = bars.filter((b) => Number.isFinite(b?.close) && b.close > 0 && String(b.date) <= todayIso).at(-1);
      out.VNINDEX = last ? { date: String(last.date).slice(0, 10), value: last.close, source: "Gateway HOSE · đóng cửa ngày" } : { error: "chưa có nến ngày", source: "Gateway HOSE" };
    } catch (e) {
      out.VNINDEX = { error: String(e?.message ?? e).slice(0, 160), source: "Gateway HOSE" };
    }
  }
  return out;
}

/** Ghép điểm ngày với giá trị tháng đã đóng gần nhất: chỉ hiện khi điểm ngày MỚI HƠN tháng đó (sau ngày cuối tháng). */
export function withVsClose(live, closed) {
  if (!live || live.error || !closed) return null;
  const [y, m] = closed.period.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  if (live.date <= monthEnd) return null;
  return { ...live, vsClosePct: closed.value > 0 ? (live.value / closed.value - 1) * 100 : null, closedPeriod: closed.period };
}
