// C2 (25/10/2026) — bảng "Ứng viên tiếp theo": cùng cấu trúc bảng Danh mục Elite 10 (cột 4 = ⏱ Điểm mua), thêm LÝ DO chưa vào danh mục
// (trần ngành / đã đủ 10 mã — Gateway phát lại đúng thuật toán dựng danh mục) và dấu vùng đệm top 20. Có thu gọn (mặc định) và chế độ gọn.
// Đây là danh sách THEO DÕI cùng mô hình Điểm Elite (THĂM DÒ, P vượt ≈ 51%) — không phải tín hiệu mua thêm.
import { useMemo } from "react";
import type { Candidate, EliteDecision } from "../../../lib/elite10/decisionTypes";
import { buyTimingCells } from "../../../lib/elite10/buyTimingCell";
import { BuyTimingCell, num, price, SectionControls, signed } from "./boardParts";
import { useBoardSection } from "./boardPrefs";

const SHOW = 10;

/** Lý do chưa vào danh mục (chữ hiển thị). */
export function reasonText(c: Candidate, sectorName: (k: string | null) => string): { text: string; title: string } {
  const sec = sectorName(c.sectorKey);
  if (c.reason === "sector_cap") return { text: `Trần ngành ${c.sectorCount}/${c.maxPerSector}`, title: `${sec} đã có ${c.sectorCount} mã trong danh mục — quy tắc tối đa ${c.maxPerSector} mã mỗi ngành ICB cấp 2` };
  if (c.reason === "full") return {
    text: "Xếp sau 10 mã", title: `Tới lượt mã này khi danh mục đã đủ 10 mã${c.sectorHeld >= c.maxPerSector ? ` (ngành ${sec} cũng đã đủ ${c.sectorHeld}/${c.maxPerSector})` : ""}`,
  };
  return { text: `Hạng ${c.rank}`, title: "Xếp sau danh mục theo Z" };
}

/** Thiếu `candidates` (Gateway cũ) -> lấy từ `scores` (đủ điều kiện, ngoài danh mục), lý do chưa xác định. */
function fallbackCandidates(d: EliteDecision): Candidate[] {
  const held = new Set(d.portfolio.map((p) => p.ticker));
  return d.scores.filter((s) => s.eligible && !held.has(s.ticker) && s.close != null).slice(0, 20).map((s) => ({
    ticker: s.ticker, rank: s.rank, Z: s.Z, alpha5Pct: s.alpha5Pct, pOutperform: s.pOutperform, sectorKey: s.sectorKey, close: s.close as number, sigma20: s.sigma20 ?? 0,
    stop: NaN, target: NaN, holdSessions: 10, inBuffer: s.rank <= 20, reason: "below", sectorCount: null, maxPerSector: 3, sectorHeld: 0,
  }));
}

