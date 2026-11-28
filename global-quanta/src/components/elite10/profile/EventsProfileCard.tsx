// PFA-v1 — Hồ sơ 360° · góc SỰ KIỆN & THỜI ĐIỂM: lịch công bố KQKD, sự kiện doanh nghiệp đã công bố (sắp tới / gần đây / trạng thái
// giao dịch), lịch sử Săn cổ tức TO-v1 của mã. Chỉ sự kiện đã CÔNG BỐ tới phiên — không dựng ngày GDKHQ ước tính.
import { useProfileFa } from "../../../hooks/elite10/useProfileFa";
import type { PfaEvent } from "../../../lib/elite10/profileFaTypes";
import { Block, Evidence, fmtDate, num, pct, spct, Stat, tone, vnd } from "./pfaParts";
import TimelineZonesBlock from "./TimelineZonesBlock";
import DilutionProfileBlock from "./DilutionProfileBlock";

const detailOf = (e: PfaEvent) =>
  e.cat === "CASH" ? `${vnd(e.cash)}/cp${e.pay ? ` · trả ${fmtDate(e.pay)}` : ""}`
    : e.cat === "STOCK" || e.cat === "BONUS" || e.cat === "RIGHTS" ? (e.ratio != null ? `tỷ lệ ${num(e.ratio, 0)}%` : "")
      : e.meeting ? `họp ${fmtDate(e.meeting)}` : e.title ?? "";

