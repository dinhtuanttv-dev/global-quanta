import { useState } from "react";
import { usePreopen, type PreopenDoc, type PreopenScenario, type PreopenWorld, type ScenarioId } from "../../../hooks/usePreopen";

// Trung tâm thị trường: kết luận → 3 kịch bản → bản đồ giá, thế giới, lịch sử → sổ tiến. Chỉ hiện phần đã đạt kiểm định; phần chưa đạt nói rõ.
const COLOR: Record<ScenarioId, string> = { neg: "#f47a84", mid: "#aab6c8", pos: "#4fd6a2" };
const PHASE: Record<PreopenDoc["phase"], string> = { pre: "Trước giờ giao dịch", session: "Trong phiên", post: "Sau phiên", closed: "Ngày nghỉ" };
const REGIME = { calm: "Yên tĩnh", volatile: "Biến động" } as const;
const SLOT_TIMES = ["07:15", "08:30", "08:50"];
const nf = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const sg = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(Math.abs(v), d)}`);
const ddmm = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "—");
const vnTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—");

function ScenarioCard({ s, lead, selected, onSelect, ev }: { s: PreopenScenario; lead: boolean; selected: boolean; onSelect: () => void; ev: PreopenDoc["evidence"] }) {
  const c = COLOR[s.id];
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} data-testid={`mc-card-${s.id}`} className="grid min-w-0 content-start gap-1.5 rounded-lg border bg-white/[0.02] p-2.5 text-left hover:bg-white/[0.04]"
      style={{ borderColor: selected ? c : "rgba(255,255,255,0.1)", borderTop: `3px solid ${c}` }}>
      <span className="flex items-baseline justify-between gap-2">
        <b className="text-[13px] text-slate-100">{s.name}{lead && <span className="ml-1.5 rounded-full border px-1.5 text-[11px] font-semibold" style={{ color: c, borderColor: c }}>đang dẫn đầu</span>}</b>
        {s.probability != null && <b className="font-mono text-[15px]" style={{ color: c }} data-testid={`mc-prob-${s.id}`}>{s.probability}%</b>}
      </span>
      <span className="text-[12px] font-semibold" style={{ color: c }}>{s.posture}</span>
      <span className="text-[11px] text-slate-400">Kích hoạt: {s.trigger}</span>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <dt className="text-slate-500">Vùng mở cửa</dt><dd className="m-0 text-right font-mono text-slate-200" data-testid={`mc-open-${s.id}`}>{s.open ? `${nf(s.open.lo)}–${nf(s.open.hi)}` : "Đang đo, chưa đạt"}</dd>
        <dt className="text-slate-500">Dải cả phiên{ev.dayBand ? "" : " *"}</dt><dd className="m-0 text-right font-mono text-slate-200">{nf(s.day.lo)}–{nf(s.day.hi)}</dd>
        <dt className="text-slate-500">Xác nhận</dt><dd className="m-0 text-right font-mono text-slate-200">{s.confirm}</dd>
        <dt className="text-slate-500">Vô hiệu</dt><dd className="m-0 text-right font-mono text-slate-200">{s.invalid}</dd>
      </dl>
      <span className="text-[11px] text-slate-400">{s.action}</span>
    </button>
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
  const latest = rows.map((r) => r.at).filter(Boolean).sort().pop();
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-2">
      <div className="flex justify-between gap-2 text-[11px]"><b className="font-medium text-slate-300">{title}</b><span className="font-mono text-slate-500">{vnTime(latest)}</span></div>
      {rows.map((r) => {
        const v = r.changePct, w = Math.min(50, (Math.abs(v ?? 0) / 2.5) * 50), up = (v ?? 0) >= 0;
        return <div key={r.name} className="mt-1 grid grid-cols-[64px_minmax(0,1fr)_52px] items-center gap-1.5 text-[11px]" data-testid={`mc-world-${r.name}`}>
          <span className="truncate text-slate-300" title={r.at ? `Chốt ${vnTime(r.at)}` : "Không có số"}>{r.name}</span>
          <span aria-hidden className="relative h-1.5 rounded bg-white/5"><i className="absolute inset-y-0 rounded" style={{ left: up ? "50%" : `${50 - w}%`, width: `${w}%`, background: up ? COLOR.pos : COLOR.neg }} /><i className="absolute -inset-y-0.5 left-1/2 w-px bg-slate-500" /></span>
          <span className="text-right font-mono text-slate-200">{v == null ? "—" : `${sg(v, 1)}%`}</span>
        </div>;
      })}
    </div>
  );
}

export default function MarketCenterPanel() {
  const { data: d, error, isLoading } = usePreopen();
  const [pick, setPick] = useState<ScenarioId | null>(null);
  const shell = "mx-4 mb-3 rounded-xl border border-white/10 bg-[#0b1120] p-3";
  if (error && !d) return <section className={shell} data-testid="market-center"><p className="text-[12px] text-rose-300" role="alert">Chưa tải được Trung tâm thị trường: {error.message}</p></section>;
  if (!d?.scenarios) return <section className={shell} data-testid="market-center"><div className={`h-24 rounded-lg bg-slate-800/20 ${isLoading ? "animate-pulse" : ""}`} aria-hidden /></section>;
  const lead = d.scenarios.find((s) => s.id === d.lead) ?? d.scenarios[1], selected = d.scenarios.find((s) => s.id === pick) ?? lead;
  const ev = d.evidence, c = COLOR[lead.id];
  const groups: [string, PreopenWorld["group"]][] = [["Mỹ", "us"], ["Tương lai", "futures"], ["Châu Á", "asia"]];
  const t = d.tracking;
  return (
    <section className={shell} aria-label="Trung tâm thị trường" data-testid="market-center">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-bold text-cyan-300">Trung tâm thị trường</h2>
        <span className="rounded border border-white/10 px-1.5 text-[11px] text-slate-300" data-testid="mc-phase">{PHASE[d.phase]}</span>
        <span className="text-[11px] text-slate-400">Cho phiên {ddmm(d.session)} · cập nhật {vnTime(d.asOf)}</span>
        <div className="ml-auto flex flex-wrap gap-1" aria-label="Các mốc ghi hôm nay" data-testid="mc-timeline">
          {SLOT_TIMES.map((slot) => { const x = d.timeline.find((y) => y.slot === slot); return <span key={slot} className="rounded border border-white/10 px-1.5 font-mono text-[11px]" style={{ color: x ? COLOR[x.lead] : "#64748b", borderColor: x ? COLOR[x.lead] : undefined }} title={x ? `ES ${sg(x.es)}%` : "Chưa đến mốc"}>{slot}</span>; })}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 rounded-lg px-3 py-2" style={{ borderLeft: `3px solid ${c}`, background: `linear-gradient(90deg, ${c}22, transparent)` }} data-testid="mc-verdict">
        <b className="text-[15px] text-slate-50">{lead.name}: {lead.posture}</b>
        <span className="text-[12px] text-slate-300">ES {sg(d.es.movePct)}% từ lúc VN đóng cửa {ddmm(d.prevDate)}</span>
        {!ev.probabilities && <span className="text-[11px] text-amber-300" data-testid="mc-no-evidence">Bản đồ tình huống, chưa có bằng chứng dự báo</span>}
      </div>

      {t && <p className={`mt-2 rounded-lg border px-3 py-1.5 text-[12px] ${t.invalidated ? "border-amber-400/40 text-amber-200" : "border-white/10 text-slate-200"}`} data-testid="mc-tracking">
        Mở {nf(t.open, 1)} ({sg(t.gapPct)}%), hiện {nf(t.last, 1)} ({sg(t.movePct)}%). {t.invalidated ? `Kịch bản ${lead.name} đã vô hiệu.` : `Kịch bản ${lead.name} còn hiệu lực.`}
      </p>}

      <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-3" data-testid="mc-cards">
        {d.scenarios.map((s) => <ScenarioCard key={s.id} s={s} lead={s.id === d.lead} selected={s.id === selected.id} onSelect={() => setPick(s.id)} ev={ev} />)}
      </div>
      {!ev.dayBand && <p className="mt-1 text-[11px] text-amber-300/90" data-testid="mc-day-warning">* Dải cả phiên chưa đạt kiểm định: thực tế chỉ phủ {nf(ev.dayCoverage, 1)}% số phiên, đích 80%. Giá có thể ra ngoài dải.</p>}

      <div className="mt-2 grid grid-cols-1 gap-2 2xl:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-white/10 p-2">
          <h3 className="text-[12px] font-semibold text-slate-200">Bản đồ mức giá: {selected.name}</h3>
          <PriceMap d={d} s={selected} />
        </div>
        <div className="min-w-0 rounded-lg border border-white/10 p-2">
          <h3 className="text-[12px] font-semibold text-slate-200">Đêm qua → sáng nay</h3>
          <p className="text-[11px] text-slate-500">% so với phiên trước của từng thị trường, nên ES ở đây khác số tính từ lúc VN đóng cửa ở dòng kết luận.</p>
          <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-3" data-testid="mc-world">
            {groups.map(([title, g]) => <WorldLane key={g} title={title} rows={d.world.filter((w) => w.group === g)} />)}
          </div>
        </div>
        <div className="min-w-0 rounded-lg border border-white/10 p-2">
          <h3 className="text-[12px] font-semibold text-slate-200">Lịch sử theo nhóm ES</h3>
          <div className="overflow-x-auto">
            <table className="mt-1 w-full min-w-[420px] text-[11px]" data-testid="mc-history">
              <thead><tr className="text-slate-500"><th className="text-left font-normal">Nhóm</th><th className="text-right font-normal">Phiên</th><th className="text-right font-normal">Mở cửa</th><th className="text-right font-normal">Mở → đóng</th><th className="text-right font-normal">Cả phiên</th></tr></thead>
              <tbody>{ev.history.map((h) => <tr key={h.id} className="border-t border-white/5" style={h.id === d.lead ? { background: "rgba(245,185,66,0.08)" } : undefined}>
                <td className="py-0.5 text-slate-200">{h.label}</td><td className="text-right font-mono text-slate-300">{h.n}</td><td className="text-right font-mono text-slate-300">{sg(h.gap)}%</td><td className="text-right font-mono text-slate-300">{sg(h.oc)}%</td><td className="text-right font-mono text-slate-300">{sg(h.cc)}%</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">{ev.sample.tested} phiên, {ddmm(ev.sample.from)}/{ev.sample.from.slice(0, 4)} → {ddmm(ev.sample.to)}/{ev.sample.to.slice(0, 4)}. Mô tả, không phải dự báo.</p>
        </div>
        <div className="min-w-0 rounded-lg border border-white/10 p-2" data-testid="mc-evidence">
          <h3 className="text-[12px] font-semibold text-slate-200">Rủi ro và độ tin cậy</h3>
          <div className="mt-1 grid grid-cols-2 gap-1.5 text-[11px] md:grid-cols-4">
            <div className="rounded border border-white/10 p-1.5"><span className="block text-slate-500">MS-GARCH</span><b className="text-slate-100" data-testid="mc-regime">{d.risk ? REGIME[d.risk.label] : "—"}</b><span className="block font-mono text-slate-400">{d.risk ? `${nf(Math.max(d.risk.probCalm, d.risk.probVolatile) * 100, 0)}% · cấp ${d.risk.grade}` : ""}</span></div>
            <div className="rounded border border-white/10 p-1.5"><span className="block text-slate-500">Biến động</span><b className="font-mono text-slate-100">{d.risk ? `${nf(d.risk.volAnnualPct, 1)}%/năm` : "—"}</b><span className="block text-slate-400">không cho chiều giá</span></div>
            <div className="rounded border border-white/10 p-1.5"><span className="block text-slate-500">Kiểm định {ev.rule}</span><b className="text-amber-300">Chưa đạt</b><span className="block font-mono text-slate-400">vùng mở phủ {nf(ev.openCoverage, 1)}%</span></div>
            <div className="rounded border border-white/10 p-1.5"><span className="block text-slate-500">Sổ tiến</span><b className="font-mono text-slate-100" data-testid="mc-ledger">{d.ledger.scored} ngày</b><span className="block text-slate-400">{d.ledger.scored ? `dẫn đầu đúng ${nf(d.ledger.leadHit, 0)}%` : "bắt đầu ghi từ phiên tới"}</span></div>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Vùng mở cửa và xác suất được ghi vào sổ mỗi sáng, chỉ hiện khi đạt kiểm định. Tư thế là tham khảo, không phải khuyến nghị đầu tư.</p>
        </div>
      </div>
    </section>
  );
}
