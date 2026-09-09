/**
 * PreviewPanel - Hiển thị Technical Layer (RSI/MACD/ADX thật) + Pattern
 * Layer (backtest mẫu hình thật)
 *
 * ĐÃ VIẾT LẠI: bản cũ hiển thị ảnh chụp biểu đồ theo từng khung thời gian
 * (tactical_layer['1h']...) — chế độ "structured" (duy nhất được deploy
 * công khai) không chụp ảnh, không có đa khung thời gian, nên phần này
 * không còn ý nghĩa. Thay bằng hiển thị đúng dữ liệu thật đang có.
 */

import type { PreviewPanelProps } from "../types";

function fmt(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined ? "—" : n.toFixed(digits);
}

export default function PreviewPanel({ scanResult }: PreviewPanelProps) {
  if (!scanResult) {
    return (
      <div className="aicv-card">
        <p style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px" }}>Chỉ báo kỹ thuật</p>
        <p style={{ fontSize: 12, color: "var(--aicv-text-muted)" }}>
          Chưa có dữ liệu — hãy chạy quét ở Bảng điều khiển
        </p>
      </div>
    );
  }

  const { technical_layer: t, pattern_layer } = scanResult;

  return (
    <div>
      <div className="aicv-card">
        <p style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px" }}>
          Chỉ báo kỹ thuật — {scanResult.target} ({scanResult.timeframe})
        </p>
        <p style={{ fontSize: 12, color: "var(--aicv-text-muted)", margin: "0 0 16px" }}>
          Tính trực tiếp từ dữ liệu giá thật, không qua AI đọc ảnh
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div style={{ background: "var(--aicv-surface-1)", borderRadius: 8, padding: 10 }}>
            <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: "0 0 4px" }}>RSI (14)</p>
            <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{fmt(t.rsi)}</p>
          </div>
          <div style={{ background: "var(--aicv-surface-1)", borderRadius: 8, padding: 10 }}>
            <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: "0 0 4px" }}>MACD</p>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
              {t.macd ? `${t.macd.label} (${t.macd.histogram > 0 ? "+" : ""}${t.macd.histogram})` : "—"}
            </p>
          </div>
          <div style={{ background: "var(--aicv-surface-1)", borderRadius: 8, padding: 10 }}>
            <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: "0 0 4px" }}>ADX</p>
            <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
              {fmt(t.adx?.value)} {t.adx && <span style={{ fontSize: 11, fontWeight: 400 }}>({t.adx.signal})</span>}
            </p>
          </div>
        </div>

        {scanResult.is_historical_data_mock && (
          <div className="aicv-warning" style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 11, margin: 0 }}>
              ⚠️ Dữ liệu giá đang là MÔ PHỎNG (mock) — không phản ánh thị trường thật.
            </p>
          </div>
        )}
      </div>

      <div className="aicv-card">
        <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 4px" }}>Tỷ lệ thành công mẫu hình (backtest thật)</p>
        <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: "0 0 12px" }}>
          Tính trên toàn bộ lịch sử giá hiện có — mẫu &lt; 5 lần không đủ tin cậy thống kê
        </p>

        {pattern_layer.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--aicv-text-muted)" }}>Không phát hiện mẫu hình nào trong dữ liệu.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "0.5px solid var(--aicv-border)" }}>
                <th style={{ padding: "4px 6px" }}>Mẫu hình</th>
                <th style={{ padding: "4px 6px" }}>Số lần</th>
                <th style={{ padding: "4px 6px" }}>Tỷ lệ thắng</th>
                <th style={{ padding: "4px 6px" }}>LN TB</th>
              </tr>
            </thead>
            <tbody>
              {pattern_layer.map((p) => (
                <tr key={p.patternType} style={{ borderBottom: "0.5px solid var(--aicv-border)" }}>
                  <td style={{ padding: "4px 6px" }}>{p.patternType}</td>
                  <td style={{ padding: "4px 6px" }}>
                    {p.sampleSize}
                    {p.lowSampleWarning && (
                      <span style={{ color: "var(--aicv-warning-text)", marginLeft: 4 }} title="Mẫu nhỏ, độ tin cậy thấp">
                        ⚠️
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "4px 6px" }}>{p.successRatePct === null ? "—" : `${p.successRatePct}%`}</td>
                  <td style={{ padding: "4px 6px" }}>{p.avgReturnPct === null ? "—" : `${p.avgReturnPct > 0 ? "+" : ""}${p.avgReturnPct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
