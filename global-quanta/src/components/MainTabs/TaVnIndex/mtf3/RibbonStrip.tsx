// MTF v3 · S1 — dải EMA21 · EMA50 · EMA100 · MA200 của ba khung Ngày / Tuần / Tháng (cùng màu với đường trên biểu đồ).
// Mỗi khung: thứ tự xếp lớp (Kendall τ), thang vị trí giá so với 4 đường, pha của dải (nén / mở rộng / mở hết), lệch khỏi EMA50 theo ATR.
// Chỉ MÔ TẢ cho tới khi kiểm định đặt trước MTF-v3 (S7) chạy xong.
import type { RibbonContext, RibbonSnapshot, Tf3 } from "../../../../hooks/useStructure3";

export const RIBBON_COLORS = { ema21: "#3b82f6", ema50: "#facc15", ema100: "#a855f7", ma200: "#fca5a5" } as const;
const TF_NAME: Record<Tf3, string> = { D: "Ngày", W: "Tuần", M: "Tháng" };
const UNIT: Record<Tf3, string> = { D: "phiên", W: "tuần", M: "tháng" };
const vi = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : x.toLocaleString("vi-VN", { maximumFractionDigits: d, minimumFractionDigits: d }));
const price = (x: number | null | undefined) => (x == null ? "—" : x.toLocaleString("vi-VN", { maximumFractionDigits: x < 100 ? 2 : 0 }));

function orderText(s: RibbonSnapshot): { text: string; tone: "up" | "down" | "flat" } {
  if (s.order == null) return { text: "Chưa đủ dữ liệu", tone: "flat" };
  if (s.order === 1) return { text: `Xếp lớp tăng · ${s.orderAge} ${UNIT[s.tf]}`, tone: "up" };
  if (s.order === -1) return { text: `Xếp lớp giảm · ${s.orderAge} ${UNIT[s.tf]}`, tone: "down" };
  return { text: `Đan xen · τ ${vi(s.order, 2)}`, tone: s.order > 0 ? "up" : s.order < 0 ? "down" : "flat" };
}
const PHASE: Record<RibbonSnapshot["phase"], { text: string; cls: string; hint: string }> = {
  squeeze: { text: "Nén", cls: "text-sky-200 border-sky-400/40 bg-sky-500/10", hint: "Dải hẹp (phân vị ≤ 20 so với 120 nến trước) — hai phe giằng co, chờ hướng bung ra." },
  expanding: { text: "Đang mở rộng", cls: "text-emerald-200 border-emerald-400/40 bg-emerald-500/10", hint: "Vừa thoát vùng nén, dải mở rộng 3 nến liên tiếp — giai đoạn thuận lợi nhất theo tài liệu (hội tụ → mở rộng)." },
  extended: { text: "Mở hết", cls: "text-amber-200 border-amber-400/40 bg-amber-500/10", hint: "Dải rộng nhất 10% lịch sử 120 nến — dễ có nhịp lấp khoảng lệch, không vào lệnh mới theo hướng làm khoảng lệch lớn thêm." },
  normal: { text: "Bình thường", cls: "text-slate-300 border-slate-600/50 bg-slate-800/40", hint: "Dải không nén, không mở hết." },
  na: { text: "—", cls: "text-slate-500 border-slate-700/50", hint: "Chưa đủ 120 nến để so sánh." },
};

/** Thang vị trí: giá (trắng) và 4 đường trên cùng một trục từ thấp đến cao. */
function Ladder({ s }: { s: RibbonSnapshot }) {
  const pts = [
    { k: "ema21", v: s.ema21, c: RIBBON_COLORS.ema21, l: "EMA21" }, { k: "ema50", v: s.ema50, c: RIBBON_COLORS.ema50, l: "EMA50" },
    { k: "ema100", v: s.ema100, c: RIBBON_COLORS.ema100, l: "EMA100" }, { k: "ma200", v: s.ma200, c: RIBBON_COLORS.ma200, l: "MA200" },
  ].filter((p) => p.v != null) as { k: string; v: number; c: string; l: string }[];
  if (s.close == null || !pts.length) return <div className="h-5" />;
  const all = [s.close, ...pts.map((p) => p.v)], lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const x = (v: number) => 6 + ((v - lo) / span) * 188;
  return (
    <svg viewBox="0 0 200 22" className="w-full h-5" role="img" aria-label={`Vị trí giá so với các đường khung ${TF_NAME[s.tf]}`}>
      <line x1={6} x2={194} y1={11} y2={11} stroke="rgba(148,163,184,0.25)" strokeWidth={1} />
      {pts.map((p) => <circle key={p.k} cx={x(p.v)} cy={11} r={4} fill={p.c} stroke="#0b1220" strokeWidth={1.5}><title>{`${p.l}: ${price(p.v)}`}</title></circle>)}
      <rect x={x(s.close) - 1.5} y={2} width={3} height={18} rx={1} fill="#f8fafc"><title>{`Giá: ${price(s.close)}`}</title></rect>
    </svg>
  );
}

