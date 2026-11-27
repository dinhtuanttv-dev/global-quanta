import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useTabNavigation } from "../../../lib/TabNavigationContext";
import { fetchMarketJson } from "../../../services/marketDataClient";
import { usePreopen, usePreopenLedger, type PreopenDoc, type PreopenLedgerRow, type PreopenScenario, type PreopenWorld, type ScenarioId } from "../../../hooks/usePreopen";
import { CiBar, GradeBadge, OPEN_LABELS_EVENT, Prov, StaleNotice, postureAllowed, vnWhen, type Grade } from "./marketQuality";
import MarketLabelLegend from "./MarketLabelLegend";
import IntradayPath from "./IntradayPath";

// Trung tâm thị trường, 3 tầng (PR-C): 0 trạng thái → 1 kết luận + 3 kịch bản → 2 phân tích (5 tab, mặc định đóng).
// Chỉ hiện phần đã đạt kiểm định; phần chưa đạt nói rõ. Mỗi số chính có nút nguồn gốc (ⓘ).
const COLOR: Record<ScenarioId, string> = { neg: "#f47a84", mid: "#aab6c8", pos: "#4fd6a2" };
const PHASE: Record<PreopenDoc["phase"], string> = { pre: "Trước giờ giao dịch", session: "Trong phiên", post: "Sau phiên", closed: "Ngày nghỉ" };
const REGIME = { calm: "Yên tĩnh", volatile: "Biến động" } as const;
const SLOT_TIMES = ["07:15", "08:30", "08:50"];
const KEY_OPEN = "gq.marketCenterOpen";
const nf = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const sg = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(Math.abs(v), d)}`);
const ddmm = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "—");
const vnTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—");

function ScenarioCard({ s, lead, selected, onSelect, ev }: { s: PreopenScenario; lead: boolean; selected: boolean; onSelect: () => void; ev: PreopenDoc["evidence"] }) {
  // Hai lớp: cổng ở giao diện + API preopen/3 trả null khi chưa đạt. Thiếu một trong hai thì không hiện.
  const c = COLOR[s.id], allowed = postureAllowed(s.id, ev) && !!s.posture;
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} data-testid={`mc-card-${s.id}`} className="grid min-w-0 content-start gap-1.5 rounded-lg border bg-white/[0.02] p-2.5 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
      style={{ borderColor: selected ? c : "rgba(255,255,255,0.1)", borderTop: `3px solid ${c}`, boxShadow: selected ? `0 0 0 1px ${c}33, 0 6px 18px -10px ${c}` : undefined }}>
      <span className="flex items-baseline justify-between gap-2">
        <b className="text-[13px] text-slate-100">{s.name}{lead && <span className="ml-1.5 rounded-full border px-1.5 text-[11px] font-semibold" style={{ color: c, borderColor: c }} data-testid={`mc-match-${s.id}`}>khớp ES</span>}</b>
        {s.probability != null && <b className="font-mono text-[15px]" style={{ color: c }} data-testid={`mc-prob-${s.id}`}>{s.probability}%</b>}
      </span>
      {allowed
        ? <span className="text-[12px] font-semibold" style={{ color: c }} data-testid={`mc-posture-${s.id}`}>{s.posture}</span>
        : <span className="text-[11px] text-slate-500" data-testid={`mc-posture-off-${s.id}`}>Tư thế: chưa đạt kiểm định</span>}
      <span className="text-[11px] text-slate-400">Kích hoạt: {s.trigger}</span>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <dt className="text-slate-500">Vùng mở cửa</dt><dd className="m-0 text-right font-mono text-slate-200" data-testid={`mc-open-${s.id}`}>{s.open ? `${nf(s.open.lo)}–${nf(s.open.hi)}` : "Đang đo, chưa đạt"}</dd>
        <dt className="text-slate-500">Dải cả phiên{ev.dayBand ? "" : " *"}</dt><dd className="m-0 text-right font-mono text-slate-200">{nf(s.day.lo)}–{nf(s.day.hi)}</dd>
        <dt className="text-slate-500">Xác nhận</dt><dd className="m-0 text-right font-mono text-slate-200">{s.confirm}</dd>
        <dt className="text-slate-500">Vô hiệu</dt><dd className="m-0 text-right font-mono text-slate-200">{s.invalid}</dd>
      </dl>
      {allowed && s.action && <span className="text-[11px] text-slate-400">{s.action}</span>}
    </button>
  );
}

const OUTCOME: Record<ScenarioId, string> = { neg: "Giảm", mid: "Đi ngang", pos: "Tăng" };
/** "10:42" giờ Việt Nam. */
const vnHm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }) : "—");

/** So kịch bản khớp ES với đường cơ sở bằng hai khoảng Wilson: còn chồng nhau thì không kết luận hơn/kém (cách đọc thận trọng). */
function verdictVsBaseline(a: { lo: number | null; hi: number | null } | undefined, b: { lo: number | null; hi: number | null } | undefined): string {
  if (!a || !b || a.lo == null || a.hi == null || b.lo == null || b.hi == null) return "";
  if (a.lo > b.hi) return "Kịch bản khớp ES đang tốt hơn đường cơ sở rõ rệt.";
  if (a.hi < b.lo) return "Kịch bản khớp ES đang kém hơn đường cơ sở rõ rệt.";
  return "Hai khoảng còn chồng nhau: chưa thấy khác biệt rõ so với đường cơ sở.";
}

/** 20 phiên gần nhất của sổ tiến, cũ → mới: màu là kết quả thực, ✓/✕ là giá đóng cửa trong/ngoài dải, viền sáng là kịch bản khớp đúng. */
function SessionStrip() {
  const { data } = usePreopenLedger(true);
  const rows = (data?.rows ?? []).slice(0, 20).reverse();
  if (!rows.length) return null;
  const label = (r: PreopenLedgerRow) => `${ddmm(r.date)}: kết quả ${OUTCOME[r.outcome]} (${sg(r.ccPct)}%), ${r.dayIn ? "trong" : "ngoài"} dải cả phiên${r.day ? ` ${nf(r.day.lo)}–${nf(r.day.hi)}` : ""}, kịch bản khớp ES ${r.lead ? OUTCOME[r.lead] : "không có"}${r.lead ? (r.leadHit ? " — đúng" : " — sai") : ""}`;
  return (
    <div className="md:col-span-2" data-testid="mc-strip">
      <div className="flex items-baseline justify-between gap-2 text-[11px]"><span className="text-slate-400">Từng phiên trong sổ tiến ({rows.length} gần nhất)</span><span className="text-slate-500">✓ trong dải · ✕ ngoài dải · viền sáng: khớp ES đúng</span></div>
      <ol className="mt-1 flex flex-wrap gap-1" aria-label="Các phiên gần nhất trong sổ tiến">
        {rows.map((r) => (
          <li key={r.date} title={label(r)} aria-label={label(r)} data-testid="mc-strip-cell" data-in={r.dayIn ? "1" : "0"}
            className="flex h-7 w-7 flex-col items-center justify-center rounded text-[10px] leading-none"
            style={{ background: `${COLOR[r.outcome]}33`, border: `1.5px solid ${r.leadHit ? COLOR[r.outcome] : "rgba(255,255,255,0.08)"}` }}>
            <b className={r.dayIn ? "text-slate-100" : "text-amber-300"} aria-hidden>{r.dayIn ? "✓" : "✕"}</b>
            <span className="font-mono text-[9px] text-slate-400" aria-hidden>{r.date.slice(8, 10)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Một cổng kiểm định: ký hiệu + chữ, không dựa vào màu. */
function Gate({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`block ${ok ? "text-emerald-300" : "text-amber-300"}`} data-gate={ok ? "pass" : "fail"}><span aria-hidden>{ok ? "✓" : "✕"}</span> {label}: {ok ? "đạt" : "chưa đạt"}</span>;
}

/** Vị trí giá hiện tại trong dải cả phiên của kịch bản khớp: 0% là đáy dải, 100% là đỉnh dải. */
function BandMeter({ last, lo, hi, color }: { last: number; lo: number; hi: number; color: string }) {
  if (!(hi > lo) || !Number.isFinite(last)) return null;
  const raw = ((last - lo) / (hi - lo)) * 100, pos = Math.min(100, Math.max(0, raw)), out = raw < 0 ? "dưới dải" : raw > 100 ? "trên dải" : null;
  return (
    <div className="mt-1 flex items-center gap-2 text-[11px]" data-testid="mc-band-meter" role="img" aria-label={out ? `Giá đang ${out} cả phiên ${nf(lo)}–${nf(hi)}` : `Giá ở ${nf(raw, 0)}% của dải cả phiên ${nf(lo)}–${nf(hi)}`}>
      <span className="font-mono text-slate-500">{nf(lo)}</span>
      <span aria-hidden className="relative h-2 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${color}22, ${color}55, ${color}22)` }}>
        <i className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-q-surface" style={{ left: `${pos}%`, background: out ? "#f5b942" : "#e2e8f0" }} />
      </span>
      <span className="font-mono text-slate-500">{nf(hi)}</span>
      <b className={`font-mono ${out ? "text-amber-300" : "text-slate-200"}`} data-testid="mc-band-pos">{out ?? `${nf(raw, 0)}%`}</b>
    </div>
  );
}

