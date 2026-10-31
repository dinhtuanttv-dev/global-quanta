import { MacroCenterTab } from "../../../../macro-center/src/ui/MacroCenterTab";
import { getMarketGateway } from "../../../../config/marketGateway";
import MacroEventsPanel from "../eventResearch/MacroEventsPanel";
import WorldTodayStrip from "../WorldTodayStrip";
import MacroPulse from "./MacroPulse";
import MacroUpcoming from "./MacroUpcoming";
import BrokerConsensus from "./BrokerConsensus";
import AiBriefPanel from "../../KetNoiTheGioi/center/AiBriefPanel";

// Mục lục: mh-* (tổng quan) + mc-* (id tiêu đề có sẵn của phần phân tích định lượng).
const SECTIONS: readonly [string, string][] = [
  ["mh-pulse", "Nhịp vĩ mô"], ["mh-brief", "Bản tin & đồng thuận"], ["mh-news", "Tin vĩ mô"], ["mh-calendar", "Lịch"], ["mc-thermo", "Nhiệt kế"], ["mc-matrix", "Ma trận tác động"],
  ["mc-regime", "Chế độ"], ["mc-scn", "Kịch bản"], ["mc-report", "Báo cáo tháng"], ["mc-src", "Nguồn dữ liệu"],
];

/**
 * Trung tâm vĩ mô (Chất xúc tác › 1) — 31/10/2026. Một đầu mối: bối cảnh thế giới → nhịp số liệu → tin từ Event Radar → lịch công bố →
 * phân tích định lượng có sẵn (nhiệt kế, ma trận, chế độ, kịch bản, báo cáo). Phần phân tích giữ giao diện riêng (.mc) nên nằm ngoài tw-scope.
 */
export default function MacroHub({ onOpenImpact, onOpenRadar }: { onOpenImpact: () => void; onOpenRadar: () => void }) {
  const go = (id: string) => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  return (
    <div data-testid="macro-hub">
      <WorldTodayStrip onOpenImpact={onOpenImpact} />
      <div className="tw-scope space-y-4 py-4">
        <header>
          <h2 className="text-base font-semibold text-slate-50">Trung tâm vĩ mô</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">Số liệu, tin tức và lịch công bố của kinh tế Việt Nam và thế giới, cùng phân tích tác động lên chỉ số HOSE. Tham khảo — không phải khuyến nghị đầu tư.</p>
          <nav aria-label="Mục trong Trung tâm vĩ mô" className="mt-3 flex flex-wrap gap-1.5">
            {SECTIONS.map(([id, label]) => <button key={id} type="button" onClick={() => go(id)} className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-300 transition-colors hover:border-amber-500/50 hover:text-amber-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400">{label}</button>)}
          </nav>
        </header>
        <MacroPulse />
        <div id="mh-brief" className="min-w-0 scroll-mt-4 space-y-4">
          <AiBriefPanel />
          <BrokerConsensus />
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
          <div id="mh-news" className="min-w-0 scroll-mt-4">
            <MacroEventsPanel />
            <button type="button" onClick={onOpenRadar} className="mt-2 text-[10px] text-sky-300 underline decoration-sky-300/30 hover:decoration-sky-300">Xem toàn bộ tin và phản ứng giá trong Event Radar →</button>
          </div>
          <MacroUpcoming />
        </div>
      </div>
      <MacroCenterTab baseUrl={getMarketGateway().baseUrl} embedded />
    </div>
  );
}
