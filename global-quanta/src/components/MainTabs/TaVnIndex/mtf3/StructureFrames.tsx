// MTF v3 · S2 — cấu trúc Dow + giai đoạn Minervini của Ngày / Tuần / Tháng và "chân dưới đổi theo chân trên" (Tuần × Ngày).
// Chỉ MÔ TẢ tới khi kiểm định đặt trước MTF-v3 (H1, H2) chạy ở bước S7.
import type { Context3, DowState, FrameSnapshot, Stage4, Tf3 } from "../../../../hooks/useStructure3";

const TF_NAME: Record<Tf3, string> = { D: "Ngày", W: "Tuần", M: "Tháng" };
const UNIT: Record<Tf3, string> = { D: "phiên", W: "tuần", M: "tháng" };
const price = (x: number | null | undefined) => (x == null ? "—" : x.toLocaleString("vi-VN", { maximumFractionDigits: x < 100 ? 2 : 0 }));
const dmy = (d: string) => d.split("-").reverse().join("/");

export const STAGE_STYLE: Record<Stage4, { short: string; cls: string }> = {
  S1: { short: "GĐ 1 · Tích lũy", cls: "text-sky-200 border-sky-400/40 bg-sky-500/10" },
  S2: { short: "GĐ 2 · Tăng", cls: "text-emerald-200 border-emerald-400/45 bg-emerald-500/10" },
  S3: { short: "GĐ 3 · Phân phối", cls: "text-amber-200 border-amber-400/45 bg-amber-500/10" },
  S4: { short: "GĐ 4 · Giảm", cls: "text-rose-200 border-rose-400/45 bg-rose-500/10" },
  NA: { short: "Chưa đủ MA200", cls: "text-slate-400 border-slate-600/50 bg-slate-800/40" },
};
const DOW_SHORT: Record<DowState, { text: string; tone: "up" | "down" | "warn" | "flat" }> = {
  UP: { text: "Dow tăng", tone: "up" }, UP_WEAK: { text: "Tăng suy yếu", tone: "warn" }, BROKEN_UP: { text: "Tăng đã gãy", tone: "down" },
  DOWN: { text: "Dow giảm", tone: "down" }, DOWN_WEAK: { text: "Giảm suy yếu", tone: "warn" }, BROKEN_DOWN: { text: "Giảm đã gãy", tone: "up" }, RANGE: { text: "Đi ngang", tone: "flat" },
};
const TONE: Record<"up" | "down" | "warn" | "flat", string> = { up: "text-emerald-300", down: "text-rose-300", warn: "text-amber-300", flat: "text-slate-300" };

