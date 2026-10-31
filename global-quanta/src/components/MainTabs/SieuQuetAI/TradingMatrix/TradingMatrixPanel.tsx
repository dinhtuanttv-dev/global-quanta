"use client";
// Trạng thái thị trường (bộ tài liệu Trading Matrix, Tài liệu 3): dòng kết luận, 4 chỉ số; mở Chi tiết có bản đồ 2D và 7 tab.
// Màn hình chính chỉ có nhãn, số, đơn vị, thời điểm. Phương pháp và kiểm định nằm ở tab Bằng chứng.
import { useMemo, useState } from "react";
import { Grid3x3 } from "lucide-react";
import { useMatrixImpact, useMatrixMovers, useMatrixSectors, useMatrixSignals, useTradingMatrix, type MatrixOverview, type MatrixScope, type StatePoint } from "../../../../hooks/useTradingMatrix";
import { RiskChecklist, ScenarioBoard, SignalJournal } from "./ScenarioBoard";
import IndexImpactTable from "./IndexImpactTable";
import { ForecastBlock } from "./MatrixOps";
import SectorHeatmap, { quadrantOf, QUADRANT } from "./SectorHeatmap";
import NotableMovers from "./NotableMovers";
import { HEALTH_VI, TONE, bn, vn, when } from "./MatrixCards";
import { IndexWaterfall, ScenarioStrip, SignedBars, Spark, StateMap, ZONE_VI } from "./StateCharts";

const SCOPES: { id: MatrixScope; label: string }[] = [{ id: "VNINDEX", label: "Toàn HOSE" }, { id: "VN30", label: "VN30" }, { id: "UNIVERSE", label: "Universe" }];
const KEY_OPEN = "gq.matrixOpen", KEY_SCOPE = "gq.matrixScope", KEY_TAB = "gq.matrixTab";
const box = { background: "rgba(13,17,26,0.75)", border: "1px solid rgba(255,255,255,0.06)" };
type TabId = "change" | "index" | "sectors" | "movers" | "scenario" | "flow" | "evidence";
const TABS: { id: TabId; label: string }[] = [
  { id: "change", label: "Thay đổi" }, { id: "index", label: "Trụ chỉ số" }, { id: "sectors", label: "Ngành" }, { id: "movers", label: "Mã nổi bật" },
  { id: "scenario", label: "Kịch bản" }, { id: "flow", label: "Dòng tiền" }, { id: "evidence", label: "Bằng chứng" },
];
const isTab = (v: unknown): v is TabId => TABS.some((t) => t.id === v);
const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const sgn = (v: number | null | undefined, d = 2) => (ok(v) ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${vn(Math.abs(v), d)}` : "—");
const volVi = (p: number | null | undefined) => (!ok(p) ? "—" : p < 25 ? "Thấp" : p <= 75 ? "Bình thường" : "Cao");

/** Cấp bằng chứng: A đã qua kiểm định đặt trước, B đo lường trực tiếp, C chưa kiểm định hoặc không đạt. */
export function Grade({ g }: { g: "A" | "B" | "C" }) {
  const c = g === "A" ? "text-emerald-300 border-emerald-500/40" : g === "B" ? "text-slate-300 border-slate-500/40" : "text-amber-300 border-amber-500/40";
  return <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9.5px] font-bold ${c}`} title={g === "A" ? "Đã qua kiểm định đặt trước" : g === "B" ? "Đo lường trực tiếp" : "Chưa kiểm định hoặc không đạt"} data-testid="mx-grade">{g}</span>;
}

function Tile({ title, value, sub, onClick, testId, children }: { title: string; value: string; sub: string; onClick: () => void; testId: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-left hover:border-amber-400/40 min-w-0">
      <span className="block truncate text-[11px] text-slate-400">{title}</span>
      <span className="flex items-center justify-between gap-2"><b className="text-[15px] leading-tight text-slate-100 truncate">{value}</b>{children}</span>
      <span className="block truncate text-[11px] text-slate-400">{sub}</span>
    </button>
  );
}

