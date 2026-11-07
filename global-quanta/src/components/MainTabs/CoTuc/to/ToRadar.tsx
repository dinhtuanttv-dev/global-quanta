// TO-v1 (07/11/2026) — Radar "Săn cổ tức trước GDKHQ": mọi đợt cổ tức tiền mặt đã công bố, GDKHQ chưa tới.
// Lợi suất tính lại theo giá khớp trực tiếp (SSI); "đã chạy" = vượt VN-Index từ trước công bố tới phiên đóng cửa gần nhất.
import { useMemo, useState } from "react";
import { useBoardQuotes } from "../../../../hooks/useBoardQuotes";
import { bil, ciText, dm, liveChange, liveYield, pct, pctS, type ToOverview, type ToRadarRow } from "../../../../lib/cotuc/to";

const TH = "sticky top-0 z-10 bg-[#0b0f17] px-1.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-white/10 leading-tight align-bottom";
const TD = "px-1.5 py-1.5 border-b border-white/[0.05] align-top";

function Chip({ tone, children, title, testid }: { tone: "ok" | "warn" | "bad" | "muted" | "info"; children: React.ReactNode; title?: string; testid?: string }) {
  const cls = { ok: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300", warn: "border-amber-400/40 bg-amber-400/10 text-amber-300", bad: "border-rose-400/40 bg-rose-400/10 text-rose-300", muted: "border-white/10 text-slate-500", info: "border-sky-400/40 bg-sky-400/10 text-sky-300" }[tone];
  return <span title={title} data-testid={testid} className={`inline-flex whitespace-nowrap rounded-md border px-1.5 py-[1px] text-[10px] font-semibold ${cls}`}>{children}</span>;
}

/** Lý do không đủ điều kiện TO-r1 (theo đúng quy tắc đã đăng ký). */
export function notQualifiedReasons(r: ToRadarRow, minYield: number): string[] {
  const out: string[] = [];
  if (r.yieldPre < minYield) out.push(`lợi suất ${pct(r.yieldPre)} < ${pct(minYield, 0)}`);
  if (!r.liquidityOk) out.push("GTGD 20 phiên < 1 tỷ");
  if (r.limitUpEntry) out.push("phiên vào tăng trần");
  return out;
}

export function ToRadar({ data, onSelectTicker }: { data: ToOverview; onSelectTicker?: (t: string) => void }) {
  const [onlyQ, setOnlyQ] = useState(false);
  const rows = useMemo(() => data.radar.rows.filter((r) => !onlyQ || r.qualifies), [data, onlyQ]);
  const board = useBoardQuotes(useMemo(() => [...new Set(data.radar.rows.map((r) => r.t))], [data]), { flushMs: 1500 });
  const nQ = data.radar.rows.filter((r) => r.qualifies).length;
  return (
    <div className="tw-scope space-y-2" data-testid="to-radar">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-bold text-slate-200">📡 Radar cổ tức tiền đang diễn ra</span>
        <span className="text-slate-500">{data.radar.rows.length} đợt · <span className="text-emerald-300">{nQ} đủ điều kiện TO-r1</span> · giá đóng cửa tới {dm(data.radar.priceAsOf)}, lợi suất theo giá trực tiếp</span>
        <label className="ml-auto flex items-center gap-1 text-slate-400"><input type="checkbox" className="accent-amber-500" checked={onlyQ} onChange={(e) => setOnlyQ(e.target.checked)} data-testid="to-only-q" /> Chỉ đợt đủ điều kiện</label>
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-xl border border-white/[0.06] bg-[#0b0f17]">
        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-[11px]">
          <thead><tr>
            <th className={TH}>Mã · ngành</th><th className={TH}>Công bố</th><th className={`${TH} text-right`}>Cổ tức · lợi suất</th><th className={`${TH} text-right`}>GTGD 20 phiên</th>
            <th className={`${TH} text-right`} title="Lợi nhuận vượt VN-Index mỗi lệnh (sau phí) của nhóm lợi suất này, 03/2022–nay; khoảng tin cậy 95% bootstrap theo tháng">Kỳ vọng nhóm</th>
            <th className={TH} title="Vượt VN-Index từ đóng cửa trước công bố tới phiên gần nhất, vị trí trong phân bố các đợt cùng nhóm ở cùng số phiên — chỉ MÔ TẢ (kiểm tra 2022–26: đợt đã chạy nhiều không kém hơn về sau)">Đã chạy</th>
            <th className={TH} title="Phiên cuối còn quyền (liền trước GDKHQ); số phiên sau phiên vào sớm nhất; T+2 = cổ phiếu về kịp để bán">Phiên bán · T+2</th>
            <th className={TH}>TO-r1</th><th className={TH}>Cảnh báo</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-slate-500">{onlyQ ? "Hiện không có đợt nào đủ điều kiện TO-r1." : "Không có đợt cổ tức tiền nào đang chờ GDKHQ."}</td></tr>}
            {rows.map((r) => {
              const live = board.quotes[r.t]?.price; const yNow = liveYield(r, live);
              const reasons = notQualifiedReasons(r, data.rule.minYield);
              return (
                <tr key={`${r.t}|${r.ex}`} data-testid="to-row" className={`cursor-pointer hover:bg-cyan-400/[0.05] ${r.qualifies ? "bg-emerald-400/[0.04]" : ""}`} onClick={() => onSelectTicker?.(r.t)}>
                  <td className={TD}><span className="font-mono text-[12px] font-semibold text-cyan-200">{r.t}</span><span className="block max-w-[9rem] truncate text-[10px] text-slate-500" title={r.sector ?? ""}>{r.sector ?? "—"}</span></td>
                  <td className={TD}><span className="font-mono">{dm(r.disclosed)}</span><span className="block text-[10px] text-slate-500">{r.sessionsSinceAnn} phiên trước</span>
                    {r.check === "CONFIRMED_2" ? <Chip tone="ok" title="VNDirect và tin doanh nghiệp CafeF khớp ngày">2 nguồn khớp</Chip> : r.check === "CONFLICT" ? <Chip tone="bad" title="Ngày giữa VNDirect và CafeF lệch">lệch nguồn</Chip> : null}</td>
                  <td className={`${TD} text-right`}><span className="font-mono">{r.cash.toLocaleString("vi-VN")} đ</span>
                    <span className="block font-mono text-[10.5px]"><span className="text-slate-400" title="Theo giá đóng cửa trước công bố (dùng cho điều kiện TO-r1)">{pct(r.yieldPre)}</span> → <span className="font-semibold text-emerald-300" title={live ? "Theo giá khớp trực tiếp" : "Theo giá đóng cửa gần nhất"}>{pct(yNow)}</span></span></td>
                  <td className={`${TD} text-right font-mono ${r.liquidityOk ? "text-slate-300" : "text-rose-300"}`}>{bil(r.adv)}</td>
                  <td className={`${TD} text-right`}>{r.expected ? <><span className={`font-mono font-semibold ${(r.expected.mean ?? 0) > 0 ? "text-emerald-300" : "text-rose-300"}`}>{pctS(r.expected.mean, 2)}</span>
                    <span className="block font-mono text-[10px] text-slate-500">{ciText(r.expected)} · thắng {pct(r.expected.hit, 0)} · n {r.expected.n}</span></> : "—"}</td>
                  <td className={TD}>{r.runUp == null ? <span className="text-slate-500">chưa có phiên</span> : <>
                    <span className={`font-mono font-semibold ${r.runUp >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pctS(r.runUp)}</span>
                    {r.runUpPct != null && <span className="ml-1 text-[10px] text-slate-500">phân vị {Math.round(r.runUpPct * 100)}</span>}
                    {r.runUpPct != null && <span className="mt-0.5 block h-1.5 w-24 rounded bg-white/[0.06]"><span className={`block h-1.5 rounded bg-cyan-400/70`} style={{ width: `${Math.round(r.runUpPct * 100)}%` }} /></span>}
                    </>}</td>
                  <td className={TD}><span className="font-mono">{dm(r.lastCumDate)}</span><span className="block text-[10px] text-slate-500">GDKHQ {dm(r.ex)} · còn {r.sessionsLeft ?? "—"} phiên</span>
                    {r.t2Ok ? <Chip tone="ok">kịp T+2</Chip> : <Chip tone="bad" testid={`to-t2-${r.t}`} title={`Vào phiên ${dm(r.buyDate)} thì cổ phiếu chưa về kịp để bán ở phiên cuối còn quyền`}>không kịp T+2</Chip>}</td>
                  <td className={TD}>{r.qualifies ? <Chip tone="ok" testid={`to-q-${r.t}`}>ĐỦ ĐIỀU KIỆN</Chip> : <span className="text-[10px] text-slate-500">{reasons.join(" · ") || "—"}</span>}</td>
                  <td className={TD}><div className="flex flex-wrap gap-1">
                    {r.weakSector && <Chip tone="warn" title="Ngành có kết quả lịch sử âm với quy tắc này">ngành yếu</Chip>}
                    {r.limitUpEntry && <Chip tone="bad" title="Phiên vào (đầu tiên sau công bố) tăng trần — thường không khớp được">trần lúc vào</Chip>}
                    {(liveChange(r, live) ?? 0) >= 0.065 && <Chip tone="bad" title="Giá trực tiếp tăng ≥ 6,5% so với đóng cửa gần nhất — sát trần HOSE (7%), có thể khó khớp">tăng ≥ 6,5% hôm nay</Chip>}
                    {r.bucket === "<3%" && <Chip tone="muted" title="Nhóm lợi suất < 3% lịch sử không có lợi thế">lợi suất thấp</Chip>}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