/** Bản đồ mức giá: dải của kịch bản đang chọn, các đường MA và giá phiên trên một trục. */
function PriceMap({ d, s }: { d: PreopenDoc; s: PreopenScenario }) {
  const levels = [["MA20", d.levels.ma20], ["MA50", d.levels.ma50], ["MA200", d.levels.ma200]] as const;
  const vals = [s.day.lo, s.day.hi, d.levels.close, ...(s.open ? [s.open.lo, s.open.hi] : []), ...levels.flatMap(([, v]) => (v == null ? [] : [v])), ...(d.tracking ? [d.tracking.last] : [])];
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = Math.max(5, (hi - lo) * 0.06);
  const W = 640, L = 40, R = 40, X = (v: number) => L + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (W - L - R);
  const step = Math.max(10, Math.ceil((hi - lo) / 5 / 10) * 10), first = Math.ceil((lo - pad) / step) * step;
  const ticks = Array.from({ length: 8 }, (_, i) => first + i * step).filter((v) => v <= hi + pad);
  const c = COLOR[s.id];
  return (
    <div className="overflow-x-auto" data-testid="mc-map">
      <svg viewBox="0 0 640 158" className="block w-full" style={{ minWidth: 520, maxWidth: 760 }} role="img" aria-label={`Dải cả phiên ${nf(s.day.lo)} đến ${nf(s.day.hi)} của kịch bản ${s.name} so với các đường MA`}>
        <rect x={X(s.day.lo)} y={40} width={X(s.day.hi) - X(s.day.lo)} height={20} rx={4} fill={c} opacity={0.2} />
        <text x={X(s.day.lo)} y={34} fontSize={11} fill="#94a3b8">Dải cả phiên</text>
        {s.open && <><rect x={X(s.open.lo)} y={66} width={Math.max(3, X(s.open.hi) - X(s.open.lo))} height={18} rx={4} fill={c} opacity={0.75} /><text x={X(s.open.hi) + 5} y={79} fontSize={11} fill="#e2e8f0">Vùng mở cửa</text></>}
        <line x1={L} x2={W - R} y1={104} y2={104} stroke="rgba(148,163,184,0.25)" />
        {ticks.map((v) => <g key={v}><line x1={X(v)} x2={X(v)} y1={100} y2={108} stroke="rgba(148,163,184,0.4)" /><text x={X(v)} y={150} fontSize={11} fill="#64748b" textAnchor="middle">{nf(v)}</text></g>)}
        {levels.map(([n, v], i) => (v == null ? null : <g key={n}><line x1={X(v)} x2={X(v)} y1={16} y2={104} stroke="#64748b" strokeDasharray="3 3" /><text x={X(v)} y={i % 2 ? 132 : 120} fontSize={11} fill="#94a3b8" textAnchor="middle">{n} {nf(v, 1)}</text></g>))}
        <line x1={X(d.levels.close)} x2={X(d.levels.close)} y1={12} y2={104} stroke="#e2e8f0" />
        <text x={X(d.levels.close)} y={10} fontSize={11} fill="#e2e8f0" textAnchor="middle">Đóng {ddmm(d.prevDate)} {nf(d.levels.close, 1)}</text>
        {d.tracking && <><circle cx={X(d.tracking.last)} cy={104} r={6} fill="#f5b942" stroke="#070b14" strokeWidth={2} data-testid="mc-live-dot" /><text x={X(d.tracking.last)} y={94} fontSize={11} fill="#f5b942" textAnchor="middle">Hiện tại {nf(d.tracking.last, 1)}</text></>}
      </svg>
    </div>
  );
}

