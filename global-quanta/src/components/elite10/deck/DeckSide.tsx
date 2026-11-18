// Command Deck — Z5 khoảng cách tới ngưỡng bán (radar), Z6 phễu chọn lọc. Giữ data-testid của phễu cũ (hl-funnel, hl-funnel-i, hl-funnel-tip-i).
import type { HlPick } from "../../../lib/elite10/decisionTypes";
import { exitRadar } from "../../../lib/elite10/deckModel";
import { num } from "../center/boardParts";
import { DeckPanel } from "./parts";

const MAX_BUF = 40;
export function ExitRadar({ picks, rule, missSessions, onOpenTicker }: { picks: HlPick[]; rule: { exitLsPct: number; warnLsPct: number; exitTaMin: number }; missSessions: number; onOpenTicker: (t: string) => void }) {
  const xr = exitRadar(picks, rule), warnGap = rule.warnLsPct - rule.exitLsPct;
  return (
    <DeckPanel title="Khoảng cách tới ngưỡng bán" meta={`điểm LS-v1 trên ngưỡng ${rule.exitLsPct}`} testId="deck-exit-radar">
      {xr.length === 0 ? <p className="text-[11px] text-slate-500">Chưa có vị thế.</p> : (
        <ul className="space-y-1.5">
          {xr.map((x) => (
            <li key={x.ticker} className="grid grid-cols-[44px_1fr_32px] items-center gap-2 text-[11.5px]" data-testid={`deck-exit-${x.ticker}`} data-warn={x.warn}>
              <button type="button" onClick={() => onOpenTicker(x.ticker)} className="text-left font-bold text-[#F5CE72] hover:underline" style={{ fontFamily: "var(--font-display)" }}>{x.ticker}</button>
              <span className="relative block h-2.5 overflow-hidden rounded-full bg-white/10" title={`LS-v1 phân vị ${num(x.lsPct, 1)} — ngưỡng bán ${rule.exitLsPct}`}>
                <span className="absolute inset-y-0 left-0" style={{ width: `${warnGap / MAX_BUF * 100}%`, background: "repeating-linear-gradient(135deg,rgba(244,63,94,.2) 0 4px,transparent 4px 8px)" }} />
                <span className="deck-grow absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, Math.max(2, x.buffer / MAX_BUF * 100))}%`, background: x.warn ? "#F43F5E" : "#E8B84B" }} />
              </span>
              <b className={`num text-right ${x.warn ? "text-rose-300" : "text-slate-100"}`}>{num(x.buffer, 0)}</b>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">Vùng sọc = dưới mức cảnh báo ({rule.warnLsPct}). Mã bị bán khi LS-v1 &lt; {rule.exitLsPct}, không còn mô hình TA nào (&lt; {rule.exitTaMin}), ngành rơi vào Tụt hậu, hoặc vắng điểm LS-v1 {missSessions} phiên liên tiếp.</p>
    </DeckPanel>
  );
}

export function FunnelBars({ steps, total }: { steps: [string, number, string][]; total: number }) {
  return (
    <DeckPanel title="Phễu chọn lọc" meta="tầng 1 → RRG ngành → tích điểm các tab" testId="hl-funnel">
      <ol className="space-y-1.5">
        {steps.map(([label, n, tip], i) => (
          <li key={label} title={tip} data-testid={`hl-funnel-${i}`} data-n={n} className="grid grid-cols-[1fr_40px] items-center gap-2">
            <span className="relative block h-[18px] overflow-hidden rounded bg-white/[0.06]">
              <span className="deck-grow absolute inset-y-0 left-0" style={{ width: `${Math.max(3, n / (total || 1) * 100)}%`, background: i === steps.length - 1 ? "linear-gradient(90deg,rgba(232,184,75,.85),rgba(232,184,75,.45))" : "linear-gradient(90deg,rgba(232,184,75,.5),rgba(232,184,75,.18))" }} />
              <span className="absolute left-2 top-[2px] text-[10.5px] text-slate-100">{i + 1}. {label}</span>
            </span>
            <b className="num text-right text-[13px] text-slate-100">{n}</b>
            <span className="col-span-2 -mt-0.5 text-[10px] leading-snug text-slate-500" data-testid={`hl-funnel-tip-${i}`}>{tip}</span>
          </li>
        ))}
      </ol>
    </DeckPanel>
  );
}
