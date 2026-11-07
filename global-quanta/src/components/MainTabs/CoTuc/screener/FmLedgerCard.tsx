// BL6 (07/11/2026) — sổ theo dõi mô hình nhân tố FM-v1: kết quả các kiểm định đặt trước + sổ tiến BL-L1 (chấm sau 12 tháng).
import { useState } from "react";
import { useFmLedger } from "../../../../hooks/useCorpEvents";

const pct = (x: number | null | undefined) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`);
const addYear = (ym: string) => `${Number(ym.slice(0, 4)) + 1}${ym.slice(4)}`;

/** Kết quả kiểm định đặt trước (backend/src/market/events/BL-prereg.md, BL-r2-prereg.md) — số cố định, không tính lại ở giao diện. */
const TESTS = [
  { id: "BL-r1", text: "IC lợi nhuận 12 tháng 0,142 (t 4,79) ĐẠT · Q5 − Q1 +11,95%/năm ĐẠT · dự đoán cắt cổ tức AUC 0,485 KHÔNG ĐẠT" },
  { id: "BL-r2", text: "dự đoán cắt cổ tức / cp theo năm tài chính: AUC 0,580 (cần ≥ 0,60) KHÔNG ĐẠT · CI [0,515; 0,646] · 125 ca cắt" },
];

export function FmLedgerCard() {
  const [open, setOpen] = useState(false);
  const d = useFmLedger(open);
  return (
    <div className="tw-scope rounded-xl border border-white/[0.06] bg-[#0b0f17] p-2.5" data-testid="fm-ledger-card">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 text-left text-[11px] font-bold text-slate-200">
        🧾 Sổ theo dõi mô hình nhân tố FM-v1
        <span className="rounded border border-sky-400/40 px-1 text-[10px] font-normal text-sky-300">MÔ TẢ</span>
        <span className="ml-auto text-[10px] font-normal text-slate-500">{open ? "▲ thu gọn" : "▼ xem"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-[10.5px]">
          <ul className="space-y-0.5 text-slate-400">
            {TESTS.map((t) => <li key={t.id}><span className="font-mono text-slate-300">{t.id}</span> · {t.text}</li>)}
            <li className="text-slate-500">Đạt đủ mọi tiêu chí mới đổi nhãn sang THĂM DÒ. Hiện dùng để sắp xếp mô tả, không phải tín hiệu mua / bán.</li>
          </ul>
          {!d ? <p className="text-slate-500">Đang tải sổ theo dõi…</p> : (
            <table className="w-full text-[10.5px]" data-testid="fm-ledger-table">
              <thead><tr className="text-left text-[10px] uppercase text-slate-500"><th className="py-0.5">Kỳ ghi</th><th>Số mã</th><th>Chấm vào</th><th className="text-right">Q5 − Q1 (12 tháng)</th></tr></thead>
              <tbody>
                {d.cohorts.length === 0 && <tr><td colSpan={4} className="py-1 text-slate-500">Chưa có kỳ ghi nào.</td></tr>}
                {[...d.cohorts].reverse().map((c) => (
                  <tr key={c.month} className="border-t border-white/[0.04] text-slate-300">
                    <td className="py-0.5 font-mono">{c.month}</td>
                    <td className="font-mono">{c.n}</td>
                    <td className="font-mono">{c.result ? c.result.scoredAt : `~${addYear(c.month)}`}</td>
                    <td className="text-right font-mono">{c.result ? pct(c.result.spread) : <span className="text-slate-500">chờ đủ 12 tháng</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[10px] text-slate-500">Mỗi tháng ghi điểm và nhóm Q1–Q5 của mọi mã; sau 12 tháng chấm lợi nhuận thật theo nhóm. Bản ghi cũ không bị sửa.</p>
        </div>
      )}
    </div>
  );
}
