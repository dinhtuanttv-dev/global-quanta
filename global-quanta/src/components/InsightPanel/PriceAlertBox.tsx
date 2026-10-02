import { useState } from 'react';
import { alertActions, alertText, notifyPermission, requestNotifyPermission, usePriceAlerts, type AlertKind } from '../../lib/priceAlerts';
import { tickSize, type KeyLevels } from '../../lib/tradeLevels';

const roundTick = (v: number) => Math.round(v / tickSize(v)) * tickSize(v);
const fmt = (v: number) => v.toLocaleString('vi-VN');

/** ⏰ Cảnh báo giá thật cho mã đang chọn: theo dõi bằng giá realtime, báo toast + thông báo trình duyệt (MarketFeed). */
export default function PriceAlertBox({ ticker, price, levels }: { ticker: string; price: number | null; levels: KeyLevels | null }) {
  const alerts = usePriceAlerts().filter((a) => a.ticker === ticker);
  const [input, setInput] = useState('');
  const [perm, setPerm] = useState(notifyPermission());
  const value = Number(input.replace(/\D/g, ''));

  const add = (kind: AlertKind, level: number, label: string | null = null) => {
    if (!(level > 0)) return;
    alertActions.add(ticker, kind, roundTick(level), label);
    setInput('');
  };
  const addTyped = () => {
    if (!(value > 0)) return;
    add(price && value < price ? 'below' : 'above', value);
  };

  const quick: { label: string; kind: AlertKind; level: number | null }[] = [
    { label: 'Dừng lỗ gợi ý', kind: 'below', level: levels?.stop ?? null },
    { label: 'Đỉnh 20 phiên', kind: 'above', level: levels?.high20 ?? null },
    { label: 'MA20', kind: price && levels?.ma20 && price > levels.ma20 ? 'below' : 'above', level: levels?.ma20 ?? null },
    { label: '+5%', kind: 'above', level: price ? price * 1.05 : null },
    { label: '−5%', kind: 'below', level: price ? price * 0.95 : null },
  ];

  return (
    <div className="mt-2.5 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[9.5px] tracking-wider text-slate-500 font-semibold">⏰ CẢNH BÁO GIÁ</div>
        {perm === 'default' && (
          <button type="button" onClick={async () => setPerm(await requestNotifyPermission())} className="text-[9.5px] text-cyan-300 hover:text-cyan-200">
            Bật thông báo trình duyệt
          </button>
        )}
        {perm === 'denied' && <span className="text-[9px] text-slate-500">Trình duyệt chặn thông báo — chỉ hiện trên trang</span>}
      </div>
      <div className="flex gap-1.5">
        <input inputMode="numeric" value={input ? fmt(value) : ''} placeholder={price ? `Mức giá, VD ${fmt(roundTick(price * 1.03))}` : 'Mức giá'}
          aria-label="Mức giá cảnh báo" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTyped(); }}
          className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-[10.5px] text-slate-200 font-mono" />
        <button type="button" onClick={addTyped} disabled={!(value > 0)}
          className="text-[10.5px] px-2 rounded border border-cyan-500/50 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed">
          Đặt
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {quick.filter((q) => q.level && q.level > 0).map((q) => (
          <button key={q.label} type="button" onClick={() => add(q.kind, q.level!, q.label)} title={`Báo khi giá ${q.kind === 'above' ? '≥' : '≤'} ${fmt(roundTick(q.level!))}`}
            className="text-[9.5px] px-1.5 py-0.5 rounded border border-white/10 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200">
            {q.kind === 'above' ? '↑' : '↓'} {q.label} <span className="font-mono text-slate-500">{fmt(roundTick(q.level!))}</span>
          </button>
        ))}
      </div>
      {alerts.length > 0 && (
        <ul className="mt-1.5 space-y-0.5" aria-label={`Cảnh báo giá của ${ticker}`}>
          {alerts.map((a) => (
            <li key={a.id} className={`flex items-center gap-1.5 text-[10px] ${a.triggeredAt ? 'text-amber-300' : 'text-slate-300'}`}>
              <span>{a.triggeredAt ? '🔔' : '⏰'}</span>
              <span className="flex-1 min-w-0 truncate font-mono">
                {alertText(a)}{a.triggeredAt ? ` — đã chạm ${a.triggeredPrice ? fmt(a.triggeredPrice) : ''} lúc ${new Date(a.triggeredAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
              <button type="button" onClick={() => alertActions.remove(a.id)} aria-label={`Xoá cảnh báo ${alertText(a)}`} className="text-slate-500 hover:text-rose-300 px-1">✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="text-[9px] text-slate-500 mt-1">Theo dõi bằng giá realtime khi trang đang mở; mỗi cảnh báo báo một lần. Lưu trong trình duyệt này.</div>
    </div>
  );
}
