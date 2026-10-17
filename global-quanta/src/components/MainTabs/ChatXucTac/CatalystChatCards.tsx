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
  world_confirmatory: "Cổng xác nhận đặt trước",
  world_links: "Liên kết thế giới → ngành (thăm dò)",
  world_events: "Sự kiện thế giới",
  world_connectedness: "Kết nối thị trường",
  world_scenario: "Kịch bản thế giới",
  world_stock_profile: "Phơi nhiễm quốc tế",
  ws_strategy: "Chiến lược ngành thế giới",
  ws_sector: "Ngành thế giới → ngành VN",
  ws_commodities: "Bảng giá hàng hoá",
  ws_commodity: "Phân tích hàng hoá",
  ws_stock: "Tác động lên cổ phiếu",
};

const STANCE_VI: Record<string, string> = { overweight: "Ưu tiên", neutral: "Trung tính", underweight: "Giảm tỷ trọng", na: "—", supportive: "Bối cảnh thuận", mixed: "Hỗn hợp", adverse: "Bối cảnh bất lợi" };
const stanceColor = (s: string) => (s === "overweight" || s === "supportive" ? "var(--positive, #34d399)" : s === "underweight" || s === "adverse" ? "var(--negative, #f87171)" : "var(--text-secondary)");
const Stance = ({ s }: { s: string }) => <span style={{ color: stanceColor(s), fontWeight: 700 }}>{STANCE_VI[s] ?? s}</span>;
const sgn = (x: unknown, d = 1) => (typeof x === "number" && Number.isFinite(x) ? `${x > 0 ? "+" : ""}${fmt(x, d)}` : "—");