function EventTable({ rows, testId, upcoming = false }: { rows: PfaEvent[]; testId: string; upcoming?: boolean }) {
  if (!rows.length) return <p className="text-[11px] text-slate-500" data-testid={testId}>{upcoming ? "Chưa có sự kiện nào được công bố cho thời gian tới." : "Không có sự kiện trong 120 ngày qua."}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 520 }} data-testid={testId}>
        <thead><tr className="text-left text-[10px] text-slate-500"><th className="py-1 font-normal">Ngày hiệu lực</th><th className="font-normal">Sự kiện</th><th className="font-normal">Chi tiết</th><th className="font-normal">Công bố</th>{upcoming && <th className="text-right font-normal">Còn</th>}</tr></thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={`${e.cat}-${e.date}-${i}`} className="border-t border-white/5">
              <td className="py-1 pr-2 font-mono">{fmtDate(e.date)}</td>
              <td className="pr-2">{e.label}</td>
              <td className="pr-2 text-slate-400">{detailOf(e)}</td>
              <td className="pr-2 text-slate-500">{fmtDate(e.disclosed)}{e.leadDays != null ? ` (trước ${e.leadDays} ngày)` : ""}</td>
              {upcoming && <td className="text-right tabular-nums">{e.sessionsAway != null ? `~${e.sessionsAway} phiên` : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** HS360-v3 H5: onOpenFocus — mở mã trong khung "Mã đang chọn" của tab 1 (chỉ khi mã đang giữ / trong hàng chờ). */
export default function EventsProfileCard({ ticker, onOpenFocus }: { ticker: string; onOpenFocus?: () => void }) {
  const { data, error, isLoading } = useProfileFa(ticker);
  if (isLoading) return <p className="tw-scope py-3 text-xs italic text-slate-500">Đang tải lịch sự kiện {ticker}…</p>;
  if (error) return <p className="tw-scope text-xs text-rose-400">Không tải được lịch sự kiện {ticker}: {String((error as Error).message ?? error)}.</p>;
  if (!data || data.missing) return <p className="tw-scope rounded-lg border border-white/10 p-3 text-[11px] text-slate-400" data-testid="pfa-events-missing">{ticker} không nằm trong bảng tín hiệu của phiên, nên chưa có lịch sự kiện.</p>;
  const cur = data.calendar?.current, nx = data.calendar?.next, ev = data.events, to = data.to;
  return (
    <div className="tw-scope space-y-3 text-slate-200" data-testid="pfa-events">
      <Block title="Lịch công bố kết quả kinh doanh" testId="pfa-calendar" right={<Evidence label="MÔ TẢ" title="Khoảng dự kiến theo độ trễ công bố lịch sử của chính mã" />}>
        <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
          <Stat label="Quý vừa rồi" testId="pfa-cal-current" sub={cur?.medianLag != null ? `Độ trễ thường lệ ${cur.medianLag} ngày sau hết quý` : undefined}>
            {cur?.date ? <>Đã công bố {fmtDate(cur.date)}</> : cur ? <>Chưa công bố · dự kiến {fmtDate(cur.band?.[0])} – {fmtDate(cur.band?.[1])}</> : "—"}
          </Stat>
          <Stat label="Quý tới" testId="pfa-cal-next" sub={nx?.lateShare != null ? `${pct(nx.lateShare, 0)} số kỳ trước công bố trễ hạn · ${nx.ownN ?? "—"} kỳ lịch sử` : undefined}>
            {nx?.band ? <>Dự kiến {fmtDate(nx.band[0])} – {fmtDate(nx.band[1])}</> : "—"}
          </Stat>
        </div>
      </Block>

      {(ev?.status.length ?? 0) > 0 && (
        <Block title="Trạng thái giao dịch" testId="pfa-status">
          <ul className="space-y-0.5 text-[11px] text-amber-200">{ev!.status.map((s, i) => <li key={i}>⚠ {s.label} — {fmtDate(s.date)}</li>)}</ul>
        </Block>
      )}

      <Block title="Sự kiện sắp tới (đã công bố)" testId="pfa-upcoming" right={<span className="text-[10px] text-slate-500">"Còn" = số phiên, không trừ ngày lễ</span>}>
        <EventTable rows={ev?.upcoming ?? []} testId="pfa-upcoming-table" upcoming />
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500" data-testid="pfa-no-forecast">
          Ngày GDKHQ ở Việt Nam thường chỉ được công bố trước khoảng 2 tuần (trung vị 14 ngày lịch). Hồ sơ vì vậy <b>không chấm điểm theo khoảng cách tới GDKHQ ước tính</b>: ngày ước tính theo chu kỳ lệch tới hàng chục phiên, còn dùng ngày thật trước khi công bố là nhìn trước.
        </p>
      </Block>

      <DilutionProfileBlock ticker={ticker} />

      <TimelineZonesBlock ticker={ticker} />

      <Block title="Sự kiện gần đây (120 ngày)" testId="pfa-recent"><EventTable rows={ev?.recent ?? []} testId="pfa-recent-table" /></Block>

      <Block title="Săn cổ tức TO-v1 — các lần gần đây của mã" testId="pfa-to" right={<Evidence label="THĂM DÒ" title="TO-v1: mua sau ngày công bố, bán phiên cuối còn quyền; sổ theo dõi tiến TO-L1 từ 09/11/2026" />}>
        {onOpenFocus && <button type="button" onClick={onOpenFocus} data-touch data-testid="pfa-to-open-focus" className="mb-1.5 min-h-[24px] rounded border border-white/10 px-2 text-[10.5px] text-slate-300 hover:border-q-accent/50 hover:text-q-text">Xem lần chi trả sắp tới trong khung "Mã đang chọn" (tab 1) →</button>}
        {!to?.available ? <p className="text-[11px] text-slate-500" data-testid="pfa-to-none">Mã chưa có lần chi trả nào trong phạm vi Săn cổ tức.</p> : (
          <>
            <p className="mb-1 text-[11px] text-slate-400" data-testid="pfa-to-summary">{to.done ?? 0} lần đã đóng · vượt VN-Index ở {pct(to.hitRate, 0)} số lần</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 520 }} data-testid="pfa-to-table">
                <thead><tr className="text-left text-[10px] text-slate-500"><th className="py-1 font-normal">GDKHQ</th><th className="font-normal">Lợi suất</th><th className="font-normal">Vào → ra</th><th className="text-right font-normal">Vượt VN-Index</th><th className="text-right font-normal">5 phiên sau GDKHQ</th></tr></thead>
                <tbody>
                  {to.events!.map((e) => (
                    <tr key={e.ex} className="border-t border-white/5">
                      <td className="py-1 pr-2 font-mono">{fmtDate(e.ex)}</td>
                      <td className="pr-2">{pct(e.yield)}{e.qualifies ? <span className="ml-1 text-emerald-300" title="Đạt điều kiện vào lệnh của TO-v1">●</span> : null}</td>
                      <td className="pr-2 text-slate-400">{fmtDate(e.entryDate)} → {fmtDate(e.exitDate)}</td>
                      <td className={`text-right tabular-nums ${tone(e.excess)}`}>{spct(e.excess)}</td>
                      <td className={`text-right tabular-nums ${tone(e.postEx5)}`}>{spct(e.postEx5)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Block>
      <p className="text-[10px] text-slate-500">Lịch sự kiện theo CE-v1 (VNDirect, đối chiếu CafeF), khoá theo phiên {fmtDate(data.asOf)}. Mô phỏng thời điểm vào cổ tức / KQKD và Săn cổ tức chi tiết ở góc nhìn Tổng hợp.</p>
    </div>
  );
}
