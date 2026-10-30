// MTF v3 · S3 — hợp lưu Elliott Pro × dải EMA × đáy bảo vệ Dow: sóng 2 / 4 kết thúc trong vùng Fib VÀ trong dải EMA, sóng 3 lồng
// sóng 3 (Tuần × Ngày), mức vô hiệu Elliott so với đáy bảo vệ, mục tiêu Fib gần nhất. MÔ TẢ tới khi H6 được kiểm định.
import type { Elliott3 } from "../../../../hooks/useStructure3";

const price = (x: number | null | undefined) => (x == null ? "—" : x.toLocaleString("vi-VN", { maximumFractionDigits: x < 100 ? 2 : 0 }));
const pct = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toFixed(1).replace(".", ",")}%`);
const CONF: Record<Elliott3["confluence"], { text: string; cls: string }> = {
  strong: { text: "Hợp lưu mạnh", cls: "text-emerald-200 border-emerald-400/50 bg-emerald-500/10" },
  partial: { text: "Hợp lưu một phần", cls: "text-amber-200 border-amber-400/45 bg-amber-500/10" },
  none: { text: "Chưa hợp lưu", cls: "text-slate-300 border-slate-600/50 bg-slate-800/40" },
};
const Mark = ({ ok }: { ok: boolean | null }) => <span className={ok ? "text-emerald-300" : ok === false ? "text-rose-300" : "text-slate-500"}>{ok ? "✓" : ok === false ? "✗" : "—"}</span>;

export default function ElliottConfluence({ e }: { e: Elliott3 }) {
  const c = CONF[e.confluence], w = e.waveEnd;
  return (
    <section className="rounded-lg p-2 space-y-1.5" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(148,163,184,0.12)" }} data-testid="elliott-confluence" aria-label="Hợp lưu Elliott và dải EMA">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Elliott × dải EMA</span>
        <span className={`rounded border px-1.5 py-0.5 text-[9.5px] font-bold ${c.cls}`} data-testid="elliott-confluence-level">{c.text}</span>
        {e.nested3 && (
          <span className={`rounded border px-1.5 py-0.5 text-[9.5px] ${e.nested3 === "up" ? "border-emerald-400/50 text-emerald-200" : "border-rose-400/50 text-rose-200"}`}
            title="Sóng 3 khung Tuần và sóng 3 khung Ngày cùng chiều — bắt sóng 3 của chân trên bằng sóng 3 của chân dưới" data-testid="elliott-nested3">
            Sóng 3 lồng sóng 3 {e.nested3 === "up" ? "↑" : "↓"}
          </span>
        )}
        <span className="ml-auto rounded border border-slate-600/60 px-1.5 py-0.5 text-[9.5px] text-slate-400" title="Engine Elliott Pro: walk-forward EP5 có lợi thế nhỏ trước phí; hợp lưu với EMA (H6) kiểm định ở S7">MÔ TẢ</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px] text-slate-300">
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase text-slate-500">Bản đếm</div>
          <div data-testid="elliott-day">Ngày: <b className="text-slate-100">{e.day?.label ?? "chưa đếm được"}</b>{e.day?.degree ? <span className="text-slate-500"> · bậc {e.day.degree}</span> : null}</div>
          <div>Tuần: <b className="text-slate-100">{e.week?.label ?? "chưa đủ 60 tuần"}</b></div>
          <div className="text-slate-400">{e.relationText}</div>
        </div>
        <div className="space-y-0.5" data-testid="elliott-wave-end">
          <div className="text-[9px] uppercase text-slate-500">Kết thúc sóng điều chỉnh</div>
          {w ? (
            <>
              <div>Sóng {w.wave} tại <b className="text-slate-100">{price(w.price)}</b>{w.date ? ` (${w.date.split("-").reverse().join("/")})` : ""}</div>
              <div><Mark ok={w.inFibZone} /> Hồi {pct(w.retrace)} — vùng Fib {w.wave === "2" ? "38,2–78,6%" : "23,6–61,8%"}</div>
              <div><Mark ok={w.inEmaBand} /> Trong dải {w.bandName}{w.band ? ` (${price(w.band[0])}–${price(w.band[1])})` : ""}</div>
            </>
          ) : <div className="text-slate-500">Bản đếm chưa có sóng 2 / sóng 4 đã kết thúc.</div>}
        </div>
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase text-slate-500">Điểm sai · mục tiêu</div>
          {e.invalidation ? <div>Vô hiệu {e.invalidation.side === "below" ? "dưới" : "trên"} <b className="text-rose-200">{price(e.invalidation.price)}</b></div> : <div className="text-slate-500">Chưa có mức vô hiệu.</div>}
          {e.stopAgreement && (
            <div className="text-slate-400" data-testid="elliott-stop" title="Đáy bảo vệ Dow khung ngày so với mức vô hiệu Elliott (theo ATR)">
              Đáy bảo vệ Dow {price(e.stopAgreement.dow)} · lệch {e.stopAgreement.gapAtr.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ATR
            </div>
          )}
          {e.targets.length > 0 && (
            <div>Mục tiêu: {e.targets.map((t) => <span key={t.label} className="mr-1.5 whitespace-nowrap"><span className="text-slate-500">{t.label}</span> <b className="text-emerald-200">{price(t.price)}</b></span>)}</div>
          )}
        </div>
      </div>
    </section>
  );
}
