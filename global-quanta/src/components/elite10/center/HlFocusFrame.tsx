// QĐ-R (20/11/2026) — khung "Mã đang chọn" ở Bảng quyết định: ba khối CHUYỂN từ Hồ sơ 360° (theo quyết định của chủ dự án):
//   💰 Sự kiện cổ tức · Săn cổ tức trước GDKHQ (ToTickerCard) · ⏱ Mô phỏng thời điểm vào (TimingSimPanel) · 📰 Tin tức thông minh Elite 10
//   (EliteNewsPanel). Dùng NGUYÊN component cũ — không đổi hook, công thức hay data-testid bên trong.
// Mã: các mã đang giữ của Elite HL (mặc định mã đầu tiên); danh mục trống -> mã đầu hàng chờ. Mô phỏng thời điểm nặng (lịch sử 5 năm,
// nghiên cứu sự kiện) nên chỉ dựng khi người dùng bấm — mở Bảng quyết định không gọi thêm các API đó.
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../../store/useAppStore";
import { hlPicks, type EliteDecision } from "../../../lib/elite10/decisionTypes";
import ToTickerCard from "./ToTickerCard";
import TimingSimPanel from "../timing/TimingSimPanel";
import EliteNewsPanel from "../news/EliteNewsPanel";
import { Panel } from "./HlRulesLedger";
import HlBuyCalendar from "./HlBuyCalendar";

export function focusTickers(d: EliteDecision): { tickers: string[]; source: "held" | "queue" | "none" } {
  const held = hlPicks(d).map((p) => p.ticker);
  if (held.length) return { tickers: held, source: "held" };
  const queue = (d.hl?.queue ?? []).map((q) => q.ticker);
  return queue.length ? { tickers: queue.slice(0, 10), source: "queue" } : { tickers: [], source: "none" };
}

/** HS360-v3 H5: nonce "Mã đang chọn" đã xử lý — mức mô-đun để mở lại tab không chọn lại. */
let handledHlFocus = 0;

export default function HlFocusFrame({ d, onOpenTicker }: { d: EliteDecision; onOpenTicker: (ticker: string) => void }) {
  const { tickers, source } = useMemo(() => focusTickers(d), [d]);
  const [picked, setPicked] = useState<string | null>(null);
  // HS360-v3 H5: Hồ sơ 360° · Sự kiện yêu cầu mở mã trong khung này (store hlFocus, nonce).
  const hlFocus = useAppStore((s) => s.hlFocus);
  useEffect(() => { if (hlFocus && hlFocus.nonce > handledHlFocus) { handledHlFocus = hlFocus.nonce; setPicked(hlFocus.ticker); } }, [hlFocus]);
  const [simOn, setSimOn] = useState(false);
  const cur = picked && tickers.includes(picked) ? picked : tickers[0] ?? null;
  const chip = (t: string) => (
    <button key={t} type="button" aria-pressed={t === cur} onClick={() => setPicked(t)} data-touch data-testid={`hl-focus-pick-${t}`}
      className={`min-h-[28px] rounded border px-2 text-[11px] font-bold ${t === cur ? "border-[#E8B84B]/60 bg-[#E8B84B]/15 text-[#F5CE72]" : "border-white/10 text-slate-300 hover:border-white/25"}`}>{t}</button>
  );
  return (
    <Panel title={cur ? `Mã đang chọn · ${cur}` : "Mã đang chọn"} testId="hl-focus"
      right={cur ? <button type="button" onClick={() => onOpenTicker(cur)} data-testid="hl-focus-open" className="min-h-[24px] rounded border border-white/15 px-2 text-[10px] text-slate-300 hover:border-[#E8B84B]/50 hover:text-[#F5CE72]">Mở Hồ sơ 360° của {cur} →</button> : undefined}>
      {!cur ? <p className="text-[11px] text-slate-500" data-testid="hl-focus-empty">Chưa có mã đang giữ hay trong hàng chờ.</p> : (
        <div className="space-y-3">
          {/* MP-a (20/11/2026): lịch vùng mua của cả danh mục — bấm mã để chọn trong khung. */}
          <HlBuyCalendar tickers={tickers} picked={cur} onPick={setPicked} />
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Chọn mã" data-testid="hl-focus-picks">
            <span className="mr-1 text-[10px] text-slate-500">{source === "held" ? "Mã đang giữ:" : "Danh mục trống — mã đầu hàng chờ:"}</span>
            {tickers.map(chip)}
          </div>
          {/* Elite × TO (07/11/2026): sự kiện cổ tức của mã — Săn cổ tức trước GDKHQ (THĂM DÒ). */}
          <ToTickerCard ticker={cur} />
          {/* CH2: mô phỏng thời điểm vào cổ tức / KQKD — dựng khi bấm. */}
          {simOn ? <TimingSimPanel ticker={cur} /> : (
            <div className="rounded-md border border-white/10 bg-white/[0.02] p-2 text-[11px]" data-testid="hl-focus-sim-off">
              <p className="text-[10px] font-bold uppercase text-slate-500">⏱ Mô phỏng thời điểm vào</p>
              <p className="mt-0.5 text-slate-400">Mô phỏng cổ tức / KQKD theo Timeline điểm mua, tải lịch sử giá 5 năm của mã.</p>
              <button type="button" onClick={() => setSimOn(true)} data-touch data-testid="hl-focus-sim-on"
                className="mt-1.5 min-h-[28px] rounded border border-[#E8B84B]/50 px-3 font-bold text-[#F5CE72] hover:bg-[#E8B84B]/10">Chạy mô phỏng cho {cur}</button>
            </div>
          )}
          <EliteNewsPanel ticker={cur} onTicker={(t) => (tickers.includes(t) ? setPicked(t) : onOpenTicker(t))} />
        </div>
      )}
    </Panel>
  );
}
