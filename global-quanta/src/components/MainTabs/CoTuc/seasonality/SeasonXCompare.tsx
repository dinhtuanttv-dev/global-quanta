// S8 (06/11/2026) — so sánh Mùa vụ bản chính (ngày làm mốc = ngày nhập dữ liệu VNDirect) với bản THĂM DÒ (ngày công bố thật, tin công bố
// của doanh nghiệp trên CafeF). Cùng giá, cùng hàm, cùng ngưỡng — chỉ khác ngày làm mốc. Không thay bản chính.
import { dmy, fin, num, pct, pctPlain } from "../../../../lib/kqkd/format";
import type { SeasonalityBundle, SeasonalityX, SeasonXStatus, SeasonWinStatus } from "../../../../lib/kqkd/types";
import { STATUS_UI } from "./SeasonBoards";

interface Win { id: string; label?: string; nEvents: number; netExpectancy: number | null; netExpectancyLcb: number | null; fdrQValue: number | null }
interface Stats { selectedWindowId?: string | null; windows?: Win[] }
/** Đúng quy tắc trạng thái của EarningsSeasonalityTab (ĐẠT / THEO DÕI / CHƯA ĐỦ MẪU / KHÔNG CÓ LỢI THẾ). */
export function winStatus(w: Win, selected: string | null | undefined, minEvents = 8): SeasonWinStatus {
  if (w.id === selected) return "SELECTED";
  if (w.nEvents < minEvents && ((w.fdrQValue ?? 1) <= 0.2 || (w.netExpectancyLcb ?? -1) > 0)) return "WATCH";
  if (w.nEvents < minEvents) return "THIN";
  return "NONE";
}

function Chip({ s }: { s: SeasonWinStatus }) { return <span className={`rounded border px-1 font-sans text-[10px] font-bold ${STATUS_UI[s].cls}`}>{STATUS_UI[s].t}</span>; }

