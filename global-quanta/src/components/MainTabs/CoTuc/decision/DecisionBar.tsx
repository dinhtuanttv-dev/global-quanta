import type { DecisionLevel, DecisionSnapshot } from '../../../../lib/cotuc/decision';
import { useDecisionState } from '../../../../hooks/useCotucDecision';
import { CARD } from '../seasonality/EarningsSeasonalityTab';

/**
 * DecisionBar — "nhìn vào là biết nên vào, quan sát hay chưa nên" (port DecisionBar của gói, giai đoạn 4).
 * Chỉ HIỂN THỊ ảnh chụp server đã tính (cron timing-signals-scan, giá SSI) — không tự suy luận thêm, để thứ người dùng
 * thấy trùng với thứ được ghi vào sổ theo dõi tín hiệu. Trình bày theo chuẩn Siêu Quét AI.
 */
const LEVELS: { key: DecisionLevel; word: string; short: string; on: string; ring: string; text: string }[] = [
  { key: 'FAVORABLE', word: 'Thuận lợi để vào', short: 'Thuận lợi', on: 'rgba(52,211,153,0.16)', ring: '#34d399', text: 'text-emerald-300' },
  { key: 'WATCH', word: 'Quan sát', short: 'Quan sát', on: 'rgba(251,191,36,0.14)', ring: '#fbbf24', text: 'text-amber-300' },
  { key: 'AVOID', word: 'Chưa nên', short: 'Chưa nên', on: 'rgba(148,163,184,0.12)', ring: '#94a3b8', text: 'text-slate-200' },
];

const ACTION_TEXT: Record<DecisionSnapshot['recommendation']['action'], string> = {
  NO_DATE: 'Chưa có ngày GDKHQ',
  POST_EX: 'Đã qua GDKHQ',
  NO_SIGNAL: 'Chưa có cửa sổ qua kiểm định',
  TOO_EARLY: 'Chưa tới vùng mua',
  IN_WINDOW: 'Đang trong vùng mua',
  WINDOW_PASSED: 'Đã qua vùng mua',
};

const REGIME: Record<DecisionSnapshot['regime']['regime'], { text: string; cls: string }> = {
  RISK_ON: { text: 'Thuận lợi', cls: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' },
  NEUTRAL: { text: 'Trung tính', cls: 'text-slate-300 border-white/10 bg-white/5' },
  RISK_OFF: { text: 'Phòng thủ', cls: 'text-rose-300 border-rose-400/30 bg-rose-400/10' },
};

const pct0 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${Math.round(v * 100)}%`);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function Chip({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${cls}`}>{children}</span>;
}

function CheckRow({ label, passed, detail }: { label: string; passed: boolean | null; detail: string }) {
  const mark = passed === true ? '✔' : passed === false ? '✖' : '·';
  const color = passed === true ? 'text-emerald-400' : passed === false ? 'text-rose-400' : 'text-slate-500';
  return (
    <li data-testid="decision-check-row" data-passed={String(passed)} className="flex gap-2 py-[3px] border-t border-white/[0.04] first:border-t-0">
      <span aria-hidden className={`w-3 shrink-0 text-center font-semibold ${color}`}>{mark}</span>
      <span className="min-w-0">
        <span className="text-slate-200">{label}</span>
        <span className="block text-[10px] text-slate-500 leading-snug break-words">{detail}</span>
      </span>
    </li>
  );
}

/** Thanh xác suất tổng hợp với 2 ngưỡng của computeDecisionState: 50% (quan sát) và 60% (thuận lợi). */
function ProbabilityGauge({ p, color }: { p: number; color: string }) {
  return (
    <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-visible" aria-hidden>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(2, Math.min(100, p * 100))}%`, background: color }} />
      {[0.5, 0.6].map((t) => (
        <div key={t} className="absolute -top-1 -bottom-1 w-px bg-slate-400/60" style={{ left: `${t * 100}%` }}>
          <span className="absolute top-3 -translate-x-1/2 text-[8.5px] font-mono text-slate-500">{t * 100}</span>
        </div>
      ))}
    </div>
  );
}