function Tiles({ p, path, open }: { p: StatePoint; path: StatePoint[]; open: (t: TabId) => void }) {
  const tail = path.slice(-20);
  return <>
    <Tile title="Độ rộng" value={ok(p.b20) ? `${vn(p.b20)}%` : "—"} sub={`MA50 ${ok(p.b50) ? `${vn(p.b50, 0)}%` : "—"} · MA200 ${ok(p.b200) ? `${vn(p.b200, 0)}%` : "—"}`} onClick={() => open("sectors")} testId="mx-tile-breadth"><Spark values={tail.map((x) => x.b20)} color="#7cb4f5" /></Tile>
    <Tile title="Khối ngoại / thanh khoản, 5 phiên" value={ok(p.fnr5) ? `${sgn(p.fnr5)}%` : "—"} sub={`Chủ động ${ok(p.ldZ) ? sgn(p.ldZ, 1) : "—"} σ`} onClick={() => open("flow")} testId="mx-tile-flow"><Spark values={tail.map((x) => x.fnr5)} color={ok(p.fnr5) && p.fnr5 >= 0 ? "#34d399" : "#fb7185"} zero /></Tile>
    <Tile title="Biến động" value={volVi(p.yzPct)} sub={`${ok(p.sigma) ? `${vn(p.sigma)}%/năm` : "—"} · phân vị ${ok(p.yzPct) ? vn(p.yzPct, 0) : "—"}`} onClick={() => open("scenario")} testId="mx-tile-vol">
      {ok(p.yzPct) && <span aria-hidden className="relative h-1.5 w-[76px] shrink-0 rounded bg-white/10"><i className="absolute -top-0.5 h-2.5 w-1 rounded-sm bg-slate-200" style={{ left: `calc(${p.yzPct}% - 2px)` }} /></span>}
    </Tile>
    <Tile title="Tập trung chỉ số" value={ok(p.neff) ? `${vn(p.neff, 0)} trụ` : "—"} sub={ok(p.idx1) ? `VN-Index ${sgn(p.idx1)}%` : "—"} onClick={() => open("index")} testId="mx-tile-neff"><Spark values={tail.map((x) => x.neff)} color="#fcd34d" /></Tile>
  </>;
}

