// X4 — Thẻ hiển thị kết quả công cụ ngay dưới câu trả lời chat. CHỈ dùng dữ liệu của chính tool_result (không gọi lại API).
import type { ReactNode } from "react";
import type { ChatToolResult } from "../../../services/catalystChat";
import { sectorLabelVi } from "../../../utils/sectorLabelVi";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dữ liệu công cụ là JSON động
type Obj = Record<string, any>;
const fmt = (x: unknown, d = 2) => (typeof x === "number" && Number.isFinite(x) ? x.toLocaleString("vi-VN", { maximumFractionDigits: d }) : String(x ?? "—"));

const TOOL_LABEL: Record<string, string> = {
  macro_overview: "Tổng quan vĩ mô",
  macro_impact_lookup: "Tác động vĩ mô",
  macro_scenario: "Kịch bản",
  macro_cell_detail: "Chi tiết tác động",
  macro_calendar_alerts: "Lịch & cảnh báo vĩ mô",
  macro_report: "Báo cáo vĩ mô",
  macro_catalyst_calendar: "Lịch vĩ mô sắp tới",
  catalyst_overview: "Tổng quan xúc tác",
  catalyst_ticker: "Xúc tác theo mã",
  catalyst_sector: "Xúc tác theo ngành",
};
export const toolLabel = (name: string) => TOOL_LABEL[name] ?? name;

const STATUS_VI: Record<string, string> = { stable: "ổn định", unstable: "không ổn định", insignificant: "chưa đủ bằng chứng", "significant-unchecked": "có ý nghĩa (chưa kiểm ổn định)" };

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", background: "var(--bg-surface)", marginTop: 8, minWidth: 0 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: 0.3, marginBottom: 6, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}