function WorldLane({ title, rows }: { title: string; rows: PreopenWorld[] }) {
  const live = rows.filter((r) => r.fresh !== false && r.at).map((r) => r.at).sort().pop();
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-2">
      <div className="flex justify-between gap-2 text-[11px]"><b className="font-medium text-slate-300">{title}</b><span className="font-mono text-slate-500">{live ? vnTime(live) : "phiên trước"}</span></div>
      {rows.map((r) => {
        const v = r.changePct, w = Math.min(50, (Math.abs(v ?? 0) / 2.5) * 50), up = (v ?? 0) >= 0, old = r.fresh === false;
        const sr = `${r.name}: ${v == null ? "không có số" : `${sg(v, 1)}%`}${old ? ", số phiên trước" : ""}${r.at ? `, chốt ${vnWhen(r.at)}` : ""}`;
        return <div key={r.name} role="group" aria-label={sr} className="mt-1 grid grid-cols-[64px_minmax(0,1fr)_52px] items-center gap-1.5 text-[11px]" data-testid={`mc-world-${r.name}`}>
          <span className="truncate text-slate-300" title={r.at ? `Chốt ${vnTime(r.at)}` : "Không có số"}>{r.name}</span>
          <span aria-hidden className="relative h-1.5 rounded bg-white/5"><i className="absolute inset-y-0 rounded" style={{ left: up ? "50%" : `${50 - w}%`, width: `${w}%`, background: old ? "#475569" : up ? COLOR.pos : COLOR.neg }} /><i className="absolute -inset-y-0.5 left-1/2 w-px bg-slate-500" /></span>
          <span className={`text-right font-mono ${old ? "text-slate-500" : "text-slate-200"}`} data-stale={old ? "1" : "0"} title={old ? `Số phiên trước, chốt ${vnTime(r.at)}` : undefined}>{v == null ? "—" : `${sg(v, 1)}%`}</span>
        </div>;
      })}
    </div>
  );
}

/** Hai câu đầu của bản tin AI đã kiểm chứng, đọc từ cùng một lần chạy với tab Phân tích vĩ mô. */
function BriefLine() {
  const goTab = useTabNavigation();
  const { data } = useSWR<{ latest: { generatedAt: string; summary: { text: string }[] } | null }>("/api/world/brief", () => fetchMarketJson("/api/world/brief"), { revalidateOnFocus: false, refreshInterval: 300_000 });
  const run = data?.latest;
  if (!run?.summary?.length) return null;
  return (
    <div className="mt-2 rounded-lg border border-white/10 p-2 text-[11px] text-slate-300" data-testid="mc-brief">
      <b className="font-semibold text-slate-200">Bản tin AI có kiểm chứng</b> <span className="text-slate-500">· {vnTime(run.generatedAt)}</span>
      {run.summary.slice(0, 2).map((s, i) => <p key={i} className="mt-0.5">{s.text}</p>)}
      <button type="button" onClick={() => goTab?.("Chat xuc tac")} className="mt-0.5 text-q-accent-strong underline decoration-q-accent-strong/30 hover:text-slate-50">Xem đầy đủ trong Phân tích vĩ mô →</button>
    </div>
  );
}
/** Tầng 2: 5 tab phân tích. Mặc định đóng; bấm lại tab đang mở để đóng. Ghi nhớ theo trình duyệt. */
type DetailTab = "map" | "world" | "morning" | "trust" | "labels";
const TABS: { id: DetailTab; label: string }[] = [
  { id: "map", label: "Bản đồ giá" }, { id: "world", label: "Thế giới" }, { id: "morning", label: "Sáng nay" }, { id: "trust", label: "Độ tin cậy" }, { id: "labels", label: "Các nhãn đo gì" },
];
const KEY_TAB = "gq.marketCenterTab";
const isDetailTab = (v: unknown): v is DetailTab => TABS.some((t) => t.id === v);

/** Tab "Sáng nay": các mốc ghi trước giờ mở cửa, ES thay đổi giữa các mốc và ES hiện tại. */
/**
 * PR-D (F-C8): ES đổi nhóm sau mốc ghi. Trong phiên: kịch bản đã chốt, chỉ báo tin. Trước giờ mở cửa: so với mốc ghi gần nhất;
 * sau 08:50 nói rõ phiên sẽ giữ theo bản 08:50 (quy tắc đóng băng), không phải ES đang chạy.
 */
