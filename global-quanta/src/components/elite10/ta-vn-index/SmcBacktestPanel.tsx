import { useState } from 'react';
import type { SmcDetectorData, TripleBarrierStats, StabilityResult } from '../../../hooks/elite10/useSmcDetector';
import type { WindowStat } from '../../../hooks/elite10/useCycleDetail';

/**
 * Giai doan 4/4 - Backtest thong ke chat che cho tung pattern SMC da
 * phat hien (Giai doan 1-3). Tai dung 100% bootstrap CI90/winRate/
 * sampleSize tu buildWindowStats() (time-engine.ts) - Y HET logic da
 * dung cho Tab Co Tuc, khong viet lai gi moi.
 *
 * MUC C (Tech Spec v2): them phuong phap Triple-Barrier (Lopez de
 * Prado) - SONG SONG voi backtest don gian cu (khong thay the).
 *
 * NANG CAP UI (2026-09-23): thay vi hien CA 2 BANG CUNG LUC (rat dai),
 * dung TAB SWITCHER de nguoi dung chon xem 1 trong 2 phuong phap tai 1
 * thoi diem - gon hon, van giu du lieu day du ca 2 (khong xoa gi).
 * Backend cung da mo rong du lieu backtest tu 6 thang len 2 nam de tang
 * co mau (Wyckoff Schematic van chi xet 6 thang gan nhat de giu tinh
 * thoi su).
 */
function Row({ stat }: { stat: WindowStat | null }) {
  if (!stat || stat.sampleSize === 0) {
    return <div className="flex items-center justify-between border-b border-white/5 py-1.5 text-[11px] last:border-b-0"><span className="text-slate-500">{stat?.label ?? '—'}</span><span className="text-slate-600">Chưa đủ mẫu</span></div>;
  }
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-1.5 text-[11px] last:border-b-0">
      <span className="text-slate-300">
        {stat.label}
        {stat.isLowSample && <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[8px] font-bold text-amber-400">n&lt;30</span>}
      </span>
      <span className="text-right">
        <span className={stat.avgReturn >= 0 ? 'font-mono text-emerald-400' : 'font-mono text-rose-400'}>
          {stat.avgReturn >= 0 ? '+' : ''}{stat.avgReturn.toFixed(1)}%
        </span>
        <span className="ml-2 text-slate-500">thắng {Math.round(stat.winRate * 100)}% (n={stat.sampleSize})</span>
      </span>
    </div>
  );
}

