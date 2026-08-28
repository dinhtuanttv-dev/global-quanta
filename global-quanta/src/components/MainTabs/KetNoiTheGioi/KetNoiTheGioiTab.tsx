import { useState } from "react";
import { Globe2, Zap, WifiOff, AlertTriangle, TrendingUp, TrendingDown, Sparkles, CheckCircle2, LineChart, Package } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { useGlobalStream } from "../../../hooks/useGlobalStream";
import { useMacroAnalysis } from "../../../hooks/useMacroAnalysis";
import { lookupSectorMapping } from "../../../lib/macro-mapping";
import CommodityPulseSubTab from "./CommodityPulseSubTab";
import TopSectorsPanel from "./TopSectorsPanel";
import StockImpactTable from "./StockImpactTable";

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

export default function KetNoiTheGioiTab() {
  const selectTicker = useAppStore((s) => s.selectTicker);
  const { data, connected } = useGlobalStream();
  const { result: aiResult, isLoading: aiLoading, error: aiError, analyze } = useMacroAnalysis();
  const [showAllMarkets, setShowAllMarkets] = useState(false);
  // PHASE (Sub-tab): "market" = Nhip Dap Thi Truong (noi dung cu, giu
  // nguyen), "commodity" = Nhip Dap Hang Hoa (MOI).
  const [activeSubTab, setActiveSubTab] = useState<"market" | "commodity">("market");

  const macro = data?.macro ?? null;
  const markets = data?.markets ?? [];
  const displayedMarkets = showAllMarkets ? markets : markets.slice(0, 6);

  return (
    <div style={{ background: `linear-gradient(165deg, ${T.bgSurface} 0%, ${T.bgSurface2} 100%)`, border: "1px solid rgba(148,163,184,0.1)" }}
      className="rounded-2xl p-5 shadow-xl space-y-4">

      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b" style={{ borderColor: "rgba(148,163,184,0.15)" }}>
        <h3 className="text-sm font-bold uppercase flex items-center gap-1.5" style={{ color: "#f1f5f9" }}>
          <Globe2 className="w-4 h-4" style={{ color: T.gold }} /> Kết Nối Thế Giới — Macro Command Center
        </h3>
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

      <p className="text-[9px] leading-relaxed" style={{ color: T.textTertiary }}>
        ℹ️ Kênh dữ liệu dùng Server-Sent Events (SSE), không phải WebSocket hai chiều thật — tự đóng và tự kết nối lại
        sau mỗi ~55 giây, cập nhật mỗi 5 giây khi đang kết nối.
      </p>

      {/* Thanh Sub-tab (MOI) */}
      <div className="flex gap-2 border-b" style={{ borderColor: "rgba(148,163,184,0.15)" }}>
        <button onClick={() => setActiveSubTab("market")}
          className="text-[10px] font-bold uppercase px-3 py-2 flex items-center gap-1.5"
          style={{ color: activeSubTab === "market" ? T.gold : T.textTertiary, borderBottom: activeSubTab === "market" ? `2px solid ${T.gold}` : "2px solid transparent" }}>
          <LineChart className="w-3.5 h-3.5" /> Nhịp Đập Thị Trường
        </button>
        <button onClick={() => setActiveSubTab("commodity")}
          className="text-[10px] font-bold uppercase px-3 py-2 flex items-center gap-1.5"
          style={{ color: activeSubTab === "commodity" ? T.gold : T.textTertiary, borderBottom: activeSubTab === "commodity" ? `2px solid ${T.gold}` : "2px solid transparent" }}>
          <Package className="w-3.5 h-3.5" /> Nhịp Đập Hàng Hóa
        </button>
      </div>

      {activeSubTab === "market" && (
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

      {macro && (
        <>
          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Risk-On Index</p>
                <span title="Công thức cố định (DXY 40% + VIX 30% + Treasury 30%), tính trực tiếp từ dữ liệu Yahoo Finance thật"
                  className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.1)", color: T.positive }}>
                  HARD_DATA
                </span>
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
              {[
                ["DXY", macro.dxy.toFixed(2)],
                ["VIX", macro.vix.toFixed(2)],
                ["US 10Y", macro.treasury_10y.toFixed(2) + "%"],
                ["Vàng", macro.gold !== null ? macro.gold.toFixed(0) : "—"],
                ["Brent", macro.oil_brent !== null ? macro.oil_brent.toFixed(1) : "—"],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="text-[9px]" style={{ color: T.textTertiary }}>{label}</p>
                  <p className="text-xs font-bold" style={{ color: "#f1f5f9" }}>{val}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t text-[9px]" style={{ borderColor: "rgba(148,163,184,0.08)", color: T.textTertiary }}>
              Baltic Dry Index: {macro.baltic_dry_index !== null
                ? <b style={{ color: "#f1f5f9" }}>{macro.baltic_dry_index}</b>
                : <i>Chưa có (cần đăng ký OILPRICEAPI_KEY)</i>}
            </div>
          </div>

          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Nhịp Đập Thị Trường Thế Giới</p>
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.1)", color: T.positive }}>HARD_DATA</span>
            </div>
            {markets.length === 0 ? (
              <p className="text-xs italic py-4 text-center" style={{ color: T.textTertiary }}>Không có dữ liệu thị trường.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {displayedMarkets.map((m) => (
                    <div key={m.symbol} style={{ background: "rgba(148,163,184,0.04)" }} className="rounded-lg p-2.5">
                      <p className="text-[9px] truncate" style={{ color: T.textTertiary }}>{m.name}</p>
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

          <TopSectorsPanel />

          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Phân Tích AI Đa Tác Nhân (Gemini)</p>
                <span title="Kết quả suy luận từ AI, không phải công thức toán cố định — luôn kèm confidence và có thể sai"
                  className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.1)", color: T.gold }}>
                  ESTIMATED
                </span>
                {aiResult?.cached && (
                  <span title="Kết quả đã lưu cache, không gọi Gemini mới lần này — tránh tốn phí lặp lại"
                    className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.1)", color: T.positive }}>
                    CACHE · {aiResult.cacheAgeMinutes}p trước
                  </span>
                )}
              </div>
              <button onClick={analyze} disabled={aiLoading}
                style={{ background: aiLoading ? "rgba(148,163,184,0.1)" : `linear-gradient(135deg, ${T.gold}, ${T.goldBright})` }}
                className="text-[10px] font-black px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:cursor-not-allowed"
                title="Gọi Gemini AI thật - tốn phí mỗi lần bấm">
                <Sparkles className="w-3 h-3" style={{ color: aiLoading ? T.textTertiary : "#0a1020" }} />
                <span style={{ color: aiLoading ? T.textTertiary : "#0a1020" }}>{aiLoading ? "Đang phân tích..." : "Chạy Phân Tích AI"}</span>
              </button>
            </div>

            {aiError && (
              <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)" }} className="rounded-lg p-2.5 mb-2">
                <p className="text-[10px]" style={{ color: T.negative }}>Không phân tích được: {aiError}</p>
              </div>
            )}

            {!aiResult && !aiError && !aiLoading && (
              <p className="text-[10px] italic" style={{ color: T.textTertiary }}>
                Bấm "Chạy Phân Tích AI" để 3 agent (Market/News/Evidence) phân tích dữ liệu thị trường hiện tại và xác định ngành CP VN bị ảnh hưởng.
              </p>
            )}

            {aiResult && aiResult.market && (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  {aiResult.evidence.verified
                    ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: T.positive }} />
                    : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: T.negative }} />}
                  <div>
                    <p className="text-xs" style={{ color: "#f1f5f9" }}>{aiResult.market.summaryVi}</p>
                    <p className="text-[9px] mt-1" style={{ color: T.textTertiary }}>
                      Độ tin cậy: <b style={{ color: "#f1f5f9" }}>{Math.round(aiResult.finalConfidence * 100)}%</b>
                      {!aiResult.evidence.verified && <span style={{ color: T.negative }}> — Evidence Agent phát hiện mâu thuẫn, độ tin cậy đã bị hạ thấp</span>}
                    </p>
                  </div>
                </div>

                {aiResult.market.affectedSectorKeys.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {aiResult.market.affectedSectorKeys.map((key) => {
                      const mapping = lookupSectorMapping(key);
                      if (!mapping) return null;
                      return (
                        <div key={key} style={{ background: "rgba(148,163,184,0.04)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-lg p-2">
                          <p className="text-[9px] font-bold" style={{ color: T.gold }}>{mapping.sectorLabelVi}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {mapping.vnTickers.map((ticker) => (
                              <button key={ticker} onClick={() => selectTicker(ticker)}
                                style={{ background: "rgba(2,6,15,0.6)" }}
                                className="text-[9px] font-black px-1.5 py-0.5 rounded" >
                                <span style={{ color: T.goldBright }}>{ticker}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {aiResult.evidence.discrepancies.length > 0 && (
                  <div style={{ background: "rgba(245,158,11,0.06)" }} className="rounded-lg p-2">
                    <p className="text-[9px] font-bold mb-1" style={{ color: T.gold }}>⚠ Mâu thuẫn Evidence Agent phát hiện:</p>
                    {aiResult.evidence.discrepancies.map((d, i) => (
                      <p key={i} className="text-[9px]" style={{ color: T.textSecondary }}>• {d}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-[9px] italic mt-3 pt-2 border-t" style={{ borderColor: "rgba(148,163,184,0.08)", color: T.textTertiary }}>
              {aiResult?.disclaimer ?? "Thông tin mang tính tham khảo, không phải khuyến nghị đầu tư."}
            </p>
          </div>

          <StockImpactTable />
        </>
      )}
      </>
      )}

      {activeSubTab === "commodity" && <CommodityPulseSubTab macro={macro} />}
    </div>
  );
}
