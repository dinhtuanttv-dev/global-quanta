import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Globe2, Zap, WifiOff, LayoutDashboard, Factory, Package, Workflow, ShieldCheck, type LucideIcon } from "lucide-react";
import { useGlobalStream } from "../../../hooks/useGlobalStream";
import CommodityPulseSubTab from "./CommodityPulseSubTab";
import WorldSectorPanel from "./worldSectors/WorldSectorPanel";
import WorldSourcePanel from "./WorldSourcePanel";
import WorldConfirmatoryPanel from "./WorldConfirmatoryPanel";
import useSWR from "swr";
import { fetchMarketJson } from "../../../services/marketDataClient";
import EvidenceTag, { EvidencePriorityNote } from "./EvidenceTag";
import { WorldTab } from "../../../macro-center/src/ui/world/WorldTab";
import StrategyPanel from "./strategy/StrategyPanel";
import EvidenceLedgerPanel from "./strategy/EvidenceLedgerPanel";
import WorldTodayStrip from "../ChatXucTac/WorldTodayStrip";
import SectorMap2D from "./center/SectorMap2D";
import TransmissionMap2D from "./center/TransmissionMap2D";
import MarketMonitor from "./center/MarketMonitor";
import WorldNewsPanel from "./center/WorldNewsPanel";
import AiBriefPanel from "./center/AiBriefPanel";

/** Sang tab Phân tích vĩ mô bằng đúng cơ chế back/forward của thanh điều hướng, rồi cuộn tới bản tin. */
function openMacroBrief() {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", "phan-tich-vi-mo");
  window.history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  window.setTimeout(() => document.getElementById("mh-brief")?.scrollIntoView({ block: "start" }), 400);
}
import "./world-gq.css";
import { getMarketGateway } from "../../../config/marketGateway";
import { WorldNavContext } from "./worldNav";

// Mau theo bien token cua du an (muc 3.1 guide) - KHONG hardcode hex moi.
// Doc qua inline style thay vi Tailwind, vi tab nay khong lien quan
// TA VN-Index (muc 3.2: "neu tab moi doc lap -> dung CSS thuan + bien token").
const T = {
  bgSurface: "var(--bg-surface, #0e1626)",
  bgSurface2: "var(--bg-surface-2, #0a1020)",
  gold: "var(--gold, #f59e0b)",
  goldBright: "var(--gold-bright, #fbbf24)",
  positive: "var(--positive, #34d399)",
  negative: "var(--negative, #f87171)",
  textSecondary: "var(--text-secondary, #94a3b8)",
  textTertiary: "var(--text-tertiary, #64748b)",
};

function RiskStatusBadge({ status }: { status: "RISK_ON" | "NEUTRAL" | "RISK_OFF" }) {
  const map = {
    RISK_ON: { label: "RISK-ON", color: T.positive, bg: "rgba(52,211,153,0.1)" },
    NEUTRAL: { label: "TRUNG LẬP", color: T.gold, bg: "rgba(245,158,11,0.1)" },
    RISK_OFF: { label: "RISK-OFF", color: T.negative, bg: "rgba(248,113,113,0.1)" },
  }[status];
  return (
    <span style={{ color: map.color, background: map.bg, border: `1px solid ${map.color}40` }}
      className="text-xs font-black px-3 py-1 rounded-lg">
      {map.label}
    </span>
  );
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[9px] mb-1" style={{ color: T.textTertiary }}>
        <span>{label}</span><span>{value}/100</span>
      </div>
      <div style={{ background: "rgba(148,163,184,0.1)" }} className="h-1.5 rounded-full overflow-hidden">
        <div style={{ width: `${value}%`, background: T.gold }} className="h-full rounded-full" />
      </div>
    </div>
  );
}

type TabId = "overview" | "sectors" | "markets" | "transmission" | "evidence";
const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "sectors", label: "Ngành Việt Nam", icon: Factory },
  { id: "markets", label: "Thị trường & rủi ro", icon: Package },
  { id: "transmission", label: "Truyền dẫn & kịch bản", icon: Workflow },
  { id: "evidence", label: "Bằng chứng & nguồn", icon: ShieldCheck },
];
const TAB_KEY = "gq.world.tab.v1";
function readTab(): TabId {
  try { const raw = window.localStorage.getItem(TAB_KEY); const v = raw === "stocks" ? "transmission" : raw; return TABS.some((t) => t.id === v) ? (v as TabId) : "overview"; } catch { return "overview"; }
}

