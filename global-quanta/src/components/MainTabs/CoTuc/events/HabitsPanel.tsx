// LSK2 (07/11/2026) — "Nếp lịch sử": mã thường GDKHQ cổ tức tiền trong khoảng tới nhưng kỳ này CHƯA công bố. Chỉ MÔ TẢ:
// kiểm định đặt trước DF-r1 KHÔNG ĐẠT (lịch sử VNDirect chỉ từ 2022) nên không hiển thị xác suất hay dải ngày.
import { useState } from "react";
import { useDividendHabits } from "../../../../hooks/useCorpEvents";
import { dmy } from "../../../../lib/kqkd/format";

export default function HabitsPanel({ days, onTicker }: { days: number; onTicker: (t: string) => void }) {
  const h = useDividendHabits(Math.max(30, Math.min(180, days)));
  const [all, setAll] = useState(false);
  if (!h) return null;
  const rows = h.rows.filter((r) => all || r.paidYears >= 2);
  return (
    <details className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px]" data-testid="ce-habits">
      <summary className="cursor-pointer text-slate-300"><b className="text-slate-100">Nếp lịch sử — thường GDKHQ trong {h.days} ngày tới nhưng chưa công bố</b> · {rows.length} mã <span className="ml-1 rounded border border-sky-400/40 px-1 text-[10px] text-sky-300">MÔ TẢ</span></summary>
      <div className="mt-1 flex items-center gap-2 text-[10.5px] text-slate-500">
        <label className="flex items-center gap-1"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> gồm cả mã mới trả 1 năm</label>
      </div>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead><tr className="text-left text-[10px] uppercase text-slate-500"><th className="px-1 py-0.5">Mã</th><th className="px-1 py-0.5">Thường GDKHQ quanh</th><th className="px-1 py-0.5">Số năm đã trả đợt này</th><th className="px-1 py-0.5">Lần gần nhất</th></tr></thead>
          <tbody>{rows.slice(0, 80).map((r) => (
            <tr key={`${r.t}${r.usual}`} className="border-t border-white/[0.04]" data-testid="ce-habit-row">
              <td className="px-1 py-0.5"><button type="button" onClick={() => onTicker(r.t)} className="font-mono font-bold text-cf-primary">{r.t}</button></td>
              <td className="px-1 py-0.5 font-mono text-slate-200">{dmy(r.usual).slice(0, 5)}</td>
              <td className="px-1 py-0.5 font-mono text-slate-300">{r.paidYears}/{r.years} năm</td>
              <td className="px-1 py-0.5 text-slate-400">{dmy(r.lastEx)}{r.lastCash ? ` · ${r.lastCash.toLocaleString("vi-VN")} đ` : ""}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">Ngày "thường GDKHQ" là trung bình các lần GDKHQ cũ của cùng đợt; không phải dự báo. Kiểm định đặt trước DF-r1 (dự báo ngày + xác suất) KHÔNG ĐẠT vì lịch sử VNDirect chỉ có từ 2022 — chỉ dùng để biết mã nào nên theo dõi tin công bố.</p>
    </details>
  );
}
