import type { ConfluenceSource, ConfluencePenaltyItem } from '../../../types/taVnIndex';
import { useTabNavigation } from '../../../lib/TabNavigationContext';

// Giai Trinh Hoi Tu - Giai doan 4: anh xa pillar key -> TEN TAB THAT
// (khop dung voi mang TABS trong MainTabs.tsx) - de bam vao 1 thanh se
// dieu huong dung sang tab nguon du lieu tuong ung.
const PILLAR_TO_TAB: Record<string, string> = {
  core: 'Sieu quet AI', ta: 'TA VN-Index', sector: 'Loc nganh',
  catalyst: 'Chat xuc tac', macro: 'Ket noi the gioi', dividend: 'Co tuc',
};

/**
 * Vung 3 - "Vi sao ra diem nay - Waterfall" (VIET LAI HOAN TOAN, Giai
 * doan 3/4 Giai Trinh Hoi Tu): THAC NUOC THAT (khong phai bar chart so
 * sanh do lon nhu ban cu) - moi nguon la 1 thanh "noi" o dung do cao
 * TICH LUY truoc do, cong don tu 0 -> qua 6 nguon -> TRU cac khoan
 * phat (thanh do di xuong) -> cham moc diem cuoi cung.
 *
 * Dung TRUC TIEP "contribution" + "reasonText" da tinh san o Backend
 * (KHONG tu parse chuoi "detail" o FE nhu ban cu - tranh loi am tham
 * neu dinh dang chuoi doi).
 */
export function ConfluenceWaterfall({
  sources, penalty, score,
}: {
  sources: ConfluenceSource[];
  penalty: { total: number; breakdown: Record<string, ConfluencePenaltyItem> } | null;
  score: number;
}) {
  const navigateToTab = useTabNavigation();
  const validSources = sources.filter((s) => s.status !== 'no_data' && s.contribution !== null);
  const penaltyEntries = penalty ? Object.entries(penalty.breakdown) : [];

  // Tinh cumulative TRUOC moi buoc (de "noi" dung vi tri), roi TRU dan
  // cac khoan phat. Dung Math.max(100, ...) lam thang chia ty le, vi
  // score luon trong [0,100] du co the vuot tam thoi giua chung (VD
  // tong cac pillar duong truoc khi tru phat co the >100).
  let cumulative = 0;
  const steps = validSources.map((s) => {
    const from = cumulative;
    cumulative += s.contribution ?? 0;
    return { ...s, from, to: cumulative };
  });
  const penaltySteps = penaltyEntries.map(([key, p]) => {
    const from = cumulative;
    cumulative -= p.value;
    return { key, ...p, from, to: cumulative };
  });

  const scaleMax = Math.max(100, ...steps.map((s) => Math.max(s.from, s.to)), ...penaltySteps.map((s) => Math.max(s.from, s.to)));
  const pct = (v: number) => Math.max(0, Math.min(100, (v / scaleMax) * 100));

  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-wide text-cyan-300">VÌ SAO RA ĐIỂM NÀY — WATERFALL</div>
        <span className="text-[9px] text-slate-500">{validSources.length}/6 nguồn khả dụng</span>
      </div>
      <p className="mb-2.5 text-[9px] text-slate-500">Điểm cộng dồn từ 0, mỗi nguồn góp một phần, khoản phạt trừ xuống</p>

      {validSources.length === 0 && <p className="py-2 text-[11px] text-slate-500">Chưa đủ nguồn để giải thích.</p>}

      <div className="flex flex-col">
        {steps.map((s) => {
          const isPositive = (s.contribution ?? 0) >= 0;
          const left = Math.min(pct(s.from), pct(s.to));
          const width = Math.max(0.5, Math.abs(pct(s.to) - pct(s.from)));
          // Giai doan 4: bam vao 1 hang -> dieu huong sang dung tab
          // nguon du lieu (chi khi CO context, VD component nay dung
          // ngoai MainTabs se khong co gi xay ra - an toan).
          const targetTab = PILLAR_TO_TAB[s.key];
          const clickable = Boolean(navigateToTab && targetTab);
          return (
            <div
              key={s.key}
              className={clickable ? 'cursor-pointer rounded border-b border-white/5 py-2 transition-colors last:border-b-0 hover:bg-white/[0.03]' : 'border-b border-white/5 py-2 last:border-b-0'}
              onClick={clickable ? () => navigateToTab!(targetTab) : undefined}
              title={clickable ? `Xem chi tiết tại tab "${targetTab}"` : undefined}
            >
              <div className="flex items-center gap-2 text-[11px]">
                <span className={s.isCurrentTab ? 'w-[132px] flex-shrink-0 truncate font-bold text-cyan-300' : 'w-[132px] flex-shrink-0 truncate text-slate-400'}>
                  {s.name}{clickable && <span className="ml-1 text-slate-600">↗</span>}
                </span>
                <div className="relative h-[18px] flex-1 rounded-sm bg-white/5">
                  <div
                    className={isPositive ? 'absolute top-0 h-full rounded-sm bg-emerald-400' : 'absolute top-0 h-full rounded-sm bg-rose-400'}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                </div>
                <span className={`w-14 flex-shrink-0 text-right font-mono text-[11px] ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isPositive ? '+' : ''}{(s.contribution ?? 0).toFixed(1)}
                </span>
              </div>
              {s.reasonText && <div className="mt-1 pl-[140px] text-[9px] leading-relaxed text-slate-500">{s.reasonText}</div>}
            </div>
          );
        })}

        {penaltySteps.map((p) => {
          const left = Math.min(pct(p.from), pct(p.to));
          const width = Math.max(0.5, Math.abs(pct(p.to) - pct(p.from)));
          return (
            <div key={p.key} className="border-b border-white/5 py-2 last:border-b-0">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="w-[132px] flex-shrink-0 truncate text-rose-300">Khoản phạt</span>
                <div className="relative h-[18px] flex-1 rounded-sm bg-white/5">
                  <div className="absolute top-0 h-full rounded-sm bg-rose-500" style={{ left: `${left}%`, width: `${width}%` }} />
                </div>
                <span className="w-14 flex-shrink-0 text-right font-mono text-[11px] text-rose-400">−{p.value.toFixed(1)}</span>
              </div>
              <div className="mt-1 pl-[140px] text-[9px] leading-relaxed text-slate-500">{p.labelVi}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-2.5 text-[12px] font-bold">
        <span className="text-slate-300">Điểm hội tụ cuối cùng</span>
        <span className="font-mono text-amber-400 text-[15px]">{score.toFixed(1)}</span>
      </div>
    </div>
  );
}
