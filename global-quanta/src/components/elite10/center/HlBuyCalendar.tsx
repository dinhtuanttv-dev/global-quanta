// MP-a (20/11/2026, tài liệu 19 mục 2) — "Lịch vùng mua của danh mục" trong khung Mã đang chọn: mỗi mã đang giữ một dòng từ Timeline
// điểm mua của Elite (useEliteTiming — cùng cache với dải "Lịch 10 phiên tới", không gọi API mới). Chỉ hiển thị số engine đã tính;
// không có khoảng tin cậy hai phía (Timeline chỉ có cận dưới). Nhãn THĂM DÒ luôn hiện; không có chữ "mua" như khuyến nghị.
import { useMemo } from "react";
// BỘ NÃO THỜI ĐIỂM CT2/CT3 (20/11/2026, docs/elite-cycle-timing-brain): lớp "Thời điểm hợp nhất" bật -> hai làn cổ tức (W1–W5 MÔ TẢ + TO
// THĂM DÒ, quyết định Q1) và nhãn phiên không âm; tắt -> đúng như MP-a. Cùng cache, không gọi API mới; số của engine giữ nguyên văn.
import { useTimingBrain } from "../../../hooks/elite10/useTimingBrain";
import { sessionExtra, W_LANE_NOTE } from "../../../lib/timing-brain";
import { portfolioBuyCalendar, SMALL_SAMPLE, type CalRow } from "../../../lib/elite10/portfolioBuyCalendar";
import { num, signed } from "./boardParts";

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pc = (x: number) => `${signed(x * 100, 1)}%`;
const TIER: Record<CalRow["tier"], { text: string; cls: string; title: string }> = {
  VALIDATED: { text: "Đạt (xem ghi chú)", cls: "border-sky-400/50 text-sky-200", title: "Cửa sổ đạt tiêu chí của engine Timeline — nhưng tỷ lệ đạt của Timeline tương đương dữ liệu giả (rà soát 07/11)" },
  NEAR: { text: "Gần đạt — chưa qua kiểm định", cls: "border-slate-500/50 text-slate-300", title: "Engine Timeline: chưa đạt tiêu chí kiểm định" },
  EXPLORATORY: { text: "Săn cổ tức TO — THĂM DÒ", cls: "border-cyan-400/40 text-cyan-200", title: "Vùng Săn cổ tức TO-v1: chờ kiểm định tiến TO-r1" },
};
const isW = (r: CalRow) => r.kind === "DIVIDEND" && r.source === "TIMELINE";
const W_CHIP = { text: "Cổ tức W1–W5 — MÔ TẢ", cls: "border-dashed border-slate-500/60 text-slate-300" };
const STATUS = (r: CalRow) => (r.status === "IN_WINDOW" ? <b className="text-emerald-300">đang mở</b> : r.status === "UPCOMING" ? <>còn {r.sessionsToEntry} phiên</> : <span className="text-slate-500">đã qua</span>);

function Result({ r }: { r: CalRow }) {
  return (
    <span className="whitespace-nowrap">
      kỳ vọng <b className="text-slate-100">{pc(r.netExpectancy)}</b> <span className="text-slate-400">(cận dưới {pc(r.netExpectancyLcb)})</span>
      <span className="block text-[10px] text-slate-400">
        thắng {num(r.winRate * 100, 0)}% · n {r.nEvents}{r.nEvents < SMALL_SAMPLE ? <b className="text-amber-300"> · mẫu rất nhỏ</b> : ""}
        {r.fdrQValue != null ? ` · q ${num(r.fdrQValue, 2)}` : " · chưa kiểm định"} · {r.source === "TO" ? "vượt VN-Index, nhóm lợi suất" : "sau phí 0,45%"}
      </span>
    </span>
  );
}