export function DecisionBar({ state, className }: { state: DecisionSnapshot; className?: string }) {
  const lv = LEVELS.find((l) => l.key === state.decision.level)!;
  const rec = state.recommendation;
  const p = state.decision.combinedProbability;
  const regime = REGIME[state.regime.regime];
  const showPlan = rec.window && (rec.action === 'IN_WINDOW' || rec.action === 'TOO_EARLY') && state.entryPlan.tranches.length > 0;

  return (
    <section
      className={`tw-scope @container rounded-xl p-4 space-y-3 ${className ?? ''}`}
      style={CARD}
      aria-label={`Trạng thái quyết định — ${state.ticker}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-cyan-400">
          ◆ Trạng thái quyết định <span className="font-mono text-slate-100">{state.ticker}</span>
        </h3>
        <span className="text-[10px] text-slate-500">
          Tính lúc <span className="font-mono tabular-nums">{ddmm(state.asOf)}</span>
          {state.priceDate && <> · giá SSI phiên <span className="font-mono tabular-nums">{ddmm(state.priceDate)}</span></>}
        </span>
      </header>

      {/* Dải 3 trạng thái — trạng thái hiện tại sáng, hai trạng thái kia mờ. */}
      <div data-testid="decision-bar" data-level={state.decision.level} role="status" className="grid grid-cols-3 gap-1.5">
        {LEVELS.map((l) => {
          const active = l.key === state.decision.level;
          return (
            <div
              key={l.key}
              className={`rounded-lg px-2.5 py-2 transition-colors ${active ? '' : 'opacity-35'}`}
              style={{ background: active ? l.on : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? l.ring : 'rgba(255,255,255,0.05)'}` }}
            >
              <div className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: active ? l.ring : 'rgba(148,163,184,0.35)', boxShadow: active ? `0 0 8px ${l.ring}` : undefined }} />
                <span className={`text-[11.5px] font-semibold ${active ? l.text : 'text-slate-400'}`} data-testid={active ? 'decision-word' : undefined}>
                  {active ? l.word : l.short}
                </span>
              </div>
              {active && (
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="font-mono tabular-nums text-xl font-semibold text-slate-100">{pct0(p)}</span>
                  <span className="hidden @2xl:inline text-[9.5px] text-slate-500">xác suất tổng hợp</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-1">
        <ProbabilityGauge p={p} color={lv.ring} />
        <p data-testid="decision-headline" className="pt-3 text-[11.5px] text-slate-200">{state.decision.headline}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip cls="text-slate-300 border-white/10 bg-white/5">{ACTION_TEXT[rec.action]}</Chip>
        {rec.window && (
          <Chip cls="text-amber-200 border-amber-400/25 bg-amber-400/10">
            {rec.window.label} · <span className="font-mono tabular-nums">[{rec.window.entryFrom}, {rec.window.entryTo}] → {rec.window.exitOffset}</span>
          </Chip>
        )}
        {state.exDate && (
          <Chip cls={state.exDate.status === 'CONFIRMED' ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' : 'text-amber-300 border-amber-400/30 bg-amber-400/10'}>
            GDKHQ <span className="font-mono tabular-nums">{ddmm(state.exDate.value)}</span> · {state.exDate.status === 'CONFIRMED' ? 'đã xác nhận' : 'ước tính'}
            {rec.tdToEx !== null && <span className="font-mono tabular-nums text-slate-400">· {rec.tdToEx >= 0 ? `còn ${rec.tdToEx}` : `qua ${-rec.tdToEx}`} phiên</span>}
          </Chip>
        )}
        <Chip cls={regime.cls}>VN-Index: {regime.text}</Chip>
      </div>

      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
        <div>
          <div className="text-[9.5px] font-semibold tracking-wider text-slate-500 mb-1">ĐIỀU KIỆN</div>
          <ul className="list-none text-[11px]">
            {state.decision.checks.map((c) => <CheckRow key={c.key} label={c.label} passed={c.passed} detail={c.detail} />)}
          </ul>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[9.5px] font-semibold tracking-wider text-slate-500 mb-1">BẰNG CHỨNG (cộng log-odds, co về 50%)</div>
            <table className="w-full text-[10.5px]">
              <tbody>
                {state.signals.map((s) => (
                  <tr key={s.name} data-testid="decision-signal" className="border-t border-white/[0.04] first:border-t-0 align-top">
                    <td className={`py-1 pr-2 whitespace-nowrap ${s.used ? 'text-slate-200' : 'text-slate-500'}`}>{s.name}</td>
                    <td className="py-1 text-[10px] text-slate-500 leading-snug">{s.detail}</td>
                    <td className={`py-1 pl-2 text-right font-mono tabular-nums ${s.used ? 'text-amber-300' : 'text-slate-600'}`}>{s.used ? pct0(s.probability) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[10px] text-slate-500">
              Trước co: <span className="font-mono tabular-nums text-slate-400">{pct0(state.combined.probabilityBeforeShrink)}</span> · tổng trọng số{' '}
              <span className="font-mono tabular-nums text-slate-400">{state.combined.totalWeight.toFixed(1)}</span>
              {state.regime.regime !== 'RISK_ON' && <> · trọng số đã nhân hệ số thị trường {state.regime.regime === 'RISK_OFF' ? '0.55' : '0.85'}</>}
            </p>
          </div>

          {showPlan && (
            <div data-testid="decision-plan">
              <div className="text-[9.5px] font-semibold tracking-wider text-slate-500 mb-1">KẾ HOẠCH VÀO LỆNH <span className="font-normal normal-case tracking-normal">· chia đợt, T−n = n phiên trước GDKHQ</span></div>
              <div className="flex flex-wrap gap-1.5">
                {state.entryPlan.tranches.map((t, i) => (
                  <span key={i} className="rounded-md border border-cyan-400/20 bg-cyan-400/5 px-1.5 py-0.5 text-[10px] text-cyan-200 font-mono tabular-nums">
                    Đợt {i + 1}: T{t.offset < 0 ? `−${-t.offset}` : `+${t.offset}`} · {Math.round(t.fraction * 100)}%
                  </span>
                ))}
              </div>
              {state.entryPlan.pauseFurtherEntries && <p className="mt-1 text-[10px] text-rose-300">Tạm dừng giải ngân đợt tiếp theo (giá đã chạy trước / hết thời gian).</p>}
            </div>
          )}

          {state.earnings && (
            <p className="text-[10px] text-slate-500">
              KQKD {state.earnings.quarterLabel} dự kiến <span className="font-mono tabular-nums text-slate-300">{ddmm(state.earnings.expectedAnnounce)}</span>
              {state.earnings.tdToEarnings !== null && state.earnings.tdToEarnings >= 0 && <> (còn <span className="font-mono tabular-nums">{state.earnings.tdToEarnings}</span> phiên)</>}
            </p>
          )}
        </div>
      </div>

      <p className="text-[10px] text-slate-500 border-t border-white/5 pt-2">
        Thông tin định lượng tham khảo, không phải khuyến nghị đầu tư. "Thuận lợi" chỉ hiện khi mọi điều kiện bắt buộc đều đạt và xác suất tổng hợp ≥ 60%;
        thiếu bằng chứng thì mặc định là "Quan sát" hoặc "Chưa nên".
      </p>
    </section>
  );
}

/** Bản đã nối dữ liệu: tra ảnh chụp của mã trong danh mục (một request cho cả danh mục). */
export function DecisionBarCard({ ticker, className }: { ticker: string; className?: string }) {
  const { state, loading, error } = useDecisionState(ticker);
  if (state) return <DecisionBar state={state} className={className} />;
  const msg = loading
    ? 'Đang tải trạng thái quyết định…'
    : error
      ? `Không tải được trạng thái quyết định: ${error}`
      : `Chưa có trạng thái quyết định cho ${ticker} — bộ máy chỉ tính cho danh mục cổ tức theo dõi (cập nhật mỗi sáng).`;
  return (
    <section className={`tw-scope rounded-xl p-4 ${className ?? ''}`} style={CARD} aria-label="Trạng thái quyết định">
      <h3 className="text-sm font-semibold text-cyan-400">◆ Trạng thái quyết định <span className="font-mono text-slate-100">{ticker}</span></h3>
      <p role={error ? 'alert' : 'status'} data-testid="decision-empty" className={`mt-1 text-[10.5px] ${error ? 'text-rose-300' : 'text-slate-500'}`}>{msg}</p>
    </section>
  );
}

export default DecisionBar;
