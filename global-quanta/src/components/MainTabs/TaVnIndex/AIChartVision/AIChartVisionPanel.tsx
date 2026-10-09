// AI Chart Vision v2 — phân tích cấu trúc ĐA KHUNG (ngày · tuần · tháng) của một mã, dữ liệu từ Gateway (chart-vision/V1).
// Thay pipeline cũ (POST /api/scan trên Vercel: chỉ phân tích khung đầu tiên, chọn 1h -> "Chưa cấu hình/nối được nguồn dữ liệu
// lịch sử thật"; thiếu khóa AI -> lỗi tổng hợp). Mọi con số tính từ nến thật, tổng hợp theo quy tắc minh bạch (EXPERIMENTAL).
// Kết nối bộ lọc: hiện các bộ lọc đang chứa mã (bấm để mở bộ lọc đó); các bảng phụ của bộ lọc có nút "AI Chart Vision" mở thẳng tab này.
import { useEffect, useState } from "react";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Check, Cpu, Layers, Minus, RefreshCw, X } from "lucide-react";
import { isMarketGatewayEnabled } from "../../../../services/marketDataClient";
import { useChartVision, usePatternGeometry, type CvFrame, type CvTimeframe } from "../../../../hooks/useChartVision";
import { Card, Tile } from "../ScreenerDeepPanel";
import VisionSketch, { DEFAULT_LAYERS, type SketchLayers } from "./VisionSketch";
import type { AIChartVisionPanelProps } from "./types";

