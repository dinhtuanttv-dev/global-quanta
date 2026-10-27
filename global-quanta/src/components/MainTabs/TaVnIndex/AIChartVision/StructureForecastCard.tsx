import { useEffect } from "react";
import { useStructure } from "../../../../hooks/useStructure";
import type { StructureDoc } from "../../../../hooks/useStructure";
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

const VERIFIED = "ĐÃ KIỂM ĐỊNH";
const fmt = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("vi-VN", { maximumFractionDigits: digits });

/** Forecast output from the existing MTF Structure Gateway model; not an AI-CV score. */
function hasPublishableOutput(doc: StructureDoc | undefined): boolean {
  const probability = doc?.probability;
  const validProbability = probability?.label === VERIFIED && probability.value != null && Number.isFinite(probability.value);
  const cone = doc?.cone;
  const validCone = cone?.label === VERIFIED && Object.keys(cone.horizons).length > 0;
  return !!(validProbability || validCone);
}

export default function StructureForecastCard({ symbol, isIndex, onModelGateStatus }: Props) {
  const gatewayEnabled = isMarketGatewayEnabled();
  const { data, error, isLoading } = useStructure(gatewayEnabled && !isIndex ? symbol : null);
  const matchesSymbol = data?.symbol.toUpperCase() === symbol.toUpperCase();
  const hasForecast = matchesSymbol && hasPublishableOutput(data);

  useEffect(() => {
    if (!gatewayEnabled || isIndex) {
      onModelGateStatus(null);
      return;
    }
    if (!data || !matchesSymbol) return;
    if (hasForecast) {
      onModelGateStatus(null);
      return;
    }
    onModelGateStatus({
      engine: data.version,
      prereg: data.evidence.prereg,
      asOf: data.asOf,
      summary: data.evidence.summary,
      probabilityNote: data.probability?.note ?? null,
      coneNote: data.evidence.coneNote ?? data.cone?.note ?? null,
    });
  }, [data, gatewayEnabled, hasForecast, isIndex, matchesSymbol, onModelGateStatus]);

  // A ticker-specific forecast card is useful only when the corresponding output passed its gate.
  // Otherwise the shared model status is presented once by AIChartVisionPanel.
  if (!gatewayEnabled || isIndex || (data && matchesSymbol && !hasForecast)) return null;

  return (
    <section
      className="rounded-lg p-2.5 space-y-2"
      style={{ background: "rgba(56,189,248,0.035)", border: "1px solid rgba(56,189,248,0.16)" }}
      data-testid="cv-structure-forecast"
      aria-labelledby="cv-structure-forecast-title"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 id="cv-structure-forecast-title" className="text-[11px] font-bold text-sky-200">
          Dự báo định lượng bổ trợ
        </h3>
        <span className="text-[8px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-400">
          MTF Structure · {symbol}
        </span>
        {data && matchesSymbol && (
          <span className={`ml-auto text-[8px] ${data.evidence.verdictValidated ? "text-emerald-300" : "text-amber-300"}`}>
            {data.evidence.verdictValidated ? "Bằng chứng đạt cổng" : "Chưa đạt cổng kết luận"}
          </span>
        )}
      </header>

      {isLoading && !data ? (
        <p className="text-[10px] text-slate-400" role="status">Đang tải dự báo cho {symbol}…</p>
      ) : error ? (
        <p className="text-[10px] text-amber-300" role="status">Chưa tải được dự báo: {error.message}</p>
      ) : !data || !matchesSymbol ? (
        <p className="text-[10px] text-slate-500">Gateway chưa có snapshot dự báo hợp lệ cho mã này.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="rounded-md border border-slate-800/80 bg-slate-950/30 p-2 space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[9px] text-slate-400">Kịch bản thắng · 20 phiên</span>
                <span className={`text-[8px] px-1.5 py-0.5 rounded border ${data.probability?.label === VERIFIED ? "border-emerald-700/70 text-emerald-300" : "border-amber-700/70 text-amber-300"}`}>
                  {data.probability?.label ?? "CHƯA CÓ"}
                </span>
              </div>
              {data.probability?.label === VERIFIED && data.probability.value != null ? (
                <p className="text-xl font-black font-mono text-slate-100">
                  {Math.round(data.probability.value * 100)}%
                  {data.probability.baseRate != null && (
                    <span className="ml-2 text-[9px] font-normal text-slate-500">tỷ lệ nền {Math.round(data.probability.baseRate * 100)}%</span>
                  )}
                </p>
              ) : (
                <p className="text-[10px] text-slate-400">Không hiển thị đầu ra mô hình như xác suất đã hiệu chuẩn.</p>
              )}
              <p className="text-[9px] text-slate-500">Target của mô hình: đạt mục tiêu 3 ATR trước khi chạm dừng 2 ATR trong 20 phiên. Không phải xác suất sinh lời chung.</p>
              {data.probability?.note && <p className="text-[9px] text-amber-300/80">{data.probability.note}</p>}
            </div>

            <div className="rounded-md border border-slate-800/80 bg-slate-950/30 p-2">
              <div className="flex justify-between text-[9px] text-slate-400 mb-1">
                <span>Dải giá mô hình</span>
                <span>{data.cone?.label ?? "Chưa đủ điều kiện"}</span>
              </div>
              {data.cone ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[9px] font-mono" aria-label={`Dải giá dự báo của ${symbol}`}>
                    <thead><tr className="text-slate-500"><th className="text-left font-normal">Phiên</th><th className="text-right font-normal">P10</th><th className="text-right font-normal">P50</th><th className="text-right font-normal">P90</th></tr></thead>
                    <tbody>{Object.entries(data.cone.horizons).map(([horizon, band]) => (
                      <tr key={horizon} className="border-t border-slate-800/70 text-slate-200">
                        <td className="py-0.5">{horizon}</td><td className="text-right text-rose-300">{fmt(band.p10)}</td><td className="text-right">{fmt(band.p50)}</td><td className="text-right text-emerald-300">{fmt(band.p90)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="text-[9px] text-slate-500">{data.evidence.coneNote ?? "Nón dự báo chưa đạt điều kiện hiển thị."}</p>}
            </div>
          </div>

          <p className="text-[8px] text-slate-500">
            MTF {data.version} · dữ liệu đến {data.asOf} · nguồn {data.dataSource.daily.source} · giá {data.dataSource.daily.priceBasis} · cập nhật {data.generatedAt}.
            {data.probability?.label !== VERIFIED && " Nhãn thực nghiệm/mô tả không phải xác suất đã hiệu chuẩn."}
            {" Không phải khuyến nghị đầu tư."}
          </p>
        </>
      )}
    </section>
  );
}
