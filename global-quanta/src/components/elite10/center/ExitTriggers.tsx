// NGƯỠNG BÁN · 4 ĐIỀU KIỆN (gộp 27/11/2026) — trước đây là hai khối trùng nhau: "Khoảng cách tới ngưỡng bán" (thanh LS-v1, DeckSide.ExitRadar)
// và "Bốn điều kiện bán" (bảng 4 cột, 20/11). Nay một bảng: mỗi vị thế một dòng, cột LS-v1 có thanh khoảng cách (vùng sọc = dưới mức cảnh báo)
// + số, rồi TA / Ngành / Dữ liệu theo đúng ngưỡng quy tắc G2r. Lớp "Buồng lái" (data-hl-layer="cockpit"): tắt lớp -> bảng cũ
// "Khoảng cách tới ngưỡng bán" hiện lại y nguyên. Chỉ hiển thị, không phải lệnh; quyết định bán vẫn do bảng dựng sau phiên.
import { useMemo } from "react";
import type { EliteDecision, HlPick } from "../../../lib/elite10/decisionTypes";
import { exitRules, exitTriggers, type TriggerCell, type TriggerLevel } from "../../../lib/elite10/exitTriggers";
import { DeckPanel } from "../deck/parts";

const TONE: Record<TriggerLevel, string> = { OK: "text-slate-300", WATCH: "text-amber-200", NEAR: "font-bold text-rose-300" };
const MARK: Record<TriggerLevel, string> = { OK: "", WATCH: "◐ ", NEAR: "● " };
const BAR: Record<TriggerLevel, string> = { OK: "var(--q-accent, #4f8ef7)", WATCH: "#E8B84B", NEAR: "#F43F5E" };
/** Thang thanh LS: 0 … 40 điểm trên ngưỡng bán (như khối cũ). */
const MAX_BUF = 40;

function Cell({ c, testId }: { c: TriggerCell; testId: string }) {
  return <td className={`px-2 py-1 text-right tabular-nums ${TONE[c.level]}`} title={c.title} data-level={c.level} data-testid={testId}><span aria-hidden="true">{MARK[c.level]}</span>{c.text}</td>;
}

function LsBar({ buffer, level, warnGap }: { buffer: number | null; level: TriggerLevel; warnGap: number }) {
  return (
    <span className="relative block h-2 min-w-[72px] overflow-hidden rounded-full bg-white/10" aria-hidden="true">
      <span className="absolute inset-y-0 left-0" style={{ width: `${(warnGap / MAX_BUF) * 100}%`, background: "repeating-linear-gradient(135deg,rgba(244,63,94,.2) 0 4px,transparent 4px 8px)" }} />
      {buffer != null && <span className="deck-grow absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, Math.max(2, (buffer / MAX_BUF) * 100))}%`, background: BAR[level] }} />}
    </span>
  );
}

export default function ExitTriggers({ d, picks, onOpenTicker }: { d: EliteDecision; picks: HlPick[]; onOpenTicker: (t: string) => void }) {
  const R = useMemo(() => exitRules(d), [d]);
  const rows = useMemo(() => exitTriggers(picks, R), [picks, R]);
  const bufOf = useMemo(() => new Map(picks.map((p) => [p.ticker, p.hl.exitBufferLs ?? (p.hl.lsPct == null ? null : p.hl.lsPct - R.exitLsPct)])), [picks, R]);
  const near = rows.filter((r) => r.near > 0).length;
  const warnGap = R.warnLsPct - R.exitLsPct;
  return (
    <div data-hl-layer="cockpit" data-testid="exit-triggers" className="lg:col-span-2">
      <DeckPanel title="Ngưỡng bán · 4 điều kiện" meta={`LS-v1 trên ngưỡng ${R.exitLsPct} · ${near ? `${near} mã có điều kiện sát ngưỡng` : "chưa mã nào sát ngưỡng"}`}>
        {rows.length === 0 ? <p className="text-[11px] text-slate-500">Chưa có vị thế.</p> : (
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Bảng ngưỡng bán bốn điều kiện">
            <table className="w-full whitespace-nowrap text-[11.5px]" style={{ borderCollapse: "collapse" }}>
              <caption className="sr-only">Khoảng cách của từng mã đang giữ tới bốn điều kiện bán của quy tắc G2r</caption>
              <thead><tr className="text-[10px] text-slate-500">
                <th scope="col" className="px-2 pb-1 text-left font-normal">Mã</th>
                <th scope="col" className="w-[38%] px-2 pb-1 text-left font-normal" title={`Thanh = số điểm LS-v1 trên ngưỡng bán ${R.exitLsPct}; vùng sọc = dưới mức cảnh báo ${R.warnLsPct}`}>Khoảng cách LS-v1</th>
                <th scope="col" className="px-2 pb-1 text-right font-normal" title={`Bán khi LS-v1 < ${R.exitLsPct}`}>LS-v1</th>
                <th scope="col" className="px-2 pb-1 text-right font-normal" title={`Bán khi số mô hình TA đạt < ${R.exitTaMin}`}>TA</th>
                <th scope="col" className="px-2 pb-1 text-right font-normal" title="Bán khi ngành rơi vào Tụt hậu">Ngành</th>
                <th scope="col" className="px-2 pb-1 text-right font-normal" title={`Bán khi vắng dữ liệu ${R.missSessions} phiên liên tiếp`}>Dữ liệu</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ticker} className="border-t border-white/5" data-testid={`exit-trig-${r.ticker}`} data-near={r.near}>
                    <th scope="row" className="px-2 py-1 text-left"><button type="button" onClick={() => onOpenTicker(r.ticker)} className="font-bold text-[#F5CE72] hover:underline">{r.ticker}</button></th>
                    <td className="px-2 py-1" title={r.ls.title} data-testid={`exit-trig-bar-${r.ticker}`}><LsBar buffer={bufOf.get(r.ticker) ?? null} level={r.ls.level} warnGap={warnGap} /></td>
                    <Cell c={r.ls} testId={`exit-trig-ls-${r.ticker}`} /><Cell c={r.ta} testId={`exit-trig-ta-${r.ticker}`} />
                    <Cell c={r.rrg} testId={`exit-trig-rrg-${r.ticker}`} /><Cell c={r.data} testId={`exit-trig-data-${r.ticker}`} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">
          Mã bị bán khi LS-v1 &lt; {R.exitLsPct}, không còn mô hình TA nào (&lt; {R.exitTaMin}), ngành rơi vào Tụt hậu, hoặc vắng điểm LS-v1 {R.missSessions} phiên liên tiếp.
          Vùng sọc = dưới mức cảnh báo ({R.warnLsPct}) · ● sát ngưỡng (LS dưới {R.warnLsPct}, TA đúng bằng ngưỡng, ngành Suy yếu — góc liền trước Tụt hậu, hoặc đang vắng dữ liệu) · ◐ cần theo dõi.
          Quyết định bán vẫn do bảng dựng sau phiên.
        </p>
      </DeckPanel>
    </div>
  );
}
