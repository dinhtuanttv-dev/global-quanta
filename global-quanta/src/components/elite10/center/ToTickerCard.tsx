// Elite × TO (07/11/2026) — Hồ sơ 360°: thẻ "Sự kiện cổ tức" của một mã.
// Đợt đang diễn ra (vùng vào / phiên bán / T+2 / kỳ vọng nhóm) + lịch sử từng đợt: TO-r1 tới phiên cuối còn quyền và phần giữ qua GDKHQ 5 phiên.
// Mọi số là MÔ TẢ / THĂM DÒ (kiểm định tiến TO-r1, EX-r1) — không phải khuyến nghị, không đổi danh mục Elite.
import { useToOverview, useToTicker } from "../../../hooks/useCorpEvents";
import { ciText, dm, pct, pctS } from "../../../lib/cotuc/to";

export default function ToTickerCard({ ticker }: { ticker: string }) {
  const { data: ov } = useToOverview(true);
  const { data: hist, error } = useToTicker(ticker);
  const live = ov?.radar.rows.find((r) => r.t === ticker.toUpperCase()) ?? null;
  const done = (hist?.events ?? []).filter((e) => e.outcome || e.postEx5);
  return (
    <section className="tw-scope rounded-lg border border-white/10 bg-[#0E131F] p-3 text-slate-200" data-testid="elite-to-card">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <h4 className="text-[12px] font-bold text-[#F5CE72]">💰 Sự kiện cổ tức · Săn cổ tức trước GDKHQ</h4>
        <span className="rounded border border-sky-400/40 px-1.5 text-[10px] font-semibold text-sky-300">{ov?.label ?? "THĂM DÒ"}</span>
      </div>
      {live ? (
        <div className={`mb-2 rounded-md border p-2 text-[11px] ${live.qualifies ? "border-emerald-400/40 bg-emerald-400/[0.06]" : "border-white/10"}`} data-testid="elite-to-live">
          <p><b>Đợt đang diễn ra:</b> {live.cash.toLocaleString("vi-VN")} đ/cp · lợi suất {pct(live.yieldNow ?? live.yieldPre)} · công bố {dm(live.disclosed)} · GDKHQ {dm(live.ex)}</p>
          <p className="text-slate-400">Phiên cuối còn quyền {dm(live.lastCumDate)} · còn {live.sessionsLeft ?? "—"} phiên · {live.t2Ok ? "kịp T+2" : "không kịp T+2"} ·{" "}
            {live.qualifies ? <b className="text-emerald-300">đủ điều kiện TO-r1</b> : "chưa đủ điều kiện TO-r1"} · đã chạy {pctS(live.runUp)}</p>
          {live.expected && <p className="text-slate-400">Nhóm {live.bucket} trong quá khứ: vượt VN-Index {pctS(live.expected.mean, 2)} {ciText(live.expected)} · thắng {pct(live.expected.hit, 0)} / {live.expected.n} lệnh</p>}
          {ov?.reference?.postEx?.[live.bucket] && <p className="text-slate-400">Giữ qua GDKHQ 5 phiên (cùng nhóm, đã gồm cổ tức sau thuế): {pctS(ov.reference.postEx[live.bucket].mean, 2)} {ciText(ov.reference.postEx[live.bucket])}</p>}
        </div>
      ) : <p className="mb-2 text-[11px] text-slate-500">Hiện không có đợt cổ tức tiền nào của {ticker} đang chờ GDKHQ.</p>}
      {error ? <p className="text-[11px] text-slate-500">Chưa tải được lịch sử cổ tức.</p> : !hist ? <p className="text-[11px] text-slate-500">Đang tải lịch sử…</p> : done.length === 0 ? <p className="text-[11px] text-slate-500">Chưa có đợt cổ tức tiền nào đủ dữ liệu giá (từ 2022).</p> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-[10.5px]" data-testid="elite-to-history">
          <thead><tr className="text-left text-[10px] uppercase text-slate-500"><th className="py-0.5">GDKHQ</th><th>Cổ tức</th><th>Lợi suất</th><th>TO-r1</th>
            <th className="text-right" title="Vào phiên đầu sau công bố, bán phiên cuối còn quyền; vượt VN-Index sau phí">Công bố → trước GDKHQ</th>
            <th className="text-right" title="Giữ tiếp 5 phiên qua GDKHQ; vượt VN-Index, đã gồm cổ tức nhận sau thuế">Giữ qua GDKHQ 5 phiên</th></tr></thead>
          <tbody>{done.slice(0, 12).map((e) => (
            <tr key={e.ex} className="border-t border-white/[0.04]"><td className="py-0.5 font-mono">{dm(e.ex)}/{e.ex.slice(2, 4)}</td><td className="font-mono">{e.cash.toLocaleString("vi-VN")}</td><td className="font-mono">{pct(e.y)}</td>
              <td>{e.qualifies ? <span className="text-emerald-300">đủ</span> : <span className="text-slate-500">—</span>}</td>
              <td className={`text-right font-mono ${(e.outcome?.excess ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{e.outcome ? pctS(e.outcome.excess) : "—"}</td>
              <td className={`text-right font-mono ${(e.postEx5?.excess ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{e.postEx5 ? pctS(e.postEx5.excess) : "—"}</td></tr>))}</tbody>
        </table></div>)}
      <p className="mt-1.5 text-[10px] text-slate-500">Nguồn: sự kiện VNDirect + giá điều chỉnh trên Gateway. Số liệu MÔ TẢ quá khứ; kết luận chỉ từ sổ theo dõi tiến TO-L1 / EX-r1.</p>
    </section>
  );
}