const Table = ({ head, rows }: { head: string[]; rows: ReactNode[][] }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
      <thead>
        <tr>{head.map((h) => <th key={h} style={{ textAlign: "left", fontWeight: 600, color: "var(--text-tertiary)", padding: "3px 6px", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: "3px 6px", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  </div>
);

const dirColor = (d: string) => (d === "benefit" || d === "tăng" ? "var(--positive, #34d399)" : d === "harm" || d === "giảm" ? "var(--negative, #f87171)" : "var(--text-secondary)");

function Thermometer({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, ((value + 1) / 2) * 100));
  return (
    <div style={{ position: "relative", height: 8, borderRadius: 4, background: "linear-gradient(90deg, var(--negative, #f87171), var(--bg-surface-2) 50%, var(--positive, #34d399))", margin: "4px 0 8px" }} aria-label={`Nhiệt kế vĩ mô ${fmt(value)}`}>
      <div style={{ position: "absolute", left: `calc(${pct}% - 2px)`, top: -3, width: 4, height: 14, borderRadius: 2, background: "var(--text-primary)" }} />
    </div>
  );
}

export function ToolResultCard({ name, result }: { name: string; result: ChatToolResult }) {
  if (!result.ok) return null;
  const d = (result.data ?? {}) as Obj;
  const title = toolLabel(name);

  if (name === "macro_overview" && d.thermometer) {
    return (
      <Shell title={`${title} · ${d.targetName ?? d.target}`}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{d.thermometer.band} <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>({fmt(d.thermometer.value)} · kỳ {d.thermometer.period})</span></div>
        <Thermometer value={d.thermometer.value} />
        {d.regime && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Chế độ: {d.regime.label} ({fmt(d.regime.probability * 100, 0)}%)</div>}
        <div style={{ fontSize: 10.5, color: "var(--warning, #f59e0b)", marginTop: 4 }}>Chỉ để tham khảo — không dùng cho quyết định mua/bán.</div>
      </Shell>
    );
  }
  if (name === "macro_impact_lookup" && Array.isArray(d.rows)) {
    if (!d.rows.length) return null;
    return (
      <Shell title={`${title} · ${d.shown}/${d.matched} cặp`}>
        <Table head={["Biến → Chỉ số", "Hướng", "β", "t", "Trễ", "Trạng thái"]} rows={d.rows.map((r: Obj) => [
          `${r.factor} → ${r.target}`, <span style={{ color: dirColor(r.direction) }}>{r.direction}</span>, fmt(r.beta), fmt(r.t, 1), `${r.lagMonths} th`, STATUS_VI[r.status] ?? r.status,
        ])} />
      </Shell>
    );
  }
  if (name === "macro_scenario" && Array.isArray(d.ranking)) {
    return (
      <Shell title={`${title} · ${d.scenario} · ${d.horizonMonths} tháng`}>
        <Table head={["Chỉ số", "Ước tính", "KTC 90%", "Kết luận"]} rows={d.ranking.map((r: Obj) => [
          r.name ?? r.target, `${fmt(r.estimatePct, 1)}%`, `[${fmt(r.ciLowPct, 1)}; ${fmt(r.ciHighPct, 1)}]`, r.conclusive ? "có hướng" : "chưa kết luận",
        ])} />
      </Shell>
    );
  }
  if (name === "macro_cell_detail") {
    return (
      <Shell title={`${title} · ${d.factor} → ${d.target}`}>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          β = {fmt(d.beta, 3)} (SE {fmt(d.standardError, 3)}, t = {fmt(d.t)}), trễ {d.lagMonths} tháng, {d.observations} quan sát · KTC bootstrap 95% [{fmt(d.bootstrapCI95?.[0])}; {fmt(d.bootstrapCI95?.[1])}] · cửa sổ 48 tháng cùng dấu {fmt((d.rolling48m?.shareSameSign ?? 0) * 100, 0)}%, đổi dấu {d.rolling48m?.signFlips} lần
        </div>
      </Shell>
    );
  }
  if ((name === "macro_catalyst_calendar" && Array.isArray(d.events)) || (name === "macro_calendar_alerts" && Array.isArray(d.upcoming))) {
    const evs: Obj[] = name === "macro_catalyst_calendar" ? d.events : d.upcoming.map((u: Obj) => ({ title: `${u.name} (kỳ ${u.period})`, date: u.expectedDate, estimated: true }));
    if (!evs.length) return null;
    return (
      <Shell title={title}>
        {evs.slice(0, 8).map((e, i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, padding: "2px 0" }}>
            <span style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>{e.date ? new Date(e.date).toLocaleDateString("vi-VN") : ""}</span>
            <span style={{ color: "var(--text-primary)", minWidth: 0 }}>{e.title}{e.estimated ? <em style={{ color: "var(--text-tertiary)" }}> · ước tính</em> : null}</span>
          </div>
        ))}
      </Shell>
    );
  }
  if (name === "catalyst_overview") {
    return (
      <Shell title={`${title} · quét ${new Date(d.scannedAt).toLocaleString("vi-VN")}`}>
        <Table head={["Ngành", "Điểm ròng", "Số mã"]} rows={(d.topSectors ?? []).map((s: Obj) => [sectorLabelVi(s.sector), <span style={{ color: dirColor(s.netScore >= 0 ? "benefit" : "harm") }}>{fmt(s.netScore)}</span>, s.tickerCount])} />
      </Shell>
    );
  }
  if ((name === "catalyst_ticker" || name === "catalyst_sector")) {
    const cards: Obj[] = name === "catalyst_ticker" ? d.cards ?? [] : [...(d.direct ?? []), ...(d.cascade ?? [])];
    if (!cards.length) return null;
    return (
      <Shell title={`${title} · ${name === "catalyst_ticker" ? d.ticker : sectorLabelVi(d.sector)}`}>
        <Table head={["Mã", "Xúc tác", "Hướng", "Tác động", "Nguồn", "Tỷ lệ thắng LS", "Giá"]} rows={cards.slice(0, 8).map((c) => [
          c.ticker, <span title={c.catalyst} style={{ display: "inline-block", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" }}>{c.catalyst}</span>,
          <span style={{ color: dirColor(c.direction) }}>{c.direction === "benefit" ? "có lợi" : "bất lợi"}</span>, fmt(c.impact), c.corroboration, `${fmt(c.historicalWinRatePct, 0)}%`,
          c.priceInStatus === "reflected" ? "đã phản ánh" : "chưa",
        ])} />
      </Shell>
    );
  }
  return null;
}
