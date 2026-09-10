import { Coins, Fuel, Ship, Coffee, Mountain, Home, Trees, Sprout, AlertTriangle } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { useHousingPrices } from "../../../hooks/useHousingPrices";
import { lookupSectorMapping } from "../../../lib/macro-mapping";
import type { MacroTrendRow } from "../../../hooks/useGlobalStream";

const T = {
  gold: "var(--gold, #f59e0b)",
  positive: "var(--positive, #34d399)",
  negative: "var(--negative, #f87171)",
  textSecondary: "var(--text-secondary, #94a3b8)",
  textTertiary: "var(--text-tertiary, #64748b)",
};

interface CommodityCardProps {
  icon: React.ReactNode;
  nameVi: string;
  value: string | null;
  unit: string;
  sectorKey: string;
  isEstimateOrProxy?: boolean;
  proxyTooltip?: string;
  changeSignal?: number | null; // >0 xanh, <0 do, null xam
  twoWayCaution?: string; // MOI: canh bao khi 1 gia tac dong 2 chieu nguoc nhau len 2 nhom CP khac nhau
}

function CommodityCard({ icon, nameVi, value, unit, sectorKey, isEstimateOrProxy, proxyTooltip, changeSignal, twoWayCaution }: CommodityCardProps) {
  const selectTicker = useAppStore((s) => s.selectTicker);
  const mapping = lookupSectorMapping(sectorKey);

  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {icon}
          <p className="text-[10px] font-bold" style={{ color: T.textSecondary }}>{nameVi}</p>
        </div>
        {isEstimateOrProxy && (
          <span title={proxyTooltip ?? "Không phải giá giao dịch trực tiếp - xem chi tiết nguồn dữ liệu"}
            className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.1)", color: T.gold }}>
            PROXY
          </span>
        )}
      </div>
      {value !== null ? (
        <p className="text-lg font-black" style={{ color: "#f1f5f9" }}>
          {value} <span className="text-[10px] font-normal" style={{ color: T.textTertiary }}>{unit}</span>
        </p>
      ) : (
        <p className="text-xs italic" style={{ color: T.textTertiary }}>Chưa có dữ liệu</p>
      )}
      {changeSignal !== undefined && changeSignal !== null && (
        <p className="text-[10px] font-bold mt-0.5" style={{ color: changeSignal >= 0 ? T.positive : T.negative }}>
          {changeSignal >= 0 ? "+" : ""}{changeSignal}% (xu hướng nhóm liên quan)
        </p>
      )}
      {mapping && mapping.vnTickers.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
          {mapping.vnTickers.map((ticker) => (
            <button key={ticker} onClick={() => selectTicker(ticker)}
              className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.06)", color: T.gold }}>
              {ticker}
            </button>
          ))}
        </div>
      )}
      {twoWayCaution && (
        <div className="flex items-start gap-1 mt-2 pt-2 border-t" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" style={{ color: T.gold }} />
          <p className="text-[8px] italic" style={{ color: T.textTertiary }}>{twoWayCaution}</p>
        </div>
      )}
    </div>
  );
}

interface CommodityPulseSubTabProps {
  macro: MacroTrendRow | null;
}