export default function HlBuyCalendar({ tickers, picked, onPick }: { tickers: readonly string[]; picked: string | null; onPick: (t: string) => void }) {
  const timing = useTimingBrain();
  const cal = useMemo(() => portfolioBuyCalendar(tickers, timing.rows), [tickers, timing.rows]);
  const wCount = timing.active ? cal.lines.reduce((n, l) => n + l.rows.filter(isW).length, 0) : 0;
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-2" data-testid="hl-buy-cal">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
        <p className="text-[10px] font-bold uppercase text-slate-500">Lịch vùng mua của danh mục · {cal.withZone}/{cal.lines.length} mã có vùng</p>
        <span className="rounded border border-amber-400/40 px-1.5 text-[10px] font-bold text-amber-200">THĂM DÒ</span>
      </div>
      {!timing.data ? (
        <p className="text-[11px] text-slate-500" data-testid="hl-buy-cal-missing">{timing.loading ? "Đang tải Timeline…" : `Timeline điểm mua tạm không có${timing.error ? ` (${timing.error})` : ""}.`}</p>
      ) : (
        <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="overflow-x-auto">
          <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 640 }}>
            <thead><tr className="text-left text-[10px] text-slate-500">
              <th className="py-1 font-normal">Mã</th><th className="font-normal">Sự kiện</th><th className="font-normal">Vùng vào</th><th className="font-normal">Thoát</th><th className="font-normal">Bậc</th><th className="font-normal">Kết quả lịch sử</th>
            </tr></thead>
            <tbody>
              {cal.lines.map((l) => (l.rows.length === 0 ? (
                <tr key={l.ticker} className="border-t border-white/5" data-testid={`hl-buy-cal-${l.ticker}`}>
                  <td className="py-1 pr-2"><TickerBtn t={l.ticker} picked={picked} onPick={onPick} /></td>
                  <td colSpan={5} className="text-slate-500">Không có vùng Timeline</td>
                </tr>
              ) : l.rows.map((r, i) => (
                <tr key={`${l.ticker}-${i}`} className={`align-top ${i === 0 ? "border-t border-white/5" : ""}`} data-testid={i === 0 ? `hl-buy-cal-${l.ticker}` : undefined}>
                  <td className="py-1 pr-2">{i === 0 && <TickerBtn t={l.ticker} picked={picked} onPick={onPick} />}</td>
                  <td className="pr-2">{r.kind === "DIVIDEND" ? "Cổ tức " : /KQKD/.test(r.eventLabel) ? "" : "KQKD "}<span className="text-slate-400">{r.eventLabel} {dm(r.eventDate)}{r.estimated ? " (ước tính)" : ""}</span></td>
                  <td className="whitespace-nowrap pr-2">{dm(r.entryFromDate)} → {dm(r.entryToDate)} <span className="block text-[10px] text-slate-400">{STATUS(r)}{timing.active && sessionExtra(r) ? <span data-hl-layer="timing" data-testid="hl-buy-cal-sess">{sessionExtra(r)}</span> : null}</span></td>
                  <td className="whitespace-nowrap pr-2">{dm(r.exitDate)}</td>
                  <td className="pr-2">{timing.active && isW(r)
                    ? <span data-hl-layer="timing" title={`${W_LANE_NOTE} Bậc engine: ${TIER[r.tier].text}.`} data-testid="hl-buy-cal-wlane" className={`whitespace-nowrap rounded border px-1 text-[10px] ${W_CHIP.cls}`}>{W_CHIP.text}<span className="block text-[10px] text-slate-500">engine: {r.tier === "VALIDATED" ? "đạt" : "gần đạt"}</span></span>
                    : <span title={TIER[r.tier].title} className={`whitespace-nowrap rounded border px-1 text-[10px] ${TIER[r.tier].cls}`}>{TIER[r.tier].text}</span>}</td>
                  <td><Result r={r} /></td>
                </tr>
              ))))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500" data-testid="hl-buy-cal-note">
        Timeline: {cal.universe.validated}/{cal.universe.rows} dòng đạt kiểm định trên toàn vũ trụ; tỷ lệ đạt tương đương dữ liệu giả (rà soát 07/11). Chỉ để tham khảo lịch, không đổi danh mục.
        Timeline chỉ có cận dưới của kỳ vọng — không có khoảng tin cậy hai phía.
        {timing.active && <span className="block" data-hl-layer="timing" data-testid="hl-buy-cal-lanes">Hai làn cổ tức: Săn cổ tức TO-v1 (THĂM DÒ) và cửa sổ W1–W5 của Timeline ({wCount} dòng trong danh mục, MÔ TẢ). {W_LANE_NOTE}</span>}
      </p>
    </div>
  );
}

function TickerBtn({ t, picked, onPick }: { t: string; picked: string | null; onPick: (t: string) => void }) {
  return <button type="button" onClick={() => onPick(t)} aria-pressed={picked === t} data-testid={`hl-buy-cal-pick-${t}`}
    className={`min-h-[24px] font-bold hover:underline ${picked === t ? "text-q-accent-strong" : "text-slate-100"}`}>{t}</button>;
}