function FrameCard({ f }: { f: FrameSnapshot }) {
  const st = STAGE_STYLE[f.stage], dw = DOW_SHORT[f.dow];
  const tplN = f.template.length;
  return (
    <div className="rounded-lg p-2 space-y-1" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(148,163,184,0.12)" }} data-testid={`frame-${f.tf}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-bold text-slate-200">{TF_NAME[f.tf]}</span>
        <span title={`${f.stageLabel} — ${f.stageAge} ${UNIT[f.tf]}`} className={`rounded border px-1.5 py-0.5 text-[9.5px] font-bold ${st.cls}`} data-testid={`frame-stage-${f.tf}`}>{st.short}{f.stage !== "NA" ? ` · ${f.stageAge}` : ""}</span>
      </div>
      <div className={`text-[11px] font-bold ${TONE[dw.tone]}`} title={f.dowLabel} data-testid={`frame-dow-${f.tf}`}>{dw.text}</div>
      <div className="grid grid-cols-2 gap-x-2 text-[9.5px] text-slate-400">
        {f.protectedLow != null && <span title="Đáy bảo vệ (押し安値): đáy đã tạo ra đỉnh cao hơn — đóng cửa thủng = xu hướng tăng gãy">Đáy bảo vệ <b className="text-slate-200">{price(f.protectedLow)}</b></span>}
        {f.pullbackHigh != null && <span title="Đỉnh hồi (戻り高値): đỉnh đã tạo ra đáy thấp hơn — đóng cửa vượt = xu hướng giảm gãy">Đỉnh hồi <b className="text-slate-200">{price(f.pullbackHigh)}</b></span>}
        <span>Đỉnh sóng <b className="text-slate-200">{price(f.lastHigh)}</b></span>
        <span>Đáy sóng <b className="text-slate-200">{price(f.lastLow)}</b></span>
      </div>
      {f.lastEvent && (
        <p className="text-[9.5px] text-slate-300" data-testid={`frame-event-${f.tf}`}>
          <span className={f.lastEvent.type.endsWith("UP") || f.lastEvent.type === "BREAK_PULLBACK_HIGH" ? "text-emerald-300" : "text-rose-300"}>●</span> {f.lastEvent.label}
          <span className="text-slate-500"> · {f.lastEvent.ago === 0 ? "kỳ này" : `${f.lastEvent.ago} ${UNIT[f.tf]} trước`} ({dmy(f.lastEvent.date)})</span>
        </p>
      )}
      {tplN > 0 && (
        <div className="flex items-center gap-1 text-[9px] text-slate-500" title={f.template.map((c) => `${c.ok ? "✓" : c.ok === false ? "✗" : "—"} ${c.text}`).join("\n")}>
          Trend Template
          <span className="flex gap-0.5">{f.template.map((c) => <i key={c.key} className={`inline-block w-1.5 h-2.5 rounded-sm ${c.ok ? "bg-emerald-400/80" : c.ok === false ? "bg-rose-400/60" : "bg-slate-600"}`} />)}</span>
          <b className="text-slate-300">{f.templateScore}/{tplN}</b>
        </div>
      )}
    </div>
  );
}

export default function StructureFrames({ ctx }: { ctx: Context3 }) {
  const tr = ctx.trigger;
  return (
    <section className="space-y-1.5" data-testid="structure-frames" aria-label="Cấu trúc Dow và giai đoạn ba khung">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cấu trúc Dow · Giai đoạn Minervini</span>
        <span className="ml-auto rounded border border-slate-600/60 px-1.5 py-0.5 text-[9.5px] text-slate-400" title="Thành phần mô tả — kiểm định đặt trước MTF-v3 (H1 giai đoạn 2, H2 chân dưới đổi theo chân trên) chạy ở bước S7">MÔ TẢ</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-1.5">
        <FrameCard f={ctx.D} /><FrameCard f={ctx.W} /><FrameCard f={ctx.M} />
        <div className={`rounded-lg p-2 space-y-1 ${tr.side === "L" ? "ring-1 ring-emerald-400/40" : tr.side === "S" ? "ring-1 ring-rose-400/40" : ""}`} style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(148,163,184,0.12)" }} data-testid="mtf-trigger">
          <div className="text-[10px] font-bold text-slate-200">Chân dưới đổi theo chân trên</div>
          <div className={`text-[11px] font-bold ${tr.side === "L" ? "text-emerald-300" : tr.side === "S" ? "text-rose-300" : "text-slate-400"}`} data-testid="mtf-trigger-side">
            {tr.side === "L" ? `Ngày vừa đổi chiều TĂNG cùng Tuần${tr.ago ? ` · ${tr.ago} phiên` : " · phiên này"}` : tr.side === "S" ? `Ngày vừa đổi chiều GIẢM cùng Tuần${tr.ago ? ` · ${tr.ago} phiên` : ""}` : "Chưa có điểm đồng pha"}
          </div>
          <ul className="space-y-0.5">
            {tr.steps.map((s) => <li key={s.key} className="flex gap-1 text-[9.5px] text-slate-300"><span className={s.ok ? "text-emerald-300" : "text-slate-500"}>{s.ok ? "✓" : "○"}</span>{s.text}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