function EsShiftAlert({ d }: { d: PreopenDoc }) {
  const name = (id: ScenarioId | null | undefined) => (id ? d.scenarios.find((s) => s.id === id)?.name ?? id : "—");
  const cls = "w-full rounded-md border border-q-accent/35 bg-q-accent/[0.08] px-2 py-0.5 text-[11.5px] text-slate-100";
  if (d.phase === "session" && d.lead && d.liveLead && d.liveLead !== d.lead && d.es.livePct != null) {
    return <span role="status" className={cls} data-testid="mc-es-shift"><span aria-hidden>⇄ </span>ES hiện {sg(d.es.livePct)}% đã sang nhóm {name(d.liveLead)}{d.esEdge != null ? ` (ngưỡng ±${nf(d.esEdge, 2)}%)` : ""}. Kịch bản phiên vẫn giữ theo bản {d.es.frozenAt ?? "cuối trước 09:00"}; chỉ để tham khảo.</span>;
  }
  const last = d.timeline[d.timeline.length - 1];
  if (d.phase === "pre" && d.lead && last?.lead && last.lead !== d.lead) {
    return <span role="status" className={cls} data-testid="mc-es-shift"><span aria-hidden>⇄ </span>{last.slot === "08:50"
      ? <>ES hiện {sg(d.es.movePct)}% khớp nhóm {name(d.lead)}, nhưng phiên sẽ giữ theo bản 08:50: {name(last.lead)} (ES {sg(last.es)}%).</>
      : <>Kịch bản đổi so với bản {last.slot}: {name(last.lead)} → {name(d.lead)} (ES {sg(last.es)}% → {sg(d.es.movePct)}%).</>}</span>;
  }
  return null;
}

/** Bản đồ giá, phần dưới: trong phiên là đường đi hôm nay; ngoài phiên là xem lại phiên gần nhất đã chấm trong sổ tiến. */
function PathSection({ d, lead }: { d: PreopenDoc; lead: PreopenScenario | null }) {
  const inSession = d.phase === "session" && !!lead;
  const { data: led } = usePreopenLedger(!inSession);
  if (inSession && lead) return <IntradayPath date={d.session} live band={lead.day} prevClose={d.levels.close} color={COLOR[lead.id]} title={`Trong phiên ${ddmm(d.session)}: VN-Index so với dải ${lead.name}`} invalidatedAt={d.tracking?.invalidatedAt ?? null} />;
  const r = led?.rows?.[0];
  if (!r?.day) return null;
  const scen = r.lead ? d.scenarios.find((s) => s.id === r.lead)?.name ?? r.lead : "không có";
  return <IntradayPath date={r.date} live={false} band={r.day} prevClose={r.prevClose} color={r.lead ? COLOR[r.lead] : "#94a3b8"}
    title={`Xem lại phiên ${ddmm(r.date)}: kịch bản ${scen}, kết quả ${OUTCOME[r.outcome]} (${sg(r.ccPct)}%), đóng cửa ${r.dayIn ? "trong" : "ngoài"} dải`}
    note={`Dải và kịch bản lấy từ sổ tiến (bản ${r.slot}); nến 5 phút gộp từ nến 1 phút SSI. Mô tả, không phải tín hiệu.`} />;
}

