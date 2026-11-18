// LQ1 (18/11/2026) — huy hiệu thanh khoản: bậc + trung vị GTGD, chú thích đầy đủ khi rê chuột / đọc màn hình. Chỉ hiển thị.
import type { LiqStats, LqRules } from "../../../lib/elite10/decisionTypes";
import { BINDING_VI, bnText, holdFlag, LQ_TIER, lqTooltip, portfolioCapacity } from "../../../lib/elite10/liquidity";

export default function LiquidityBadge({ liq, rules, sigma20, weight = null, held = false, fallbackAdvBn = null, testId }: {
  liq: LiqStats | null | undefined; rules: LqRules; sigma20?: number | null; weight?: number | null; held?: boolean; fallbackAdvBn?: number | null; testId?: string;
}) {
  // Gateway chưa có số đo (tài liệu cũ): giữ đúng chữ cũ.
  if (!liq) return <span data-testid={testId}>GTGD {bnText(fallbackAdvBn)}</span>;
  const t = LQ_TIER[liq.tier], flag = held && weight ? holdFlag(liq, weight, sigma20, rules) : null;
  const title = lqTooltip(liq, rules, sigma20, weight) + (flag ? `\n⚠ Đang giữ: ${flag.text}` : "");
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={title} aria-label={title} data-testid={testId} data-tier={liq.tier}>
      <span className={`inline-flex items-center gap-0.5 rounded border px-1 text-[10px] font-bold leading-[14px] ${t.cls}`}>
        <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${t.dot}`} />{t.short}
      </span>
      <span className="text-slate-400">{liq.tier === "NA" ? t.label : `GTGD ${bnText(liq.med20)}`}</span>
      {liq.tier === "L3" || liq.tier === "L4" ? <span className="text-[10px] text-slate-500">{t.label.toLowerCase()}</span> : null}
      {flag && <span className={`text-[10px] font-bold ${flag.level === "red" ? "text-rose-300" : "text-amber-300"}`} data-testid={testId ? `${testId}-flag` : undefined}>⚠</span>}
    </span>
  );
}

/** Dòng tóm tắt dưới tiêu đề danh mục: phân bố bậc + vốn tối đa mà danh mục hôm nay chịu được (năng lực, ràng buộc chặt nhất). */
export function PortfolioLiquidityLine({ rows, rules }: { rows: { ticker: string; weight: number; liq?: LiqStats | null; sigma20?: number | null }[]; rules: LqRules }) {
  const have = rows.filter((r) => r.liq);
  if (!have.length) return null;
  const counts = (["L1", "L2", "L3", "L4", "NA"] as const).map((k) => [k, have.filter((r) => r.liq!.tier === k).length] as const).filter(([, n]) => n > 0);
  const cap = portfolioCapacity(rows, rules);
  return (
    <p className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-slate-400" data-testid="hl-capacity">
      <span className="font-bold text-slate-300">Thanh khoản</span>
      {counts.map(([k, n]) => (
        <span key={k} className="inline-flex items-center gap-1" title={LQ_TIER[k].hint}><span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${LQ_TIER[k].dot}`} />{LQ_TIER[k].short} {LQ_TIER[k].label.toLowerCase()} · {n}</span>
      ))}
      {cap && (
        <span title={`Vốn lớn nhất để MỌI vị thế (theo tỷ trọng hiện tại) vẫn vào ≤ 10% trung vị GTGD, thoát trong 3 phiên xấu và tác động ≤ 0,5%. Mã giới hạn: ${cap.ticker} (${BINDING_VI[cap.binding]}).`}>
          · Danh mục chịu được vốn tới <b className="text-slate-100">{bnText(cap.capitalBn)}</b> <span className="text-slate-500">(giới hạn bởi {cap.ticker}: {BINDING_VI[cap.binding]})</span>
        </span>
      )}
    </p>
  );
}
