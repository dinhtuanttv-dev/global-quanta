// Bảng phụ PHÂN TÍCH CHUYÊN SÂU của bộ lọc (Screener Engine v2 / S5) — mở bằng nhấn đúp / nút ▸ trên dòng mã,
// đóng bằng nhấn đúp lại hoặc Esc (cùng cách dùng với dòng phụ "Phân tích khối lượng" của Siêu Quét AI).
// Nội dung: mẫu hình mô phỏng, kế hoạch giao dịch, sóng Elliott (đang sóng mấy), Fibonacci + hợp lưu, chấm điểm
// từng yếu tố, khối lượng 30 phiên, khối ngoại 20 phiên. Không mở biểu đồ — có nút riêng nếu muốn mở.
import { useMemo, type ReactNode } from "react";
import { LineChart, X, Cpu } from "lucide-react";
import { useTaSeries } from "../../../hooks/useTaSeries";
import { useVolumeAnalysis, type VolumeAnalysis } from "../../../hooks/useVolumeAnalysis";
import type {
  TechnicalFilterComponent, TechnicalFilterResponse, TechnicalFilterResult, TechnicalFilterStrategy,
} from "../../../hooks/useTechnicalFilter";
import { elliottMtf } from "../../../lib/quant-core/elliott/mtf";
import { ELLIOTT_VN_NOTE } from "../../../lib/quant-core/elliott/vnValidation";
import PatternSketch from "./PatternSketch";

const UP = "#059669";
const DOWN = "#e11d48";
const ACCENT = "#0284c7";
const GRID = "rgba(148,163,184,0.18)";

const fmtP = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("vi-VN"));
const fmtPct = (v?: number | null, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")}%`);
const fmtBn = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${v < 0 ? "−" : ""}${(Math.abs(v) / 1e9).toFixed(1).replace(".", ",")} tỷ`);
const fmtX = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(2).replace(".", ",")}×`);

/** Giá trị đo của một thành phần, theo đúng đơn vị của nó. */
export function componentValue(c: TechnicalFilterComponent): string {
  const v = c.value;
  if (v == null) return "chưa có dữ liệu";
  if (typeof v === "boolean") return v ? "có" : "không";
  switch (c.key) {
    case "cQuarter": case "cAccel": case "cRevenue": case "aAnnual": return v >= 9.99 ? "từ lỗ sang lãi" : fmtPct(v * 100, 0);
    case "aRoe": return fmtPct(v * 100, 1).replace("+", "");
    case "nHigh": return `${fmtPct(v * 100, 1)} so đỉnh`;
    case "sVolume": case "sUpDown": case "volume": return fmtX(v);
    case "lRs": return `RS ${Math.round(v)}`;
    case "lSector": return `top ${Math.max(1, Math.round((1 - v) * 100))}%`;
    case "iForeign": case "foreign": return fmtBn(v);
    case "mDistribution": return `${v} ngày`;
    case "handleConfluence": return `hồi ${v.toFixed(0)}% cạnh phải`;
    case "moneyFlow": return `MFI ${v.toFixed(0)}`;
    case "dayGain": return fmtPct(v, 1);
    case "volumeProfile": return `${fmtPct(v * 100, 1)} so VAH`;
    case "closeStrength": return `${Math.round(v * 100)}% thân nến`;
    case "context": return `biên độ ${v.toFixed(0)}%`;
    case "macd": return v >= 0 ? "trên tín hiệu" : "dưới tín hiệu";
    default: return String(Math.round(v * 100) / 100);
  }
}

export function Card({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg p-2.5 min-w-0 ${className}`} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h3 className="text-[10px] text-slate-300 font-semibold uppercase tracking-wide">{title}</h3>
        {right && <div className="text-[9px] text-slate-500">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-md px-2 py-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="text-[8px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-[13px] font-bold font-mono ${tone === "up" ? "text-emerald-400" : tone === "down" ? "text-rose-400" : "text-slate-100"}`}>{value}</div>
      {sub && <div className="text-[8px] text-slate-500">{sub}</div>}
    </div>
  );
}