function ChangeTab({ d, scope, onIndustry, onSelect }: { d: MatrixOverview; scope: MatrixScope; onIndustry: (n: string | null) => void; onSelect: (t: string) => void }) {
  const sectors = useMatrixSectors(scope, true);
  const s = d.state, c = s?.current, pv = s?.previous;
  const flips = useMemo(() => (sectors.data?.sectors ?? []).flatMap((x) => {
    const t = x.trail ?? [], a = t[t.length - 2], b = t[t.length - 1];
    if (!a || !b) return [];
    const q0 = quadrantOf(a.rs?.[5] ?? null, a.breadth), q1 = quadrantOf(b.rs?.[5] ?? null, b.breadth);
    return q0 && q1 && q0 !== q1 ? [{ industry: x.industry, q0, q1 }] : [];
  }), [sectors.data]);
  if (!s || !c) return <p className="text-[12px] text-slate-400">Chưa có dữ liệu.</p>;
  const rows: { k: string; label: string; a: number | null | undefined; b: number | null | undefined; d: number | null; unit: string; dig: number; max: number }[] = [
    { k: "b20", label: "Độ rộng MA20", a: pv?.b20, b: c.b20, d: s.deltas.b20, unit: "%", dig: 1, max: 15 },
    { k: "b50", label: "Độ rộng MA50", a: pv?.b50, b: c.b50, d: s.deltas.b50, unit: "%", dig: 1, max: 15 },
    { k: "mo", label: "McClellan", a: pv?.mo, b: c.mo, d: s.deltas.mo, unit: "", dig: 0, max: 150 },
    { k: "sigma", label: "Biến động, %/năm", a: pv?.sigma, b: c.sigma, d: s.deltas.sigma, unit: "", dig: 1, max: 5 },
    { k: "fnr5", label: "Khối ngoại / thanh khoản", a: pv?.fnr5, b: c.fnr5, d: s.deltas.fnr5, unit: "%", dig: 2, max: 2 },
    { k: "neff", label: "Số trụ hiệu dụng", a: pv?.neff, b: c.neff, d: s.deltas.neff, unit: "", dig: 0, max: 30 },
  ];
  const up = d.links?.impact?.up?.slice(0, 3) ?? [], dn = d.links?.impact?.down?.slice(0, 3) ?? [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="mx-tab-change">
      <table className="w-full text-[12px]">
        <thead><tr className="text-[11px] text-slate-400"><th className="text-left font-normal py-1">{pv ? `${when(pv.date)} → ${when(c.date)}` : ""}</th><th className="text-right font-normal">Trước</th><th className="text-right font-normal">Nay</th><th className="font-normal pl-3 w-[120px]">Thay đổi</th></tr></thead>
        <tbody>{rows.map((r) => {
          const w = ok(r.d) ? Math.min(1, Math.abs(r.d) / r.max) * 50 : 0;
          return <tr key={r.k} className="border-t border-white/5" data-testid={`mx-chg-${r.k}`}><td className="py-1 text-slate-200">{r.label}</td><td className="text-right font-mono text-slate-400">{ok(r.a) ? `${vn(r.a, r.dig)}${r.unit}` : "—"}</td><td className="text-right font-mono text-slate-100">{ok(r.b) ? `${vn(r.b, r.dig)}${r.unit}` : "—"}</td>
            <td className="pl-3"><span className="flex items-center gap-1.5"><span aria-hidden className="relative h-1.5 w-[60px] rounded bg-white/5"><i className="absolute inset-y-0 rounded" style={{ left: ok(r.d) && r.d >= 0 ? "50%" : `${50 - w}%`, width: `${w}%`, background: ok(r.d) && r.d >= 0 ? "#34d399" : "#fb7185" }} /></span><span className="font-mono text-[11px] text-slate-300">{sgn(r.d, r.dig)}</span></span></td></tr>;
        })}</tbody>
      </table>
      <div className="space-y-2 text-[12px] min-w-0">
        <p className="text-slate-200">Vùng: <b>{s.zone ? ZONE_VI[s.zone.id] : "—"}</b>{s.zoneChanged && s.zonePrev ? <span className="text-amber-300"> · đổi từ {ZONE_VI[s.zonePrev.id]}</span> : ""}</p>
        {(up.length > 0 || dn.length > 0) && <p className="text-slate-300" data-testid="mx-chg-pillars">Trụ phiên {when(d.links?.impact?.date)}: {up.map((x) => <button key={x.symbol} type="button" aria-label={`Chọn ${x.symbol}`} onClick={() => onSelect(x.symbol)} className="mr-1 font-mono text-emerald-300 hover:underline">{x.symbol} {sgn(x.points)}</button>)}{dn.map((x) => <button key={x.symbol} type="button" aria-label={`Chọn ${x.symbol}`} onClick={() => onSelect(x.symbol)} className="mr-1 font-mono text-rose-300 hover:underline">{x.symbol} {sgn(x.points)}</button>)}</p>}
        <div>
          <p className="text-slate-400">Ngành đổi góc, RS 5 phiên {sectors.isLoading && !sectors.data ? "…" : `(${flips.length})`}</p>
          <ul className="flex flex-wrap gap-1 pt-1" data-testid="mx-flips">{flips.slice(0, 12).map((f) => <li key={f.industry}><button type="button" onClick={() => onIndustry(f.industry)} className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-slate-200 hover:border-amber-400/40">{f.industry}: <span className={QUADRANT[f.q0].text}>{QUADRANT[f.q0].label}</span> → <span className={QUADRANT[f.q1].text}>{QUADRANT[f.q1].label}</span></button></li>)}</ul>
        </div>
      </div>
    </div>
  );
}

function IndexTab({ onSelect, onIndustry }: { onSelect: (t: string) => void; onIndustry: (n: string | null) => void }) {
  const [live, setLive] = useState(false);
  const impact = useMatrixImpact(true, live);
  return (
    <div className="space-y-2" data-testid="mx-tab-index">
      <div role="group" aria-label="Thời điểm" className="inline-flex rounded border border-white/10 overflow-hidden bg-black/40">
        {([[false, "Phiên đã chốt"], [true, "Trong phiên"]] as const).map(([v, l]) => <button key={l} type="button" aria-pressed={live === v} onClick={() => setLive(v)} data-mx-impact-live={v ? "1" : "0"} className={`px-2 py-0.5 text-[11px] ${live === v ? "bg-amber-400/15 text-amber-200" : "text-slate-400"}`}>{l}</button>)}
      </div>
      {impact.isLoading && !impact.data && <p className="text-[12px] text-slate-400">Đang tải…</p>}
      {impact.error && !impact.data && <p className="text-[12px] text-rose-300" role="alert">Không khả dụng: {impact.error.message}</p>}
      {impact.data && <IndexWaterfall data={impact.data} onSelect={onSelect} />}
      {impact.data && <IndexImpactTable data={impact.data} onSelect={onSelect} onIndustry={onIndustry} />}
    </div>
  );
}

function SectorsTab({ scope, active, onIndustry }: { scope: MatrixScope; active: Set<string>; onIndustry: (n: string | null) => void }) {
  const sectors = useMatrixSectors(scope, true);
  if (sectors.error && !sectors.data) return <p className="text-[12px] text-rose-300" role="alert">Không khả dụng: {sectors.error.message}</p>;
  if (!sectors.data) return <p className="text-[12px] text-slate-400">Đang tải…</p>;
  return <SectorHeatmap data={sectors.data} active={active} onIndustry={onIndustry} />;
}
function MoversTab({ scope, onSelect }: { scope: MatrixScope; onSelect: (t: string) => void }) {
  const m = useMatrixMovers(scope, true);
  if (m.error && !m.data) return <p className="text-[12px] text-rose-300" role="alert">Không khả dụng: {m.error.message}</p>;
  if (!m.data) return <p className="text-[12px] text-slate-400">Đang tải…</p>;
  return <NotableMovers data={m.data} onSelect={onSelect} />;
}

const M3_NAMES = { SC1: "Xu hướng có độ rộng", SC2: "Chỉ số dẫn dắt", SC3: "Biến động / độ rộng rơi" };
const M4_NAMES = { SC1: "M4 Xu hướng có độ rộng", SC2: "M4 Chỉ số dẫn dắt", SC3: "M4 Cú sốc biến động", SC4: "M4 Độ rộng rơi nhanh" };

function ScenarioTab({ d, onSelect, onIndustry }: { d: MatrixOverview; onSelect: (t: string) => void; onIndustry: (n: string | null) => void }) {
  return (
    <div className="space-y-3" data-testid="mx-tab-scenario">
      <ScenarioStrip rows={(d.scenarioTimeline ?? []) as unknown as Record<string, string | null>[]} ids={["SC1", "SC2", "SC3"]} names={M3_NAMES} testId="mx-strip" />
      <ScenarioBoard d={d} onSelectTicker={onSelect} onIndustry={onIndustry} />
      <RiskChecklist flags={d.riskFlags ?? []} onSelectTicker={onSelect} onIndustry={onIndustry} />
    </div>
  );
}

function FlowTab({ d }: { d: MatrixOverview }) {
  const path = d.state?.path ?? [], rows = path.slice(-30), f = d.flow, c = d.state?.current;
  return (
    <div className="space-y-3" data-testid="mx-tab-flow">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[12px]">
        <div className="rounded border border-white/10 px-2.5 py-1.5"><span className="block text-[11px] text-slate-400">Khối ngoại, phiên cuối</span><b className="font-mono text-slate-100">{bn(f.foreign?.net)}</b></div>
        <div className="rounded border border-white/10 px-2.5 py-1.5"><span className="block text-[11px] text-slate-400">Khối ngoại, 5 phiên</span><b className="font-mono text-slate-100">{bn(f.foreign?.net5)}</b></div>
        <div className="rounded border border-white/10 px-2.5 py-1.5"><span className="block text-[11px] text-slate-400">% thanh khoản, 5 phiên</span><b className="font-mono text-slate-100">{ok(c?.fnr5) ? `${sgn(c?.fnr5)}%` : "—"}</b> <span className="text-[11px] text-slate-400">{ok(c?.fnrZ) ? `${sgn(c?.fnrZ, 1)} σ` : ""}</span></div>
        <div className="rounded border border-white/10 px-2.5 py-1.5"><span className="block text-[11px] text-slate-400">Lệnh chủ động</span><b className="font-mono text-slate-100">{ok(c?.ldZ) ? `${sgn(c?.ldZ, 1)} σ` : "—"}</b> <span className="text-[11px] text-slate-400">{f.foreign?.streak ? `chuỗi ${f.foreign.streak > 0 ? "mua" : "bán"} ${Math.abs(f.foreign.streak)}` : ""}</span></div>
      </div>
      <SignedBars rows={rows.map((r) => ({ date: r.date, v: r.fnr1 }))} label="Khối ngoại ròng / giá trị giao dịch, từng phiên" testId="mx-flow-bars" />
      <SignedBars rows={rows.map((r) => ({ date: r.date, v: r.ldZ }))} unit=" σ" digits={1} label="Lệnh chủ động, chuẩn hoá trung vị" testId="mx-flow-ld" height={76} />
    </div>
  );
}

const flowSources = (d: MatrixOverview) => (d.flow.sources.length ? d.flow.sources.map((x) => (x === "IFE" ? "dấu chân lệnh" : "khối ngoại đã chốt phiên")).join(" + ") : "chưa có nguồn");

function EvidenceTab({ d, scope }: { d: MatrixOverview; scope: MatrixScope }) {
  const sig = useMatrixSignals(scope, true);
  const r = d.regime, g4 = sig.data?.m4;
  const rows: { name: string; g: "A" | "B" | "C"; result: string }[] = [
    { name: "Độ rộng, McClellan, khoảng cách tham gia", g: "B", result: `Đếm trực tiếp ${d.breadth.daily?.eligibleCount ?? "—"}/${d.breadth.daily?.scopeSize ?? "—"} mã, ${d.scope.label}` },
    { name: "Biến động Yang–Zhang", g: "B", result: "OHLC VN-Index, 20 phiên; phân vị 250 phiên trước" },
    { name: "Dòng tiền", g: "B", result: `${flowSources(d)}; z theo trung vị và MAD, chặn ±4` },
    { name: "Tác động VN-Index", g: "B", result: d.links?.impact?.check ? `Lệch ${vn(d.links.impact.check.diffPp, 3)} điểm % so với thực tế phiên ${when(d.links.impact.date)}` : "Chỉ có ở phạm vi toàn HOSE" },
    { name: "Bản đồ trạng thái, MS-r1", g: "B", result: "Trung bình z trọng số đều, mô tả hiện tại, không phải dự báo" },
    ...(d.scenarios ?? []).map((s) => ({ name: `${s.id} ${s.title}`, g: "C" as const, result: s.validation.summary })),
    ...(d.forecast ? [{ name: "Tần suất VN-Index tăng sau 10 phiên", g: "C" as const, result: `${vn(d.forecast.p * 100, 0)}%, nền ${vn(d.forecast.baseRate * 100, 0)}%; AUC ${vn(d.forecast.holdout.auc ?? null, 2)}; huấn luyện trên VN100` }] : []),
    ...(d.m4?.current ?? []).map((x) => ({ name: `M4 ${x.id} ${x.title}`, g: "C" as const, result: `Sổ tiến: ${g4?.live?.[x.id]?.n ?? 0} đợt đã chấm 10 phiên; cần tối thiểu 12` })),
  ];
  return (
    <div className="space-y-3 text-[12px]" data-testid="mx-tab-evidence">
      <table className="w-full"><thead><tr className="text-[11px] text-slate-400"><th className="text-left font-normal">Thành phần</th><th className="font-normal px-2">Cấp</th><th className="text-left font-normal">Kết quả</th></tr></thead>
        <tbody>{rows.map((x) => <tr key={x.name} className="border-t border-white/5" data-testid="mx-ev-row"><td className="py-1 text-slate-200 align-top">{x.name}</td><td className="px-2 text-center align-top"><Grade g={x.g} /></td><td className="py-1 text-slate-400">{x.result}</td></tr>)}</tbody></table>
      {d.m4?.timeline?.length ? <ScenarioStrip rows={d.m4.timeline as unknown as Record<string, string | null>[]} ids={["SC1", "SC2", "SC3", "SC4"]} names={M4_NAMES} testId="mx-strip-m4" /> : null}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SignalJournal data={sig.data} />
        <ForecastBlock f={d.forecast} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-1">
          <h3 className="text-[12px] font-bold text-slate-200">Nguồn dữ liệu</h3>
          <ul className="space-y-1" data-testid="mx-sources">{d.dataHealth.sources.map((s) => { const h = HEALTH_VI[s.status], t = TONE[h.tone]; return <li key={s.id} className="flex items-start gap-2 text-[11px]"><span className={`shrink-0 ${t.fg}`} aria-hidden>{h.glyph}</span><span className="flex-1 min-w-0 text-slate-200">{s.label}<span className="block text-slate-400">{s.detail ?? ""}</span></span><span className={`shrink-0 text-right ${t.fg}`}>{s.kind === "intraday" && !d.session.live ? "Ngoài giờ" : h.text}<span className="block text-slate-400">{when(s.asOf)}</span></span></li>; })}</ul>
        </div>
        <div className="space-y-1 text-[11px] text-slate-400">
          <h3 className="text-[12px] font-bold text-slate-200">Phương pháp</h3>
          {r.definition && <p>{r.definition}</p>}
          {r.probabilities && <p>HMM {when(r.hmmAsOf)}: giảm {vn(r.probabilities.bear * 100, 0)}%, ngang {vn(r.probabilities.neutral * 100, 0)}%, tăng {vn(r.probabilities.bull * 100, 0)}%. Đo trạng thái biến động giá, không phải nhãn xu hướng.</p>}
          {r.stageOdds && <p>Cấu trúc ngày {r.stageOdds.stage}, {r.stageOdds.age} phiên{r.stageOdds.up != null ? `: P(sang tăng trong 10 phiên) ${vn(r.stageOdds.up * 100, 0)}%, P(sang giảm) ${vn((r.stageOdds.down ?? 0) * 100, 0)}%` : ""}. {r.stageOdds.label}.</p>}
          <p>{d.flow.note} Tự doanh: chưa có nguồn.</p>
          <p>X = trung bình z của lợi suất 20 phiên, độ rộng MA20, McClellan, dòng tiền. Y = trung bình z của biến động, độ rộng giảm 5 phiên, độ tập trung trụ. Vùng đệm ±0,25.</p>
          <p>Kịch bản M3-r1 hiện hành; M4-r1 chạy song song, sổ riêng. {d.version}.</p>
        </div>
      </div>
    </div>
  );
}

const NO_SET = new Set<string>();
const NOOP = () => {};

export default function TradingMatrixPanel({ activeIndustries = NO_SET, onIndustry = NOOP, onSelectTicker = NOOP }: {
  /** Bộ lọc ngành hiện tại của bảng (cùng state với ScannerToolbar). */
  activeIndustries?: Set<string>; onIndustry?: (name: string | null) => void; onSelectTicker?: (ticker: string) => void;
} = {}) {
  const [open, setOpenState] = useState(() => { try { return window.localStorage.getItem(KEY_OPEN) === "1"; } catch { return false; } });
  const [scope, setScopeState] = useState<MatrixScope>(() => { try { const v = window.localStorage.getItem(KEY_SCOPE); return v === "VN30" || v === "UNIVERSE" ? v : "VNINDEX"; } catch { return "VNINDEX"; } });
  const [tab, setTabState] = useState<TabId>(() => { try { const v = window.localStorage.getItem(KEY_TAB); return isTab(v) ? v : "change"; } catch { return "change"; } });
  const [replay, setReplay] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);
  const setOpen = (v: boolean) => { setOpenState(v); try { window.localStorage.setItem(KEY_OPEN, v ? "1" : "0"); } catch { /* bỏ qua */ } };
  const setScope = (v: MatrixScope) => { setScopeState(v); setReplay(null); try { window.localStorage.setItem(KEY_SCOPE, v); } catch { /* bỏ qua */ } };
  const setTab = (v: TabId) => { setTabState(v); try { window.localStorage.setItem(KEY_TAB, v); } catch { /* bỏ qua */ } };
  const openTab = (t: TabId) => { setTab(t); setOpen(true); };
  const { data, error, isLoading } = useTradingMatrix(scope);
  const others = SCOPES.map((s) => s.id).filter((s) => s !== scope);
  const o1 = useTradingMatrix(others[0], compare), o2 = useTradingMatrix(others[1], compare);
  const path = data?.state?.path ?? [];
  const idx = replay != null && replay < path.length ? replay : path.length - 1;
  const point = path[idx] ?? null;
  const replaying = replay != null && idx !== path.length - 1;
  const bad = data && (data.dataHealth.status === "PARTIAL" || data.dataHealth.status === "UNAVAILABLE");
  const compared = compare ? [o1, o2].flatMap((o, i) => (o.data?.state ? [{ scope: others[i], x: o.data.state.x, y: o.data.state.y }] : [])) : [];

  return (
    <section className="rounded-xl px-3 py-2.5" style={box} aria-label="Trạng thái thị trường" data-testid="trading-matrix">
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5"><Grid3x3 className="w-3.5 h-3.5 text-amber-300" aria-hidden /> Trạng thái thị trường</h2>
        <div role="group" aria-label="Phạm vi" className="inline-flex rounded border border-white/10 overflow-hidden bg-black/40">
          {SCOPES.map((s) => <button key={s.id} type="button" aria-pressed={scope === s.id} onClick={() => setScope(s.id)} data-mx-scope={s.id} className={`px-2 py-0.5 text-[11px] font-semibold ${scope === s.id ? "bg-amber-400/15 text-amber-200" : "text-slate-400 hover:text-slate-200"}`}>{s.label}</button>)}
        </div>
        {point && <span className="text-[11px] text-slate-400" data-testid="mx-asof">Phiên {when(point.date)}{replaying ? " · đang xem lại" : ""}</span>}
        {bad && <button type="button" onClick={() => openTab("evidence")} className="text-[11px] text-amber-300 hover:underline" data-testid="mx-health-warn">{HEALTH_VI[data.dataHealth.status].glyph} {HEALTH_VI[data.dataHealth.status].text}</button>}
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mx-detail" className="ml-auto text-[11px] px-2 py-0.5 rounded border border-white/10 text-slate-300 hover:text-amber-200 hover:border-amber-400/40">{open ? "Thu gọn ▴" : "Chi tiết ▾"}</button>
      </div>
      {error && !data ? (
        <p className="text-[12px] text-rose-300" role="alert">Không khả dụng: {error.message}</p>
      ) : !data ? (
        <div className={`h-[92px] rounded-lg bg-slate-800/20 ${isLoading ? "animate-pulse" : ""}`} aria-hidden />
      ) : (
        <>
          <div className="mb-1.5 flex flex-wrap items-center gap-x-1.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-2.5 py-1 text-[13px] font-semibold text-slate-100" data-testid="mx-headline">
            {(data.state?.headline ?? []).map((h, i) => <span key={h.key} className="inline-flex items-center gap-1.5">{i > 0 && <span className="text-slate-500" aria-hidden>·</span>}<button type="button" className="hover:text-amber-200" onClick={() => openTab(isTab(h.tab) ? h.tab : "change")} data-testid={`mx-hl-${h.key}`}>{h.text}</button></span>)}
            {!data.state && <span className="text-slate-400">Chưa đủ dữ liệu</span>}
          </div>
          {point ? (
            open ? (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-2">
                <div className="min-w-0 rounded-lg border border-white/10 p-1.5">
                  <StateMap path={path} index={idx} others={compared} />
                  <div className="flex flex-wrap items-center gap-2 px-1 pt-1 text-[11px] text-slate-400">
                    <label className="flex flex-1 min-w-[160px] items-center gap-1.5">Xem lại <input type="range" min={0} max={path.length - 1} value={idx} onChange={(e) => { const v = Number(e.target.value); setReplay(v === path.length - 1 ? null : v); }} aria-label="Chọn phiên" data-testid="mx-replay" className="flex-1 accent-amber-400" /></label>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} data-testid="mx-compare" className="accent-amber-400" />So 3 phạm vi</label>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 min-w-0 content-start"><Tiles p={point} path={path.slice(0, idx + 1)} open={openTab} /></div>
              </div>
            ) : <div className="grid grid-cols-2 xl:grid-cols-4 gap-2" data-testid="mx-tiles"><Tiles p={point} path={path} open={openTab} /></div>
          ) : null}
          {open && (
            <div id="mx-detail" className="mt-2">
              <div role="tablist" aria-label="Chi tiết trạng thái thị trường" className="flex gap-1 overflow-x-auto border-b border-white/10">
                {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-mx-tab={t.id} className={`shrink-0 whitespace-nowrap border-b-2 px-2.5 py-1 text-[12px] font-semibold ${tab === t.id ? "border-amber-400 text-amber-200" : "border-transparent text-slate-400 hover:text-slate-200"}`}>{t.label}</button>)}
              </div>
              <div role="tabpanel" className="max-h-[420px] overflow-y-auto pt-2 pr-1" data-testid="mx-tabpanel">
                {tab === "change" && <ChangeTab d={data} scope={scope} onIndustry={onIndustry} onSelect={onSelectTicker} />}
                {tab === "index" && <IndexTab onSelect={onSelectTicker} onIndustry={onIndustry} />}
                {tab === "sectors" && <SectorsTab scope={scope} active={activeIndustries} onIndustry={onIndustry} />}
                {tab === "movers" && <MoversTab scope={scope} onSelect={onSelectTicker} />}
                {tab === "scenario" && <ScenarioTab d={data} onSelect={onSelectTicker} onIndustry={onIndustry} />}
                {tab === "flow" && <FlowTab d={data} />}
                {tab === "evidence" && <EvidenceTab d={data} scope={scope} />}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
