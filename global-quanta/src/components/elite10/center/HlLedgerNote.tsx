// HL-v1: dòng tóm tắt SỔ THEO DÕI TIẾN của quy tắc hợp lưu (Gateway ghi mỗi phiên, chấm sau 20 phiên). THĂM DÒ — chỉ mô tả.
import { useHlLedger } from "../../../hooks/elite10/useHlLedger";

const dmy = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");
const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const ORDER = ["sel", "strong", "lead", "impr", "against"] as const;

export default function HlLedgerNote() {
  const { data: L } = useHlLedger();
  if (!L) return null;
  return (
    <div className="mt-1 rounded border border-white/10 px-2 py-1 text-[10px] text-slate-400" data-testid="hl-ledger" title={L.noteVi}>
      <span className="font-bold text-slate-300">Sổ theo dõi tiến HL-v1</span> · từ {dmy(L.start)} · đã ghi <b className="text-slate-200">{L.days}</b> phiên · đã chấm <b className="text-slate-200">{L.scoredDays}</b> phiên ({L.rule.horizon} phiên sau khi ghi)
      {L.scoredDays === 0
        ? <span data-testid="hl-ledger-wait"> · chưa có phiên nào đủ {L.rule.horizon} phiên để chấm — kết quả đầu tiên khoảng 5 tuần sau ngày bắt đầu.</span>
        : (
          <span data-testid="hl-ledger-stats"> · vượt bình quân cả bảng:{" "}
            {ORDER.filter((k) => L.groups[k]?.days).map((k, i) => { const g = L.groups[k]; return <span key={k}>{i ? " · " : ""}{g.labelVi} <b className={g.meanEx != null && g.meanEx > 0 ? "text-emerald-300" : "text-rose-300"}>{pct(g.meanEx)}</b>{g.t != null ? ` (t ${g.t.toLocaleString("vi-VN")})` : ""}</span>; })}
            {" "}— {L.groups.sel?.verdict ?? "CHƯA ĐỦ MẪU"}{L.scoredDays < L.rule.minDays ? ` (cần ${L.rule.minDays} phiên đã chấm)` : ""}
          </span>
        )}
      <span className="ml-1 rounded border border-slate-500/50 px-1 text-slate-400">THĂM DÒ</span>
    </div>
  );
}
