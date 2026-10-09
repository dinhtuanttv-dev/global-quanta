// Pattern Scanner v2 (Pring) — bảng phụ phân tích chuyên sâu một mã: chọn mô hình (ngày / tuần), mô phỏng trên giá thật ghim theo nến,
// sơ đồ mẫu chuẩn theo sách, checklist tiêu chí Pring, vòng đời, mô hình nến tại điểm phá vỡ, kế hoạch R:R và kết quả kiểm định P3 của nhóm.
import { useMemo, useState } from "react";
import { Check, Cpu, LineChart, Minus, X } from "lucide-react";
import { GROUP_OF_FAMILY, usePatternDetail, type PatternFull, type PatternRow, type PatternsDoc, type PatternStat } from "../../../hooks/usePatterns";
import { Card, Tile } from "./ScreenerDeepPanel";
import PringSketch from "./PringSketch";
import PringSchematic from "./PringSchematic";

const fmtP = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("vi-VN") : v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));
const fmtN = (v?: number | null, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v?: number | null, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtN(v, d)}%`);
export const STATE_STYLE: Record<string, string> = {
  FORMING: "bg-sky-500/15 text-sky-200 border-sky-500/30", BREAKOUT: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  CONFIRMED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40", PULLBACK: "bg-teal-500/15 text-teal-200 border-teal-500/40",
  TARGET1: "bg-violet-500/15 text-violet-200 border-violet-500/40", TARGET2: "bg-violet-500/15 text-violet-200 border-violet-500/40", TARGET3: "bg-violet-500/15 text-violet-200 border-violet-500/40",
  FAILED: "bg-rose-500/15 text-rose-300 border-rose-500/40", EXPIRED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};
const EVENT_VI: Record<string, string> = { BREAKOUT: "Phá vỡ dứt khoát", PULLBACK: "Pullback về điểm phá vỡ", TARGET1: "Đạt mục tiêu 1×", TARGET2: "Đạt mục tiêu 2×", TARGET3: "Đạt mục tiêu 3×" };
const VERDICT_VI: Record<string, string> = { PASS: "ĐẠT", FAIL: "KHÔNG ĐẠT", INSUFFICIENT: "THIẾU MẪU" };
const stat = (s?: PatternStat) => (s && s.n ? `n ${s.n} · ${pct(s.mean, 2)}${s.ci ? ` [${fmtN(s.ci[0], 2)}; ${fmtN(s.ci[1], 2)}]` : ""}` : "—");
const keyOf = (p: { timeframe: string; type: string; startDate: string }) => `${p.timeframe}|${p.type}|${p.startDate}`;

function OkIcon({ ok }: { ok: boolean | null }) {
  if (ok == null) return <Minus className="w-3 h-3 text-slate-600 shrink-0" />;
  return ok ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <X className="w-3 h-3 text-rose-400 shrink-0" />;
}

function checkValue(key: string, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  if (["boVol"].includes(key)) return `${fmtN(v, 2)}×`;
  if (["prior", "pole", "depth"].includes(key)) return pct(v * 100, 0);
  if (key === "apex") return `${Math.round(v * 100)}%`;
  if (key === "trend") return v > 0 ? "lên" : v < 0 ? "xuống" : "ngang";
  if (Math.abs(v) < 1) return fmtN(v, 2);
  return fmtN(v, 0);
}

interface Props { row: PatternRow; doc: PatternsDoc; onClose: () => void; onOpenChart: (ticker: string) => void; onOpenVision?: (ticker: string) => void }

export default function PatternDeepPanel({ row, doc, onClose, onOpenChart, onOpenVision }: Props) {
  const { data, error, isLoading } = usePatternDetail(row.ticker);
  const all = useMemo(() => [...(data?.daily ?? []), ...(data?.weekly ?? [])], [data]);
  const [pick, setPick] = useState<string>(() => keyOf(row.patterns[0]));
  const p: PatternFull | undefined = all.find((x) => keyOf(x) === pick) ?? all[0];
  const bars = p?.timeframe === "W" ? data?.bars.weekly ?? [] : data?.bars.daily ?? [];
  const v = doc.evidence?.validation;
  const grp = p ? GROUP_OF_FAMILY[p.family] : undefined;
  const g = grp && v ? v.H1[grp] : undefined;
  const tg = grp && v && p ? v.targets[`${grp}_${p.dir}`] : undefined;
  const bull = p?.dir === "bull";

  return (
    <div className="p-3 font-sans space-y-2" style={{ background: "linear-gradient(180deg, rgba(167,139,250,0.07), rgba(2,6,15,0.2))" }} data-testid="pattern-deep-panel">
      <header className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-lg font-black text-amber-400 tracking-wide">{row.ticker}</span>
            {p && <>
              <span className={`text-[11px] font-bold ${bull ? "text-emerald-300" : "text-rose-300"}`} data-testid="pattern-deep-label">{p.label}{p.subLabel && p.timeframe === "D" ? ` · ${p.subLabel}` : ""}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-slate-500/15 text-slate-200">{p.timeframe === "W" ? "Khung tuần" : "Khung ngày"} · {p.role === "continuation" ? "tiếp diễn" : "đảo chiều"}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${STATE_STYLE[p.state]}`} data-testid="pattern-deep-state">{p.stateLabel}</span>
            </>}
            <span className="text-[8px] px-1.5 py-0.5 rounded font-bold bg-amber-500/10 text-amber-300" title={v?.conclusion}>{doc.evidence?.label ?? "EXPERIMENTAL"}</span>
          </div>
          <div className="text-[10px] text-slate-400 truncate">{row.name ?? ""}{row.sector ? ` · ${row.sector}` : ""} · Mô hình giá Martin Pring · engine {doc.engine} · dữ liệu tới {data?.dataAsOf ?? row.date}{p?.timeframe === "W" && data?.partialWeek ? " · tuần chưa đóng" : ""}</div>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          {onOpenVision && <button type="button" onClick={() => onOpenVision(row.ticker)} data-testid="open-vision" className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20"><Cpu className="w-3 h-3" />AI Chart Vision</button>}
          <button type="button" onClick={() => onOpenChart(row.ticker)} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-slate-700 text-slate-300 hover:border-violet-500/50 hover:text-violet-300"><LineChart className="w-3 h-3" />Mở biểu đồ TA</button>
          <button type="button" onClick={onClose} aria-label="Đóng phân tích chuyên sâu" className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"><X className="w-3.5 h-3.5" /></button>
        </div>
      </header>

      {error && !data && <div role="alert" className="text-[10px] text-rose-300 py-6 text-center">Không tải được chi tiết {row.ticker}: {error.message}</div>}
      {isLoading && !data && <div className="text-[10px] text-slate-500 py-10 text-center">Đang tải mô hình và nến…</div>}

      {all.length > 1 && (
        <div className="flex flex-wrap gap-1" data-testid="pattern-picker">
          {all.map((x) => (
            <button key={keyOf(x)} type="button" onClick={() => setPick(keyOf(x))} aria-pressed={p && keyOf(p) === keyOf(x)}
              className={`text-[9px] px-2 py-0.5 rounded-full border ${p && keyOf(p) === keyOf(x) ? "border-violet-500/50 bg-violet-500/10 text-violet-200" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}>
              {x.timeframe === "W" ? "Tuần" : "Ngày"} · {x.label} · {x.stateLabel}
            </button>
          ))}
        </div>
      )}

      {p && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
            <Tile label="Giá" value={fmtP(bars[bars.length - 1]?.[4])} sub={`cách đường phá vỡ ${pct(p.distancePct)}`} />
            <Tile label="Đường phá vỡ" value={fmtP(p.levelAtBreakout ?? p.levelNow)} sub={p.breakout ? `phá vỡ ${p.breakout.date}` : "chưa phá vỡ"} />
            <Tile label="Chiều cao" value={pct(p.heightPct, 1)} sub={`${p.width} ${p.timeframe === "W" ? "tuần" : "phiên"}`} />
            <Tile label="Mục tiêu 1×" value={fmtP(p.targets[0])} sub="chiều cao chiếu trên thang log" tone={bull ? "up" : "down"} />
            <Tile label="Mức thất bại" value={fmtP(p.failLevel ?? p.invalidation)} sub={p.failLevel != null ? "quay lại 50% thân mô hình" : "vô hiệu mô hình"} tone={bull ? "down" : "up"} />
            <Tile label="KL phá vỡ" value={p.breakout?.volRatio != null ? `${fmtN(p.breakout.volRatio, 2)}×` : "—"} sub="so TB25 trước phá vỡ" tone={(p.breakout?.volRatio ?? 0) >= 1.5 ? "up" : undefined} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
            <Card title="Mô phỏng trên giá thật" className="lg:col-span-2" right={`${p.startDate} → ${p.endDate}`}>
              <PringSketch bars={bars} p={p} />
            </Card>
            <Card title="Sơ đồ mẫu theo sách" right={p.familyLabel}>
              <PringSchematic type={p.type} dir={p.dir} label={p.label} />
              <p className="mt-1 text-[9px] text-slate-500 leading-snug">
                {p.role === "continuation" ? "Mô hình tiếp diễn: phá vỡ theo hướng xu hướng trước." : "Mô hình đảo chiều: cần có xu hướng trước để đảo chiều."}
                {" "}Mục tiêu đo bằng chiều cao mô hình, là mức TỐI THIỂU; phá vỡ phải dứt khoát và giữ ≥ 2 thanh (ch6, ch17).
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Card title="Tiêu chí Pring" right={`${p.checks.filter((c) => c.ok).length}/${p.checks.filter((c) => c.ok != null).length} · điểm ${p.score}`}>
              <ul className="space-y-0.5 text-[10px]" data-testid="pattern-checks">
                {p.checks.map((c) => <li key={c.key + c.label} className="flex items-start gap-1.5"><OkIcon ok={c.ok} /><span className={c.ok ? "text-slate-200" : "text-slate-400"}>{c.label}</span><span className="ml-auto font-mono text-slate-500 shrink-0">{checkValue(c.key, c.value)}</span></li>)}
              </ul>
            </Card>
            <Card title="Vòng đời">
              <ol className="space-y-0.5 text-[10px]" data-testid="pattern-timeline">
                <li className="flex gap-2"><span className="font-mono text-slate-500 w-16 shrink-0">{p.startDate}</span><span className="text-slate-300">Bắt đầu hình thành</span></li>
                <li className="flex gap-2"><span className="font-mono text-slate-500 w-16 shrink-0">{p.endDate}</span><span className="text-slate-300">Hoàn tất thân mô hình</span></li>
                {p.events.map((e) => <li key={e.kind + e.date} className="flex gap-2"><span className="font-mono text-slate-500 w-16 shrink-0">{e.date}</span><span className={e.kind.startsWith("TARGET") ? "text-violet-200" : "text-amber-200"}>{EVENT_VI[e.kind] ?? e.kind} · {fmtP(e.price)}</span></li>)}
                {p.breakout?.confirmDate && <li className="flex gap-2"><span className="font-mono text-slate-500 w-16 shrink-0">{p.breakout.confirmDate}</span><span className="text-emerald-300">Xác nhận: giữ ngoài mô hình 2 thanh</span></li>}
                {p.failure && <li className="flex gap-2"><span className="font-mono text-slate-500 w-16 shrink-0">{p.failure.date}</span><span className="text-rose-300">Thất bại: {p.failure.reason}</span></li>}
                {p.state === "FORMING" && <li className="text-sky-200">Đang hình thành — chờ phá vỡ dứt khoát{p.apexBarsAhead != null && p.apexBarsAhead > 0 ? ` (đỉnh tam giác sau ${p.apexBarsAhead} thanh)` : ""}.</li>}
              </ol>
            </Card>
            <Card title="Nến tại điểm phá vỡ · bối cảnh">
              <ul className="space-y-0.5 text-[10px]">
                {p.barSignals.confirm.map((b) => <li key={`c${b.kind}${b.date}`} className="text-emerald-300">✓ Xác nhận: {b.label} ({b.date})</li>)}
                {p.barSignals.warn.map((b) => <li key={`w${b.kind}${b.date}`} className="text-amber-300">⚠ Cảnh báo: {b.label} ({b.date}) — dễ thành phá vỡ giả</li>)}
                {!p.barSignals.confirm.length && !p.barSignals.warn.length && <li className="text-slate-500">Không có mô hình 1–3 thanh tại điểm phá vỡ.</li>}
                <li className="pt-1 text-slate-300">Xu hướng chính (MA200): {p.context.majorTrend > 0 ? "lên" : p.context.majorTrend < 0 ? "xuống" : "ngang"} · {p.context.withTrend ? "phá vỡ thuận xu hướng" : p.context.counterTrend ? "phá vỡ NGƯỢC xu hướng (dễ thất bại)" : "trung tính"}</li>
                {p.context.divergence != null && <li className="text-slate-300">Phân kỳ RSI tại phá vỡ: {p.context.divergence ? "có (cảnh báo)" : "không"}</li>}
                {p.context.trianglePosition != null && <li className="text-slate-300">Vị trí phá vỡ trong tam giác: {Math.round(p.context.trianglePosition * 100)}% đường tới đỉnh (lý tưởng 50–67%)</li>}
              </ul>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Card title="Kế hoạch theo mô hình" right={p.plan?.basis}>
              {p.plan ? (
                <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-[10px]" data-testid="pattern-plan">
                  <dt className="text-slate-500">Điểm vào</dt><dd className="text-right font-mono text-slate-200">{fmtP(p.plan.entry)}</dd>
                  <dt className="text-slate-500">Dừng lỗ (mức thất bại)</dt><dd className="text-right font-mono text-rose-300">{fmtP(p.plan.stop)}</dd>
                  <dt className="text-slate-500">Mục tiêu 1× / 2× / 3×</dt><dd className="text-right font-mono text-emerald-300">{fmtP(p.plan.target)} / {fmtP(p.plan.target2 ?? p.targets[1])} / {fmtP(p.plan.target3 ?? p.targets[2])}</dd>
                  <dt className="text-slate-500">Lời / lỗ (R:R)</dt><dd className={`text-right font-mono ${(p.plan.rr ?? 0) >= 3 ? "text-emerald-300" : "text-amber-300"}`}>{fmtN(p.plan.rr, 1)} {(p.plan.rr ?? 0) >= 3 ? "· đạt 3:1" : "· dưới 3:1 (Pring khuyên bỏ qua)"}</dd>
                </dl>
              ) : <p className="text-[10px] text-slate-500">Chưa có kế hoạch.</p>}
              <p className="mt-1 text-[9px] text-amber-300/80">Kiểm định P3: mô phỏng lệnh theo kế hoạch này ngoài mẫu có PF {fmtN(v?.trades.oos.profitFactor, 2)} (n {v?.trades.oos.n ?? "—"}) — chưa có lợi thế, chỉ để tham khảo.</p>
            </Card>
            <Card title="Kiểm định đặt trước (P3)" right={g ? `${grp} · ${VERDICT_VI[g.verdict] ?? g.verdict}` : undefined}>
              {g ? (
                <div className="space-y-1 text-[10px]" data-testid="pattern-validation">
                  <p className="text-slate-300">{g.label} — tín hiệu mua khi mô hình được xác nhận, lợi suất vượt trội T+20:</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                    <dt className="text-slate-500">Trong mẫu</dt><dd className="font-mono text-slate-200">{stat(g.is)}</dd>
                    <dt className="text-slate-500">Ngoài mẫu</dt><dd className="font-mono text-slate-200">{stat(g.oos)}</dd>
                    {g.placeboP != null && <><dt className="text-slate-500">Placebo</dt><dd className="text-slate-300">p = {fmtN(g.placeboP, 2)} (ngẫu nhiên cùng mã, cùng tháng)</dd></>}
                    {tg && <><dt className="text-slate-500">Đạt mục tiêu</dt><dd className="text-slate-300">1× {fmtN(tg.t1, 0)}% · 2× {fmtN(tg.t2, 0)}% · 3× {fmtN(tg.t3, 0)}% · thất bại {fmtN(tg.failed, 0)}% (60 phiên, n {tg.n})</dd></>}
                  </dl>
                  <p className="text-[9px] text-slate-500">{v?.conclusion}</p>
                </div>
              ) : <p className="text-[10px] text-slate-500">Chưa có kết quả kiểm định.</p>}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
