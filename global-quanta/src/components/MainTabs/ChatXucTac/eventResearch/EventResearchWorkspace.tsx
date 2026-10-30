import { useEffect, useState } from "react";
import { useAppStore } from "../../../../store/useAppStore";
import EsaPanel from "./EsaPanel";
import EventReactionStudyPanel from "./EventReactionStudyPanel";
import LeadershipPanel from "./LeadershipPanel";
import MacroEventsPanel from "./MacroEventsPanel";
import type { EventSeed } from "./researchFormat";

export const ESA_DEBOUNCE_MS = 700;

/**
 * Event Radar · Phần 2 — Phân tích chuyên sâu (30/10/2026). Chuyển nguyên từ tab Siêu quét AI: Quant Edge (H1/H2), ESA cảnh báo
 * bất thường intraday, Sự kiện vĩ mô (nay lấy từ Event Radar trên Gateway). Một ô mã dùng chung cho ESA + H1.
 */
export default function EventResearchWorkspace({ seed }: { seed: EventSeed | null }) {
  const selectedTicker = useAppStore((s) => s.selectedTicker);
  const [symbol, setSymbol] = useState(seed?.symbol ?? selectedTicker ?? "FPT");

  useEffect(() => { if (seed?.symbol) setSymbol(seed.symbol); }, [seed]);
  useEffect(() => { if (!seed && selectedTicker) setSymbol(selectedTicker); }, [selectedTicker, seed]);
  // ESA dựng nến phút (nặng trên Gateway): chỉ gọi khi mã hợp lệ và người dùng ngừng gõ — không gọi theo từng ký tự.
  const [esaSymbol, setEsaSymbol] = useState<string | null>(null);
  useEffect(() => {
    const s = symbol.trim().toUpperCase();
    const timer = window.setTimeout(() => setEsaSymbol(/^[A-Z][A-Z0-9]{2}$/.test(s) ? s : null), ESA_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [symbol]);

  return (
    <section className="space-y-4" aria-labelledby="event-research-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="event-research-title" className="text-sm font-semibold text-cyan-200">Phân tích chuyên sâu · Quant Edge H1/H2 · ESA · vĩ mô</h2>
          <p className="text-[11px] text-slate-400">Phân tích lịch sử mô tả; chưa phải dự báo đã hiệu chuẩn hay khuyến nghị giao dịch.</p>
        </div>
        <span className="rounded border border-amber-700/60 px-2 py-1 text-[10px] text-amber-300">RESEARCH ONLY</span>
      </div>
      <EsaPanel symbol={esaSymbol} />
      <EventReactionStudyPanel symbol={symbol} onSymbolChange={setSymbol} seed={seed} />
      <LeadershipPanel />
      <MacroEventsPanel />
    </section>
  );
}
