import { useState, useMemo } from "react";
import useSWR from "swr";
import { TrendingUp, TrendingDown, Minus, History } from "lucide-react";
import { lookupSectorMapping } from "../../../lib/macro-mapping";
import SectorImpactDetailModal, { type SectorImpact } from "./SectorImpactDetailModal";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

const T = {
  positive: "var(--positive, #34d399)",
  negative: "var(--negative, #f87171)",
  gold: "var(--gold, #f59e0b)",
  textSecondary: "var(--text-secondary, #94a3b8)",
  textTertiary: "var(--text-tertiary, #64748b)",
};

interface ImpactTableResponse {
  runId: string | null;
  generatedAt: string | null;
  overallSummaryVi: string | null;
  sectors: SectorImpact[];
  availableRuns: { runId: string; generatedAt: string; overallSummaryVi: string }[];
}

type FilterTab = "all" | "bullish" | "bearish" | "neutral";

function directionMeta(direction: SectorImpact["direction"]) {
  if (direction === "bullish") return { color: T.positive, Icon: TrendingUp, bg: "rgba(52,211,153,0.08)" };
  if (direction === "bearish") return { color: T.negative, Icon: TrendingDown, bg: "rgba(248,113,113,0.08)" };
  return { color: T.textTertiary, Icon: Minus, bg: "rgba(148,163,184,0.05)" };
}

