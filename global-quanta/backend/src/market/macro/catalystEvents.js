// X3 — Bộ chuyển đổi Vĩ mô -> Sự kiện xúc tác (một lịch hợp nhất cho tab Chất xúc tác).
//   1) Lịch công bố số liệu VN (GSO, NHNN, S&P Global PMI) — ƯỚC TÍNH từ độ trễ + ngày công bố điển hình của danh mục
//      MacroCenter (GSO công bố số liệu tháng vào ~ngày 6 tháng sau từ 2025). Không phụ thuộc dữ liệu -> hợp lệ cả khi mô phỏng.
//   2) Họp FOMC — ngày CHÍNH THỨC Fed đã công bố (cập nhật hằng năm).
//   3) Cảnh báo + chuyển chế độ vĩ mô — CHỈ ở chế độ số liệu THẬT (trên dữ liệu mô phỏng chúng vô nghĩa -> không phát).
// Không gán hướng tốt/xấu cho lịch công bố: hướng chỉ biết sau khi có số liệu (không bịa).
import { VN_CATALOG } from "./macroCore.js";

// Ngày quyết định (ngày thứ 2 của cuộc họp), giờ công bố 14:00 ET ~ 18:00/19:00 UTC.
export const FOMC_DECISION_DATES = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"];
const RELEASE_SOURCES = new Set(["GSO", "NHNN", "S&P Global"]);
const SOURCE_VI = { GSO: "Cục Thống kê (GSO)", NHNN: "NHNN", "S&P Global": "S&P Global" };
const DAY_MS = 86_400_000;
const SHORT_VI = { CPI: "CPI", FDI: "FDI", EXPORT: "xuất khẩu", IO: "IIP", CREDIT: "tín dụng", M2: "M2", PMI: "PMI" };

const addMonths = (period, k) => {
  const [y, m] = period.split("-").map(Number);
  const i = y * 12 + (m - 1) + k;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};
const monthVi = (period) => `${Number(period.slice(5, 7))}/${period.slice(0, 4)}`;
const daysBetween = (fromIso, toIso) => Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);

/** Lịch công bố ước tính trong [today, today + horizonDays], gộp theo (ngày, cơ quan). */
export function releaseSchedule(todayIso, horizonDays = 60, catalog = VN_CATALOG) {
  const end = new Date(Date.parse(`${todayIso}T00:00:00Z`) + horizonDays * DAY_MS).toISOString().slice(0, 10);
  const groups = new Map();
  for (const m of catalog) {
    if (!RELEASE_SOURCES.has(m.source)) continue;
    // Lãi suất liên ngân hàng / tỷ giá: số liệu ngày liên tục, không phải "sự kiện công bố".
    if (m.source === "NHNN" && m.pubLagMonths === 0) continue;
    const day = String(Math.min(Math.max(m.typicalReleaseDay, 1), 28)).padStart(2, "0");
    // Kỳ tham chiếu THỰC TẾ của lịch: GSO công bố số liệu tháng M vào ~ngày 6 tháng M+1 (từ 2025); PMI tháng M vào đầu
    // tháng M+1. NHNN (M2, tín dụng) công bố không đều -> dùng độ trễ thận trọng của danh mục (pubLag + 1).
    // (Danh mục dùng độ trễ thận trọng hơn cho backtest chống nhìn trước — đó là chuyện khác với lịch.)
    const refLag = m.source === "NHNN" ? m.pubLagMonths + 1 : 1;
    for (let k = 0; k <= Math.ceil(horizonDays / 28) + 1; k++) {
      const releaseMonth = addMonths(todayIso.slice(0, 7), k);
      const period = addMonths(releaseMonth, -refLag);
      const date = `${releaseMonth}-${day}`;
      if (date < todayIso || date > end) continue;
      const key = `${date}|${m.source}`;
      const g = groups.get(key) ?? { date, source: m.source, items: [] };
      g.items.push({ seriesId: m.id, nameVi: m.nameVi, period });
      groups.set(key, g);
    }
  }
  return [...groups.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.source < b.source ? -1 : 1)).map((g) => {
    const periods = [...new Set(g.items.map((i) => i.period))];
    const names = g.items.map((i) => SHORT_VI[i.seriesId] ?? i.seriesId).join(", ");
    return {
      id: `release:${g.source}:${g.date}`,
      kind: "release",
      title: `${SOURCE_VI[g.source]} công bố số liệu tháng ${periods.map(monthVi).join(", ")}: ${names}`,
      date: g.date,
      daysRemaining: daysBetween(todayIso, g.date),
      country: "VN",
      estimated: true,
      evidence: "SCHEDULE_ESTIMATE",
      series: g.items,
    };
  });
}

export function fomcEvents(todayIso, horizonDays = 60, dates = FOMC_DECISION_DATES) {
  return dates
    .filter((d) => d >= todayIso && daysBetween(todayIso, d) <= horizonDays)
    .map((d) => ({ id: `fomc:${d}`, kind: "fomc", title: "Fed công bố quyết định lãi suất (FOMC)", date: d, daysRemaining: daysBetween(todayIso, d), country: "US", estimated: false, evidence: "OFFICIAL_SCHEDULE" }));
}

/** Sự kiện từ phân tích vĩ mô (cảnh báo, đổi chế độ) — chỉ ở chế độ số liệu thật. */
export function analysisEvents({ mode, alerts, regime, todayIso }) {
  if (mode !== "real") return [];
  const out = [];
  for (const a of alerts?.alerts ?? []) {
    out.push({ id: `alert:${a.id}`, kind: "alert", level: a.level, title: a.messageVi, date: todayIso, daysRemaining: 0, country: "VN", estimated: false, evidence: "REAL_DATA" });
  }
  const hist = regime?.history ?? [];
  if (regime?.current && hist.length >= 2) {
    const argmax = (p) => p.indexOf(Math.max(...p));
    const now = argmax(hist.at(-1).probs);
    const prev = argmax(hist.at(-2).probs);
    if (now !== prev) {
      out.push({
        id: `regime:${hist.at(-1).period}`, kind: "regime", level: "warn",
        title: `Chế độ vĩ mô chuyển sang "${regime.current.label}" (kỳ ${monthVi(hist.at(-1).period)}, xác suất ${Math.round(Math.max(...regime.current.probs) * 100)}%)`,
        date: todayIso, daysRemaining: 0, country: "VN", estimated: false, evidence: "REAL_DATA",
      });
    }
  }
  return out;
}

export async function buildMacroCatalystEvents(service, { todayIso, horizonDays = 60 } = {}) {
  const src = await service.source();
  let analysis = [];
  if (src.mode === "real") {
    const [alerts, regime] = await Promise.all([
      service.handle({ method: "GET", path: "/api/macro/alerts", query: {}, body: undefined }),
      service.handle({ method: "GET", path: "/api/macro/regime", query: {}, body: undefined }),
    ]);
    analysis = analysisEvents({ mode: src.mode, alerts: alerts.status === 200 ? alerts.body : null, regime: regime.status === 200 ? regime.body : null, todayIso });
  }
  const events = [...analysis, ...releaseSchedule(todayIso, horizonDays), ...fomcEvents(todayIso, horizonDays)].sort((a, b) => a.daysRemaining - b.daysRemaining);
  return {
    mode: src.mode,
    notice: src.notice,
    asOf: todayIso,
    horizonDays,
    caveat: "Ngày công bố số liệu VN là ƯỚC TÍNH (độ trễ + ngày điển hình); đối chiếu lịch chính thức. Cảnh báo/chế độ chỉ phát khi có số liệu thật.",
    events,
  };
}