/** Vòng điểm 0–100. */
export function ScoreRing({ score, grade }: { score: number; grade?: string }) {
  const r = 22, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, score / 100));
  const color = grade === "A" ? UP : grade === "B" ? ACCENT : "#64748b";
  return (
    <svg viewBox="0 0 56 56" className="w-14 h-14 shrink-0" role="img" aria-label={`Điểm ${score}/100, hạng ${grade ?? "—"}`}>
      <circle cx={28} cy={28} r={r} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={5} />
      <circle cx={28} cy={28} r={r} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round"
        strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 28 28)" />
      <text x={28} y={27} textAnchor="middle" fontSize={15} fontWeight={800} fill="#e2e8f0">{score}</text>
      <text x={28} y={39} textAnchor="middle" fontSize={8} fill="#94a3b8">hạng {grade ?? "—"}</text>
    </svg>
  );
}

export function VolumeBars({ data }: { data: VolumeAnalysis["trend"] }) {
  const W = 300, H = 80;
  const max = Math.max(...data.bars30.map((b) => b.volume), data.ma20Volume ?? 0, 1);
  const bw = W / Math.max(1, data.bars30.length);
  const y = (v: number) => H - (v / max) * (H - 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" role="img" aria-label="Khối lượng 30 phiên">
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke={GRID} />
      {data.bars30.map((b, i) => {
        const h = Math.max(1, H - y(b.volume)), c = b.up ? UP : DOWN;
        return (
          <g key={b.date}>
            <rect x={i * bw + 1.5} y={H - h} width={Math.max(1, bw - 3)} height={h} rx={1.5} fill={b.up ? c : "none"} stroke={c} strokeWidth={b.up ? 0 : 1.2} />
            <rect x={i * bw} y={0} width={bw} height={H} fill="transparent"><title>{`${b.date}: ${fmtP(b.volume)} cp · ${b.up ? "tăng" : "giảm"}`}</title></rect>
          </g>
        );
      })}
      {data.ma20Volume ? <line x1={0} x2={W} y1={y(data.ma20Volume)} y2={y(data.ma20Volume)} stroke="#94a3b8" strokeDasharray="4 3" /> : null}
    </svg>
  );
}

export function ForeignBars({ series }: { series: VolumeAnalysis["foreign"]["netSeries20"] }) {
  const W = 300, H = 70, mid = H / 2;
  const max = Math.max(...series.map((s) => Math.abs(s.netVal)), 1);
  const bw = W / Math.max(series.length, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[70px]" role="img" aria-label="Khối ngoại mua bán ròng 20 phiên">
      <line x1={0} x2={W} y1={mid} y2={mid} stroke={GRID} />
      {series.map((s, i) => {
        const h = Math.max(1, (Math.abs(s.netVal) / max) * (mid - 2)), up = s.netVal >= 0;
        return (
          <g key={s.date}>
            <rect x={i * bw + 1.5} y={up ? mid - h : mid} width={Math.max(1, bw - 3)} height={h} rx={1.5} fill={up ? UP : "none"} stroke={up ? UP : DOWN} strokeWidth={up ? 0 : 1.2} />
            <rect x={i * bw} y={0} width={bw} height={H} fill="transparent"><title>{`${s.date}: ${up ? "mua" : "bán"} ròng ${fmtBn(Math.abs(s.netVal))}`}</title></rect>
          </g>
        );
      })}
    </svg>
  );
}

const FACTOR_NAME: Record<string, string> = { C: "Lợi nhuận quý", A: "Lợi nhuận năm", N: "Đỉnh mới", S: "Cung – cầu", L: "Dẫn dắt", I: "Dòng tiền tổ chức", M: "Thị trường" };