function TripleBarrierRow({ label, stat, stability }: { label: string; stat: TripleBarrierStats | null; stability?: StabilityResult | null }) {
  if (!stat || stat.sampleSize === 0) {
    return <div className="flex items-center justify-between border-b border-white/5 py-1.5 text-[11px] last:border-b-0"><span className="text-slate-500">{label}</span><span className="text-slate-600">Chưa đủ mẫu</span></div>;
  }
  return (
    <div className="border-b border-white/5 py-1.5 text-[11px] last:border-b-0">
      <div className="flex items-center justify-between">
        <span className="text-slate-300">
          {label}
          {stat.isLowSample && <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[8px] font-bold text-amber-400">n&lt;30</span>}
          {stability?.flagUnstable && (
            <span className="ml-1.5 rounded bg-rose-500/15 px-1 py-0.5 text-[8px] font-bold text-rose-400" title="Tỷ lệ thắng tổng thể trông cao nhưng chỉ đến từ 1-2 giai đoạn, không nhất quán qua thời gian">
              ⚠ KHÔNG ỔN ĐỊNH
            </span>
          )}
        </span>
        <span className="text-right">
          <span className="font-mono text-slate-200">{stat.winRatePct.toFixed(0)}%</span>
          <span className="ml-1.5 text-slate-500">KTC90 [{stat.wilsonCi90[0].toFixed(0)}–{stat.wilsonCi90[1].toFixed(0)}] (n={stat.sampleSize})</span>
        </span>
      </div>
      <div className="mt-0.5 text-[9px] text-slate-500">
        Chốt lời {stat.breakdown.takeProfitPct.toFixed(0)}% · Cắt lỗ {stat.breakdown.stopLossPct.toFixed(0)}% · Hết hạn {stat.breakdown.timeLimitPct.toFixed(0)}% · TB {stat.avgDaysToHit.toFixed(0)} phiên
      </div>
      {stability && stability.stabilityScorePct !== null && (
        <div className="mt-0.5 text-[9px] text-slate-500">
          Ổn định qua thời gian: <span className={stability.flagUnstable ? 'font-bold text-rose-400' : 'text-slate-400'}>{stability.periodsWinning}/{stability.periodsWithData} giai đoạn thắng ≥50%</span>
          {stability.winRateStdDevPct !== null && ` · độ lệch ${stability.winRateStdDevPct.toFixed(0)}pp`}
        </div>
      )}
    </div>
  );
}

type BacktestMethod = 'simple' | 'tripleBarrier';

export function SmcBacktestPanel({ smcReal }: { smcReal?: SmcDetectorData | null }) {
  const [method, setMethod] = useState<BacktestMethod>('tripleBarrier');
  if (!smcReal) return null;
  const bt = smcReal.backtest;
  const tb = smcReal.tripleBarrierBacktest;
  const st = smcReal.stability;

  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-wide text-cyan-300">BACKTEST PATTERN SMC/WYCKOFF</div>
        <span className="text-[9px] text-slate-500">Dữ liệu 2 năm gần nhất</span>
      </div>

      {/* Nut truot (tab switcher) - chon 1 trong 2 phuong phap de xem,
          tranh cuon 1 trang qua dai voi ca 2 bang cung luc. */}
      <div className="mb-3 inline-flex rounded-md border border-white/10 bg-white/[0.02] p-0.5 text-[10px]">
        <button
          type="button"
          onClick={() => setMethod('simple')}
          className={method === 'simple'
            ? 'rounded px-3 py-1.5 font-bold text-slate-950 bg-cyan-400'
            : 'rounded px-3 py-1.5 font-medium text-slate-400 hover:text-slate-200'}
        >
          Đơn giản (sau {bt.holdDays} phiên)
        </button>
        <button
          type="button"
          onClick={() => setMethod('tripleBarrier')}
          className={method === 'tripleBarrier'
            ? 'rounded px-3 py-1.5 font-bold text-slate-950 bg-cyan-400'
            : 'rounded px-3 py-1.5 font-medium text-slate-400 hover:text-slate-200'}
        >
          Triple-Barrier{tb && <span className="ml-1 opacity-70">±{tb.atrMultiplier}×ATR</span>}
        </button>
      </div>

      {method === 'simple' && (
        <>
          <Row stat={bt.fvgBullish} /><Row stat={bt.fvgBearish} />
          <Row stat={bt.bosBullish} /><Row stat={bt.bosBearish} />
          <Row stat={bt.chochBullish} /><Row stat={bt.chochBearish} />
          <Row stat={bt.orderBlockBullish} /><Row stat={bt.orderBlockBearish} />
          <div className="mt-2.5 rounded bg-white/[0.02] p-2.5 text-[10px] text-slate-500">
            <p>⏳ <b className="text-slate-300">Wyckoff Spring/SOS/LPS:</b> {bt.wyckoffNote}</p>
            <p className="mt-1">Mẫu thường nhỏ (n&lt;30) — tham khảo, không phải cam kết. Xem cờ "n&lt;30" trước khi tin vào con số.</p>
          </div>
        </>
      )}

      {method === 'tripleBarrier' && tb && (
        <>
          <p className="mb-2 text-[9px] text-slate-500">Chốt lời/cắt lỗ = entry ±{tb.atrMultiplier}×ATR14 · giới hạn thời gian {tb.timeLimitDays} phiên</p>
          <TripleBarrierRow label="FVG tăng" stat={tb.fvgBullish} stability={st?.fvgBullish} />
          <TripleBarrierRow label="FVG giảm" stat={tb.fvgBearish} stability={st?.fvgBearish} />
          <TripleBarrierRow label="BOS tăng" stat={tb.bosBullish} stability={st?.bosBullish} />
          <TripleBarrierRow label="BOS giảm" stat={tb.bosBearish} stability={st?.bosBearish} />
          <TripleBarrierRow label="CHoCH tăng" stat={tb.chochBullish} stability={st?.chochBullish} />
          <TripleBarrierRow label="CHoCH giảm" stat={tb.chochBearish} stability={st?.chochBearish} />
          <TripleBarrierRow label="Order Block tăng" stat={tb.orderBlockBullish} stability={st?.orderBlockBullish} />
          <TripleBarrierRow label="Order Block giảm" stat={tb.orderBlockBearish} stability={st?.orderBlockBearish} />
          <div className="mt-2.5 rounded bg-white/[0.02] p-2.5 text-[10px] text-slate-500">{tb.note}</div>
          {st && <div className="mt-1.5 rounded bg-white/[0.02] p-2.5 text-[10px] text-slate-500">{st.note}</div>}
        </>
      )}
    </div>
  );
}
