// Elite × TO Giai đoạn II (07/11/2026) — thẻ sổ ảo trong tab Bằng chứng: COMP-r1 (CORE / GUARD / SLEEVE / COMP, đóng góp từng lớp),
// DIV-IC (tín hiệu "đang trong cửa sổ cổ tức" theo khung Elite, sổ riêng ngoài E2), EX-r1 (giữ qua GDKHQ). THĂM DÒ — không đổi danh mục.
import { useEliteToShadow } from "../../../hooks/elite10/useEliteCenter";
import { EquityChart } from "../../MainTabs/CoTuc/to/ToPanels";

const pc = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const ci = (c: [number | null, number | null] | undefined, d = 3) => (c?.[0] == null ? "" : `[${pc(c[0], d)}; ${pc(c[1], d)}]`);
const dm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export default function EliteToShadowCard() {
  const { data: s } = useEliteToShadow();
  return (
    <section className="rounded-lg border border-white/10 bg-[#0E131F] p-3 space-y-2" data-testid="elite-to-shadow">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#F5CE72]">Sổ ảo Elite 10 × Săn cổ tức</h4>
        <span className="rounded border border-sky-400/40 px-1.5 text-[10px] font-semibold text-sky-300">{s?.label ?? "THĂM DÒ"}</span>
        <span className="ml-auto text-[10px] text-slate-500">{s ? `${s.version} · ghi từ ${dm(s.start)} · ${s.days} phiên` : "đang tải…"}</span>
      </div>
      <p className="text-[10.5px] text-slate-400">Đăng ký trước (ELITE-TO-prereg.md): danh mục Elite chính thức KHÔNG đổi. Sổ ảo đo riêng từng lớp so với Elite 10 dòng tiền (CORE):
        GUARD = bán ở phiên cuối còn quyền các vị thế có GDKHQ nhóm lợi suất ≥ 5% (tiền mặt 5 phiên); SLEEVE = thêm tối đa 2 lệnh Săn cổ tức × 10% vốn; COMP = cả hai. Kết luận tại mốc đánh giá (≥ {s?.rule.minDays ?? 60} phiên).</p>
      {!s ? null : s.days === 0 ? <p className="text-[11px] text-slate-500" data-testid="elite-to-shadow-empty">Chưa có phiên nào (ghi từ {dm(s.start)}, cập nhật 20:35 mỗi tối).</p> : <>
        <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4" data-testid="elite-to-shadow-stats">
          {([["Elite 10 dòng tiền (CORE)", s.nav.core, s.maxDD.core], ["+ bảo vệ GDKHQ (GUARD)", s.nav.guard, s.maxDD.guard], ["+ vệ tinh Săn cổ tức (SLEEVE)", s.nav.sleeve, s.maxDD.sleeve], ["Ghép (COMP)", s.nav.comp, s.maxDD.comp]] as [string, number | null, number | null][]).map(([k, v, dd]) => (
            <div key={k} className="rounded-md border border-white/[0.06] px-2 py-1"><p className="text-[10px] uppercase text-slate-500">{k}</p><p className="font-mono text-slate-100">{pc(v)}</p><p className="text-[10px] text-slate-500">sụt giảm {pc(dd)}</p></div>))}
        </div>
        <EquityChart sim={{ curve: s.curve.map(([d, comp, , core]) => [d, comp, core] as [string, number, number]) }} labels={["Ghép (COMP)", "Elite 10 dòng tiền (CORE)"]} height={150} />
        <table className="w-full text-[10.5px]"><thead><tr className="text-left text-[10px] uppercase text-slate-500"><th>Đóng góp so với CORE</th><th className="text-right">TB / phiên</th><th className="text-right">Khoảng 95% (bootstrap khối 10)</th><th className="text-right">Cộng dồn</th></tr></thead>
          <tbody>{([["Bảo vệ GDKHQ", s.delta.guard, s.guardDays], ["Vệ tinh Săn cổ tức", s.delta.sleeve, s.sleeveDays], ["Ghép", s.delta.comp, null]] as [string, typeof s.delta.comp, number | null][]).map(([k, v, n]) => (
            <tr key={k} className="border-t border-white/[0.04]"><td className="py-0.5 text-slate-300">{k}{n != null ? <span className="text-slate-500"> · {n} phiên có hoạt động</span> : null}</td><td className="text-right font-mono">{pc(v.mean, 3)}</td><td className="text-right font-mono text-slate-400">{ci(v.ci95)}</td><td className="text-right font-mono">{pc(v.total)}</td></tr>))}</tbody></table>
        <p className="text-[10.5px]" data-testid="elite-to-shadow-verdict">COMP-r1: <b className={s.compVerdict === "ĐẠT" ? "text-emerald-300" : s.compVerdict === "KHÔNG ĐẠT" ? "text-rose-300" : "text-slate-300"}>{s.compVerdict}</b>
          {" "}· DIV-IC: TB {s.ic.mean == null ? "—" : s.ic.mean.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} · t {s.ic.t ?? "—"} · {s.ic.days} phiên → <b>{s.ic.verdict}</b></p>
      </>}
      {s?.coreNoteVi && <p className="text-[10px] text-amber-200" data-testid="elite-to-shadow-core">{s.coreNoteVi}</p>}
      {s?.ex && <p className="text-[10.5px] text-slate-400" data-testid="elite-to-shadow-ex">EX-r1 (giữ qua GDKHQ 5 phiên, nhóm ≥ 5%): {s.ex.n ? `${pc(s.ex.stats.mean)} ${ci(s.ex.stats.ci95, 2)} / ${s.ex.n} đợt` : "chưa có đợt nào"} · lần xem tới {s.ex.nextLook ?? "—"} đợt · tham chiếu 2022–26 {pc(s.ex.ref.mean)} [{pc(s.ex.ref.ci95[0])}; {pc(s.ex.ref.ci95[1])}] / {s.ex.ref.n} đợt → <b>{s.ex.label}</b></p>}
    </section>
  );
}
