// RADAR 4 ĐIỀU KIỆN BÁN (20/11/2026) — bổ sung cho "Khoảng cách tới ngưỡng bán" (chỉ đo LS-v1): mỗi vị thế một dòng, đủ bốn điều kiện bán
// của quy tắc G2r. Lớp "Buồng lái" (data-hl-layer="cockpit"): tắt lớp -> bảng như cũ. Chỉ hiển thị, không phải lệnh.
import { useMemo } from "react";
import type { EliteDecision, HlPick } from "../../../lib/elite10/decisionTypes";
import { exitRules, exitTriggers, type TriggerCell, type TriggerLevel } from "../../../lib/elite10/exitTriggers";
import { DeckPanel } from "../deck/parts";

const TONE: Record<TriggerLevel, string> = { OK: "text-slate-300", WATCH: "text-amber-200", NEAR: "font-bold text-rose-300" };
const MARK: Record<TriggerLevel, string> = { OK: "", WATCH: "◐ ", NEAR: "● " };

function Cell({ c, testId }: { c: TriggerCell; testId: string }) {
  return <td className={`px-1 py-0.5 text-right tabular-nums ${TONE[c.level]}`} title={c.title} data-level={c.level} data-testid={testId}><span aria-hidden="true">{MARK[c.level]}</span>{c.text}</td>;
}

export default function ExitTriggers({ d, picks, onOpenTicker }: { d: EliteDecision; picks: HlPick[]; onOpenTicker: (t: string) => void }) {
  const R = useMemo(() => exitRules(d), [d]);
  const rows = useMemo(() => exitTriggers(picks, R), [picks, R]);
  const near = rows.filter((r) => r.near > 0).length;
  return (
    <div data-hl-layer="cockpit" data-testid="exit-triggers">
      <DeckPanel title="Bốn điều kiện bán" meta={near ? `${near} mã có điều kiện sát ngưỡng` : "chưa mã nào sát ngưỡng"}>
        {rows.length === 0 ? <p className="text-[11px] text-slate-500">Chưa có vị thế.</p> : (
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Bảng bốn điều kiện bán">
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
              <caption className="sr-only">Khoảng cách của từng mã đang giữ tới bốn điều kiện bán của quy tắc G2r</caption>
              <thead><tr className="text-[10px] text-slate-500">
                <th scope="col" className="px-1 text-left font-normal">Mã</th>
                <th scope="col" className="px-1 text-right font-normal" title={`Bán khi LS-v1 < ${R.exitLsPct}`}>LS-v1</th>
                <th scope="col" className="px-1 text-right font-normal" title={`Bán khi số mô hình TA đạt < ${R.exitTaMin}`}>TA</th>
                <th scope="col" className="px-1 text-right font-normal" title="Bán khi ngành rơi vào Tụt hậu">Ngành</th>
                <th scope="col" className="px-1 text-right font-normal" title={`Bán khi vắng dữ liệu ${R.missSessions} phiên liên tiếp`}>Dữ liệu</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ticker} className="border-t border-white/5" data-testid={`exit-trig-${r.ticker}`} data-near={r.near}>
                    <th scope="row" className="px-1 py-0.5 text-left"><button type="button" onClick={() => onOpenTicker(r.ticker)} className="font-bold text-[#F5CE72] hover:underline">{r.ticker}</button></th>
                    <Cell c={r.ls} testId={`exit-trig-ls-${r.ticker}`} /><Cell c={r.ta} testId={`exit-trig-ta-${r.ticker}`} />
                    <Cell c={r.rrg} testId={`exit-trig-rrg-${r.ticker}`} /><Cell c={r.data} testId={`exit-trig-data-${r.ticker}`} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
          ● sát ngưỡng (LS dưới mức cảnh báo {R.warnLsPct}, TA đúng bằng ngưỡng, ngành Suy yếu — góc liền trước Tụt hậu, hoặc đang vắng dữ liệu) · ◐ cần theo dõi.
          Mô tả khoảng cách theo đúng ngưỡng của quy tắc; quyết định bán vẫn do bảng dựng sau phiên.
        </p>
      </DeckPanel>
    </div>
  );
}
