import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useAppStore } from '../../store/useAppStore';
import { getOhlcv, isMarketGatewayEnabled } from '../../services/marketDataClient';
import { useResearchSymbol } from '../../hooks/useResearch';
import { AdaptiveScoreBody } from '../MainTabs/SieuQuetAI/AdaptiveScoreCard';
import { useRadarModel } from '../../hooks/useRadarModel';
import { useSieuQuetScanner } from '../../hooks/useSieuQuetScanner';
import { useWatchlists } from '../../hooks/useWatchlists';
import { CORE_MIN } from '../../lib/radarModel';
import { keyLevels, positionSize, tickSize } from '../../lib/tradeLevels';
import Card, { AiChip } from './Card';
import PriceAlertBox from './PriceAlertBox';

// ACTION CENTER — mã đang chọn (Radar / Bảng Siêu Quét / ô tìm mã):
//   Quan tâm / Loại bỏ (thêm / bỏ khỏi ★ Danh mục của Radar), mức giá then chốt tính từ dữ liệu thật (MA20/50,
//   ATR14, đỉnh/đáy 20 phiên, POC / vùng giá trị), biểu đồ 60 phiên, máy tính khối lượng theo % rủi ro, điểm AI.
// Trang không kết nối tài khoản chứng khoán — không có nút đặt lệnh.