function TfCard({ s }: { s: RibbonSnapshot }) {
  const o = orderText(s), ph = PHASE[s.phase];
  const toneCls = o.tone === "up" ? "text-emerald-300" : o.tone === "down" ? "text-rose-300" : "text-slate-300";
  return (
    <div className="rounded-lg p-2 space-y-1" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(148,163,184,0.12)" }} data-testid={`ribbon-tf-${s.tf}`}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] font-bold text-slate-200">{TF_NAME[s.tf]}</span>
        <span className="text-[9px] text-slate-500">{s.date ? `kỳ đóng ${s.date.split("-").reverse().join("/")}` : "chưa có kỳ đóng"}</span>
      </div>
      <div className={`text-[11px] font-bold ${toneCls}`} data-testid={`ribbon-order-${s.tf}`}>{o.text}</div>
      <Ladder s={s} />
      <div className="flex flex-wrap items-center gap-1 text-[9.5px]">
        <span title={ph.hint} className={`rounded border px-1.5 py-0.5 ${ph.cls}`} data-testid={`ribbon-phase-${s.tf}`}>{ph.text}{s.widthPct != null ? ` · ${s.widthPct}%` : ""}</span>
        <span className="text-slate-400" title="(Giá − EMA50) / ATR của khung">lệch EMA50 <b className="text-slate-200">{vi(s.dev50)} ATR</b></span>
        {s.over !== 0 && <span className="rounded border border-amber-400/50 px-1 text-amber-200" title="Lệch ≥ 3 ATR khỏi EMA50 theo chiều dải — không vào lệnh mới theo hướng này (dễ lấp khoảng lệch)">Quá đà</span>}
        {s.inBand && <span className="rounded border border-slate-500/50 px-1 text-slate-300" title="Giá nằm giữa EMA21 và EMA50 — vùng hai phe giằng co">Trong dải 21–50</span>}
      </div>
      {s.ma200 == null && s.bars > 0 && <p className="text-[9px] text-slate-500">MA200: chưa đủ 200 {UNIT[s.tf]} ({s.bars}) — để trống, không ước lượng.</p>}
    </div>
  );
}

export default function RibbonStrip({ ctx }: { ctx: RibbonContext }) {
  const nested = ctx.nested;
  return (
    <section className="space-y-1.5" data-testid="ribbon-strip" aria-label="Dải EMA ba khung">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Dải EMA 21 · 50 · 100 · MA200</span>
        <span className="flex items-center gap-1.5 text-[9px] text-slate-500">
          {(["ema21", "ema50", "ema100", "ma200"] as const).map((k) => <span key={k} className="inline-flex items-center gap-0.5"><i className="inline-block w-2 h-2 rounded-full" style={{ background: RIBBON_COLORS[k] }} />{k === "ma200" ? "MA200" : k.toUpperCase()}</span>)}
          <span className="inline-flex items-center gap-0.5"><i className="inline-block w-0.5 h-2.5 bg-slate-100" />giá</span>
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[9.5px]">
          <span className="text-slate-400" title="Cộng dấu thứ tự xếp lớp của Ngày, Tuần, Tháng (−3 … +3)">Đồng thuận 3 khung <b className={ctx.align > 0 ? "text-emerald-300" : ctx.align < 0 ? "text-rose-300" : "text-slate-200"} data-testid="ribbon-align">{ctx.align > 0 ? "+" : ""}{ctx.align}</b></span>
          {nested && <span className={`rounded border px-1.5 py-0.5 ${nested === "up" ? "border-emerald-400/50 text-emerald-200" : "border-rose-400/50 text-rose-200"}`} title="Dải Ngày vừa thoát nén và mở rộng (≤ 5 phiên) cùng chiều xếp lớp của Tuần — 'hội tụ → mở rộng lồng khung'" data-testid="ribbon-nested">Mở rộng lồng khung {nested === "up" ? "↑" : "↓"}</span>}
          <span className="rounded border border-slate-600/60 px-1.5 py-0.5 text-slate-400" title="Thành phần mô tả — kiểm định đặt trước MTF-v3 chạy ở bước S7">MÔ TẢ</span>
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
        <TfCard s={ctx.D} /><TfCard s={ctx.W} /><TfCard s={ctx.M} />
      </div>
    </section>
  );
}
