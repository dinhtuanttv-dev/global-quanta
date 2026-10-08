// Bảng phụ PHÂN TÍCH CHUYÊN SÂU của bộ lọc Hợp lưu v2 (H3) — cùng khuôn với bảng phụ CAN SLIM / Base Breakout:
// mở bằng bấm mã / nhấn đúp dòng, đóng bằng bấm lại hoặc Esc. Tính lại TRÊN TRÌNH DUYỆT bằng đúng engine của Gateway
// (quant-core: convergenceAt + Wyckoff v2 + 9 phép thử + kế hoạch 3 lần), cùng cửa sổ 400 nến, chuỗi giá điều chỉnh và VN-Index
// -> khớp với biểu đồ TA. Bên trái: mô phỏng Wyckoff trên giá thật; bên phải: sơ đồ mẫu chuẩn với vị trí hiện tại.
import { useMemo } from "react";
import { LineChart, X } from "lucide-react";
import { useTaSeries } from "../../../hooks/useTaSeries";
import { useVolumeAnalysis } from "../../../hooks/useVolumeAnalysis";
import type { ConvergenceDoc, ConvergenceRow } from "../../../hooks/useConvergenceV2";
import { convergenceAt } from "../../../lib/quant-core/convergence";
import { wyckoffFor, WYCKOFF_DEFAULT_ENGINE } from "../../../lib/quant-core";
import { computeStructure } from "../../../lib/quant-core/structure";
import { detectFVG, detectOrderBlocks } from "../../../lib/quant-core/zones";
import { WYCKOFF_PHASE_LABEL } from "../../../lib/ta-command-center/detectors/wyckoffDetector";
import { Card, ForeignBars, ScoreRing, Tile, VolumeBars } from "./ScreenerDeepPanel";
import { WyckoffCycleMap, WyckoffEvidenceBlock, WyckoffPlanBlock, WyckoffSignalsBlock, WyckoffTestsBlock } from "./MethodPanels";
import WyckoffSketch from "./WyckoffSketch";

const UP = "#059669";
const DOWN = "#e11d48";
const ACCENT = "#0284c7";