export default function EliteCandidates({ d, onOpenTicker, sectorName, drivers, buyRows, sessions }: {
  d: EliteDecision; onOpenTicker: (t: string) => void; sectorName: (k: string | null) => string; drivers: (t: string) => string[];
  buyRows: Parameters<typeof buyTimingCells>[1]; sessions: string[];
}) {
  const { open, compact, toggleOpen, toggleCompact } = useBoardSection("candidates");
  const list = useMemo(() => (d.candidates?.length ? d.candidates : fallbackCandidates(d)), [d]);
  const shown = list.slice(0, SHOW);
  const cells = useMemo(() => buyTimingCells(shown.map((c) => c.ticker), buyRows, d.date, sessions), [shown, buyRows, d.date, sessions]);
  if (!list.length) return null;
  const capped = list.filter((c) => c.reason === "sector_cap").length;

  return (
    <section data-testid="elite-candidates" className="rounded-lg border border-cyan-500/15 bg-slate-950/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-cyan-300/90">Ứng viên tiếp theo <span className="font-normal normal-case text-slate-500">· {shown.length}/{list.length} mã xếp sau danh mục</span></h4>
        <SectionControls id="elite-candidates-table" open={open} compact={compact} onToggleOpen={toggleOpen} onToggleCompact={toggleCompact} testid="elite-candidates" />
      </div>
      {!open ? (
        // Thu gọn: một dòng tóm tắt (giữ testid cũ "elite-next").
        <p className="text-[10.5px] text-slate-400" data-testid="elite-next">
          {shown.slice(0, 5).map((c) => (
            <button key={c.ticker} type="button" onClick={() => onOpenTicker(c.ticker)} className="mr-2 font-bold text-cyan-300/80 hover:underline" title={reasonText(c, sectorName).title}>
              {c.ticker} <span className="font-normal text-slate-500">Z {num(c.Z, 2)} · {cells.get(c.ticker)?.text ?? "—"}</span>
            </button>
          ))}
          {capped > 0 && <span className="text-slate-500">· {capped} mã bị trần ngành</span>}
        </p>
      ) : (
        <div className="overflow-x-auto" id="elite-candidates-table">
          <table className="w-full text-[11px]" style={{ minWidth: compact ? 560 : 900, borderCollapse: "collapse" }}>
            <thead>
              <tr className="text-slate-500">
                <th className="text-left font-normal py-1">Mã</th>
                <th className="text-left font-normal">Ngành</th>
                <th className="text-left font-normal" title="Vì sao mã chưa vào danh mục — phát lại đúng quy tắc dựng danh mục">Lý do chưa vào</th>
                <th className="text-left font-normal pr-2">⏱ Điểm mua</th>
                <th className="font-normal">Z</th>
                {!compact && <th className="font-normal">α 5 phiên</th>}
                <th className="font-normal">P vượt</th>
                {!compact && <th className="font-normal" title="Độ biến động ngày 20 phiên (dùng tính cắt lỗ / mục tiêu)">σ20</th>}
                <th className="whitespace-nowrap pl-2 text-right font-normal">Giá</th><th className="whitespace-nowrap pl-2 text-right font-normal">Cắt lỗ</th>
                {!compact && <th className="whitespace-nowrap pl-2 text-right font-normal">Mục tiêu</th>}
                {!compact && <th className="text-left font-normal pl-3">Động lực chính</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const r = reasonText(c, sectorName);
                return (
                  <tr key={c.ticker} className="border-t border-white/5" data-testid={`elite-cand-${c.ticker}`}>
                    <td className="py-1.5 whitespace-nowrap">
                      <button type="button" onClick={() => onOpenTicker(c.ticker)} className="font-bold text-cyan-300/90 hover:underline">{c.ticker}</button>
                      <span className="ml-1 text-[9px] text-slate-500">#{c.rank}</span>
                      {c.inBuffer && <span title="Trong top 20 — nếu đã có trong danh mục thì được giữ (vùng đệm)" className="ml-1 rounded border border-white/15 px-1 text-[8.5px] text-slate-400">đệm</span>}
                    </td>
                    <td className="pr-2 text-slate-400">{sectorName(c.sectorKey)}</td>
                    <td className={`whitespace-nowrap pr-2 ${c.reason === "sector_cap" ? "text-amber-300" : "text-slate-400"}`} title={r.title} data-testid={`elite-cand-reason-${c.ticker}`}>{r.text}</td>
                    <td className="pr-2 py-1" data-testid={`elite-cand-buy-${c.ticker}`}><BuyTimingCell cell={cells.get(c.ticker)} compact={compact} /></td>
                    <td className="whitespace-nowrap px-1 text-center font-mono">{num(c.Z, 2)}</td>
                    {!compact && <td className="whitespace-nowrap px-1 text-center font-mono text-emerald-300/80">{signed(c.alpha5Pct, 2)}%</td>}
                    <td className="whitespace-nowrap px-1 text-center font-mono">{num(c.pOutperform * 100, 1)}%</td>
                    {!compact && <td className="whitespace-nowrap px-1 text-center font-mono text-slate-400">{num(c.sigma20 * 100, 1)}%</td>}
                    <td className="whitespace-nowrap pl-2 text-right font-mono">{price(c.close)}</td>
                    <td className="whitespace-nowrap pl-2 text-right font-mono text-rose-300/90">{Number.isFinite(c.stop) ? price(c.stop) : "—"}</td>
                    {!compact && <td className="whitespace-nowrap pl-2 text-right font-mono text-emerald-300/90">{Number.isFinite(c.target) ? price(c.target) : "—"}</td>}
                    {!compact && <td className="pl-3 text-slate-400">{drivers(c.ticker).join(" · ") || "—"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-slate-500">
            Danh sách THEO DÕI: các mã đủ điều kiện xếp sau danh mục theo Điểm Elite (cùng nhãn {d.ledgerSummary?.label === "EVIDENCE" ? "ĐẠT TIÊU CHÍ" : "THĂM DÒ"}) — không phải tín hiệu mua thêm.
            Cắt lỗ / mục tiêu cùng công thức danh mục (dải 2σ / 3σ của 5 phiên). Mã vào danh mục ở phiên sau nếu điểm vượt mã đang giữ.
          </p>
        </div>
      )}
    </section>
  );
}
