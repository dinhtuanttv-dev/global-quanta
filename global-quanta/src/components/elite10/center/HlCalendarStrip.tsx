// T1 (18/11/2026) — dải "Lịch 10 phiên tới" trên Bảng quyết định Elite HL: sự kiện đã công bố + mốc dự kiến của danh mục và hàng chờ.
// Chỉ hiển thị, không đổi danh mục. Nguồn: hồ sơ PFA-v1 từng mã (/api/elite/profile-fa/:t, đệm CDN) và nguồn thời điểm Elite.
import { useMemo } from "react";
import useSWR from "swr";
import { fetchMarketJson } from "../../../services/marketDataClient";
import { useEliteTiming } from "../../../hooks/elite10/useEliteTiming";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";
import type { ProfileFa } from "../../../lib/elite10/profileFaTypes";
import { buildHlCalendar, HL_CAL_HORIZON, type CalBasis, type CalItem } from "../../../lib/elite10/hlCalendar";

const HL_CAL_QUEUE = 10; // 10 mã đầu hàng chờ — giới hạn số lần gọi hồ sơ
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const BASIS: Record<CalBasis, { text: string; cls: string; title: string }> = {
  ANNOUNCED: { text: "đã công bố", cls: "text-slate-400", title: "Doanh nghiệp đã công bố (CE-v1, VNDirect, đối chiếu CafeF)" },
  EXPECTED: { text: "dự kiến", cls: "text-slate-500", title: "Khoảng dự kiến theo độ trễ công bố lịch sử của chính mã — chưa có ngày chính thức" },
  EXPLORATORY: { text: "THĂM DÒ", cls: "text-amber-300", title: "Săn cổ tức TO-v1: neo ngày công bố, chờ kiểm định tiến TO-r1" },
  VALIDATED_ESTIMATED: { text: "đạt kiểm định · ngày ước tính", cls: "text-sky-300", title: "Vùng Timeline đạt kiểm định nhưng neo ngày sự kiện ƯỚC TÍNH" },
  VALIDATED: { text: "đạt kiểm định", cls: "text-sky-300", title: "Vùng Timeline đạt kiểm định" },
};
const ICON: Record<CalItem["kind"], string> = { EX_CASH: "₫", EX_STOCK: "◫", RIGHTS: "◫", MEETING: "◷", LISTING: "◫", OTHER: "·", KQKD: "▤", TO: "◎", SEASON: "◎" };

export default function HlCalendarStrip({ d, onOpenTicker }: { d: EliteDecision; onOpenTicker: (t: string) => void }) {
  const portfolio = useMemo(() => d.portfolio.map((p) => p.ticker), [d.portfolio]);
  const queue = useMemo(() => (d.hl?.queue ?? []).slice(0, HL_CAL_QUEUE).map((q) => q.ticker), [d.hl?.queue]);
  const tickers = useMemo(() => [...new Set([...portfolio, ...queue])], [portfolio, queue]);
  const { data: profiles } = useSWR(tickers.length ? ["hl-cal-pfa", d.date, tickers.join(",")] : null, async () => {
    const got = await Promise.all(tickers.map((t) => fetchMarketJson<ProfileFa>(`/api/elite/profile-fa/${t}`).catch(() => null)));
    return new Map(tickers.map((t, i) => [t, got[i]] as const));
  }, { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 });
  const timing = useEliteTiming();
  const cal = useMemo(() => (profiles ? buildHlCalendar({ asOf: d.date, sessions: timing.sessions ?? [], portfolio, queue, profiles, timeline: timing.data?.rows ?? null }) : null),
    [profiles, d.date, timing.sessions, timing.data, portfolio, queue]);
  const byDate = useMemo(() => {
    const m = new Map<string, CalItem[]>(); for (const it of cal?.items ?? []) (m.get(it.date) ?? m.set(it.date, []).get(it.date)!).push(it); return [...m];
  }, [cal]);
  const counts = timing.data?.counts, cov = timing.data?.coverage;

  return (
    <section className="rounded-lg border border-white/10 bg-[#0E131F] p-3" data-testid="hl-calendar">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#F5CE72]">Lịch {HL_CAL_HORIZON} phiên tới · danh mục và hàng chờ</h4>
        <span className="text-[10px] text-slate-500">{cal ? `${dm(d.date)} → ${dm(cal.endDate)} · ${cal.withProfile}/${cal.tickers} mã có hồ sơ` : "Đang tải…"} · chỉ hiển thị, không đổi danh mục</span>
      </div>
      {!cal ? <p className="text-[11px] italic text-slate-500">Đang tải lịch sự kiện…</p> : byDate.length === 0 ? (
        <p className="text-[11px] text-slate-400" data-testid="hl-calendar-empty">Không có sự kiện đã công bố hay mốc dự kiến nào trong {HL_CAL_HORIZON} phiên tới cho danh mục và hàng chờ.</p>
      ) : (
        <ol className="flex flex-col gap-1.5" data-testid="hl-calendar-days">
          {byDate.map(([date, list]) => (
            <li key={date} className="flex flex-wrap items-start gap-x-2 gap-y-1 text-[11px]" data-testid={`hl-cal-${date}`}>
              <span className="w-24 shrink-0 font-mono text-slate-300">{dm(date)}<span className="ml-1 text-[10px] text-slate-500">{list[0].sessionsAway === 0 ? "hôm nay" : list[0].sessionsAway != null ? `+${list[0].sessionsAway} phiên` : ""}</span></span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                {list.map((it, i) => (
                  <span key={`${it.ticker}-${it.kind}-${i}`} title={`${it.label}${it.detail ? ` · ${it.detail}` : ""} — ${BASIS[it.basis].title}`}
                    className={`inline-flex flex-wrap items-baseline gap-1 rounded border px-1.5 py-0.5 ${it.inPortfolio ? "border-[#E8B84B]/40" : "border-white/10"}`} data-testid={`hl-cal-item-${it.ticker}-${it.kind}`}>
                    <span aria-hidden="true" className="text-slate-500">{ICON[it.kind]}</span>
                    <button type="button" onClick={() => onOpenTicker(it.ticker)} className={`font-bold hover:underline ${it.inPortfolio ? "text-[#F5CE72]" : "text-slate-300"}`}>{it.ticker}</button>
                    {!it.inPortfolio && <span className="text-[10px] text-slate-500">(hàng chờ)</span>}
                    <span className="text-slate-200">{it.label}</span>
                    {it.detail && <span className="text-[10px] text-slate-500">{it.detail}</span>}
                    <span className={`text-[10px] ${BASIS[it.basis].cls}`}>· {BASIS[it.basis].text}</span>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500" data-testid="hl-calendar-note">
        Số phiên tính theo lịch giao dịch của Gateway (có ngày nghỉ). Với Elite, vùng cổ tức W1–W5 của Timeline được thay bằng Săn cổ tức TO-v1 (neo ngày đã công bố) từ 07/11/2026.
        {counts && cov ? ` Timeline gốc: ${counts.validated} vùng đạt kiểm định trên ${cov.universe} mã — rà soát 07/11 cho thấy tỷ lệ "đạt" ngang dữ liệu giả, nên chỉ dùng để tham khảo lịch.` : ""}
      </p>
    </section>
  );
}