export default function CommodityPulseSubTab({ macro }: CommodityPulseSubTabProps) {
  const { countries, isLoading: housingLoading, error: housingError } = useHousingPrices();

  return (
    <div className="space-y-4">
      {/* TRANG THAI: cho macro tu component cha (SSE dung chung, khong tao
          ket noi thu 2) */}
      {!macro && (
        <div className="flex items-center gap-2 text-xs py-6 justify-center" style={{ color: T.textSecondary }}>
          <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: T.gold, borderTopColor: "transparent" }} />
          Đang tải dữ liệu hàng hóa...
        </div>
      )}

      {macro && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Hàng Hóa Chiến Lược</p>
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.1)", color: T.positive }}>HARD_DATA</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <CommodityCard icon={<Coins className="w-3.5 h-3.5" style={{ color: T.gold }} />} nameVi="Vàng"
              value={macro.gold !== null ? macro.gold.toFixed(1) : null} unit="USD/oz" sectorKey="PRECIOUS_METALS" />
            <CommodityCard icon={<Fuel className="w-3.5 h-3.5" style={{ color: T.gold }} />} nameVi="Dầu Brent"
              value={macro.oil_brent !== null ? macro.oil_brent.toFixed(1) : null} unit="USD/thùng" sectorKey="ENERGY_OIL_GAS" />
            <CommodityCard icon={<Fuel className="w-3.5 h-3.5" style={{ color: T.gold }} />} nameVi="Dầu WTI"
              value={macro.oil_wti !== null ? macro.oil_wti.toFixed(1) : null} unit="USD/thùng" sectorKey="ENERGY_OIL_GAS" />
            <CommodityCard icon={<Ship className="w-3.5 h-3.5" style={{ color: T.gold }} />} nameVi="Cước tàu hàng rời (BDI)"
              value={macro.baltic_dry_index !== null ? String(macro.baltic_dry_index) : null} unit="điểm" sectorKey="SHIPPING_LOGISTICS"
              isEstimateOrProxy proxyTooltip="Baltic Dry Index đo cước tàu HÀNG RỜI (quặng sắt, than, ngũ cốc) - KHÔNG đại diện cho cước tàu container. Xem thẻ 'Cước container' riêng bên cạnh." />
            <CommodityCard icon={<Ship className="w-3.5 h-3.5" style={{ color: T.gold }} />} nameVi="Cước container (Proxy)"
              value={typeof macro.container_freight_proxy_change_percent === "number" ? "ZIM/MAERSK-B/COSCO" : null} unit=""
              changeSignal={macro.container_freight_proxy_change_percent ?? null} sectorKey="SHIPPING_LOGISTICS" isEstimateOrProxy
              proxyTooltip="Không có chỉ số cước container miễn phí đủ tin cậy - dùng % thay đổi trung bình cổ phiếu 3 hãng tàu container lớn (ZIM, Maersk B, COSCO Shipping Holdings) làm tín hiệu gián tiếp." />
            <CommodityCard icon={<Coffee className="w-3.5 h-3.5" style={{ color: T.gold }} />} nameVi="Cà phê Robusta"
              value={macro.robusta_coffee !== null ? macro.robusta_coffee.toFixed(1) : null} unit="chỉ số NASDAQ" sectorKey="AGRICULTURE_COFFEE" />
            <CommodityCard icon={<Mountain className="w-3.5 h-3.5" style={{ color: T.gold }} />} nameVi="Quặng sắt (Proxy)"
              value={macro.iron_ore_proxy_change_percent !== null ? "RIO/VALE/BHP" : null} unit=""
              changeSignal={macro.iron_ore_proxy_change_percent} sectorKey="STEEL_MATERIALS" isEstimateOrProxy
              proxyTooltip="Không có ticker Yahoo Finance đáng tin cậy cho quặng sắt - dùng % thay đổi trung bình 3 cổ phiếu khai khoáng lớn nhất thế giới (RIO/VALE/BHP) làm tín hiệu gián tiếp." />
            <CommodityCard icon={<Trees className="w-3.5 h-3.5" style={{ color: T.gold }} />} nameVi="Cao su tự nhiên"
              value={typeof macro.rubber_price === "number" ? macro.rubber_price.toFixed(2) : null} unit="USD/kg"
              changeSignal={macro.rubber_change_percent ?? null} sectorKey="RUBBER_NATURAL"
              twoWayCaution="Giá tăng có lợi cho DN trồng/khai thác (PHR, DPR, TRC) nhưng BẤT LỢI cho DN sản xuất lốp xe (DRC, CSM, SRC) vì đây là nguyên liệu đầu vào của họ." />
            <CommodityCard icon={<Sprout className="w-3.5 h-3.5" style={{ color: T.gold }} />} nameVi="Phân bón (Urea)"
              value={typeof macro.fertilizer_urea_price === "number" ? macro.fertilizer_urea_price.toFixed(0) : null} unit="USD/tấn"
              changeSignal={macro.fertilizer_urea_change_percent ?? null} sectorKey="FERTILIZER" />
          </div>
          <p className="text-[9px] italic mt-2" style={{ color: T.textTertiary }}>
            Quặng sắt &amp; Cước container: không có giá/chỉ số Yahoo Finance đáng tin cậy — dùng % thay đổi trung bình rổ cổ phiếu đại diện làm tín hiệu gián tiếp, không phải giá/cước thật.
            Cao su &amp; Phân bón: nguồn World Bank Pink Sheet, cập nhật theo tháng (không phải real-time như DXY/VIX).
          </p>
        </div>
      )}

      {/* GIA NHA THE GIOI - tan suat thap (quy), SWR rieng */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Xu Hướng Giá Nhà Thế Giới</p>
          <span title="Bank for International Settlements - dữ liệu theo quý"
            className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.1)", color: T.positive }}>
            HARD_DATA (BIS)
          </span>
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
