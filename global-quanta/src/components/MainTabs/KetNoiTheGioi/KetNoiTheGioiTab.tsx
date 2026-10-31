import { useRef, useState, type KeyboardEvent } from "react";
import { Globe2, Zap, WifiOff, AlertTriangle, TrendingUp, TrendingDown, LayoutDashboard, Factory, Package, BriefcaseBusiness, ShieldCheck, type LucideIcon } from "lucide-react";
import { useGlobalStream } from "../../../hooks/useGlobalStream";
import CommodityPulseSubTab from "./CommodityPulseSubTab";
import StockImpactTable from "./StockImpactTable";
import WorldSectorPanel from "./worldSectors/WorldSectorPanel";
import AiAnalysisPanel from "./AiAnalysisPanel";
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
import "./world-gq.css";
import { getMarketGateway } from "../../../config/marketGateway";

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

type TabId = "overview" | "sectors" | "markets" | "stocks" | "evidence";
const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "sectors", label: "Ngành Việt Nam", icon: Factory },
  { id: "markets", label: "Hàng hoá & thị trường", icon: Package },
  { id: "stocks", label: "Cổ phiếu & kịch bản", icon: BriefcaseBusiness },
  { id: "evidence", label: "Bằng chứng & nguồn", icon: ShieldCheck },
];
const TAB_KEY = "gq.world.tab.v1";
function readTab(): TabId {
  try { const v = window.localStorage.getItem(TAB_KEY); return TABS.some((t) => t.id === v) ? (v as TabId) : "overview"; } catch { return "overview"; }
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
  const [showAllMarkets, setShowAllMarkets] = useState(false);
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
  const { data: stockProbe } = useSWR(tab === "stocks" ? "world-stock-probe" : null,
    () => fetchMarketJson("/api/world/stock/HPG").then(() => true, () => false), { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 });
  const stockProfileReady = stockProbe === true;
  const macro = data?.macro ?? null;
  const markets = data?.markets ?? [];
  const displayedMarkets = showAllMarkets ? markets : markets.slice(0, 6);

  return (
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
          <Engine only="overview" />
          <SectorMap2D />
          <TransmissionMap2D />
        </div>
      )}

      {tab === "sectors" && (
        <div className="space-y-3" data-testid="td-root">
          <StrategyPanel />
          <WorldSectorPanel />
          <p className="text-[10px] font-bold uppercase pt-2" style={{ color: T.textSecondary }}>Ma trận yếu tố × ngành (thăm dò)</p>
          <Engine only="matrix" />
        </div>
      )}

      {tab === "markets" && (
        <>
      {!data && (
        <div className="flex items-center gap-2 text-xs py-10 justify-center" style={{ color: T.textSecondary }}>
          <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: T.gold, borderTopColor: "transparent" }} />
          Đang tải dữ liệu vĩ mô...
        </div>
      )}

      {data && !macro && (
        <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}
          className="rounded-xl p-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: T.gold }} />
          <p className="text-xs" style={{ color: T.gold }}>
            Chưa có dữ liệu vĩ mô. Cron <code>/api/cron/refresh-macro</code> có thể chưa chạy lần nào — cần chờ lịch cron
            (2 lần/ngày) hoặc gọi thủ công để khởi tạo dữ liệu đầu tiên.
          </p>
        </div>
      )}

          {data && (
          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Nhịp Đập Thị Trường Thế Giới</p>
              <EvidenceTag kind="data" />
            </div>
            {markets.length === 0 ? (
              <p className="text-xs italic py-4 text-center" style={{ color: T.textTertiary }}>Không có dữ liệu thị trường.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {displayedMarkets.map((m) => (
                    <div key={m.symbol} style={{ background: "rgba(148,163,184,0.04)" }} className="rounded-lg p-2.5">
                      <p className="text-[9px] truncate" style={{ color: T.textTertiary }} title={m.source ? `${m.source}${m.date ? `, phiên ${m.date}` : ""}` : undefined}>{m.name}{m.date ? ` · ${m.date.split("-").reverse().slice(0, 2).join("/")}` : ""}</p>
                      <p className="text-sm font-black" style={{ color: "#f1f5f9" }}>{m.value.toLocaleString("vi-VN")}</p>
                      <p className="text-[10px] font-bold flex items-center gap-0.5" style={{ color: m.change_percent >= 0 ? T.positive : T.negative }}>
                        {m.change_percent >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {m.change_percent >= 0 ? "+" : ""}{m.change_percent.toFixed(2)}%
                      </p>
                    </div>
                  ))}
                </div>
                {markets.length > 6 && (
                  <button onClick={() => setShowAllMarkets(!showAllMarkets)}
                    className="text-[10px] mt-2 hover:underline" style={{ color: T.gold }}>
                    {showAllMarkets ? "Thu gọn" : `Xem thêm ${markets.length - 6} thị trường`}
                  </button>
                )}
              </>
            )}
          </div>

          )}
          <CommodityPulseSubTab />
          <Engine only="events" />
          <Engine only="connect" />
        </>
      )}

      {tab === "stocks" && (
        <>
          <StockImpactTable />
          <AiAnalysisPanel />
          <Engine only="scenario" />
          {stockProfileReady
            ? <Engine only="stock" />
            : <p className="text-[9.5px]" style={{ color: T.textTertiary }}>Hồ sơ cổ phiếu đang ẩn vì chưa có dữ liệu phơi nhiễm quốc tế thật cho từng mã.</p>}
        </>
      )}

      {tab === "evidence" && (
        <div className="space-y-3">
          <EvidencePriorityNote />
          <EvidenceLedgerPanel />
          <p className="text-[10px] font-bold uppercase pt-2" style={{ color: T.textSecondary }}>Bằng chứng truyền dẫn chi tiết</p>
          <p className="text-[9.5px] leading-relaxed" style={{ color: T.textTertiary }}>
            Yếu tố và sự kiện thế giới đi vào ngành Việt Nam qua kênh nào, mạnh đến đâu và <b>bằng chứng ở bậc nào</b>: A — vượt hiệu chỉnh kiểm định bội,
            ổn định và vượt kiểm định ngoài mẫu; B — có ý nghĩa sau hiệu chỉnh; C — giả thuyết / chưa đủ bằng chứng (không phải “có tác động”).
            Ma trận 10 rổ ngành (chuỗi tháng) ánh xạ sang ICB: Ngân hàng 8300, Chứng khoán 8700, BĐS 8600, Thép 1750, Dầu khí 0500, Cảng 2770, Công nghệ 9500, Điện 7530.
          </p>
          <WorldConfirmatoryPanel />
          <WorldSourcePanel />
          <p className="text-[9.5px]" style={{ color: T.textTertiary }}>
            Bên dưới là phần <b>thăm dò</b>: 13 yếu tố × 10 ngành, chọn trễ tốt nhất 0–6. Bậc A/B ở đây là tham khảo; quyết định Lọc ngành chỉ dùng cổng xác nhận phía trên.
            Kịch bản dùng local projection tháng — ước tính vượt ±50%/3 tháng là bất ổn về số (chiến lược đã gắn cờ, không dùng).
            {!stockProfileReady && " Hồ sơ cổ phiếu đang ẩn vì chưa có dữ liệu phơi nhiễm quốc tế thật cho từng mã."}
          </p>
      <p className="text-[9px] leading-relaxed" style={{ color: T.textTertiary }}>
        ℹ️ Nguồn giá ngày:{" "}
        {pulseSource === "gateway"
          ? <>Gateway (Yahoo Finance), làm mới mỗi 60 giây — DXY, VIX, US10Y, vàng, Brent, WTI và các chỉ số đều từ <b>một nguồn</b>, kèm ngày phiên.</>
          : pulseSource === "project-a"
            ? <><b style={{ color: T.gold }}>dự phòng</b> — luồng SSE của Project A (Gateway không phản hồi); số liệu có thể trễ, xem giờ cập nhật.</>
            : "đang tải…"}
        {" "}Cao su, urê, BDI, cước container và quặng sắt (proxy) là số liệu tháng/proxy từ Project A{monthlyFromProjectA ? "" : " — hiện chưa lấy được"}.
      </p>

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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-3 border-t" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
              {([
                ["DXY", macro.dxy.toFixed(2), "dxy"],
                ["VIX", macro.vix.toFixed(2), "vix"],
                ["US 10Y", macro.treasury_10y.toFixed(2) + "%", "treasury_10y"],
                ["Vàng", macro.gold !== null ? macro.gold.toFixed(0) : "—", "gold"],
                ["Brent", macro.oil_brent !== null ? macro.oil_brent.toFixed(1) : "—", "oil_brent"],
              ] as const).map(([label, val, key]) => {
                const q = macro.quotes?.[key];
                return (
                  <div key={label} title={q ? `${q.nameVi} — ${q.source}, phiên ${q.date}` : `Project A, cập nhật ${new Date(macro.fetched_at).toLocaleString("vi-VN")}`}>
                    <p className="text-[9px]" style={{ color: T.textTertiary }}>{label}</p>
                    <p className="text-xs font-bold" style={{ color: "#f1f5f9" }}>{val}</p>
                    <p className="text-[8px]" style={{ color: T.textTertiary }}>
                      {q ? `${q.symbol} · ${q.date.split("-").reverse().slice(0, 2).join("/")}` : new Date(macro.fetched_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 pt-2 border-t text-[9px]" style={{ borderColor: "rgba(148,163,184,0.08)", color: T.textTertiary }}>
              Baltic Dry Index: {macro.baltic_dry_index !== null
                ? <b style={{ color: "#f1f5f9" }}>{macro.baltic_dry_index}</b>
                : <i>Chưa có (cần đăng ký OILPRICEAPI_KEY)</i>}
            </div>
          </div>

          )}
        </div>
      )}
      </div>
    </div>
  );
}