const fmtP = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("vi-VN") : v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));
const fmtN = (v?: number | null, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const sgn = (v: number) => `${v > 0 ? "+" : ""}${v}`;
const toneOf = (score: number) => (score >= 15 ? "text-emerald-400" : score <= -15 ? "text-rose-400" : "text-slate-200");
const TF_TABS: { key: CvTimeframe; label: string }[] = [{ key: "D", label: "Ngày" }, { key: "W", label: "Tuần" }, { key: "M", label: "Tháng" }];
const COMP_VI: Record<string, string> = { trend: "Xu hướng MA", momentum: "Động lượng", structure: "Cấu trúc", volume: "Khối lượng" };
const MA_COLOR = ["#38bdf8", "#f59e0b", "#a78bfa"];
/** Bộ lọc của Gateway -> tab con của TA VN-Index. */
export const STRATEGY_TAB: Record<string, string> = { camslim: "camslim", "base-breakout": "base-breakout", convergence: "convergence", sepa: "sepa", patterns: "pattern" };

/** Thanh điểm hai phía −100..+100, tâm 0. */
function DivBar({ value, h = 6 }: { value: number; h?: number }) {
  const v = Math.max(-100, Math.min(100, value));
  return (
    <div className="relative w-full rounded-full overflow-hidden" style={{ height: h, background: "rgba(148,163,184,0.12)" }}>
      <div className="absolute top-0 bottom-0 w-px bg-slate-500/60" style={{ left: "50%" }} />
      <div className={`absolute top-0 bottom-0 ${v >= 0 ? "bg-emerald-500/80" : "bg-rose-500/80"}`}
        style={v >= 0 ? { left: "50%", width: `${v / 2}%` } : { right: "50%", width: `${-v / 2}%` }} />
    </div>
  );
}

/** Đồng hồ hợp lưu −100..+100 (nửa vòng). */
function Gauge({ score, label }: { score: number; label: string }) {
  const r = 34, cx = 42, cy = 40, a = Math.PI * (1 - (Math.max(-100, Math.min(100, score)) + 100) / 200);
  const px = cx + r * Math.cos(a), py = cy - r * Math.sin(a);
  return (
    <svg width={84} height={52} viewBox="0 0 84 52" role="img" aria-label={`Điểm hợp lưu ${score}: ${label}`}>
      <defs><linearGradient id="cvg" x1="0" x2="1"><stop offset="0" stopColor="#f43f5e" /><stop offset="0.5" stopColor="#64748b" /><stop offset="1" stopColor="#10b981" /></linearGradient></defs>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="url(#cvg)" strokeWidth={6} strokeLinecap="round" opacity={0.85} />
      <line x1={cx} y1={cy} x2={px} y2={py} stroke="#f8fafc" strokeWidth={2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={3} fill="#f8fafc" />
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize={11} fontWeight={800} fill={score >= 15 ? "#34d399" : score <= -15 ? "#fb7185" : "#e2e8f0"}>{sgn(score)}</text>
    </svg>
  );
}

function OkIcon({ ok }: { ok: boolean | null }) {
  if (ok == null) return <Minus className="w-3 h-3 text-slate-600 shrink-0" />;
  return ok ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <X className="w-3 h-3 text-rose-400 shrink-0" />;
}

function FrameCard({ f, partial }: { f: CvFrame; partial: boolean }) {
  if (f.insufficient) return <Card title={`Khung ${f.label}`}><p className="text-[10px] text-slate-500">{f.note}</p></Card>;
  const m = f.momentum, st = f.structure, lv = f.levels;
  return (
    <Card title={`Khung ${f.label}`} right={<span>{f.date}{partial ? " · đang hình thành" : ""}</span>}>
      <div className="flex items-baseline justify-between gap-2" data-testid={`cv-frame-${f.tf}`}>
        <span className={`text-[15px] font-black font-mono ${toneOf(f.score)}`}>{sgn(f.score)}</span>
        <span className={`text-[10px] font-bold ${toneOf(f.score)}`}>{f.bias.label}</span>
      </div>
      <DivBar value={f.score} />
      <div className="mt-2 space-y-1">
        {f.components && Object.entries(f.components).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[72px_1fr_34px] items-center gap-1.5 text-[9px]">
            <span className="text-slate-500">{COMP_VI[k]}</span><DivBar value={v * 100} h={4} /><span className="text-right font-mono text-slate-300">{sgn(Math.round(v * 100))}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        <Tile label="RSI 14" value={fmtN(m?.rsi)} sub={m?.rsiZone ?? undefined} tone={(m?.rsi ?? 50) >= 50 ? "up" : "down"} />
        <Tile label="MACD hist" value={m?.macd ? (m.macd.hist >= 0 ? "Dương" : "Âm") : "—"} sub={m?.macd ? `${m.macd.rising ? "đang tăng" : "đang giảm"}${m.macd.cross ? ` · cắt ${m.macd.cross === "UP" ? "lên" : "xuống"}` : ""}` : undefined} tone={m?.macd ? (m.macd.hist >= 0 ? "up" : "down") : undefined} />
        <Tile label="ADX 14" value={fmtN(m?.adx?.value)} sub={m?.adx ? `${m.adx.strength} · +DI ${fmtN(m.adx.pdi, 0)}/−DI ${fmtN(m.adx.mdi, 0)}` : undefined} />
      </div>
      <ul className="mt-2 space-y-0.5 text-[10px]">
        {f.trend?.checks.map((c) => (
          <li key={c.key} className="flex items-center gap-1.5"><OkIcon ok={c.ok} /><span className={c.ok ? "text-slate-200" : "text-slate-400"}>{c.label}</span>
            {c.value != null && <span className="ml-auto font-mono text-slate-500">{c.key === "slope" ? `${fmtN(c.value, 2)}%` : fmtP(c.value)}</span>}</li>
        ))}
      </ul>
      <div className="mt-2 text-[10px] text-slate-300"><span className="text-slate-500">Cấu trúc: </span>{st?.label}</div>
      {st?.event && <div className={`text-[10px] ${st.event.kind === "BREAK_UP" ? "text-emerald-300" : "text-rose-300"}`}>{st.event.label}</div>}
      <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-[10px]">
        <dt className="text-slate-500">Kháng cự gần</dt><dd className="text-right font-mono text-rose-300">{lv?.resistance[0] ? `${fmtP(lv.resistance[0].price)} · ${lv.resistance[0].touches} chạm` : "—"}</dd>
        <dt className="text-slate-500">Hỗ trợ gần</dt><dd className="text-right font-mono text-emerald-300">{lv?.support[0] ? `${fmtP(lv.support[0].price)} · ${lv.support[0].touches} chạm` : "—"}</dd>
        <dt className="text-slate-500">KL tăng/giảm 20 thanh</dt><dd className="text-right font-mono text-slate-200">{fmtN(f.volume?.upDownRatio, 2)}×</dd>
        <dt className="text-slate-500">ATR</dt><dd className="text-right font-mono text-slate-200">{f.atrPct != null ? `${fmtN(f.atrPct, 2)}%` : "—"}</dd>
      </dl>
    </Card>
  );
}

const LAYER_VI: { key: keyof SketchLayers; label: string }[] = [
  { key: "ma", label: "MA" }, { key: "pivots", label: "Pivot đỉnh/đáy" }, { key: "allLevels", label: "Mọi vùng giá" }, { key: "patterns", label: "Mô hình Pring" },
];

export default function AIChartVisionPanel({ ticker, onRequestTickerChange, onOpenScreener }: AIChartVisionPanelProps) {
  const [input, setInput] = useState(ticker ?? "VNINDEX");
  const [symbol, setSymbol] = useState((ticker ?? "VNINDEX").toUpperCase());
  const [tf, setTf] = useState<CvTimeframe>("D");
  const [layers, setLayers] = useState<SketchLayers>(DEFAULT_LAYERS);
  useEffect(() => { if (ticker) { setInput(ticker.toUpperCase()); setSymbol(ticker.toUpperCase()); } }, [ticker]);
  const gateway = isMarketGatewayEnabled();
  const { data, error, isLoading, isValidating, refresh } = useChartVision(gateway ? symbol : null);
  const geo = usePatternGeometry(symbol, gateway && layers.patterns && tf !== "M" && !data?.isIndex);

  const apply = () => {
    const s = input.trim().toUpperCase();
    if (!s || s === symbol) return;
    setSymbol(s);
    if (s !== ticker?.toUpperCase()) onRequestTickerChange?.(s);
  };

  const syn = data?.synthesis;
  const frame = data?.frames.find((f) => f.tf === tf);
  const geoPatterns = tf === "D" ? geo.data?.daily ?? [] : tf === "W" ? geo.data?.weekly ?? [] : [];
  const alignTone = syn?.alignment.key === "ALIGNED_UP" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
    : syn?.alignment.key === "ALIGNED_DOWN" ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
    : syn?.alignment.key === "CONFLICT" ? "bg-amber-500/15 text-amber-200 border-amber-500/40" : "bg-slate-500/15 text-slate-200 border-slate-500/30";

  return (
    <div className="rounded-xl p-3 space-y-2 font-sans" style={{ background: "linear-gradient(180deg, rgba(56,189,248,0.06), rgba(2,6,15,0.25))", border: "1px solid rgba(148,163,184,0.12)" }} data-testid="cv-panel">
      <header className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="p-1.5 rounded-md bg-sky-500/15 text-sky-300"><Cpu className="w-4 h-4" /></span>
          <div className="min-w-0">
            <h2 className="text-[13px] font-bold text-slate-100 leading-tight">AI Chart Vision</h2>
            <p className="text-[9px] text-slate-500 leading-tight">Cấu trúc đa khung Ngày · Tuần · Tháng — tính từ nến thật, tổng hợp quy tắc minh bạch</p>
          </div>
        </div>
        <form className="flex items-center gap-1.5 ml-auto" onSubmit={(e) => { e.preventDefault(); apply(); }}>
          <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} onBlur={apply} aria-label="Mã cổ phiếu" data-testid="cv-input"
            className="w-24 text-[11px] font-mono font-bold px-2 py-1 rounded-md bg-slate-900/80 border border-slate-700 text-amber-300 focus:outline-none focus:border-sky-500/60" />
          <button type="submit" className="text-[10px] px-2 py-1 rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20">Phân tích</button>
          <button type="button" onClick={() => refresh()} aria-label="Tải lại" className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60">
            <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? "animate-spin" : ""}`} />
          </button>
        </form>
      </header>

      {!gateway && <p className="text-[10px] text-slate-500 italic py-4 text-center">AI Chart Vision cần Market Gateway (chưa bật cho môi trường này).</p>}
      {gateway && error && !data && (
        <div role="alert" className="flex items-center gap-2 text-[10px] text-rose-300 rounded-md px-2 py-1.5 bg-rose-500/10 border border-rose-500/30">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />Không phân tích được {symbol}: {error.message}
        </div>
      )}
      {gateway && isLoading && !data && <div className="text-[10px] text-slate-500 py-12 text-center">Đang phân tích {symbol} trên 3 khung…</div>}

      {data && syn && (
        <>
          <section className="rounded-lg p-2.5 flex flex-wrap items-center gap-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }} data-testid="cv-hero">
            <Gauge score={syn.score} label={syn.bias.label} />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-lg font-black text-amber-400 tracking-wide">{data.symbol}</span>
                <span className={`text-[11px] font-bold ${toneOf(syn.score)}`} data-testid="cv-bias">{syn.bias.label}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${alignTone}`}>{syn.alignment.label}</span>
                <span className="text-[8px] px-1.5 py-0.5 rounded font-bold bg-amber-500/10 text-amber-300" title={data.method.note}>{data.method.label}</span>
              </div>
              <p className="text-[11px] text-slate-200">{syn.thesis}</p>
              <p className="text-[10px] text-sky-200/90">{syn.conclusion}</p>
              <p className="text-[9px] text-slate-500">engine {data.engine} · dữ liệu tới {data.dataAsOf} · {data.isIndex ? "điểm chỉ số" : "giá điều chỉnh cộng dồn"}{data.partial.week ? " · tuần chưa đóng" : ""}{data.partial.month ? " · tháng chưa đóng" : ""}</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 w-full sm:w-auto sm:min-w-[240px]">
              <Tile label="Mức vô hiệu" value={fmtP(syn.invalidation)} sub={syn.score >= 0 ? "thủng mức này: kịch bản tăng sai" : "vượt mức này: kịch bản giảm sai"} tone={syn.score >= 0 ? "down" : "up"} />
              <Tile label="Trọng số" value={Object.entries(syn.weights).map(([k, v]) => `${k} ${Math.round((v ?? 0) * 100)}`).join(" · ")} sub="hợp lưu theo khung (%)" />
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
            {data.frames.map((f) => <FrameCard key={f.tf} f={f} partial={f.tf === "W" ? data.partial.week : f.tf === "M" ? data.partial.month : false} />)}
          </div>

          <Card title="Mô phỏng trên giá thật" right={
            <div className="flex flex-wrap items-center gap-1">
              {TF_TABS.map((t) => (
                <button key={t.key} type="button" onClick={() => setTf(t.key)} aria-pressed={tf === t.key} data-testid={`cv-tf-${t.key}`}
                  className={`text-[9px] px-2 py-0.5 rounded-full border ${tf === t.key ? "border-sky-500/50 bg-sky-500/10 text-sky-200" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}>{t.label}</button>
              ))}
            </div>
          }>
            <div className="flex flex-wrap items-center gap-1 mb-1.5">
              <Layers className="w-3 h-3 text-slate-500" />
              {LAYER_VI.map((l) => (
                <button key={l.key} type="button" onClick={() => setLayers((s) => ({ ...s, [l.key]: !s[l.key] }))} aria-pressed={layers[l.key]} data-testid={`cv-layer-${l.key}`}
                  disabled={l.key === "patterns" && (tf === "M" || data.isIndex)}
                  className={`text-[9px] px-2 py-0.5 rounded-full border disabled:opacity-40 ${layers[l.key] ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}>{l.label}</button>
              ))}
              <span className="text-[9px] text-slate-500 sm:ml-auto">Mặc định chỉ hiện vùng hỗ trợ/kháng cự gần nhất</span>
            </div>
            <VisionSketch tf={tf} bars={data.bars[tf] ?? []} frame={frame} ma={data.ma?.[tf]} layers={layers} patterns={geoPatterns} />
            {layers.ma && frame?.trend && (
              <div className="flex flex-wrap gap-3 mt-1 text-[9px] text-slate-400">
                {frame.trend.mas.map((x, k) => <span key={x.n}><span style={{ color: MA_COLOR[k] }}>━</span> MA{x.n} {fmtP(x.value)}{x.distPct != null ? ` (${x.distPct >= 0 ? "+" : ""}${fmtN(x.distPct, 1)}%)` : ""}</span>)}
              </div>
            )}
            {layers.patterns && geo.error && <p className="text-[9px] text-amber-300/80 mt-1">Chưa tải được hình học mô hình Pring ({geo.error.message}).</p>}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Card title="Kịch bản">
              <ul className="space-y-1.5 text-[10px]" data-testid="cv-scenarios">
                {syn.scenarios.map((s) => (
                  <li key={s.dir} className="flex gap-1.5">
                    {s.dir === "up" ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                    <span><span className="text-slate-200">{s.label}</span><span className="text-slate-500"> → {s.then}</span></span>
                  </li>
                ))}
                {!syn.scenarios.length && <li className="text-slate-500">Chưa có vùng giá đủ rõ.</li>}
              </ul>
            </Card>
            <Card title="Yếu tố ủng hộ · mâu thuẫn">
              <ul className="space-y-0.5 text-[10px]">
                {syn.support.map((s) => <li key={`s${s}`} className="flex gap-1.5"><Check className="w-3 h-3 text-emerald-400 shrink-0 mt-px" /><span className="text-slate-200">{s}</span></li>)}
                {syn.conflict.map((s) => <li key={`c${s}`} className="flex gap-1.5"><AlertCircle className="w-3 h-3 text-amber-400 shrink-0 mt-px" /><span className="text-slate-300">{s}</span></li>)}
              </ul>
            </Card>
            <Card title="Checklist hợp lưu" right={`${syn.checklist.filter((c) => c.passed).length}/${syn.checklist.length}`}>
              <ul className="space-y-0.5 text-[10px]" data-testid="cv-checklist">
                {syn.checklist.map((c) => <li key={c.label} className="flex items-center gap-1.5"><OkIcon ok={c.passed} /><span className={c.passed ? "text-slate-200" : "text-slate-400"}>{c.label}</span><span className="ml-auto text-slate-500 font-mono truncate max-w-[40%]">{c.detail}</span></li>)}
              </ul>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Card title="Có mặt trong các bộ lọc" right={data.screeners.length ? `${data.screeners.length} bộ lọc` : "không có"}>
              {data.screeners.length ? (
                <ul className="space-y-1 text-[10px]" data-testid="cv-screeners">
                  {data.screeners.map((s) => (
                    <li key={`${s.strategy}${s.side ?? ""}`}>
                      <button type="button" onClick={() => onOpenScreener?.(STRATEGY_TAB[s.strategy] ?? s.strategy)} disabled={!onOpenScreener}
                        className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-left border border-slate-800 hover:border-sky-500/40 hover:bg-sky-500/5">
                        <span className="font-bold text-slate-100 shrink-0">{s.label}</span>
                        <span className="text-slate-300 truncate">{s.status ?? "—"}{s.grade ? ` · ${s.grade}` : ""}{s.side === "sell" ? " · phía bán" : ""}</span>
                        {s.score != null && <span className="ml-auto font-mono text-slate-400">{Math.round(s.score)}</span>}
                        {s.evidence && <span className="text-[8px] px-1 rounded bg-amber-500/10 text-amber-300">{s.evidence}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[10px] text-slate-500">Mã chưa có trong kết quả quét 15:45 của CAN SLIM, Base Breakout, Hợp lưu v2, SEPA hay Mô hình giá.</p>}
            </Card>
            <Card title="Mô hình giá (Martin Pring)" right={data.isIndex ? "không áp dụng cho chỉ số" : `${data.patterns.length} mô hình`}>
              {data.patterns.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]" data-testid="cv-patterns">
                    <thead><tr className="text-slate-500 text-left"><th className="font-normal">Khung</th><th className="font-normal">Mô hình</th><th className="font-normal">Trạng thái</th><th className="font-normal text-right">Tiêu chí</th><th className="font-normal text-right">R:R</th></tr></thead>
                    <tbody>
                      {data.patterns.map((p) => (
                        <tr key={`${p.timeframe}${p.type}${p.startDate}`} className="border-t border-slate-800/60">
                          <td className="py-0.5 text-slate-400">{p.timeframe === "W" ? "Tuần" : "Ngày"}</td>
                          <td className={p.dir === "bull" ? "text-emerald-300" : "text-rose-300"}>{p.label}</td>
                          <td className="text-slate-300">{p.stateLabel}{p.barWarn.length ? " ⚠" : ""}</td>
                          <td className="text-right font-mono text-slate-300">{p.checksOk}/{p.checksTotal}</td>
                          <td className="text-right font-mono text-slate-300">{p.plan?.rr != null ? fmtN(p.plan.rr, 1) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-[10px] text-slate-500">{data.isIndex ? "Engine mô hình giá chỉ chạy cho cổ phiếu." : "Không có mô hình còn hiệu lực."}</p>}
            </Card>
          </div>

          <p className="text-[9px] text-slate-500 leading-snug">{data.method.note} Không phải khuyến nghị đầu tư.</p>
          {data.warnings.length > 0 && <p className="text-[9px] text-amber-300/80">{data.warnings.join(" ")}</p>}
        </>
      )}
    </div>
  );
}