function ComponentList({ components, strategy }: { components: TechnicalFilterComponent[]; strategy: TechnicalFilterStrategy }) {
  const rows = components.filter((c) => strategy === "camslim" || c.max > 0 || ["foreign", "closeStrength", "context"].includes(c.key));
  return (
    <ul className="space-y-1" data-testid="deep-components">
      {rows.map((c) => (
        <li key={c.key} className="grid grid-cols-[14px_1fr_auto] items-center gap-1.5 text-[10px]">
          <span className={`w-3.5 h-3.5 rounded-[3px] text-[8px] font-black leading-[14px] text-center ${c.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-500"}`}
            title={c.factor ? FACTOR_NAME[c.factor] : "Thông tin"}>{c.factor ?? "i"}</span>
          <span className="text-slate-300 truncate" title={c.label}>{c.ok ? "✓" : "✗"} {c.label}</span>
          <span className="text-slate-400 font-mono text-right whitespace-nowrap">
            {componentValue(c)}{c.max > 0 && <span className="text-slate-500"> · {c.points}/{c.max}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  strategy: TechnicalFilterStrategy;
  result: TechnicalFilterResult;
  doc: TechnicalFilterResponse;
  onClose: () => void;
  onOpenChart: (ticker: string) => void;
  /** Mở AI Chart Vision (đa khung) cho mã. */
  onOpenVision?: (ticker: string) => void;
}

export default function ScreenerDeepPanel({ strategy, result, doc, onClose, onOpenChart, onOpenVision }: Props) {
  const series = useTaSeries(result.ticker);
  const { data: vol } = useVolumeAnalysis(result.ticker);
  // Elliott chạy trên trình duyệt (quant-core) — chỉ khi dòng được mở.
  // E6: hai khung — tuần (gộp từ chuỗi ngày) cho bối cảnh lớn, ngày cho cấu trúc đang chạy.
  const mtf = useMemo(() => (series.bars.length >= 60 ? elliottMtf(series.bars) : null), [series.bars]);
  const ew = mtf?.day ?? null;
  const plan = result.plan ?? result.metrics.plan;
  const h = result.handle;
  const p = result.pattern;
  const last = series.bars[series.bars.length - 1];
  const evidence = doc.evidence;
  const gradeStats = evidence?.byGrade?.[result.grade ?? "C"];

  const fibRows: { label: string; price: number; hot?: boolean }[] = [];
  if (h) {
    for (const f of h.fib) fibRows.push({ label: `Fib ${(f.ratio * 100).toFixed(1).replace(".", ",")}% cạnh phải`, price: f.price });
    for (const z of h.wave?.wave4Zone ?? []) fibRows.push({ label: `Sóng 4: ${String(z.ratio).replace(".", ",")} × sóng 3`, price: z.price });
    if (h.abc) fibRows.push({ label: "Sóng C = 1,0 × A (tay cầm)", price: h.abc.cTarget });
    if (h.avwap) fibRows.push({ label: "AVWAP từ đáy cốc", price: h.avwap });
    if (h.poc) fibRows.push({ label: "POC của cốc", price: h.poc });
    if (h.best) for (const r of fibRows) r.hot = r.price >= h.best.low * 0.999 && r.price <= h.best.high * 1.001;
  }
  if (!h && series.bars.length >= 60) {
    // Base Breakout: Fibonacci của biên độ 52 tuần + Volume Profile nền + đáy nền.
    const w = series.bars.slice(-250);
    const hi = Math.max(...w.map((b) => b.high)), lo = Math.min(...w.map((b) => b.low));
    for (const r of [0.236, 0.382, 0.5, 0.618]) fibRows.push({ label: `Fib ${(r * 100).toFixed(1).replace(".", ",")}% biên độ 52 tuần`, price: hi - r * (hi - lo) });
    const vp = result.metrics.vp;
    if (vp) { fibRows.push({ label: "POC nền 60 phiên", price: vp.poc }, { label: "VAH nền 60 phiên", price: vp.vah }, { label: "VAL nền 60 phiên", price: vp.val }); }
    if (result.base) fibRows.push({ label: "Đáy nền 10 phiên", price: result.base.low });
    const pivot = result.metrics.basePivot;
    if (pivot) for (const r of fibRows) r.hot = Math.abs(r.price / pivot - 1) <= 0.015;
  }
  for (const l of ew?.levels.slice(0, 4) ?? []) fibRows.push({ label: `Elliott: ${l.label}`, price: l.price });
  fibRows.sort((a, b) => b.price - a.price);

  return (
    <div className="p-3 font-sans space-y-2" style={{ background: "linear-gradient(180deg, rgba(2,132,199,0.07), rgba(2,6,15,0.2))" }} data-testid="screener-deep-panel">
      {/* đầu bảng */}
      <header className="flex flex-wrap items-center gap-3">
        <ScoreRing score={result.metrics.score} grade={result.grade} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-lg font-black text-amber-400 tracking-wide">{result.ticker}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${result.status === "BREAKOUT" ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300"}`}>
              {result.status === "BREAKOUT" ? "BREAKOUT" : `SETUP · cách pivot ${fmtPct(result.metrics.belowPivotPct)}`.replace("+", "")}
            </span>
            {evidence && <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${evidence.label === "VALIDATED" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-300"}`}>{evidence.label}</span>}
            {doc.market?.up === false && <span className="text-[8px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 font-bold">M chưa thuận</span>}
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {result.name ?? ""}{result.sector ? ` · ${result.sector}` : ""} · {strategy === "camslim" ? "CAN SLIM · cốc tay cầm" : "Base Breakout"} · tín hiệu {result.date}
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          {onOpenVision && (
            <button type="button" onClick={() => onOpenVision(result.ticker)} data-testid="open-vision" className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20">
              <Cpu className="w-3 h-3" />AI Chart Vision
            </button>
          )}
          <button type="button" onClick={() => onOpenChart(result.ticker)} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300">
            <LineChart className="w-3 h-3" />Mở biểu đồ TA
          </button>
          <button type="button" onClick={onClose} aria-label="Đóng phân tích chuyên sâu" className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
        <Tile label="Giá" value={fmtP(last?.close ?? result.liquidity?.price)} sub={last ? `phiên ${last.date}` : undefined} />
        <Tile label={strategy === "camslim" ? "Pivot" : "Pivot nền"} value={fmtP(result.metrics.pivot ?? result.metrics.basePivot)} />
        <Tile label="RS O'Neil" value={result.metrics.rs != null ? String(result.metrics.rs) : "—"} tone={(result.metrics.rs ?? 0) >= 80 ? "up" : undefined} sub={strategy === "camslim" ? "≥ 80 = dẫn dắt" : undefined} />
        <Tile label="KL so TB" value={fmtX(result.metrics.volRatio)} tone={(result.metrics.volRatio ?? 0) >= 1.5 ? "up" : undefined} />
        <Tile label="GTGD TB20" value={fmtBn(result.liquidity?.avgValue20)} />
        <Tile label="KN ròng 20 phiên" value={fmtBn(vol?.foreign.net20Val ?? result.metrics.foreignNet20)} tone={(vol?.foreign.net20Val ?? 0) > 0 ? "up" : (vol?.foreign.net20Val ?? 0) < 0 ? "down" : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <Card title="Mẫu hình mô phỏng" className="lg:col-span-2"
          right={p ? `cốc ${p.cupBars} phiên · sâu ${p.depthPct.toFixed(0)}% · tay cầm ${p.handleBars} phiên · ${p.handleDepthPct.toFixed(0)}%${p.uShape ? " · đáy chữ U" : ""}${p.handleVolDry ? " · KL tay cầm cạn" : ""}` : result.base ? `nền 10 phiên · biên ${fmtPct(result.metrics.baseRangePct).replace("+", "")}` : undefined}>
          {series.isLoading && !series.bars.length
            ? <div className="text-[10px] text-slate-500 py-10 text-center">Đang tải nến…</div>
            : series.error && !series.bars.length
              ? <div role="alert" className="text-[10px] text-rose-300 py-10 text-center">Không tải được nến {result.ticker}: {String((series.error as Error)?.message ?? series.error)}</div>
              : <PatternSketch bars={series.bars} result={result} strategy={strategy} />}
        </Card>

        <Card title="Kế hoạch giao dịch" right="tham khảo, không phải khuyến nghị">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px]">
            <dt className="text-slate-500">Vào lệnh</dt><dd className="text-right font-mono text-slate-100">{fmtP(plan?.entry)}{result.plan?.buyZoneTop ? ` → ${fmtP(result.plan.buyZoneTop)}` : ""}</dd>
            <dt className="text-slate-500">Cắt lỗ</dt><dd className="text-right font-mono text-rose-300">{fmtP(plan?.stop)} <span className="text-slate-500">({fmtPct(-(plan?.riskPct ?? NaN))})</span></dd>
            <dt className="text-slate-500">Mục tiêu</dt><dd className="text-right font-mono text-emerald-300">{fmtP(plan?.target)}</dd>
            <dt className="text-slate-500">Lợi nhuận / rủi ro</dt><dd className="text-right font-mono text-slate-200">{plan?.rr ? `${plan.rr.toFixed(1).replace(".", ",")} R` : "—"}</dd>
          </dl>
          {h?.earlyEntry && (
            <div className="mt-2 rounded-md p-2 text-[10px]" style={{ background: "rgba(217,119,6,0.10)", border: "1px solid rgba(217,119,6,0.35)" }} data-testid="early-entry">
              <div className="font-semibold text-amber-200">◆ Mua sớm trong tay cầm tại vùng hợp lưu</div>
              <div className="text-slate-300 font-mono">{fmtP(h.earlyEntry.price)} · cắt lỗ {fmtP(h.earlyEntry.stop)} ({fmtPct(-h.earlyEntry.riskPct)})</div>
              <div className="text-slate-500">{h.handleAtConfluence ? "Đáy tay cầm đã chạm vùng hợp lưu." : "Đáy tay cầm chưa chạm vùng hợp lưu."} Chưa kiểm định (INFERRED).</div>
            </div>
          )}
          {gradeStats?.n ? (
            <p className="mt-2 text-[9px] text-slate-500 leading-relaxed">
              Lịch sử hạng {result.grade}: {gradeStats.n} lệnh · thắng {gradeStats.winRate?.toFixed(0)}% · PF {gradeStats.profitFactor?.toFixed(2).replace(".", ",") ?? "—"}
              {evidence && evidence.all.n < 100 ? " · mẫu nhỏ, chỉ tham khảo" : ""}
            </p>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Card title="Sóng Elliott" right={ew ? `tới ${ew.asOf} · INFERRED` : undefined}>
          {ew ? (
            <div className="space-y-1.5 text-[10px]" data-testid="deep-elliott">
              <div className="text-[12px] font-bold text-cyan-200">{ew.label}</div>
              {ew.weight != null && (
                <div title="Trọng số tương đối giữa các kịch bản sóng (softmax điểm mô hình) — không phải xác suất xảy ra">
                  <div className="flex justify-between text-[9px] text-slate-500"><span>Trọng số tương đối (chưa hiệu chỉnh)</span><span className="font-mono text-slate-300">{Math.round(ew.weight * 100)}%</span></div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.round(ew.weight * 100)}%`, background: ACCENT }} /></div>
                </div>
              )}
              {ew.invalidation && <div className="text-slate-400">Vô hiệu nếu giá {ew.invalidation.side === "below" ? "thủng" : "vượt"} <span className="font-mono text-slate-200">{fmtP(ew.invalidation.price)}</span></div>}
              {ew.alternatives.length > 0 && (
                <ul className="text-[9px] text-slate-500 space-y-0.5">
                  {ew.alternatives.map((a, i) => <li key={i}>Phương án {i + 2}: {a.label}{a.weight != null ? ` · trọng số ${Math.round(a.weight * 100)}%` : ""}</li>)}
                </ul>
              )}
              {h?.wave && <div className="text-slate-400">Cạnh phải cốc: <span className="text-slate-200">{h.wave.count}</span></div>}
              {mtf?.week && (
                <div className="rounded px-1.5 py-1 space-y-0.5" style={{ background: "rgba(148,163,184,0.05)" }} data-testid="deep-elliott-week">
                  <div className="text-[9px] text-slate-500">Khung tuần{mtf.week.partial ? " (tuần chưa hết)" : ""}</div>
                  <div className="text-[10px] font-semibold text-slate-200">{mtf.week.label}</div>
                  <div className="text-[9px] text-slate-400">{mtf.relationText}</div>
                </div>
              )}
              {mtf && mtf.osc.day.wave !== "none" && <div className="text-[9px] text-slate-400" data-testid="deep-elliott-osc">{mtf.osc.day.label}</div>}
              <p className="text-[8px] text-slate-600">Trọng số = so sánh tương đối giữa các kịch bản, không phải xác suất. {ELLIOTT_VN_NOTE}</p>
            </div>
          ) : <div className="text-[10px] text-slate-500 py-4">{series.isLoading ? "Đang đếm sóng…" : "Chưa có kịch bản sóng hợp lệ."}</div>}
        </Card>

        <Card title="Fibonacci & hợp lưu" right={h ? `tay cầm hồi ${h.retracePct.toFixed(0)}% cạnh phải` : "◆ = trong 1,5% quanh pivot"}>
          {fibRows.length ? (
            <ul className="space-y-0.5 text-[10px]" data-testid="deep-fib">
              {fibRows.map((r, i) => (
                <li key={i} className={`flex justify-between gap-2 rounded px-1 ${r.hot ? "bg-amber-500/10" : ""}`}>
                  <span className={`truncate ${r.hot ? "text-amber-200" : "text-slate-400"}`}>{r.hot ? "◆ " : ""}{r.label}</span>
                  <span className="font-mono text-slate-200">{fmtP(r.price)}</span>
                </li>
              ))}
              {h?.best && <li className="pt-1 text-[9px] text-slate-500">Cụm mạnh nhất: {fmtP(h.best.low)}–{fmtP(h.best.high)} · {h.best.sources.length} nguồn · trọng số {h.best.weight}</li>}
            </ul>
          ) : <div className="text-[10px] text-slate-500 py-4">Không có mức Fibonacci cho tín hiệu này.</div>}
        </Card>

        <Card title={strategy === "camslim" ? "CAN SLIM — 7 yếu tố" : "Thành phần điểm"} right={`${result.metrics.score}/100`}>
          {result.components?.length ? <ComponentList components={result.components} strategy={strategy} /> : <div className="text-[10px] text-slate-500">—</div>}
          {result.fundamentals && <p className="mt-1.5 text-[9px] text-slate-500">BCTC gần nhất đã công bố: {result.fundamentals.latestQuarter} · tăng trưởng đo bằng LNST</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Card title="Khối lượng 30 phiên" right={vol ? `KL tăng/giảm 20 phiên ${fmtX(vol.trend.upDownVolumeRatio20)}` : undefined}>
          {vol ? <VolumeBars data={vol.trend} /> : <div className="text-[10px] text-slate-500 py-6 text-center">Đang tải khối lượng…</div>}
          <div className="flex gap-3 text-[9px] text-slate-400 mt-1">
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: UP }} />Phiên tăng</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ border: `1.2px solid ${DOWN}` }} />Phiên giảm</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-slate-400" />TB20</span>
          </div>
        </Card>
        <Card title="Khối ngoại 20 phiên" right={vol ? `5 phiên ${fmtBn(vol.foreign.net5Val)} · 20 phiên ${fmtBn(vol.foreign.net20Val)}` : undefined}>
          {vol ? <ForeignBars series={vol.foreign.netSeries20} /> : <div className="text-[10px] text-slate-500 py-6 text-center">Đang tải khối ngoại…</div>}
          <div className="flex gap-3 text-[9px] text-slate-400 mt-1">
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: UP }} />Mua ròng (trên trục)</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ border: `1.2px solid ${DOWN}` }} />Bán ròng (dưới trục)</span>
            {strategy === "base-breakout" && <span className="text-slate-500">khối ngoại không tính điểm (bằng chứng ngược)</span>}
          </div>
        </Card>
      </div>
      <p className="text-[9px] text-slate-600">Nhấn đúp vào dòng hoặc Esc để đóng · {doc.disclaimer} · {series.priceBasis === "ADJUSTED_CUMULATIVE" ? "giá điều chỉnh cộng dồn" : series.priceBasis}{series.warnings.length ? ` · ${series.warnings[0]}` : ""}</p>
    </div>
  );
}