export default function SeasonXCompare({ official, x, status }: { official: SeasonalityBundle; x: SeasonalityX; status: SeasonXStatus | null }) {
  const ev = status?.evaluate ?? null;
  const filing = x.cafef.filter((c) => c.tier === "FILING");
  const rows = [1, 2, 3, 4].flatMap((q) => {
    const a = official.items[`stats:${q}`]?.body as Stats | undefined, b = x.items[`stats:${q}`]?.body as Stats | undefined;
    return (a?.windows ?? []).map((w) => {
      const v = b?.windows?.find((y) => y.id === w.id);
      return { q, w, v, sa: winStatus(w, a?.selectedWindowId), sb: v ? winStatus(v, b?.selectedWindowId) : null };
    });
  });
  const changed = rows.filter((r) => r.sb && r.sa !== r.sb).length;
  return (
    <section className="tw-scope space-y-2 rounded-lg border border-sky-400/25 bg-sky-400/[0.03] p-3" data-testid="season-x-compare">
      <p className="text-[11px] text-slate-300">
        <span className="mr-1 rounded border border-sky-400/40 px-1 text-[10px] text-sky-300">THĂM DÒ</span>
        <b className="text-slate-100">Ngày làm mốc = ngày công bố thật.</b> Cùng giá SSI tổng lợi suất, cùng hàm và ngưỡng của bản chính; chỉ thay ngày nhập dữ liệu VNDirect bằng ngày doanh nghiệp công bố BCTC / kết quả kinh doanh (tin công bố trên CafeF). Kỳ không tìm được tin công bố giữ ngày VNDirect.
      </p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-md border border-white/[0.07] px-2 py-1.5" data-testid="season-x-eval"><p className="text-[10px] font-bold uppercase text-slate-500">Độ chính xác ngày CafeF</p><p className={`font-mono text-[14px] font-bold ${ev?.pass ? "text-emerald-300" : "text-amber-300"}`}>{fin(ev?.precision) ? pctPlain(ev!.precision, 0) : "—"}</p><p className="text-[10px] text-slate-500">{ev ? `${ev.ok}/${ev.found} kỳ lệch ≤ 1 phiên so tin BCTC chính thức · ${ev.pass ? "ĐẠT tiêu chí" : "chưa đạt"}` : "chưa đánh giá"}</p></div>
        <div className="rounded-md border border-white/[0.07] px-2 py-1.5"><p className="text-[10px] font-bold uppercase text-slate-500">Ngày đã thay ({x.ticker})</p><p className="font-mono text-[14px] font-bold text-slate-100">{x.sources ? `${x.sources.cafef}/${x.sources.cafef + x.sources.vnd}` : "—"}</p><p className="text-[10px] text-slate-500">kỳ dùng ngày công bố thật{x.sources?.added ? ` · thêm ${x.sources.added} kỳ` : ""}</p></div>
        <div className="rounded-md border border-white/[0.07] px-2 py-1.5"><p className="text-[10px] font-bold uppercase text-slate-500">Ngày VNDirect trễ (toàn thị trường)</p><p className="font-mono text-[14px] font-bold text-slate-100">{ev?.vndLag ? `${ev.vndLag.median} phiên` : "—"}</p><p className="text-[10px] text-slate-500">{ev?.vndLag ? `trung vị · ${pctPlain(ev.vndLag.share2plus, 0)} số kỳ trễ ≥ 2 phiên (2020–2023)` : ""}</p></div>
        <div className="rounded-md border border-white/[0.07] px-2 py-1.5"><p className="text-[10px] font-bold uppercase text-slate-500">Cửa sổ đổi trạng thái</p><p className="font-mono text-[14px] font-bold text-slate-100" data-testid="season-x-changed">{changed}/{rows.length}</p><p className="text-[10px] text-slate-500">dựng {dmy(x.builtAt)}</p></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[11px]" data-testid="season-x-table">
          <thead><tr className="text-right text-[10px] uppercase text-slate-500"><th className="px-1 py-1 text-left">Quý · cửa sổ</th><th className="px-1 py-1">Bản chính</th><th className="px-1 py-1">Kỳ · ròng · q</th><th className="px-1 py-1">Bản THĂM DÒ</th><th className="px-1 py-1">Kỳ · ròng · q</th></tr></thead>
          <tbody>
            {rows.map(({ q, w, v, sa, sb }) => (
              <tr key={`${q}${w.id}`} className={`text-right font-mono tabular-nums ${sb && sb !== sa ? "bg-sky-400/[0.06]" : ""}`}>
                <td className="px-1 py-0.5 text-left font-sans text-slate-300">Q{q} · {w.label ?? w.id}</td>
                <td className="px-1 py-0.5"><Chip s={sa} /></td>
                <td className="px-1 py-0.5 text-slate-400">{w.nEvents} · {pct(w.netExpectancy, 1)} · {num(w.fdrQValue, 2)}</td>
                <td className="px-1 py-0.5">{sb ? <Chip s={sb} /> : "—"}</td>
                <td className="px-1 py-0.5 text-slate-300">{v ? `${v.nEvents} · ${pct(v.netExpectancy, 1)} · ${num(v.fdrQValue, 2)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filing.length > 0 && (
        <details className="text-[10.5px] text-slate-400" data-testid="season-x-dates">
          <summary className="cursor-pointer text-slate-300">Ngày công bố thật đã dùng ({filing.length} kỳ)</summary>
          <ul className="mt-1 grid gap-0.5 md:grid-cols-2">{filing.slice(0, 40).map((c) => <li key={c.fiscal}><span className="font-mono text-slate-200">{dmy(c.date)}</span> · kỳ {c.fiscal.slice(0, 7)} · {c.title}</li>)}</ul>
        </details>
      )}
      <p className="text-[10px] text-slate-500">Bản THĂM DÒ không thay bản chính và không đổi Timeline điểm mua. Nó trả lời: nếu đặt "ngày 0" đúng ngày công bố thật thì thống kê mùa vụ thay đổi thế nào. Số kỳ vẫn tính từ 2020 (giá SSI); lịch sử về 2013 đang được đọc thêm ban đêm. {ev?.rule}</p>
    </section>
  );
}
