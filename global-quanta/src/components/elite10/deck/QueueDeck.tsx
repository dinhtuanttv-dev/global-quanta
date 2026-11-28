// Command Deck — Z7 hàng chờ dạng thẻ: điều kiện của quy tắc ✓/✗ (deckModel.queueChecks), vị trí giá, thanh khoản, pha loãng, lý do của Gateway.
// Giữ data-testid cũ: hl-queue, hl-queue-<mã>, hl-queue-pz-<mã>, hl-queue-px-<mã>, hl-queue-illiquid, hl-queue-ill-<mã>, hl-queue-ill-pz-<mã>, hl-against.
import type { ReactNode } from "react";
import type { EliteDecision, HlQueueItem, LiqStats, LqRules } from "../../../lib/elite10/decisionTypes";
import { queueChecks } from "../../../lib/elite10/deckModel";
import { reasonText, splitQueue } from "../../../lib/elite10/liquidity";
import LiquidityBadge from "../center/LiquidityBadge";
import { PzBadge } from "../center/HlPricePosition";
import { num } from "../center/boardParts";
import { DeckPanel } from "./parts";

export default function QueueDeck({ d, onOpenTicker, liqOf, sigmaOf, lq, pxBadge }: {
  d: EliteDecision; onOpenTicker: (t: string) => void; liqOf: (t: string) => LiqStats | null; sigmaOf: (t: string) => number | null | undefined; lq: LqRules;
  pxBadge: (t: string, id: string) => ReactNode;
}) {
  const hl = d.hl!, q = splitQueue(hl.queue, hl.queueIlliquid), t1 = hl.tier1 ?? { lsLeaderPct: 80, taMin: 2, taModels: 7, maxScore: 10 };
  const card = (x: HlQueueItem, ill: boolean) => {
    const l = liqOf(x.ticker), why = ill && l && l.tier !== "NA" && l.reasons.length ? reasonText(l.reasons[0], l, lq) : x.reasonVi;
    return (
      <li key={x.ticker} data-testid={ill ? `hl-queue-ill-${x.ticker}` : `hl-queue-${x.ticker}`} className={`rounded-lg border bg-[#161D2E] p-2.5 text-[11px] ${ill ? "border-rose-400/35" : "border-white/10"}`}>
        <div className="flex items-baseline justify-between gap-2">
          <button type="button" onClick={() => onOpenTicker(x.ticker)} data-testid={ill ? undefined : `hl-open-${x.ticker}`} className="text-[14px] font-bold text-q-accent-strong hover:underline" style={{ fontFamily: "var(--q-font-sans)" }}>{x.ticker}</button>
          <span className="text-[10.5px] text-slate-400">hạng hợp lưu {x.hlRank}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {x.pz && <PzBadge pz={x.pz} compact testId={ill ? `hl-queue-ill-pz-${x.ticker}` : `hl-queue-pz-${x.ticker}`} />}
          {l && <LiquidityBadge liq={l} rules={lq} sigma20={sigmaOf(x.ticker)} fallbackAdvBn={x.advBn} />}
          {pxBadge(x.ticker, `hl-queue-px-${x.ticker}`)}
        </div>
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-slate-300">
          {queueChecks(x, t1, hl.rule).map((c) => <li key={c.id} title={c.need}><span className={c.ok ? "text-emerald-300" : "text-rose-300"} aria-hidden="true">{c.ok ? "✓" : "✗"}</span> {c.text}</li>)}
        </ul>
        <p className={`mt-1.5 text-[10.5px] ${ill ? "text-rose-200" : "text-slate-300"}`}>{why}</p>
      </li>
    );
  };
  return (
    <DeckPanel title={`Hàng chờ · ${q.tradable.length} mã giao dịch được${q.illiquid.length ? ` · ${q.illiquid.length} chưa giao dịch được` : ""}`} meta="điều kiện của quy tắc · mô tả, không phải khuyến nghị mua" testId="hl-queue">
      {q.tradable.length === 0 ? <p className="text-[11px] text-slate-400">{q.illiquid.length ? "Không còn mã Hợp lưu nào giao dịch được ngoài danh mục." : "Không còn mã Hợp lưu nào ngoài danh mục."}</p>
        : <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">{q.tradable.map((x) => card(x, false))}</ul>}
      {q.illiquid.length > 0 && (
        <div className="mt-2.5" data-testid="hl-queue-illiquid">
          <p className="mb-1.5 text-[11px] text-rose-200">Đạt Hợp lưu nhưng chưa giao dịch được ({q.illiquid.length}) — không chiếm suất hàng chờ</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">{q.illiquid.map((x) => card(x, true))}</ul>
          <p className="mt-1.5 text-[10px] text-slate-500">Cổng vào hiện hành vẫn là GTGD trung bình 20 phiên ≥ {num(hl.rule.minAdvBn, 0)} tỷ; lý do ghi theo số đo LQ-v1 (trung vị, phiên thấp, trượt giá).</p>
        </div>
      )}
      {hl.against.length > 0 && <p className="mt-2 text-[10.5px] text-slate-400" data-testid="hl-against">Đạt tầng 1 nhưng ngành phản đối (không vào): {hl.against.map((x) => `${x.ticker} (${x.rrgVi ?? "—"})`).join(" · ")}</p>}
    </DeckPanel>
  );
}