const fmtP = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("vi-VN"));
const fmtPct = (v?: number | null, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")}%`);
const fmtBn = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${v < 0 ? "−" : ""}${(Math.abs(v) / 1e9).toFixed(1).replace(".", ",")} tỷ`);
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const KIND_VI: Record<string, string> = { wyckoff: "Wyckoff", ob: "Order Block", fvg: "FVG", poc: "POC", avwap: "AVWAP" };

interface Props {
  row: ConvergenceRow;
  doc: ConvergenceDoc;
  onClose: () => void;
  onOpenChart: (ticker: string) => void;
}

export default function ConvergenceDeepPanel({ row, doc, onClose, onOpenChart }: Props) {
  const series = useTaSeries(row.ticker);
  const bench = useTaSeries("VNINDEX");
  const { data: vol } = useVolumeAnalysis(row.ticker);
  // Cùng engine + cùng cửa sổ 400 nến với Gateway; bỏ nến chưa đóng phiên.
  const model = useMemo(() => {
    const bars = series.bars.filter((b) => !(b as { partial?: boolean }).partial);
    if (bars.length < 60) return null;
    const window = bars.slice(-400);
    const bm = bench.bars.length ? bench.bars : null;
    const conv = convergenceAt(window, bm);
    const w = wyckoffFor(window, WYCKOFF_DEFAULT_ENGINE, "D", false, bm);
    const buy = conv ? conv.side === "buy" : row.side === "buy";
    const dir = buy ? "bullish" : "bearish";
    const st = computeStructure(window);
    const obs = detectOrderBlocks(window, st.events, st.atr).filter((z) => z.dir === dir && z.status === "ACTIVE").slice(-3);
    const fvgs = detectFVG(window, st.atr, { limitPct: 0.07 }).filter((g) => g.dir === dir && (g.state === "OPEN" || g.state === "PARTIAL")).slice(-3);
    return { window, conv, w, obs, fvgs, buy };
  }, [series.bars, bench.bars, row.side]);

  const conv = model?.conv ?? null;
  const w = model?.w ?? null;
  const last = model?.window[model.window.length - 1];
  const evidence = doc.evidence;
  const grade = conv?.grade ?? row.grade;
  const gradeStats = evidence?.byGrade?.[grade];
  const buy = model?.buy ?? row.side === "buy";
  const cur = w?.phases?.find((p) => p.current)?.phase ?? null;
  const differs = conv && (conv.dataAsOf !== row.date || conv.score !== row.metrics.score);
  const rs = w?.tests?.rs ?? null;
  const cap15 = row.liquidityCapacity.find((c) => c.pct === 0.15)?.value ?? null;
  const sequence = (w?.events ?? []).filter((e) => e.confirmedIndex != null).slice(-9);
  const spKind = new Map((w?.evidence?.springs ?? []).map((s) => [s.index, s.kind]));
  const zone = conv?.zone ?? row.zone;
  const levelRows = (conv?.levels ?? row.levels).map((l) => ({ ...l, hot: !!zone && l.price >= zone.low * 0.999 && l.price <= zone.high * 1.001 }))
    .sort((a, b) => b.price - a.price);
  const components = conv?.components ?? row.components;

  return (
    <div className="p-3 font-sans space-y-2" style={{ background: "linear-gradient(180deg, rgba(2,132,199,0.07), rgba(2,6,15,0.2))" }} data-testid="convergence-deep-panel">
      <header className="flex flex-wrap items-center gap-3">
        <ScoreRing score={conv?.score ?? row.metrics.score} grade={grade} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-lg font-black text-amber-400 tracking-wide">{row.ticker}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${buy ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
              {buy ? "▲ Tích luỹ · phía mua" : "▼ Phân phối · phía bán"}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-violet-500/15 text-violet-200" data-testid="deep-phase">
              {w ? WYCKOFF_PHASE_LABEL[w.phase] : row.wyckoff.phase}{cur ? ` · Phase ${cur}` : ""}
            </span>
            {(conv?.status ?? row.status) === "READY" && <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 font-bold">READY · lần mua mới khớp</span>}
            {evidence && <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${evidence.label === "VALIDATED" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-300"}`}>{evidence.label}</span>}
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {row.name ?? ""}{row.sector ? ` · ${row.sector}` : ""} · Hợp lưu v2 · Wyckoff {w?.engine ?? row.wyckoff.engine} · dữ liệu tới {conv?.dataAsOf ?? row.date}
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <button type="button" onClick={() => onOpenChart(row.ticker)} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300">
            <LineChart className="w-3 h-3" />Mở biểu đồ TA
          </button>
          <button type="button" onClick={onClose} aria-label="Đóng phân tích chuyên sâu" className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {differs && (
        <p className="text-[9px] text-amber-300/80" data-testid="deep-differs">
          Gateway quét phiên {row.date}: {row.metrics.score} điểm · tính lại trên trình duyệt với dữ liệu tới {conv!.dataAsOf}: {conv!.score} điểm (dữ liệu mới hơn lần quét).
        </p>
      )}
      {model && !conv && (
        <p role="status" className="text-[10px] text-amber-300">Với dữ liệu mới nhất, {row.ticker} không còn cấu trúc Wyckoff đang hoạt động — sẽ rời danh sách ở lần quét sau. {w?.statusReason ?? ""}</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
        <Tile label="Giá" value={fmtP(last?.close ?? row.metrics.close)} sub={last ? `phiên ${last.date}` : undefined} />
        <Tile label="Pha Wyckoff" value={cur ? `Phase ${cur}` : "—"} sub={w?.kind ?? undefined} />
        <Tile label="Vùng hợp lưu" value={zone ? `${zone.kinds.length} loại` : "không có"} sub={zone ? `cách giá ${fmtPct(zone.distancePct)}` : "trong 1,5 ATR"} tone={zone && zone.kinds.length >= 3 ? (buy ? "up" : "down") : undefined} />
        <Tile label="9 phép thử" value={w?.tests ? `${w.tests.passed}/${w.tests.avail}` : "—"} sub="không phải xác suất" />
        <Tile label="So VN-Index 20p" value={rs ? fmtPct(rs.diffPct) : "—"} tone={rs ? (rs.diffPct > 0 ? "up" : "down") : undefined} sub={rs ? `mã ${fmtPct(rs.stockPct)} · chỉ số ${fmtPct(rs.indexPct)}` : undefined} />
        <Tile label="Sức chứa / lệnh" value={fmtBn(cap15)} sub="15% GTGD TB20" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <Card title="Mô phỏng mẫu hình Wyckoff (giá thật)" className="lg:col-span-2"
          right={w?.rangeLow != null ? `range ${fmtP(w.rangeLow)}–${fmtP(w.rangeHigh)} · ${w.rangeStartDate} → ${w.rangeEndDate ?? "nay"}` : undefined}>
          {series.isLoading && !series.bars.length
            ? <div className="text-[10px] text-slate-500 py-10 text-center">Đang tải nến…</div>
            : series.error && !series.bars.length
              ? <div role="alert" className="text-[10px] text-rose-300 py-10 text-center">Không tải được nến {row.ticker}: {String((series.error as Error)?.message ?? series.error)}</div>
              : model && w ? <WyckoffSketch bars={model.window} w={w} conv={conv} obs={model.obs} fvgs={model.fvgs} ticker={row.ticker} />
                : <div className="text-[10px] text-slate-500 py-10 text-center">Chưa đủ dữ liệu nến.</div>}
        </Card>

        <Card title="Sơ đồ mẫu Wyckoff" right="mẫu chuẩn ↔ thực tế">
          <WyckoffCycleMap kind={buy ? "accumulation" : "distribution"} current={cur} />
          {sequence.length > 0 && (
            <div className="mt-1.5 text-[9px] text-slate-400 leading-relaxed" data-testid="deep-sequence">
              <span className="text-slate-500">Thực tế: </span>
              {sequence.map((e, i) => (
                <span key={`${e.event}-${e.index}`}>
                  {i > 0 && <span className="text-slate-600"> → </span>}
                  <span className="text-slate-200">{spKind.has(e.index) ? `${e.event}#${spKind.get(e.index)}` : e.event}</span>
                  <span className="font-mono text-slate-500"> {dm(e.confirmedDate ?? e.date)}</span>
                </span>
              ))}
            </div>
          )}
          {w?.statusReason && <p className="mt-1 text-[9px] text-slate-500">{w.statusReason}</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Card title={buy ? "Kế hoạch 3 lần mua" : "3 bước giảm tỷ trọng"} right="minh hoạ, không phải khuyến nghị">
          {w?.tranches ? <WyckoffPlanBlock plan={w.tranches} open /> : <div className="text-[10px] text-slate-500">Chưa có kế hoạch (cấu trúc chưa có range).</div>}
          {row.plan && (
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[10px]" data-testid="deep-plan">
              <dt className="text-slate-500">Cắt lỗ bộ lọc</dt><dd className="text-right font-mono text-rose-300">{fmtP(row.plan.stop)}</dd>
              <dt className="text-slate-500">Mục tiêu</dt><dd className="text-right font-mono text-emerald-300">{fmtP(row.plan.target)}</dd>
              <dt className="text-slate-500">Lợi nhuận / rủi ro</dt><dd className="text-right font-mono text-slate-200">{row.plan.rr.toFixed(1).replace(".", ",")} R</dd>
            </dl>
          )}
        </Card>

        <Card title="Hợp lưu vùng giá" right={zone ? `◆ cụm ${fmtP(zone.low)}–${fmtP(zone.high)}` : "không có cụm trong 1,5 ATR"}>
          {levelRows.length ? (
            <ul className="space-y-0.5 text-[10px]" data-testid="deep-levels">
              {levelRows.map((l, i) => (
                <li key={`${l.label}-${i}`} className={`flex justify-between gap-2 rounded px-1 ${l.hot ? "bg-amber-500/10" : ""}`}>
                  <span className={`truncate ${l.hot ? "text-amber-200" : "text-slate-400"}`}>{l.hot ? "◆ " : ""}{l.label} <span className="text-slate-600">· {KIND_VI[l.kind]}</span></span>
                  <span className="font-mono text-slate-200">{fmtP(l.price)}</span>
                </li>
              ))}
            </ul>
          ) : <div className="text-[10px] text-slate-500 py-4">Không có mức giá cùng chiều.</div>}
          {zone && <p className="pt-1 text-[9px] text-slate-500">Nguồn: {zone.kinds.map((k) => KIND_VI[k] ?? k).join(" ∩ ")} · gom ±1,5%, chỉ mức cùng chiều với Wyckoff.</p>}
        </Card>

        <Card title="Thành phần điểm" right={`${conv?.score ?? row.metrics.score}/100`}>
          <ul className="space-y-1.5" data-testid="deep-components">
            {components.map((c) => (
              <li key={c.key} className="text-[10px]">
                <div className="flex justify-between gap-2">
                  <span className={c.ok ? "text-slate-200" : "text-slate-400"}>{c.label}</span>
                  <span className="font-mono text-slate-300 shrink-0">{c.points}/{c.max}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(c.points / c.max) * 100}%`, background: c.ok ? (buy ? UP : DOWN) : ACCENT }} /></div>
                <div className="text-[9px] text-slate-500 truncate" title={c.value}>{c.value}</div>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[9px] text-slate-500">Trọng số đặt trước kiểm định, không tinh chỉnh · không phải xác suất.</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Card title="9 phép thử Wyckoff">
          {w?.tests ? <WyckoffTestsBlock t={w.tests} open /> : <div className="text-[10px] text-slate-500">—</div>}
        </Card>
        <Card title="Bằng chứng VSA">
          {w?.evidence ? <WyckoffEvidenceBlock ev={w.evidence} current /> : <div className="text-[10px] text-slate-500">—</div>}
        </Card>
        <Card title="Tín hiệu & kiểm định" right={evidence?.label === "PENDING" ? "đang chờ job đêm" : evidence?.outOfSample?.n ? `ngoài mẫu PF ${evidence.outOfSample.profitFactor?.toFixed(2).replace(".", ",") ?? "—"}` : undefined}>
          {w?.signals?.length ? <WyckoffSignalsBlock signals={w.signals} /> : <p className="text-[10px] text-slate-500">Chưa có tín hiệu chuyển pha / lần mua khớp.</p>}
          {gradeStats?.n ? (
            <p className="mt-1.5 text-[9px] text-slate-500 leading-relaxed" data-testid="deep-grade-stats">
              Lịch sử hạng {grade} của bộ lọc: {gradeStats.n} lệnh · thắng {gradeStats.winRate?.toFixed(0)}% · PF {gradeStats.profitFactor?.toFixed(2).replace(".", ",") ?? "—"} — hạng không phân biệt được lợi suất trong kiểm định.
            </p>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Card title="Khối lượng 30 phiên" right={vol ? `KL tăng/giảm 20 phiên ${vol.trend.upDownVolumeRatio20?.toFixed(2).replace(".", ",") ?? "—"}×` : undefined}>
          {vol ? <VolumeBars data={vol.trend} /> : <div className="text-[10px] text-slate-500 py-6 text-center">Đang tải khối lượng…</div>}
        </Card>
        <Card title="Khối ngoại 20 phiên" right={vol ? `5 phiên ${fmtBn(vol.foreign.net5Val)} · 20 phiên ${fmtBn(vol.foreign.net20Val)}` : undefined}>
          {vol ? <ForeignBars series={vol.foreign.netSeries20} /> : <div className="text-[10px] text-slate-500 py-6 text-center">Đang tải khối ngoại…</div>}
        </Card>
      </div>
      <p className="text-[9px] text-slate-600">
        Bấm lại mã hoặc Esc để đóng · {doc.disclaimer} · {series.priceBasis === "ADJUSTED_CUMULATIVE" ? "giá điều chỉnh cộng dồn" : series.priceBasis} · cùng engine với Gateway và biểu đồ TA
      </p>
    </div>
  );
}