const UP = '#34d399', DOWN = '#fb7185';
const fmt = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('vi-VN'));
const pctTxt = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`);

function readNum(key: string, def: number) {
  try { const v = Number(window.localStorage.getItem(key)); return Number.isFinite(v) && v > 0 ? v : def; } catch { return def; }
}

function Sparkline({ closes, ma20, stop }: { closes: number[]; ma20: number | null; stop: number | null }) {
  if (closes.length < 2) return null;
  const W = 300, H = 56;
  const all = [...closes, ...(stop ? [stop] : [])];
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const y = (v: number) => H - 4 - ((v - lo) / span) * (H - 8);
  const pts = closes.map((c, i) => `${((i / (closes.length - 1)) * W).toFixed(1)},${y(c).toFixed(1)}`).join(' ');
  const up = closes[closes.length - 1] >= closes[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14 block" role="img" aria-label={`Giá ${closes.length} phiên gần nhất`}>
      {ma20 && <line x1={0} x2={W} y1={y(ma20)} y2={y(ma20)} stroke="rgba(56,189,248,0.5)" strokeDasharray="3 3" />}
      {stop && <line x1={0} x2={W} y1={y(stop)} y2={y(stop)} stroke="rgba(251,113,133,0.55)" strokeDasharray="2 3" />}
      <polyline points={pts} fill="none" stroke={up ? UP : DOWN} strokeWidth={1.6} />
    </svg>
  );
}

function Level({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="rounded px-1.5 py-1" style={{ background: 'rgba(255,255,255,0.03)' }} title={hint}>
      <div className="text-[9px] text-slate-500">{label}</div>
      <div className="font-mono text-[11px]" style={{ color: color ?? '#e2e8f0' }}>{value}</div>
    </div>
  );
}

export default function ActionCenter() {
  const { selectedTicker, showToast } = useAppStore();
  const focusTickerInScanner = useAppStore((s) => s.focusTickerInScanner);
  const live = useAppStore((s) => s.livePrices);
  const radar = useRadarModel();
  const { items } = useSieuQuetScanner();
  const { addTo, removeFrom, restoreList } = useWatchlists();

  const core = radar.core.find((n) => n.ticker === selectedTicker);
  const scored = radar.scored.find((x) => x.ticker === selectedTicker) ?? null;
  const item = scored?.item ?? items.find((i) => i.ticker === selectedTicker) ?? null;
  const ticker = selectedTicker;
  const inList = Boolean(ticker && radar.tickers.includes(ticker));
  const research = useResearchSymbol(ticker ?? null);

  const { data: ohlcv } = useSWR(
    ticker && isMarketGatewayEnabled() ? ['ac-ohlcv', ticker] : null,
    () => getOhlcv(ticker!, { limit: 80 }),
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );
  const livePrice = ticker ? live[ticker]?.price ?? null : null;
  const levels = useMemo(() => (ohlcv ? keyLevels(ohlcv.bars, livePrice ?? item?.price ?? null) : null), [ohlcv, livePrice, item?.price]);
  const price = livePrice ?? levels?.price ?? item?.price ?? null;
  const changePct: number | null = (ticker ? live[ticker]?.changePct : null) ?? item?.changePct ?? null;

  const [capital, setCapital] = useState(() => readNum('gq.ac.capital', 100_000_000));
  const [riskPct, setRiskPct] = useState(() => readNum('gq.ac.riskPct', 1));
  const [stopInput, setStopInput] = useState<string>('');
  useEffect(() => setStopInput(''), [ticker]); // dừng lỗ tự nhập là của mã trước
  const stop = stopInput ? Number(stopInput.replace(/\D/g, '')) : levels?.stop ?? null;
  const size = price && stop ? positionSize(capital, riskPct, price, stop) : null;
  const save = (k: string, v: number) => { try { window.localStorage.setItem(k, String(v)); } catch { /* bỏ qua */ } };

  if (!ticker) {
    return (
      <Card id="action" title={<>ACTION CENTER <AiChip /></>}>
        <div className="text-[10.5px] text-slate-400">Chọn 1 mã trên Radar hoặc bấm một dòng trong Bảng Siêu Quét để xem chi tiết hành động.</div>
      </Card>
    );
  }

  const onInterest = () => {
    if (addTo(radar.listId, ticker)) showToast(`Đã thêm ${ticker} vào ★ ${radar.listName}`);
    else showToast(`${ticker} đã có trong ★ ${radar.listName} (hoặc danh mục đã đủ 60 mã)`);
  };
  const onRemove = () => {
    const before = removeFrom(radar.listId, ticker);
    if (before) showToast(`Đã loại ${ticker} khỏi ★ ${radar.listName}`, () => restoreList(before));
  };
  const score = scored?.score ?? null;
  const stateLine = core
    ? `${core.state === 'stable' ? '🛡' : core.state === 'breakout' ? '⚡' : '⚠'} ${core.stateLabel} · Core ${score}/6`
    : score !== null ? `Ring · ${score}/6 tiêu chí — còn ${Math.max(0, CORE_MIN - score)} để vào Core` : `Chưa có trong ★ ${radar.listName}`;
  const vsMa = (ma: number | null) => (ma && price ? ((price / ma - 1) * 100) : null);

  return (
    <Card id="action" title={<>ACTION CENTER <AiChip /></>}>
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center font-mono text-[11px] font-bold text-cyan-200 shrink-0"
          style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.3)' }}>{ticker}</div>
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-slate-100 truncate">{item?.companyName ?? core?.name ?? ticker}</div>
          <div className="text-[10px] text-slate-400 truncate">{stateLine}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="font-mono text-sm font-semibold text-slate-100">{fmt(price)}</div>
          <div className="font-mono text-[10.5px]" style={{ color: (changePct ?? 0) >= 0 ? UP : DOWN }}>{pctTxt(changePct)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mt-2.5">
        <button type="button" onClick={onInterest} disabled={inList} aria-pressed={inList}
          className={`py-2 rounded-lg text-[11.5px] font-semibold border transition-colors ${inList ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200/70 cursor-default' : 'border-cyan-500/50 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25'}`}>
          {inList ? '★ Đang quan tâm' : '☆ Quan tâm'}
        </button>
        <button type="button" onClick={onRemove} disabled={!inList}
          className={`py-2 rounded-lg text-[11.5px] font-semibold border transition-colors ${inList ? 'border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20' : 'border-white/10 text-slate-600 cursor-not-allowed'}`}>
          ✕ Loại bỏ
        </button>
      </div>
      <div className="text-[9.5px] text-slate-500 mt-1">Quan tâm / Loại bỏ = thêm / bỏ mã khỏi ★ {radar.listName} (Radar, tin tức, giá realtime đổi theo).</div>

      {levels && (
        <>
          <div className="mt-2.5 text-[9.5px] text-slate-500 flex justify-between">
            <span>60 phiên · <span className="text-sky-400">- - MA20</span> · <span className="text-rose-400">- - dừng lỗ gợi ý</span></span>
            <button type="button" onClick={() => focusTickerInScanner(ticker)} className="text-cyan-300 hover:text-cyan-200">Mở phân tích ↗</button>
          </div>
          <Sparkline closes={levels.closes} ma20={levels.ma20} stop={levels.stop} />
          <div className="grid grid-cols-3 gap-1 mt-1">
            <Level label="MA20" value={fmt(levels.ma20)} hint={`Giá ${pctTxt(vsMa(levels.ma20), 1)} so MA20`} color={vsMa(levels.ma20) !== null && vsMa(levels.ma20)! >= 0 ? UP : DOWN} />
            <Level label="MA50" value={fmt(levels.ma50)} hint={`Giá ${pctTxt(vsMa(levels.ma50), 1)} so MA50`} color={vsMa(levels.ma50) !== null && vsMa(levels.ma50)! >= 0 ? UP : DOWN} />
            <Level label="ATR14" value={levels.atrPct ? `${levels.atrPct.toFixed(1)}%` : '—'} hint={`Biên độ dao động trung bình 14 phiên: ${fmt(levels.atr14)}đ`} />
            <Level label="Đỉnh 20 phiên" value={fmt(levels.high20)} />
            <Level label="Đáy 20 phiên" value={fmt(levels.low20)} />
            <Level label="Dừng lỗ gợi ý" value={fmt(levels.stop)} hint="Giá − 2×ATR14, không thấp hơn đáy 20 phiên − 1×ATR" color={DOWN} />
            {research.data?.profile && <Level label="POC (vùng KL lớn)" value={fmt(research.data.profile.poc)} hint={`Vùng giá trị ${fmt(research.data.profile.vaLow)}–${fmt(research.data.profile.vaHigh)}`} />}
            {item?.riskRewardRatio !== null && item?.riskRewardRatio !== undefined && <Level label="R/R (Siêu Quét)" value={item.riskRewardRatio.toFixed(2)} />}
            {research.data?.profile && <Level label="VWAP" value={fmt(research.data.profile.vwap)} />}
          </div>
        </>
      )}

      <div className="mt-2.5 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="text-[9.5px] tracking-wider text-slate-500 font-semibold mb-1">MÁY TÍNH KHỐI LƯỢNG THEO RỦI RO</div>
        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
          <label className="flex flex-col gap-0.5 text-slate-500">Vốn (đ)
            <input inputMode="numeric" value={capital.toLocaleString('vi-VN')} aria-label="Vốn"
              onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, '')) || 0; setCapital(v); save('gq.ac.capital', v); }}
              className="bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-slate-200 font-mono w-full" />
          </label>
          <label className="flex flex-col gap-0.5 text-slate-500">Rủi ro (% vốn)
            <input inputMode="decimal" value={riskPct} aria-label="Phần trăm rủi ro"
              onChange={(e) => { const v = Number(e.target.value.replace(',', '.')) || 0; setRiskPct(v); save('gq.ac.riskPct', v); }}
              className="bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-slate-200 font-mono w-full" />
          </label>
          <label className="flex flex-col gap-0.5 text-slate-500">Dừng lỗ (đ)
            <input inputMode="numeric" value={stopInput || (levels?.stop ? String(Math.round(levels.stop / tickSize(levels.stop)) * tickSize(levels.stop)) : '')} aria-label="Giá dừng lỗ"
              onChange={(e) => setStopInput(e.target.value)}
              className="bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-slate-200 font-mono w-full" />
          </label>
        </div>
        <div className="text-[10.5px] mt-1.5" aria-live="polite">
          {size ? (
            <>
              <b className="text-amber-400 font-mono">{size.shares.toLocaleString('vi-VN')} CP</b>
              <span className="text-slate-400"> ≈ {fmt(size.value)}đ ({size.pctOfCapital.toFixed(0)}% vốn) · lỗ tối đa ≈ {fmt(size.riskVnd)}đ nếu chạm dừng lỗ</span>
            </>
          ) : <span className="text-slate-500">Nhập vốn, % rủi ro và giá dừng lỗ thấp hơn giá hiện tại.</span>}
        </div>
      </div>

      <PriceAlertBox ticker={ticker} price={price} levels={levels} />

      <div className="text-[10px] text-slate-400 mt-2">Gợi ý khung nắm giữ (theo quy tắc): <b className="text-slate-200 font-medium">{core ? core.holdSuggestion : 'Theo dõi — chưa đủ điều kiện Core'}</b></div>
      {research.data?.asOf && (
        <div className="mt-2 text-[10px] text-slate-400">
          <div className="mb-1 text-violet-200">Điểm dòng tiền thích ứng (AI tự học) — xác suất mạnh hơn trung vị thị trường:</div>
          <AdaptiveScoreBody data={research.data} compact />
        </div>
      )}
    </Card>
  );
}
