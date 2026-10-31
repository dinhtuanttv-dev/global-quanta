import { useState } from "react";
import { AlertTriangle, ChevronRight, Home } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { useHousingPrices } from "../../../hooks/useHousingPrices";
import useSWR from "swr";
import { useCommoditySnapshot } from "../../../hooks/useCommoditySnapshot";
import { fetchMarketJson } from "../../../services/marketDataClient";
import { fmtSigned, type MonitorDoc, type MonitorItem } from "../../../lib/world/monitor";
import { fmtPct, fmtPeriod, fmtPrice, staleDays, type CommodityItem } from "../../../lib/commodities/types";
import EvidenceTag from "./EvidenceTag";
import TrendSparkline from "./TrendSparkline";
import CommodityDrawer from "./commodity/CommodityDrawer";

const T = {
  gold: "var(--gold, #f59e0b)",
  positive: "var(--positive, #34d399)",
  negative: "var(--negative, #f87171)",
  textSecondary: "var(--text-secondary, #94a3b8)",
  textTertiary: "var(--text-tertiary, #64748b)",
};

const GROUP_ORDER = ["Kim loại quý", "Năng lượng", "Kim loại", "Nông sản", "Phân bón", "Vận tải"];

function CommodityCard({ c, onOpen, stats }: { c: CommodityItem; onOpen: (c: CommodityItem) => void; stats?: MonitorItem }) {
  const selectTicker = useAppStore((s) => s.selectTicker);
  const stale = c.available ? staleDays(c) : null;
  const hist = c.history ?? [];
  const chg = c.change?.pct ?? null;
  return (
    <div data-testid={`commodity-card-${c.id}`} role="button" tabIndex={0} aria-label={`${c.nameVi}: mở phân tích chuyên sâu`}
      onClick={() => onOpen(c)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(c); } }}
      style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)", cursor: "pointer" }} className="rounded-xl p-3.5 flex flex-col gap-1.5 hover:brightness-125 focus:outline focus:outline-1">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold" style={{ color: T.textSecondary }}>{c.nameVi}</p>
        <div className="flex items-center gap-1 shrink-0">
          {c.vnPrice && <span title="Giá xuất khẩu của Việt Nam (không phải giá thế giới quy đổi)" className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.1)", color: T.positive }}>GIÁ VIỆT NAM</span>}
          {stale !== null && <span title="Nguồn chưa có số mới" className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.12)", color: T.gold }}>cũ {stale} ngày</span>}
          <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.08)", color: T.textTertiary }}>{c.freq === "day" ? "NGÀY" : c.freq === "month" ? "THÁNG" : "—"}</span>
        </div>
      </div>
      {c.available ? (
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-lg font-black" style={{ color: "#f1f5f9" }}>
              {fmtPrice(c.value)} <span className="text-[10px] font-normal" style={{ color: T.textTertiary }}>{c.unit}</span>
            </p>
            <p className="text-[10px] font-bold" style={{ color: chg == null ? T.textTertiary : chg >= 0 ? T.positive : T.negative }}>
              {fmtPct(chg)} <span className="font-normal" style={{ color: T.textTertiary }}>{c.change?.basisVi}</span>
            </p>
            {stats?.z != null && <p className="text-[9px]" data-testid={`commodity-z-${c.id}`} style={{ color: stats.unusual ? T.gold : T.textTertiary }} title="So với 60 phiên trước; vị trí trong biên 252 phiên">z {fmtSigned(stats.z, 1)}{stats.rangePct != null ? ` · biên năm ${stats.rangePct.toFixed(0)}%` : ""}</p>}
            {c.yoyPct != null && <p className="text-[9px]" style={{ color: T.textTertiary }}>So với cùng kỳ năm trước: <b style={{ color: c.yoyPct >= 0 ? T.positive : T.negative }}>{fmtPct(c.yoyPct, 1)}</b></p>}
          </div>
          <TrendSparkline values={hist.map((h) => h[1])} width={96} height={30}
            label={hist.length ? `${c.nameVi}: ${hist.length} ${c.freq === "day" ? "phiên" : "tháng"}, ${fmtPeriod(hist[0][0])} → ${fmtPeriod(hist[hist.length - 1][0])}` : undefined} />
        </div>
      ) : (
        <p className="text-xs italic" style={{ color: T.textTertiary }}>{c.reasonVi ?? "Chưa có dữ liệu"}</p>
      )}
      <p className="text-[8.5px]" style={{ color: T.textTertiary }}>
        {c.available && <>{c.freq === "day" ? "Phiên" : "Kỳ"} {fmtPeriod(c.period)}{hist.length > 1 && ` · xu hướng ${hist.length} ${c.freq === "day" ? "phiên" : "tháng"}`} · </>}
        {c.source.symbol ? `${c.source.symbol} — ` : ""}{c.source.labelVi}
        {c.freq === "month" && c.source.updatedOn && ` (bản công bố ${fmtPeriod(c.source.updatedOn)})`}
      </p>
      {c.vnTickers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-1.5 border-t" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
          <span title="Ánh xạ đặt tay mặt hàng → cổ phiếu VN, chưa kiểm định ngoài mẫu" className="text-[8px]" style={{ color: T.textTertiary }}>Mã liên quan (heuristic):</span>
          {c.vnTickers.map((t) => (
            <button key={t} type="button" onClick={(e) => { e.stopPropagation(); selectTicker(t); }} onKeyDown={(e) => e.stopPropagation()} className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.06)", color: T.gold }}>{t}</button>
          ))}
        </div>
      )}
      {c.available && (
        <p className="text-[9px] flex items-center gap-0.5" style={{ color: T.gold }}>Phân tích chuyên sâu: xu hướng VN ↔ thế giới, biến động, tương quan <ChevronRight className="w-3 h-3" /></p>
      )}
      {c.twoWayVi && (
        <div className="flex items-start gap-1 pt-1.5 border-t" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" style={{ color: T.gold }} />
          <p className="text-[8px] italic" style={{ color: T.textTertiary }}>{c.twoWayVi}</p>
        </div>
      )}
    </div>
  );
}