function relativeTimeVi(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

// NANG CAP (2026-09-11): tu "danh sach the card doc, MOI card lap lai 1
// doan text dai giong het nhau" (do backend truoc day dung 1 ket luan
// chung cho tat ca nganh) sang "Smart Grid Cards" - luoi 3 cot, moi card
// GON (ten nganh + huong + % tin cay + vai ticker), bam vao moi hien chi
// tiet (SectorImpactDetailModal). Them tab loc Bullish/Bearish/Neutral va
// bo chon lich su 3 lan chay gan nhat (availableRuns tu backend).
export default function StockImpactTable() {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null); // null = dung mac dinh (lan moi nhat)
  const [detailSector, setDetailSector] = useState<SectorImpact | null>(null);
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);

  const queryUrl = selectedRunId
    ? `${API_BASE}/api/global/impact-table?runId=${encodeURIComponent(selectedRunId)}`
    : `${API_BASE}/api/global/impact-table`;

  const { data, error, isLoading } = useSWR<ImpactTableResponse>(queryUrl, fetcher, { revalidateOnFocus: true });

  const sectors = data?.sectors ?? [];
  const availableRuns = data?.availableRuns ?? [];

  const counts = useMemo(() => ({
    all: sectors.length,
    bullish: sectors.filter((s) => s.direction === "bullish").length,
    bearish: sectors.filter((s) => s.direction === "bearish").length,
    neutral: sectors.filter((s) => s.direction === "neutral").length,
  }), [sectors]);

  const filteredSectors = activeTab === "all" ? sectors : sectors.filter((s) => s.direction === activeTab);

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "bullish", label: "🟢 Bullish" },
    { key: "bearish", label: "🔴 Bearish" },
    { key: "neutral", label: "⚪ Neutral" },
  ];

  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3.5 relative">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Bảng Tổng Hợp Tác Động Cổ Phiếu</p>
        <div className="flex items-center gap-1.5">
          {availableRuns.length > 1 && (
            <div className="relative">
              <button onClick={() => setShowHistoryMenu((v) => !v)}
                className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: "rgba(148,163,184,0.08)", color: T.textSecondary }}>
                <History className="w-3 h-3" /> Lịch sử
              </button>
              {showHistoryMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg p-1.5"
                  style={{ background: "#0B0F19", border: "1px solid rgba(148,163,184,0.15)", boxShadow: "0 12px 30px rgba(0,0,0,0.4)" }}>
                  {availableRuns.map((run, i) => (
                    <button key={run.runId}
                      onClick={() => { setSelectedRunId(i === 0 ? null : run.runId); setShowHistoryMenu(false); }}
                      className="w-full text-left px-2 py-1.5 rounded text-[10px] hover:bg-white/5"
                      style={{ color: (selectedRunId === run.runId || (i === 0 && !selectedRunId)) ? T.gold : "#e2e8f0" }}>
                      <div className="font-bold">{relativeTimeVi(run.generatedAt)} {i === 0 ? "(mới nhất)" : ""}</div>
                      <div className="truncate" style={{ color: T.textTertiary }}>{run.overallSummaryVi}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <span title="Kết quả suy luận từ AI, không phải công thức toán cố định"
            className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.1)", color: T.gold }}>
            ESTIMATED
          </span>
        </div>
      </div>

      {/* MOI: overallSummaryVi hien 1 LAN DUY NHAT o day, khong lap lai o tung card nua */}
      {data?.overallSummaryVi && (
        <p className="text-[10px] leading-relaxed mb-2.5" style={{ color: "#cbd5e1" }}>{data.overallSummaryVi}</p>
      )}

      {isLoading && <p className="text-xs italic py-3 text-center" style={{ color: T.textTertiary }}>Đang tải...</p>}
      {error && <p className="text-xs" style={{ color: T.negative }}>Không tải được: {String(error)}</p>}

      {!isLoading && !error && sectors.length === 0 && (
        <p className="text-xs italic py-3 text-center" style={{ color: T.textTertiary }}>
          Chưa có dữ liệu — bấm "Chạy Phân Tích AI" ở trên để tạo bản ghi đầu tiên.
        </p>
      )}

      {sectors.length > 0 && (
        <>
          {/* Tab loc Bullish/Bearish/Neutral, co dem so luong */}
          <div className="flex flex-wrap gap-1 mb-2.5">
            {TABS.map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className="text-[9px] font-bold px-2 py-1 rounded-full"
                style={{
                  background: activeTab === tab.key ? "rgba(245,158,11,0.15)" : "rgba(148,163,184,0.05)",
                  color: activeTab === tab.key ? T.gold : T.textSecondary,
                  border: activeTab === tab.key ? "1px solid rgba(245,158,11,0.3)" : "1px solid transparent",
                }}>
                {tab.label} ({counts[tab.key]})
              </button>
            ))}
          </div>

          {/* Smart Grid - 3 cot desktop, thu gon con 1-2 cot man hinh hep */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filteredSectors.map((sector) => {
              const meta = directionMeta(sector.direction);
              const mapping = lookupSectorMapping(sector.sectorKey);
              return (
                <button key={sector.id} onClick={() => setDetailSector(sector)}
                  className="text-left rounded-lg p-2.5 transition-transform hover:scale-[1.02]"
                  style={{ background: meta.bg, border: `1px solid ${meta.color}22` }}>
                  <div className="flex items-center justify-between mb-1">
                    <meta.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: meta.color }} />
                    <span className="text-[9px] font-bold" style={{ color: meta.color }}>{Math.round(sector.confidence * 100)}%</span>
                  </div>
                  <p className="text-[10px] font-bold leading-tight mb-1.5 line-clamp-2" style={{ color: "#f1f5f9" }}>
                    {mapping?.sectorLabelVi ?? sector.sectorKey}
                  </p>
                  {sector.vnTickers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sector.vnTickers.slice(0, 4).map((t) => (
                        <span key={t} className="text-[8px] font-black px-1 py-0.5 rounded" style={{ background: "rgba(2,6,15,0.5)", color: meta.color }}>
                          {t}
                        </span>
                      ))}
                      {sector.vnTickers.length > 4 && (
                        <span className="text-[8px]" style={{ color: T.textTertiary }}>+{sector.vnTickers.length - 4}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {filteredSectors.length === 0 && (
            <p className="text-xs italic py-3 text-center" style={{ color: T.textTertiary }}>
              Không có ngành nào thuộc nhóm này.
            </p>
          )}
        </>
      )}

      <SectorImpactDetailModal sector={detailSector} onClose={() => setDetailSector(null)} />
    </div>
  );
}