/** Một phần của động cơ Truyền dẫn (gói macro-center), giao diện đồng nhất qua .gq-world. */
function Engine({ only, hideStock }: { only: "overview" | "matrix" | "events" | "connect" | "scenario" | "stock"; hideStock?: boolean }) {
  return <div className="gq-world"><WorldTab baseUrl={getMarketGateway().baseUrl} theme="dark" hideHeader initialStock="HPG" hideStock={hideStock} only={only} /></div>;
}

/**
 * Trung tâm kinh tế thế giới (31/10/2026). Mạch đọc: Tổng quan -> Ngành Việt Nam -> Hàng hoá & thị trường -> Cổ phiếu & kịch bản -> Bằng chứng.
 * Mọi tính năng cũ giữ nguyên, chỉ xếp lại một tầng tab. Risk-On (đã trượt kiểm định) chuyển sang tab Bằng chứng. Tab chỉ tải khi mở.
 */
export default function KetNoiTheGioiTab() {
  const { data, connected, source: pulseSource, monthlyFromProjectA } = useGlobalStream();
  const [tab, setTabState] = useState<TabId>(readTab);
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const setTab = (next: TabId) => {
    setTabState(next);
    try { window.localStorage.setItem(TAB_KEY, next); } catch { /* chỉ nhớ trong phiên */ }
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const n = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault();
    setTab(TABS[n].id);
    refs.current[TABS[n].id]?.focus();
  };

  // Hồ sơ cổ phiếu (W7): chỉ hiện khi Gateway có dữ liệu phơi nhiễm thật (chưa có -> 422)
  const { data: stockProbe } = useSWR(tab === "transmission" ? "world-stock-probe" : null,
    () => fetchMarketJson("/api/world/stock/HPG").then(() => true, () => false), { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 });
  const stockProfileReady = stockProbe === true;
  const macro = data?.macro ?? null;
  const { data: spill } = useSWR<{ spillover?: { total: number } }>(tab === "markets" ? "world-overview-spill" : null,
    () => fetchMarketJson("/api/world/overview"), { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 });

  const nav = useMemo(() => ({ openEvidence: () => setTab("evidence") }), []);

  return (
    <WorldNavContext.Provider value={nav}>
    <div style={{ background: `linear-gradient(165deg, ${T.bgSurface} 0%, ${T.bgSurface2} 100%)`, border: "1px solid rgba(148,163,184,0.1)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
      className="rounded-2xl shadow-xl" data-testid="world-center">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-1.5" style={{ color: "#f1f5f9" }}>
            <Globe2 className="w-4 h-4" style={{ color: T.gold }} /> Trung tâm kinh tế thế giới
          </h3>
          <p className="text-[10px]" style={{ color: T.textTertiary, marginTop: 3 }}>Kinh tế thế giới tác động thế nào tới nhóm ngành và cổ phiếu Việt Nam, kèm mức bằng chứng cho từng mắt xích.</p>
        </div>
        {connected ? (
          <span className="flex items-center gap-1 text-[10px]" style={{ color: T.positive }}>
            <Zap className="w-3 h-3" /> Đang kết nối trực tiếp
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px]" style={{ color: T.textTertiary }}>
            <WifiOff className="w-3 h-3 animate-pulse" /> Đang kết nối lại...
          </span>
        )}
      </div>

      <div role="tablist" aria-label="Trung tâm kinh tế thế giới" className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: "rgba(148,163,184,0.15)" }}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} id={`world-${t.id}-tab`} type="button" role="tab" aria-selected={on} aria-controls={`world-${t.id}-panel`} tabIndex={on ? 0 : -1}
            onClick={() => setTab(t.id)} onKeyDown={onKey} className="text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            style={{ padding: "9px 12px", color: on ? T.goldBright : T.textSecondary, borderBottom: on ? `2px solid ${T.gold}` : "2px solid transparent" }}>
            <t.icon className="w-3.5 h-3.5" aria-hidden /> {t.label}
          </button>;
        })}
      </div>

      <div id={`world-${tab}-panel`} role="tabpanel" aria-labelledby={`world-${tab}-tab`} className={tab === "sectors" ? "space-y-4" : "tw-scope space-y-4"}>
      {tab === "overview" && (
        <div className="tw-scope space-y-4" data-testid="world-overview">
          <WorldTodayStrip onOpenImpact={() => setTab("sectors")} />
          <AiBriefPanel compact onOpenFull={openMacroBrief} />
          <WorldNewsPanel />
          <Engine only="overview" />
          <SectorMap2D />
        </div>
      )}

      {tab === "sectors" && (
        <div className="space-y-3" data-testid="td-root">
          <StrategyPanel />
          <WorldSectorPanel />
        </div>
      )}

      {tab === "markets" && (
        <>
          <MarketMonitor spillover={spill?.spillover?.total ?? null} />
          <CommodityPulseSubTab />
          <Engine only="connect" />
        </>
      )}

      {tab === "transmission" && (
        <div className="space-y-4" data-testid="world-transmission">
          <TransmissionMap2D />
          <Engine only="scenario" />
          <Engine only="matrix" />
          <Engine only="events" />
          {stockProfileReady
            ? <Engine only="stock" />
            : <p className="text-[9.5px]" style={{ color: T.textTertiary }}>Hồ sơ phơi nhiễm từng cổ phiếu đang ẩn vì chưa có dữ liệu phơi nhiễm quốc tế thật cho từng mã.</p>}
        </div>
      )}

      {tab === "evidence" && (
        <div className="space-y-3">
          <EvidencePriorityNote />
          <EvidenceLedgerPanel />
          <WorldConfirmatoryPanel />
          <WorldSourcePanel />
          <details className="rounded-xl px-3 py-2 text-[10px]" style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)", color: T.textSecondary }} data-testid="evidence-method">
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>Phương pháp và cách đọc bậc bằng chứng</summary>
            <div className="space-y-1.5 pt-2" style={{ color: T.textTertiary }}>
              <p><b>Bậc A</b>: vượt hiệu chỉnh kiểm định bội, ổn định và vượt kiểm định ngoài mẫu. <b>Bậc B</b>: có ý nghĩa sau hiệu chỉnh. <b>Bậc C</b>: giả thuyết hoặc chưa đủ bằng chứng, không có nghĩa là có tác động.</p>
              <p>Ma trận gồm 13 yếu tố × 10 rổ ngành theo tháng, chọn trễ tốt nhất 0–6, chỉ để thăm dò. Rổ ngành ánh xạ sang ICB: Ngân hàng 8300, Chứng khoán 8700, BĐS 8600, Thép 1750, Dầu khí 0500, Cảng 2770, Công nghệ 9500, Điện 7530. Quyết định Lọc ngành chỉ dùng cổng xác nhận đặt trước.</p>
              <p>Kịch bản dùng local projection theo tháng; ước tính vượt ±50% trong 3 tháng là bất ổn về số và không được dùng.</p>
              <p>Giá ngày lấy từ {pulseSource === "project-a" ? <b style={{ color: T.gold }}>nguồn dự phòng Project A, có thể trễ</b> : "Gateway (Yahoo Finance), mỗi số kèm ngày phiên"}. Cao su, urê, BDI, cước container và quặng sắt là số liệu tháng hoặc proxy từ Project A{monthlyFromProjectA ? "" : ", hiện chưa lấy được"}. Baltic Dry Index {macro?.baltic_dry_index != null ? <b>{macro.baltic_dry_index}</b> : "chưa có vì cần OILPRICEAPI_KEY"}.</p>
            </div>
          </details>

          {macro && (
          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Risk-On Index</p>
                <EvidenceTag kind="failed" title="Công thức đặt tay (DXY 40% + VIX 30% + US10Y 30%) trên số liệu Yahoo thật. Kiểm định đặt trước 10 năm (124 mẫu không chồng lấn): IC +0,05, KTC95 [−0,10; +0,22] — KHÔNG ĐẠT. Chỉ tham khảo." />
              </div>
              <RiskStatusBadge status={macro.risk_status} />
            </div>
            <p className="text-3xl font-black mb-3" style={{ color: "#f1f5f9" }}>{macro.risk_on_score}<span className="text-sm" style={{ color: T.textTertiary }}>/100</span></p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <BreakdownBar label="DXY (40%)" value={macro.breakdown.dxyScore} />
              <BreakdownBar label="VIX (30%)" value={macro.breakdown.vixScore} />
              <BreakdownBar label="Treasury 10Y (30%)" value={macro.breakdown.treasuryScore} />
            </div>
          </div>

          )}
        </div>
      )}
      </div>
    </div>
    </WorldNavContext.Provider>
  );
}