function MorningTab({ d }: { d: PreopenDoc }) {
  const rows = SLOT_TIMES.map((slot) => ({ slot, x: d.timeline.find((y) => y.slot === slot) ?? null }));
  let prev: number | null = null;
  return (
    <div className="space-y-2" data-testid="mc-morning">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-[11px]">
          <caption className="sr-only">Các mốc ghi kịch bản trước giờ mở cửa</caption>
          <thead><tr className="text-slate-500"><th className="py-1 text-left font-normal">Mốc</th><th className="text-left font-normal">Ghi lúc</th><th className="text-right font-normal">ES từ lúc VN đóng cửa</th><th className="text-right font-normal">Đổi so mốc trước</th><th className="pl-3 text-left font-normal">Kịch bản khớp</th></tr></thead>
          <tbody>
            {rows.map(({ slot, x }) => {
              const delta = x?.es != null && prev != null ? x.es - prev : null;
              if (x?.es != null) prev = x.es;
              return <tr key={slot} className="border-t border-white/5" data-testid={`mc-morning-${slot}`}>
                <td className="py-1 font-mono text-slate-200">{slot}</td>
                <td className="font-mono text-slate-400">{x?.at ? vnHm(x.at) : "—"}</td>
                <td className="text-right font-mono text-slate-200">{x ? `${sg(x.es)}%` : d.phase === "closed" || d.phase === "post" ? `chờ phiên ${ddmm(d.session)}` : "chưa đến mốc"}</td>
                <td className="text-right font-mono text-slate-400">{delta == null ? "—" : `${sg(delta)} điểm %`}</td>
                <td className="pl-3">{x ? (x.lead ? <span style={{ color: COLOR[x.lead] }}>{d.scenarios.find((s) => s.id === x.lead)?.name}</span> : <span className="text-slate-500">chưa kết luận</span>) : <span className="text-slate-600">—</span>}</td>
              </tr>;
            })}
            {d.es.livePct != null && <tr className="border-t border-white/10" data-testid="mc-morning-now">
              <td className="py-1 text-slate-300">Hiện tại</td><td className="font-mono text-slate-400">{vnHm(d.es.at)}</td><td className="text-right font-mono text-slate-100">{sg(d.es.livePct)}%</td>
              <td className="text-right font-mono text-slate-400">{prev != null ? `${sg(d.es.livePct - prev)} điểm %` : "—"}</td>
              <td className="pl-3 text-[11px] text-slate-500">{d.es.frozenAt ? `kịch bản phiên giữ theo bản ${d.es.frozenAt}` : "chưa chốt"}</td>
            </tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">Kịch bản của phiên lấy theo mốc cuối cùng trước 09:00 và giữ nguyên trong phiên; ES chạy tiếp sau đó chỉ để tham khảo.</p>
      <div className="rounded-lg border border-white/10 p-2">
        <h3 className="text-[12px] font-semibold text-slate-200">Lịch sử theo nhóm ES</h3>
        <div className="overflow-x-auto">
          <table className="mt-1 w-full min-w-[420px] text-[11px]" data-testid="mc-history">
            <thead><tr className="text-slate-500"><th className="text-left font-normal">Nhóm</th><th className="text-right font-normal">Phiên</th><th className="text-right font-normal">Mở cửa</th><th className="text-right font-normal">Mở → đóng</th><th className="text-right font-normal">Cả phiên</th></tr></thead>
            <tbody>{d.evidence.history.map((h) => <tr key={h.id} className="border-t border-white/5" style={h.id === d.lead ? { background: "rgba(245,185,66,0.08)" } : undefined}>
              <td className="py-0.5 text-slate-200">{h.label}</td><td className="text-right font-mono text-slate-300">{h.n}</td><td className="text-right font-mono text-slate-300">{sg(h.gap)}%</td><td className="text-right font-mono text-slate-300">{sg(h.oc)}%</td><td className="text-right font-mono text-slate-300">{sg(h.cc)}%</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">{d.evidence.sample.tested} phiên, {ddmm(d.evidence.sample.from)}/{d.evidence.sample.from.slice(0, 4)} → {ddmm(d.evidence.sample.to)}/{d.evidence.sample.to.slice(0, 4)}. Mô tả, không phải dự báo.</p>
        {d.esFit && <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-400" data-testid="mc-esfit"><GradeBadge g="C" />
          <span>Độ nhạy mô tả trên {d.esFit.n} phiên: ES đổi 1% thì mở cửa VN-Index dịch trung bình {sg(d.esFit.slope, 2)}%; 8 trong 10 phiên nằm trong {sg(d.esFit.residLo, 2)}% đến {sg(d.esFit.residHi, 2)}% quanh mức đó.</span>
          <Prov label="Độ nhạy ES → mở cửa" rows={[["Mô hình", "Hồi quy gap% = a + b·ES%, phần dư chia σ̂ EWMA"], ["Mẫu", `${d.esFit.n} phiên huấn luyện, ${d.trainFrom ?? "—"} → ${d.trainTo ?? "—"}`], ["a, b", `${nf(d.esFit.intercept, 3)}; ${nf(d.esFit.slope, 3)}`], ["σ̂ hiện tại", `${nf(d.esFit.vol, 3)}%`]]} grade="C" testId="mc-prov-esfit" /></p>}
      </div>
    </div>
  );
}

/** Tab "Độ tin cậy": rủi ro MS-GARCH, cổng kiểm định, hiệu chuẩn sổ tiến, từng phiên. */
function TrustTab({ d }: { d: PreopenDoc }) {
  const ev = d.evidence;
  return (
    <div data-testid="mc-evidence">
      <div className="grid grid-cols-2 gap-1.5 text-[11px] md:grid-cols-4">
        <div className="rounded border border-white/10 p-1.5"><span className="flex items-center gap-1 text-slate-500">MS-GARCH {d.risk && <Prov label="MS-GARCH" rows={[["Đo", "Chế độ biến động VN-Index (yên tĩnh / biến động)"], ["Dữ liệu", "Lợi suất VN-Index đã điều chỉnh, 5 năm"], ["Tính đến phiên", d.risk.asOf]]} grade={(d.risk.grade as Grade) ?? "C"} testId="mc-prov-msgarch" />}</span><b className="text-slate-100" data-testid="mc-regime">{d.risk ? REGIME[d.risk.label] : "—"}</b><span className="block font-mono text-slate-400">{d.risk ? `${nf(Math.max(d.risk.probCalm, d.risk.probVolatile) * 100, 0)}% · cấp ${d.risk.grade}` : ""}</span>{d.risk && <span className="block text-slate-500" data-testid="mc-risk-asof">đến phiên {ddmm(d.risk.asOf)}</span>}</div>
        <div className="rounded border border-white/10 p-1.5"><span className="block text-slate-500">Biến động MS-GARCH</span><b className="font-mono text-slate-100">{d.risk ? `${nf(d.risk.volAnnualPct, 1)}%/năm` : "—"}</b><span className="block text-slate-400">không cho chiều giá</span></div>
        <div className="rounded border border-white/10 p-1.5" data-testid="mc-gates"><span className="block text-slate-500">Kiểm định {ev.rule}</span>
          <Gate ok={ev.dayBand} label="Dải cả phiên" /><Gate ok={ev.openBand} label="Vùng mở cửa" /><Gate ok={ev.probabilities} label="Xác suất" />
        </div>
        <div className="rounded border border-white/10 p-1.5"><span className="block text-slate-500">Sổ tiến</span><b className="font-mono text-slate-100" data-testid="mc-ledger">{d.ledger.scored} ngày</b><span className="block text-slate-400">{d.ledger.scored ? `khớp ES đúng ${nf(d.ledger.leadHit, 1)}%` : "bắt đầu ghi từ phiên tới"}</span></div>
      </div>
      {d.ledger.scored > 0 && <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2" data-testid="mc-calibration">
        <CiBar value={d.ledger.dayCoverage} n={d.ledger.scored} target={80} label="Dải cả phiên phủ (sổ tiến)" testId="mc-ci-day" />
        {d.ledger.lead && d.ledger.alwaysMid?.pct != null
          ? <CiBar value={d.ledger.lead.pct} n={d.ledger.lead.n} compare={{ v: d.ledger.alwaysMid.pct, label: "luôn đoán Trung tính" }} label="Kịch bản khớp ES đúng (sổ tiến)" testId="mc-ci-lead" />
          : <CiBar value={d.ledger.leadHit} n={d.ledger.scored} compare={{ v: 100 / 3, label: "đoán ngẫu nhiên 3 nhóm" }} label="Kịch bản khớp ES đúng (sổ tiến)" testId="mc-ci-lead" />}
        <p className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500 md:col-span-2" data-testid="mc-ci-note"><span>Ngoặc vuông là khoảng tin cậy Wilson 95% với {d.ledger.scored} phiên đã chấm. Vạch vàng: đích 80%; vạch đứt: {d.ledger.alwaysMid?.pct != null
          ? <>luôn đoán Trung tính trên cùng các phiên ({nf(d.ledger.alwaysMid.pct, 1)}%). {verdictVsBaseline(d.ledger.lead, d.ledger.alwaysMid)}</>
          : <>33% nếu đoán ngẫu nhiên.</>} Khoảng còn rộng nghĩa là chưa đủ phiên để kết luận.</span>
          <Prov label="Sổ tiến" rows={[["Lưu", "Gateway, khoá preopen:ledger:v1"], ["Ghi", "07:15 · 08:30 · 08:50 mỗi phiên, gồm cả số bị ẩn"], ["Chấm", "15:15 theo ảnh chụp cuối trước 09:00"], ["Khoảng tin cậy", "Wilson 95%"], ["Xác nhận", ev.confirm ? `${ev.confirm.rule}: ${ev.confirm.n}/${ev.confirm.need} phiên, ${ev.confirm.status === "confirming" ? "đang xác nhận" : ev.confirm.status === "passed" ? "đạt" : "không đạt"}` : null]]} grade="B" testId="mc-prov-ledger" /></p>
        <SessionStrip />
      </div>}
      <p className="mt-1 text-[11px] text-slate-500">Vùng mở cửa, xác suất và tư thế được ghi vào sổ mỗi sáng, chỉ hiện khi đạt kiểm định. Không phải khuyến nghị đầu tư.</p>
    </div>
  );
}

export default function MarketCenterPanel() {
  const { data: d, error, isLoading } = usePreopen();
  const [pick, setPick] = useState<ScenarioId | null>(null);
  const [slotView, setSlotView] = useState<string | null>(null);
  const [open, setOpenState] = useState(() => { try { return window.localStorage.getItem(KEY_OPEN) !== "0"; } catch { return true; } });
  const setOpen = (v: boolean) => { setOpenState(v); try { window.localStorage.setItem(KEY_OPEN, v ? "1" : "0"); } catch { /* bỏ qua */ } };
  const [tab, setTabState] = useState<DetailTab | null>(() => { try { const v = window.localStorage.getItem(KEY_TAB); return isDetailTab(v) ? v : null; } catch { return null; } });
  const setTab = (v: DetailTab | null) => { setTabState(v); try { window.localStorage.setItem(KEY_TAB, v ?? ""); } catch { /* bỏ qua */ } };
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const go = () => { setOpen(true); setTab("labels"); requestAnimationFrame(() => rootRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" })); };
    window.addEventListener(OPEN_LABELS_EVENT, go);
    return () => window.removeEventListener(OPEN_LABELS_EVENT, go);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shell = "rounded-xl border border-q-line bg-q-surface p-4";
  if (error && !d) return <section className={shell} data-testid="market-center"><p className="text-[12px] text-rose-300" role="alert">Chưa tải được Trung tâm thị trường: {error.message}</p></section>;
  if (!d?.scenarios) return <section className={shell} data-testid="market-center"><div className={`h-24 rounded-lg bg-slate-800/20 ${isLoading ? "animate-pulse" : ""}`} aria-hidden /></section>;
  const lead = d.scenarios.find((s) => s.id === d.lead) ?? null, selected = d.scenarios.find((s) => s.id === pick) ?? lead ?? d.scenarios[1];
  const ev = d.evidence, c = lead ? COLOR[lead.id] : "#64748b";
  const viewed = d.timeline.find((x) => x.slot === slotView) ?? null;
  const groups: [string, PreopenWorld["group"]][] = [["Mỹ", "us"], ["Tương lai", "futures"], ["Châu Á", "asia"]];
  const t = d.tracking;
  const staleWorld = d.world.filter((w) => w.fresh === false).length;
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = TABS.length, j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault(); setTab(TABS[j].id); tabRefs.current[TABS[j].id]?.focus();
  };
  return (
    <section ref={rootRef} className={shell} aria-label="Trung tâm thị trường" data-testid="market-center">
      {/* TẦNG 0 — trạng thái: pha, phiên, giờ, mốc ghi, chất lượng dữ liệu */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="mc-tier0">
        <h2 className="text-[14px] font-semibold text-slate-50">Trung tâm thị trường</h2>
        <span className="rounded border border-white/10 px-1.5 text-[11px] text-slate-300" data-testid="mc-phase">{PHASE[d.phase]}</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">Cho phiên {ddmm(d.session)} · cập nhật {vnTime(d.asOf)}
          <Prov label="Tài liệu Trung tâm thị trường" rows={[["Nguồn", `Gateway ${d.version}, quy tắc ${d.rule}`], ["Tính lúc", vnWhen(d.asOf)], ["Tính lại sau", d.nextRefreshAt ? vnWhen(d.nextRefreshAt) : "≤ 5 phút"], ["Giá VN-Index", `đóng cửa phiên ${ddmm(d.prevDate)}`], ["Ghi chú", "Mỗi khối bên dưới có thời điểm riêng"]]} testId="mc-prov-doc" />
        </span>
        {staleWorld > 0 && <span className="text-[11px] text-slate-500" data-testid="mc-quality">◌ {staleWorld} thị trường dùng số phiên trước</span>}
        <div className="ml-auto flex flex-wrap gap-1" aria-label="Các mốc ghi hôm nay" data-testid="mc-timeline">
          {SLOT_TIMES.map((slot) => { const x = d.timeline.find((y) => y.slot === slot), col = x?.lead ? COLOR[x.lead] : "#64748b"; return <button key={slot} type="button" disabled={!x} aria-pressed={slotView === slot}
            aria-label={x ? `Mốc ${slot}: ${x.lead ? d.scenarios.find((s) => s.id === x.lead)?.name ?? x.lead : "chưa kết luận"}, ES ${sg(x.es)}%` : `Mốc ${slot}: chưa có bản ghi`} onClick={() => setSlotView(slotView === slot ? null : slot)} data-testid={`mc-slot-${slot}`} className="rounded border border-white/10 px-1.5 font-mono text-[11px] disabled:cursor-default" style={{ color: col, borderColor: x ? col : undefined, background: slotView === slot ? `${col}22` : undefined }} title={x ? `ES ${sg(x.es)}%` : "Chưa đến mốc"}>{slot}</button>; })}
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="mc-toggle" className="rounded-md border border-white/10 px-2 text-[11.5px] text-slate-300 hover:text-slate-50 hover:border-white/25">{open ? "Thu gọn ▴" : "Mở ▾"}</button>
        </div>
      </div>

      {/* TẦNG 1 — kết luận */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 rounded-lg px-3 py-2" style={{ borderLeft: `3px solid ${c}`, background: `linear-gradient(90deg, ${c}22, transparent)` }} data-testid="mc-verdict">
        {lead ? <>
          <span className="text-[12px] text-slate-400">Điều kiện ES khớp</span>
          <b className="text-[15px] text-slate-50">{lead.name}</b>
          {postureAllowed(lead.id, ev) && lead.posture && <span className="text-[12px] text-slate-200" data-testid="mc-verdict-posture">Tham khảo: {lead.posture}</span>}
          <span className="inline-flex items-center gap-1 text-[12px] text-slate-300">ES {sg(d.es.movePct)}% từ lúc VN đóng cửa {ddmm(d.prevDate)}{d.es.frozenAt ? `, chốt lúc ${d.es.frozenAt}` : ""}
            <Prov label="ES qua đêm" rows={[["Nguồn", "Yahoo Finance, hợp đồng tương lai ES=F (S&P 500)"], ["Mốc so sánh", `giá ES lúc 15:00 phiên ${ddmm(d.prevDate)} (VN đóng cửa)`], ["Giá mốc → hiện tại", d.es.refPrice != null && d.es.price != null ? `${nf(d.es.refPrice, 2)} → ${nf(d.es.price, 2)}` : null], ["Giá ES lúc", vnWhen(d.es.at)], ["Ngưỡng nhóm", d.esSd != null ? `±1σ, σ = ${nf(d.esSd, 2)}% (250 phiên)` : null], ["Trong phiên", d.es.frozenAt ? `giữ theo bản ${d.es.frozenAt}` : null]]} grade="B" testId="mc-prov-es" />
          </span>
          {d.es.at && <span className="text-[11px] text-slate-500" data-testid="mc-es-at">giá ES lúc {vnWhen(d.es.at)}{d.phase === "closed" ? " · thị trường đang nghỉ" : ""}</span>}
        </> : <b className="text-[14px] text-amber-200" data-testid="mc-no-es">Chưa kết luận: {d.es.at ? `giá ES chưa cập nhật từ ${vnTime(d.es.at)}` : "thiếu giá ES"}</b>}
        {!ev.probabilities && <span className="rounded border border-amber-400/40 px-1.5 text-[11px] text-amber-300" data-testid="mc-no-evidence">Chưa có bằng chứng dự báo chiều giá</span>}
        <EsShiftAlert d={d} />
        {viewed && <span className="w-full text-[11px] text-slate-400" data-testid="mc-slot-view">Bản {viewed.slot}: {viewed.lead ? d.scenarios.find((s) => s.id === viewed.lead)?.name : "chưa kết luận"}, ES {sg(viewed.es)}%</span>}
      </div>
      <StaleNotice error={error && d ? error : null} asOf={d.asOf} testId="mc-stale" />
      {open && <>

      {t && <div className={`mt-2 rounded-lg border px-3 py-1.5 text-[12px] ${t.invalidated ? "border-amber-400/40 text-amber-200" : "border-white/10 text-slate-200"}`} data-testid="mc-tracking">
        <p>Mở {nf(t.open, 1)} ({sg(t.gapPct)}%), hiện {nf(t.last, 1)} ({sg(t.movePct)}%). {t.invalidated ? `Kịch bản ${lead?.name} đã vô hiệu.` : t.invalidatedAt ? `Kịch bản ${lead?.name} từng vô hiệu, giá đã quay lại.` : `Kịch bản ${lead?.name} còn hiệu lực.`}</p>
        {t.invalidatedAt && <p className="text-[11px] text-amber-300" data-testid="mc-invalidated-at"><span aria-hidden>⚑ </span>Vô hiệu lần đầu lúc {vnHm(t.invalidatedAt)}{t.invalidatedLast != null ? ` (VN-Index ${nf(t.invalidatedLast, 1)})` : ""}</p>}
        {lead && <BandMeter last={t.last} lo={lead.day.lo} hi={lead.day.hi} color={COLOR[lead.id]} />}
        <p className="text-[11px] text-slate-500" data-testid="mc-track-src">{t.source === "live"
          ? <>Giá trực tiếp lúc {vnHm(t.at)}, cùng nguồn với thanh trên cùng.</>
          : t.source === "daily" ? <>Giá từ nến ngày (chưa có giá trực tiếp), có thể trễ.</> : <>Giá trong phiên làm mới tối đa mỗi 5 phút.</>}</p>
      </div>}

      <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-3" data-testid="mc-cards">
        {d.scenarios.map((s) => <ScenarioCard key={s.id} s={s} lead={s.id === d.lead} selected={s.id === selected.id} onSelect={() => setPick(s.id)} ev={ev} />)}
      </div>
      <div className="mt-1 flex items-start gap-1">
      {ev.dayBand
        ? <p className="text-[11px] text-slate-400" data-testid="mc-day-ok">Dải cả phiên dùng MS-GARCH, đạt kiểm định {ev.rule} khi chạy lại trên dữ liệu cũ: phủ {nf(ev.dayCoverage, 1)}% số phiên, đích 80%. Khoảng 1 phiên trong 5 giá vẫn ra ngoài dải. {d.ledger.scored
          ? <span data-testid="mc-day-forward">{ev.confirm
            ? ev.confirm.status === "passed"
              ? <>Sổ tiến đã xác nhận ({ev.confirm.rule}, {ev.confirm.n} phiên): phủ {nf(ev.confirm.coverage, 1)}% [{nf(ev.confirm.wilsonLo, 0)}–{nf(ev.confirm.wilsonHi, 0)}].</>
              : <>Đang xác nhận theo {ev.confirm.rule} (đăng ký trước): {ev.confirm.n}/{ev.confirm.need} phiên, phủ {nf(ev.confirm.coverage, 1)}%. Kết luận khi đủ {ev.confirm.need} phiên.</>
            : <>Đang xác nhận trên sổ tiến: {d.ledger.scored} phiên, phủ {nf(d.ledger.dayCoverage, 1)}%.</>}</span>
          : <span data-testid="mc-day-forward">Sổ tiến chưa có phiên nào được chấm.</span>}</p>
        : ev.confirm?.status === "failed"
          ? <p className="text-[11px] text-amber-300/90" data-testid="mc-day-warning">* Dải cả phiên KHÔNG ĐẠT xác nhận tiến {ev.confirm.rule}: {ev.confirm.n} phiên phủ {nf(ev.confirm.coverage, 1)}% [{nf(ev.confirm.wilsonLo, 0)}–{nf(ev.confirm.wilsonHi, 0)}], cần {ev.confirm.range[0]}–{ev.confirm.range[1]}% và khoảng chứa 80%. Giá có thể ra ngoài dải.</p>
          : <p className="text-[11px] text-amber-300/90" data-testid="mc-day-warning">* Dải cả phiên chưa đạt kiểm định: thực tế chỉ phủ {nf(ev.dayCoverage, 1)}% số phiên, đích 80%. Giá có thể ra ngoài dải.</p>}
        <Prov label="Dải cả phiên" rows={[["Mô hình", `Hồi quy theo ES, phần dư chia σ̂ ${ev.dayModel === "ms" ? "MS-GARCH" : "EWMA"}; phân vị 10–90%`], ["Huấn luyện", `${d.trainDays} phiên, ${d.trainFrom ?? "—"} → ${d.trainTo ?? "—"}`], ["Kiểm định", `${ev.rule} G2a: phủ ${nf(ev.dayCoverage, 1)}% trên ${ev.sample.tested} phiên (chạy lại trên dữ liệu cũ)`], ["Xác nhận tiến", ev.confirm ? `${ev.confirm.rule}: ${ev.confirm.n}/${ev.confirm.need} phiên` : null], ["Mốc xác nhận / vô hiệu", "MA20/50/200 nằm trong dải, ngoài dải thì dùng giá đóng cửa phiên trước"]]} grade={ev.dayBand ? (ev.confirm?.status === "passed" ? "A" : "B") : "C"} testId="mc-prov-day" />
      </div>
      {!d.scenarios.some((s) => postureAllowed(s.id, ev) && s.posture) && <p className="text-[11px] text-slate-500" data-testid="mc-no-action">Tư thế và câu hành động được ẩn vì các cổng xác suất, không bán đuổi, không mua đuổi của {ev.rule} chưa đạt. Số bị ẩn vẫn được ghi vào sổ tiến để đánh giá lại.</p>}

      {/* TẦNG 2 — phân tích, mặc định đóng */}
      <div className="mt-2" data-testid="mc-tier2">
        <div role="tablist" aria-label="Phân tích Trung tâm thị trường" className="flex gap-1 overflow-x-auto border-b border-white/10">
          {TABS.map((x, i) => <button key={x.id} ref={(el) => { tabRefs.current[x.id] = el; }} type="button" role="tab" id={`mc-tab-${x.id}`} aria-selected={tab === x.id} aria-controls="mc-tabpanel" tabIndex={tab === x.id || (!tab && i === 0) ? 0 : -1}
            onClick={() => setTab(tab === x.id ? null : x.id)} onKeyDown={(e) => onTabKey(e, i)} data-mc-tab={x.id}
            className={`shrink-0 whitespace-nowrap border-b-2 px-2.5 py-1 text-[12px] font-semibold transition-colors ${tab === x.id ? "border-q-accent text-slate-50" : "border-transparent text-slate-400 hover:text-slate-200"}`}>{x.label}</button>)}
          {tab && <button type="button" onClick={() => setTab(null)} className="ml-auto shrink-0 px-2 text-[11px] text-slate-500 hover:text-slate-300" data-testid="mc-tab-close">Ẩn phân tích ▴</button>}
        </div>
        {tab && <div role="tabpanel" id="mc-tabpanel" aria-labelledby={`mc-tab-${tab}`} className="pt-2" data-testid="mc-tabpanel">
          {tab === "map" && <div className="min-w-0 space-y-3">
            <div>
              <h3 className="text-[12px] font-semibold text-slate-200">Bản đồ mức giá: {selected.name} <span className="font-normal text-slate-500">(bấm một thẻ kịch bản để đổi)</span></h3>
              <PriceMap d={d} s={selected} />
            </div>
            <PathSection d={d} lead={lead} />
          </div>}
          {tab === "world" && <div className="min-w-0">
            {d.world.some((w) => w.fresh === false) && <p className="text-[11px] text-slate-500" data-testid="mc-stale-note">Số màu xám là của phiên trước, thị trường đó chưa mở phiên mới.</p>}
            <p className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">% so với phiên trước của từng thị trường, nên ES ở đây khác số tính từ lúc VN đóng cửa ở dòng kết luận.
              <Prov label="Thị trường thế giới" rows={[["Nguồn", "Yahoo Finance v8, 9 mã: S&P 500, Nasdaq, VIX, ES, NQ, DXY, Nikkei, Kospi, Hang Seng"], ["Cách tính", "% so với phiên trước của chính thị trường đó"], ["Số cũ", "Châu Á chưa mở hôm nay; Mỹ quá 20 giờ; tương lai ngoài giờ hoặc quá 26 giờ"]]} grade="B" testId="mc-prov-world" /></p>
            <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-3" data-testid="mc-world">
              {groups.map(([title, g]) => <WorldLane key={g} title={title} rows={d.world.filter((w) => w.group === g)} />)}
            </div>
            <BriefLine />
          </div>}
          {tab === "morning" && <MorningTab d={d} />}
          {tab === "trust" && <TrustTab d={d} />}
          {tab === "labels" && <MarketLabelLegend d={d} />}
        </div>}
      </div>
      </>}
    </section>
  );
}
