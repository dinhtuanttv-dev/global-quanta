import type { ConfluenceSource } from '../../../types/taVnIndex';

/**
 * Vung 3 - "Vi sao ra diem nay - Waterfall": giai thich diem hoi tu
 * bang cach hien thi dong gop CUA TUNG NGUON (weightPct * gia tri chuan
 * hoa), giup nguoi dung hieu NGUON NAO dong gop nhieu/it thay vi chi
 * thay 1 con so tong.
 */
export function ConfluenceWaterfall({ sources, score }: { sources: ConfluenceSource[]; score: number }) {
  const validSources = sources.filter((s) => s.status !== 'no_data' && s.weightPct !== null);
  const contributions = validSources.map((s) => {
    const numericDetail = parseFloat(s.detail);
    const value = Number.isFinite(numericDetail) ? numericDetail : 0;
    const contribution = (s.weightPct ?? 0) / 100 * value;
    return { ...s, contribution };
  });
  const maxAbs = Math.max(1, ...contributions.map((c) => Math.abs(c.contribution)));

  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-wide text-cyan-300">VÌ SAO RA ĐIỂM NÀY — WATERFALL</div>
        <span className="text-[9px] text-slate-500">Renormalize trên {validSources.length}/6 nguồn</span>
      </div>

      {contributions.length === 0 && <p className="py-2 text-[11px] text-slate-500">Chưa đủ nguồn để giải thích.</p>}

      <div className="flex flex-col gap-1.5">
        {contributions.map((c) => (
          <div key={c.key} className="flex items-center gap-2 text-[11px]">
            <span className="w-32 flex-shrink-0 truncate text-slate-400">{c.name}</span>
            <div className="h-3.5 flex-1 overflow-hidden rounded-sm bg-white/5">
              <div
                className={c.contribution >= 0 ? 'h-full rounded-sm bg-emerald-400' : 'h-full rounded-sm bg-rose-400'}
                style={{ width: `${Math.min(100, (Math.abs(c.contribution) / maxAbs) * 100)}%` }}
              />
            </div>
            <span className={`w-14 flex-shrink-0 text-right font-mono ${c.contribution >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {c.contribution >= 0 ? '+' : ''}{c.contribution.toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2 text-[12px] font-bold">
        <span className="text-slate-300">Điểm hội tụ cuối cùng</span>
        <span className="font-mono text-amber-400">= {score.toFixed(1)}</span>
      </div>
    </div>
  );
}
