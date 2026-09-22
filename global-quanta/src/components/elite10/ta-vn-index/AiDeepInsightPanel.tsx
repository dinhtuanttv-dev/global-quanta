import type { TradeScenario } from '../../../hooks/elite10/useAiInsight';

/**
 * Vung 5 - "AI Deep Insight": Trade Scenario (Vung mua/Stop loss/Chot
 * loi) + canh bao tu Validation Layer. isEstimated=true khi chua du du
 * lieu lich su that cho cua so hien tai (xem lib/elite10/ai-pipeline.ts
 * _trade_scenario - da fix khong con dung cong thuc suy dien nhu ban goc).
 */
export function AiDeepInsightPanel({ tradeScenario, riskFlags, warnings }: {
  tradeScenario: TradeScenario; riskFlags: string[]; warnings: string[];
}) {
  const dim = tradeScenario.isEstimated;

  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-wide text-cyan-300">AI DEEP INSIGHT</div>
        {warnings.length === 0 && <span className="text-[9px] text-emerald-400">✓ Đã qua Validation Layer</span>}
      </div>

      <div className="mb-3 flex gap-2">
        <div className={`flex-1 rounded-md border p-2.5 text-center ${dim ? 'border-rose-800 bg-rose-950/20' : 'border-rose-700 bg-rose-950/40'}`}>
          <div className="text-[9px] text-slate-500">Stop loss</div>
          <div className="mt-1 font-mono text-[13px] font-bold text-rose-400">&lt; {tradeScenario.stopLoss.toLocaleString()}</div>
        </div>
        <div className={`flex-1 rounded-md border p-2.5 text-center ${dim ? 'border-cyan-800 bg-cyan-950/10' : 'border-cyan-700 bg-cyan-950/30'}`}>
          <div className="text-[9px] text-slate-500">Vùng mua</div>
          <div className="mt-1 font-mono text-[13px] font-bold text-cyan-300">
            {tradeScenario.buyZone[0].toLocaleString()}–{tradeScenario.buyZone[1].toLocaleString()}
          </div>
        </div>
        <div className={`flex-1 rounded-md border p-2.5 text-center ${dim ? 'border-emerald-800 bg-emerald-950/20' : 'border-emerald-700 bg-emerald-950/40'}`}>
          <div className="text-[9px] text-slate-500">Chốt lời</div>
          <div className="mt-1 font-mono text-[13px] font-bold text-emerald-400">
            {tradeScenario.takeProfit[0].toLocaleString()}/{tradeScenario.takeProfit[1].toLocaleString()}
          </div>
        </div>
      </div>

      <div className="mb-3 flex gap-4">
        <div className="flex-1 text-center">
          <div className="font-mono text-[16px] font-bold">{Math.round(tradeScenario.winRate * 100)}%</div>
          <div className="text-[9px] text-slate-500">Tỷ lệ thắng {dim ? '(tham chiếu)' : 'lịch sử'}</div>
        </div>
        <div className="flex-1 text-center">
          <div className="font-mono text-[16px] font-bold">{tradeScenario.sampleSize}</div>
          <div className="text-[9px] text-slate-500">Số mẫu backtest</div>
        </div>
        <div className="flex-1 text-center">
          <div className="font-mono text-[16px] font-bold">{riskFlags.length}</div>
          <div className="text-[9px] text-slate-500">Cờ rủi ro đang bật</div>
        </div>
      </div>

      {riskFlags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {riskFlags.map((f) => (
            <span key={f} className="rounded border border-rose-700 bg-rose-950/40 px-1.5 py-0.5 text-[9px] font-bold text-rose-400">⚠ {f}</span>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-md border border-dashed border-amber-700/60 bg-amber-950/10 p-2.5">
          <div className="mb-1 text-[10px] font-bold text-amber-400">⚠ Validation Layer — {warnings.length} cảnh báo tự động</div>
          {warnings.map((w, i) => (
            <p key={i} className="text-[10px] text-slate-400">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