/** Bậc bằng chứng của gói macro-center: A/B có màu, C và pending trung tính (không phải "có tác động"). */
const TIER_STYLE: Record<string, { label: string; color: string }> = {
  A: { label: "Bậc A", color: "var(--positive, #34d399)" },
  B: { label: "Bậc B", color: "var(--gold, #e8b84b)" },
  C: { label: "Bậc C", color: "var(--text-tertiary)" },
  pending: { label: "Chờ đo", color: "var(--text-tertiary)" },
};
const Tier = ({ t }: { t: string }) => {
  const s = TIER_STYLE[t] ?? { label: t, color: "var(--text-tertiary)" };
  return <span title={t === "C" ? "Chưa đủ bằng chứng / giả thuyết — không phải \"có tác động\"" : undefined} style={{ fontSize: 9.5, fontWeight: 700, color: s.color, border: `1px solid ${s.color}`, borderRadius: 4, padding: "0 4px" }}>{s.label}</span>;
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
  if (name === "world_confirmatory" && Array.isArray(d.rows)) {
    return (
      <Shell title={`${title} · ${d.confirmed}/${d.family} cặp đạt · trễ ${d.lagMonths} tháng`}>
        <Table head={["Cặp", "Kỳ vọng", "β (t)", "q", "Kết luận"]} rows={d.rows.map((r: Obj) => [
          `${r.factorName ?? r.factor} → ${r.sectorName ?? r.sector}`, r.expected, r.beta == null ? "thiếu dữ liệu" : `${fmt(r.beta, 3)} (${fmt(r.t)})`, fmt(r.q, 3),
          <span style={{ color: r.confirmed ? "var(--positive, #34d399)" : "var(--text-tertiary)" }}>{r.confirmed ? "Đã xác nhận" : "Chưa xác nhận"}</span>,
        ])} />
      </Shell>
    );
  }
  if (name === "world_links") {
    const rows: Obj[] = d.rows ?? [];
    return (
      <Shell title={`${title} · A ${d.counts?.A ?? 0} · B ${d.counts?.B ?? 0} · C ${d.counts?.C ?? 0}`}>
        {rows.length ? (
          <Table head={["Yếu tố → Ngành", "Hướng", "β", "t", "Trễ", "Bậc"]} rows={rows.map((r) => [
            `${r.factorName ?? r.factor} → ${r.sectorName ?? r.sector}`, <span style={{ color: dirColor(r.direction) }}>{r.direction}</span>, fmt(r.beta), fmt(r.t, 1), `${r.lagMonths} th`, <Tier t={r.tier} />,
          ])} />
        ) : <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Chưa có liên kết bậc A/B nào — chưa tìm thấy bằng chứng.</div>}
      </Shell>
    );
  }
  if (name === "world_events") {
    const evs: Obj[] = d.events ?? (d.id ? [{ title: d.title, tier: d.tier, sector: d.sector, carPct: d.carPct, q: d.q }] : []);
    if (!evs.length) return null;
    return (
      <Shell title={title}>
        <Table head={["Sự kiện", "Ngành", "CAR (−1,+3)", "q", "Bậc"]} rows={evs.slice(0, 10).map((e) => [
          <span title={e.title} style={{ display: "inline-block", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" }}>{e.title}</span>,
          e.sector ?? "—", e.carPct == null ? "—" : `${fmt(e.carPct, 1)}%`, e.q == null ? "—" : fmt(e.q, 3), <Tier t={e.tier} />,
        ])} />
      </Shell>
    );
  }
  if (name === "world_connectedness") {
    return (
      <Shell title={`${title} · lan truyền tổng ${fmt(d.totalRecentPct, 1)}%`}>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Việt Nam nhận từ: {(d.vnReceivesFrom ?? []).map((x: Obj) => `${x.market} ${fmt(x.sharePct, 1)}%`).join(" · ")}
          <br />Phụ thuộc đuôi (cùng rơi vào 5% ngày tệ nhất; độc lập ≈ 0,05): {(d.tailDependence ?? []).map((x: Obj) => `${x.market} ${fmt(x.jointCrashProb)}`).join(" · ")}
        </div>
      </Shell>
    );
  }
  if (name === "world_scenario" && Array.isArray(d.sectors)) {
    return (
      <Shell title={`${title} · ${d.scenario} · ${d.horizonMonths} tháng · ${d.conclusiveSectors} ngành có hướng`}>
        <Table head={["Ngành", "Ước tính", "KTC 90%", "Kết luận"]} rows={d.sectors.map((r: Obj) => [
          r.name, `${fmt(r.estPct, 1)}%`, `[${fmt(r.ciLowPct, 1)}; ${fmt(r.ciHighPct, 1)}]`, r.conclusive ? "có hướng" : "chưa kết luận",
        ])} />
        {Array.isArray(d.warnings) && d.warnings.length > 0 && <div style={{ fontSize: 10, color: "var(--warning, #f59e0b)", marginTop: 4 }}>{d.warnings.join(" · ")}</div>}
      </Shell>
    );
  }
  if (name === "ws_strategy" && Array.isArray(d.shortTop)) {
    const rows: Obj[] = [...d.shortTop, ...(d.shortBottom ?? [])];
    return (
      <Shell title={`${title} · phiên ${d.asOf ?? "—"}${d.regime?.stressed ? " · biến động cao" : ""}`}>
        <Table head={["Ngành", "Tư thế ngắn hạn", "α (đcb/phiên)", "P vượt", "Mã lớn"]} rows={rows.map((r) => [
          r.nameVi, <Stance s={r.stance} />, sgn(r.alphaBps), r.pOutperform == null ? "—" : `${fmt(r.pOutperform * 100, 1)}%`, (r.topStocks ?? []).join(" "),
        ])} />
        {d.medium && <div style={{ fontSize: 10.5, color: "var(--text-secondary)", marginTop: 4 }}>
          Trung hạn (bối cảnh, không dự báo): thuận — {(d.medium.supportive ?? []).map((m: Obj) => m.nameVi).join(", ") || "—"}; bất lợi — {(d.medium.adverse ?? []).map((m: Obj) => m.nameVi).join(", ") || "—"}
        </div>}
      </Shell>
    );
  }
  if (name === "ws_sector" && d.short) {
    return (
      <Shell title={`${title} · ${d.nameVi} (ICB ${d.icb}) · ${d.asOf ?? ""}`}>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Ngắn hạn {sgn(d.short.score, 2)} σ ({d.short.evidence}) · trung hạn {sgn(d.medium?.score, 2)} σ ({d.medium?.evidence})
          {Array.isArray(d.drivers) && d.drivers.length > 0 && <><br />Hàng hoá: {d.drivers.map((x: Obj) => `${x.nameVi} ${sgn(x.shortPct)}% phiên · ${sgn(x.mediumPct)}% 3T`).join(" · ")}</>}
        </div>
        {Array.isArray(d.stocks) && d.stocks.length > 0 && (
          <Table head={["Mã", "Tỷ trọng", "β", "1 phiên", "1 tháng"]} rows={d.stocks.slice(0, 6).map((x: Obj) => [x.ticker, `${fmt(x.weightPct, 1)}%`, fmt(x.betaPct, 2), `${sgn(x.d1Pct)}%`, `${sgn(x.m1Pct)}%`])} />
        )}
      </Shell>
    );
  }
  if (name === "ws_commodities" && Array.isArray(d.items)) {
    return (
      <Shell title={title}>
        <Table head={["Mặt hàng", "Giá", "Thay đổi", "Kỳ"]} rows={d.items.map((x: Obj) => [x.nameVi, `${fmt(x.value)} ${x.unit}`, `${sgn(x.changePct)}% ${x.basis ?? ""}`, x.period])} />
      </Shell>
    );
  }
  if (name === "ws_commodity" && d.id) {
    const ch: Obj = d.changesPct ?? {};
    return (
      <Shell title={`${title} · ${d.nameVi} · ${d.lastDate ?? ""}`}>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          {fmt(d.last)} {d.unit} · 1 phiên {sgn(ch.d1)}% · 1 tháng {sgn(ch.m1)}% · 3 tháng {sgn(ch.m3)}% · 1 năm {sgn(ch.y1)}%
          <br />Phân vị 5 năm {fmt(d.percentile5y, 0)} · z 1 năm {sgn(d.zScore1y, 2)} · biến động {fmt(d.volNowPct, 1)}% (TB 5 năm {fmt(d.volAvg5yPct, 1)}%)
          {Array.isArray(d.relations) && d.relations.length > 0 && <><br />Quan hệ (thăm dò): {d.relations.map((r: Obj) => `${r.code} r ${fmt(r.corr, 2)}${r.significant ? "" : " (chưa có ý nghĩa)"}`).join(" · ")}</>}
        </div>
      </Shell>
    );
  }
  if (name === "ws_stock" && d.ticker) {
    const e: Obj | null = d.stockExposure;
    return (
      <Shell title={`${title} · ${d.ticker}${d.sector ? ` · ${d.sector.nameVi} (ICB ${d.sector.icb})` : ""}`}>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Ngắn hạn ngành: {d.sectorShort ? <><Stance s={d.sectorShort.stance} /> α {sgn(d.sectorShort.alphaBps)} đcb/phiên · P vượt {d.sectorShort.pOutperform == null ? "—" : `${fmt(d.sectorShort.pOutperform * 100, 1)}%`}</> : "—"}
          <br />Trung hạn ngành: {d.sectorMedium ? <><Stance s={d.sectorMedium.stance} /> (bối cảnh, không dự báo)</> : "—"}
          {e && <><br />Mã: tỷ trọng {fmt(e.weightPct, 1)}% · β {fmt(e.betaPct, 2)} · 1 tháng {sgn(e.m1Pct)}% · 3 tháng {sgn(e.m3Pct)}%</>}
          {Array.isArray(d.drivers) && d.drivers.length > 0 && <><br />Hàng hoá dẫn dắt: {d.drivers.map((x: Obj) => x.nameVi).join(", ")}</>}
        </div>
      </Shell>
    );
  }
  return null;
}