export default function CommodityPulseSubTab() {
  const { countries, isLoading: housingLoading, error: housingError } = useHousingPrices();
  const { data: snap, error: snapError } = useCommoditySnapshot();
  const { data: monitor } = useSWR<MonitorDoc>("world-monitor", () => fetchMarketJson<MonitorDoc>("/api/world/monitor"), { refreshInterval: 60_000, revalidateOnFocus: true, dedupingInterval: 30_000 });
  const [open, setOpen] = useState<CommodityItem | null>(null);
  const groups = snap ? GROUP_ORDER.map((g) => [g, snap.items.filter((i) => i.group === g)] as const).filter(([, xs]) => xs.length) : [];

  return (
    <div className="tw-scope space-y-4">
      {!snap && !snapError && (
        <div className="flex items-center gap-2 text-xs py-6 justify-center" style={{ color: T.textSecondary }}>
          <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: T.gold, borderTopColor: "transparent" }} />
          Đang tải dữ liệu hàng hóa...
        </div>
      )}
      {snapError && <p className="text-xs" style={{ color: T.negative }}>Không tải được dữ liệu hàng hoá từ Gateway: {snapError.message}</p>}

      {snap && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Hàng Hóa Chiến Lược</p>
            <EvidenceTag kind="data" title="Giá thị trường thật — mỗi mặt hàng một nguồn, kèm phiên/kỳ" />
          </div>
          {groups.map(([g, xs]) => (
            <div key={g}>
              <p className="text-[9px] font-bold uppercase mb-1.5" style={{ color: T.textTertiary }}>{g}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {xs.map((c) => <CommodityCard key={c.id} c={c} stats={monitor?.items.find((m) => m.id === c.id)} onOpen={(x) => x.available && setOpen(x)} />)}
              </div>
            </div>
          ))}
          <p className="text-[9px] italic" style={{ color: T.textTertiary }}>
            Giá NGÀY: hợp đồng tương lai kỳ gần trên Yahoo qua Gateway (nối kỳ hạn nên có thể có bước nhảy khi đáo hạn). Giá THÁNG: World Bank
            Pink Sheet — trung bình tháng, công bố đầu tháng sau
            {snap.pinkSheet?.updatedOn ? ` (bản ${fmtPeriod(snap.pinkSheet.updatedOn)}, kỳ mới nhất ${fmtPeriod(snap.pinkSheet.lastPeriod)})` : ""}
            {snap.pinkSheet?.lastError ? ` — lần lấy gần nhất lỗi, đang dùng bản lưu lúc ${new Date(snap.pinkSheet.fetchedAt).toLocaleString("vi-VN")}` : ""}.
            Brent tháng (Pink Sheet) khác Brent tương lai kỳ gần (ngày). Mã cổ phiếu là ánh xạ đặt tay, không phải khuyến nghị.
          </p>
        </div>
      )}

      {open && <CommodityDrawer item={open} onClose={() => setOpen(null)} />}

      {/* GIA NHA THE GIOI - tan suat thap (quy), SWR rieng */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Xu Hướng Giá Nhà Thế Giới</p>
          <EvidenceTag kind="data" title="Bank for International Settlements — số liệu thật theo quý" />
        </div>
        {housingLoading && (
          <p className="text-xs italic py-3 text-center" style={{ color: T.textTertiary }}>Đang tải...</p>
        )}
        {housingError && (
          <p className="text-xs" style={{ color: T.negative }}>Không tải được: {String(housingError)}</p>
        )}
        {!housingLoading && !housingError && countries.length === 0 && (
          <p className="text-xs italic py-3 text-center" style={{ color: T.textTertiary }}>Chưa có dữ liệu.</p>
        )}
        {countries.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {countries.map((c) => (
              <div key={c.country_code} style={{ background: "rgba(2,6,15,0.6)" }} className="rounded-lg p-2.5">
                <div className="flex items-center gap-1">
                  <Home className="w-3 h-3" style={{ color: T.textTertiary }} />
                  <p className="text-[9px]" style={{ color: T.textTertiary }}>{c.country_name} · {c.quarter_label}</p>
                </div>
                <p className="text-sm font-black" style={{ color: "#f1f5f9" }}>{c.real_index_value.toFixed(1)}</p>
                {c.yoy_change_percent !== null && (
                  <p className="text-[10px] font-bold" style={{ color: c.yoy_change_percent >= 0 ? T.positive : T.negative }}>
                    {c.yoy_change_percent >= 0 ? "+" : ""}{c.yoy_change_percent.toFixed(1)}% YoY
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-[9px] italic mt-2" style={{ color: T.textTertiary }}>
          Chỉ số thực (đã điều chỉnh lạm phát), năm gốc 2010=100. Nguồn: Bank for International Settlements.
        </p>
      </div>
    </div>
  );
}
