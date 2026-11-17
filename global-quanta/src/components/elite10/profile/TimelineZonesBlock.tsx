// T2 (18/11/2026) — Hồ sơ 360° · Sự kiện & thời điểm: "Vùng Timeline của mã" — đọc nguyên văn nguồn thời điểm Elite (Timeline Gateway,
// vùng cổ tức W1–W5 đã thay bằng Săn cổ tức TO-v1). CHỈ ĐỌC — engine Timeline điểm mua khoá, không tính lại, không đổi danh mục.
import { useEliteTiming } from "../../../hooks/elite10/useEliteTiming";
import { isToRow } from "../../../lib/elite10/toTiming";
import type { TimelineRow } from "../../../lib/cotuc/buy-timeline";
import { Block, Evidence, fmtDate, num, pct, spct, tone } from "./pfaParts";

const TIER: Record<string, { text: string; cls: string; title: string }> = {
  VALIDATED: { text: "ĐẠT KIỂM ĐỊNH", cls: "border-sky-400/50 text-sky-200", title: "Qua kiểm định của Timeline (số lần, tỷ lệ thắng, kỳ vọng sau phí, FDR)" },
  NEAR: { text: "GẦN ĐẠT", cls: "border-slate-400/40 text-slate-300", title: "Chưa đủ điều kiện kiểm định — chỉ để tham khảo lịch" },
  EXPLORATORY: { text: "THĂM DÒ", cls: "border-amber-400/50 text-amber-200", title: "Săn cổ tức TO-v1: neo ngày công bố, chờ kiểm định tiến TO-r1" },
};
const STATUS: Record<string, string> = { UPCOMING: "sắp tới", IN_WINDOW: "đang mở", PASSED: "đã qua" };
const KIND: Record<string, string> = { DIVIDEND: "Cổ tức", EARNINGS: "Mùa vụ KQKD" };

export default function TimelineZonesBlock({ ticker }: { ticker: string }) {
  const timing = useEliteTiming();
  const rows: TimelineRow[] = (timing.data?.rows ?? []).filter((r) => r.ticker.toUpperCase() === ticker.toUpperCase());
  const counts = timing.data?.counts, cov = timing.data?.coverage;
  return (
    <Block title="Vùng Timeline của mã" testId="pfa-timeline" right={<Evidence label="CHỈ ĐỌC" title="Đọc nguyên văn nguồn thời điểm Elite; Timeline điểm mua bị khoá, hồ sơ không tính lại" />}>
      {timing.loading && !timing.data ? <p className="text-[11px] italic text-slate-500">Đang tải Timeline…</p> : !rows.length ? (
        <p className="text-[11px] text-slate-500" data-testid="pfa-timeline-none">{ticker} không có vùng Timeline nào (đạt, gần đạt hay Săn cổ tức) ở phiên này.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 640 }} data-testid="pfa-timeline-table">
            <thead><tr className="text-left text-[10px] text-slate-500">
              <th className="py-1 font-normal">Bậc</th><th className="font-normal">Loại</th><th className="font-normal">Trạng thái</th><th className="font-normal">Vào → bán</th>
              <th className="font-normal">Ngày sự kiện</th><th className="text-right font-normal">Số lần</th><th className="text-right font-normal">Tỷ lệ thắng</th>
              <th className="text-right font-normal">Kỳ vọng sau phí (cận dưới)</th><th className="text-right font-normal">q</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const to = isToRow(r), tier = TIER[to ? "EXPLORATORY" : r.tier] ?? TIER.NEAR;
                return (
                  <tr key={`${r.kind}-${r.entryFromDate}-${i}`} className="border-t border-white/5" data-testid={`pfa-timeline-row-${i}`}>
                    <td className="py-1 pr-2"><span className={`rounded border px-1 py-px text-[10px] font-bold ${tier.cls}`} title={tier.title}>{tier.text}</span></td>
                    <td className="pr-2">{to ? "Săn cổ tức TO-v1" : KIND[r.kind] ?? r.kind}{r.windowLabel && !to ? <span className="block text-[10px] text-slate-500">{r.windowLabel}</span> : null}</td>
                    <td className="pr-2">{STATUS[r.status] ?? r.status}{r.status === "UPCOMING" && r.sessionsToEntry != null ? <span className="text-slate-500"> · sau {r.sessionsToEntry} phiên</span> : null}</td>
                    <td className="pr-2 font-mono text-slate-300">{fmtDate(r.entryFromDate)}–{fmtDate(r.entryToDate)} → {fmtDate(r.exitDate)}</td>
                    <td className="pr-2">{fmtDate(r.eventDate)}{r.eventDateBasis === "ESTIMATED" ? <span className="ml-1 text-[10px] text-amber-300" title="Ngày sự kiện chưa công bố — ước tính theo chu kỳ, có thể lệch hàng chục phiên">(ước tính)</span> : r.eventDateBasis === "ANNOUNCED" ? <span className="ml-1 text-[10px] text-slate-500">(đã công bố)</span> : null}</td>
                    <td className="text-right tabular-nums">{r.nEvents ?? "—"}</td>
                    <td className="text-right tabular-nums">{r.winRate != null ? pct(r.winRate, 0) : "—"}</td>
                    <td className={`text-right tabular-nums ${tone(r.netExpectancy)}`}>{r.netExpectancy != null ? spct(r.netExpectancy) : "—"}{r.netExpectancyLcb != null ? <span className="text-slate-500"> ({spct(r.netExpectancyLcb)})</span> : null}</td>
                    <td className="text-right tabular-nums text-slate-400">{!to && r.fdrQValue != null ? num(r.fdrQValue, 2) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.some((r) => r.missing?.length) && (
            <ul className="mt-1 space-y-0.5 text-[10px] text-slate-500" data-testid="pfa-timeline-missing">
              {rows.filter((r) => r.missing?.length).map((r, i) => <li key={i}>{KIND[r.kind] ?? r.kind} {fmtDate(r.entryFromDate)}: còn thiếu — {r.missing!.join("; ")}</li>)}
            </ul>
          )}
        </div>
      )}
      <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500" data-testid="pfa-timeline-note">
        Với Elite, vùng cổ tức W1–W5 của Timeline được thay bằng Săn cổ tức TO-v1 (neo ngày đã công bố) từ 07/11/2026.
        {counts && cov ? ` Toàn bộ Timeline phiên này: ${counts.validated} vùng đạt kiểm định trên ${cov.universe} mã.` : ""} Rà soát 07/11 cho thấy tỷ lệ "đạt" của Timeline ngang dữ liệu giả và lịch sử cổ tức chỉ từ 2022,
        nên vùng chỉ để tham khảo lịch — không phải tín hiệu mua và không đổi danh mục.
      </p>
    </Block>
  );
}
