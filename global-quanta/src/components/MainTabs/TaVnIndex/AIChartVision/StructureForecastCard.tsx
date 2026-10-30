import { useEffect } from "react";
import { useStructure3 } from "../../../../hooks/useStructure3";
import { isMarketGatewayEnabled } from "../../../../services/marketDataClient";

export interface StructureModelGateStatus {
  engine: string;
  prereg: string;
  asOf: string;
  summary: string | null;
  probabilityNote: string | null;
  coneNote: string | null;
}

interface Props {
  symbol: string;
  isIndex: boolean;
  onModelGateStatus: (status: StructureModelGateStatus | null) => void;
}

/**
 * Trạng thái mô hình Cấu trúc MTF v3 cho AI Chart Vision (30/10/2026 — thay MTF v2 /structure). MTF v3 không phát hành xác suất hay nón
 * dự báo: kiểm định đặt trước MTF-v3 (H1–H6) không đạt nên chỉ báo trạng thái một lần cho bảng (không có thẻ dự báo riêng cho mã).
 */
export default function StructureForecastCard({ symbol, isIndex, onModelGateStatus }: Props) {
  const gatewayEnabled = isMarketGatewayEnabled();
  const { data } = useStructure3(gatewayEnabled && !isIndex ? symbol : null);
  const matchesSymbol = data?.symbol?.toUpperCase() === symbol.toUpperCase();

  useEffect(() => {
    if (!gatewayEnabled || isIndex) { onModelGateStatus(null); return; }
    if (!data || !matchesSymbol) return;
    onModelGateStatus({
      engine: data.version,
      prereg: data.evidence.prereg ?? "structure/MTF-v3-prereg.md",
      asOf: data.asOf,
      summary: data.evidence.note ?? null,
      probabilityNote: "MTF v3 không phát hành xác suất — chỉ mô tả cấu trúc Ngày · Tuần · Tháng.",
      coneNote: "MTF v3 không có nón dự báo.",
    });
  }, [data, gatewayEnabled, isIndex, matchesSymbol, onModelGateStatus]);

  return null;
}
