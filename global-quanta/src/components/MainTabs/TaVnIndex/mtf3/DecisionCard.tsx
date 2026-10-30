// MTF v3 · S5 — lớp quyết định (MÔ TẢ): thiết lập nào đang có, cổng cấm vào nào đang chặn, kế hoạch cắt lỗ / mục tiêu / R:R ≥ 2.
// Không dùng chữ MUA / BÁN cho tới khi kiểm định đặt trước MTF-v3 (S7) ĐẠT.
import type { Decision3View } from "../../../../hooks/useStructure3";

const price = (x: number | null | undefined) => (x == null ? "—" : x.toLocaleString("vi-VN", { maximumFractionDigits: x < 100 ? 2 : 0 }));
const STATE: Record<Decision3View["state"], { cls: string; dot: string }> = {
  setup: { cls: "border-emerald-400/45 bg-emerald-500/[0.07]", dot: "bg-emerald-400" },
  blocked: { cls: "border-amber-400/45 bg-amber-500/[0.06]", dot: "bg-amber-400" },
  wait: { cls: "border-slate-600/50 bg-slate-800/30", dot: "bg-slate-500" },
};

export default function DecisionCard({ d }: { d: Decision3View }) {
  const st = STATE[d.state], p = d.plan;
  return (
    <section className={`rounded-lg border p-2.5 space-y-2 ${st.cls}`} data-testid="decision3" aria-label="Lớp quyết định MTF v3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${st.dot}`} />
        <span className="text-[12px] font-bold text-slate-100" data-testid="decision3-headline">{d.headline}</span>
        <span className="ml-auto rounded border border-slate-600/60 px-1.5 py-0.5 text-[9.5px] text-slate-400" title="Thiết lập H2 / H3 / H4 và cổng H5 của MTF-v3-prereg chạy kiểm định ở S7 — trước đó chỉ là MÔ TẢ, không phải khuyến nghị">MÔ TẢ · chưa kiểm định</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 text-[10px]">
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase text-slate-500">Thiết lập</div>
          {d.setups.map((s) => (
            <div key={s.key} className="flex gap-1.5" data-testid={`setup-${s.key}`} title={s.why}>
              <span className={s.on ? "text-emerald-300" : "text-slate-600"}>{s.on ? "●" : "○"}</span>
              <span className={s.on ? "text-slate-100 font-bold" : "text-slate-400"}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase text-slate-500">Cổng cấm vào</div>
          {d.gates.map((g) => (
            <div key={g.key} className="flex gap-1.5" data-testid={`gate-${g.key}`}>
              <span className={g.hit ? "text-rose-300" : "text-emerald-300/80"}>{g.hit ? "✗" : "✓"}</span>
              <span className={g.hit ? "text-rose-200" : "text-slate-400"}>{g.label}{g.hit && g.detail ? <span className="text-slate-500"> · {g.detail}</span> : null}</span>
            </div>
          ))}
          {d.late && <div className="flex gap-1.5 text-rose-200"><span>✗</span>Đã quá muộn: giá cách điểm kích hoạt &gt; 1,5 ATR</div>}
        </div>
        <div className="space-y-0.5" data-testid="decision3-plan">
          <div className="text-[9px] uppercase text-slate-500">Kế hoạch nếu vào ở giá hiện tại</div>
          {p ? (
            <>
              <div>Vào <b className="text-slate-100">{price(p.entry)}</b> · cắt lỗ <b className="text-rose-200">{price(p.stop)}</b> <span className="text-slate-500">({p.stopBasis})</span></div>
              <div>Mục tiêu 1 <b className="text-emerald-200">{price(p.target1)}</b> <span className="text-slate-500">({p.target1Basis})</span>{p.target2 ? <> · MT2 <b className="text-emerald-200">{price(p.target2)}</b></> : null}</div>
              <div>R:R <b className={p.ok ? "text-emerald-300" : "text-amber-300"} data-testid="decision3-rr">1 : {p.rr1.toLocaleString("vi-VN")}</b> <span className="text-slate-500">{p.ok ? "≥ 2 — đạt" : "< 2 — không đạt"}</span></div>
              {p.trail != null && <div className="text-slate-400" title="Dừng lỗ kéo lên theo mỗi đáy bảo vệ Dow mới">Dừng lỗ kéo theo đáy bảo vệ: {price(p.trail)}</div>}
            </>
          ) : <div className="text-slate-500">Chưa có mức kỹ thuật dưới giá để đặt cắt lỗ.</div>}
        </div>
      </div>
    </section>
  );
}
