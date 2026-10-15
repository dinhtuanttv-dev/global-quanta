import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { CatalystCard } from "../../../types/catalyst";
import { computeForensicScore } from "../../../lib/forensics";
import { buildScoreExplanation } from "../../../lib/explainability";
import { useForensicInputs, usePortfolioRiskData } from "../../../hooks/useDeepAnalysisData";
import { useWatchlists } from "../../../hooks/useWatchlists";
import ForensicScoreBadge from "./ForensicScoreBadge";
import ScoreExplanationPanel from "./ScoreExplanationPanel";
import PortfolioRiskPanel from "./PortfolioRiskPanel";

interface Props {
  card: CatalystCard;
  onClose: () => void;
}

type SubTab = "explain" | "forensics" | "risk";

// X5 (2026-10-16): DỮ LIỆU THẬT thay số minh hoạ —
//   Sức khoẻ tài chính: BCTC NĂM 2 năm gần nhất của mã từ VNDirect (Gateway /api/market/fundamentals/:symbol/forensic).
//   Rủi ro: lợi suất ngày thật của danh mục ★ (cân bằng tỷ trọng, giá điều chỉnh) + beta thật (Gateway /api/market/portfolio-risk).
//   Giá trị danh mục do người dùng nhập; tỷ lệ lãi/lỗ TB chưa có dữ liệu -> mặc định 1 và ghi rõ là giả định.
const DEFAULT_PORTFOLIO_VALUE = 500_000_000;

const Note = ({ children, warn = false }: { children: ReactNode; warn?: boolean }) => (
  <p style={{ fontSize: 9.5, color: warn ? "var(--warning, #f59e0b)" : "var(--text-tertiary)", margin: "0 0 8px", lineHeight: 1.45 }}>{children}</p>
);

export default function DeepAnalysisDrawer({ card, onClose }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("explain");
  const [portfolioValue, setPortfolioValue] = useState(DEFAULT_PORTFOLIO_VALUE);
  const fin = useForensicInputs(card.ticker);
  const { radar } = useWatchlists();
  const risk = usePortfolioRiskData(radar?.tickers ?? []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const forensic = useMemo(() => {
    const d = fin.data;
    if (!d?.applicable || !d.current || !d.prior) return null;
    return computeForensicScore(d.current, d.prior, card.direction);
  }, [fin.data, card.direction]);

  const explanation = useMemo(() => buildScoreExplanation(card, forensic ?? undefined), [card, forensic]);
  // Tỷ lệ thắng đúng 50% là giá trị MẶC ĐỊNH của engine khi chưa đủ mẫu hiệu chỉnh — không phải số đo.
  const winRateIsDefault = card.historicalWinRate === 50;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Phân tích sâu ${card.ticker}`}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(420px, 100%)", height: "100%", background: "var(--bg-surface-2)", borderLeft: "1px solid var(--border)", overflowY: "auto", padding: 16 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{card.ticker}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
            color: card.direction === "benefit" ? "var(--positive)" : "var(--negative)",
            background: card.direction === "benefit" ? "color-mix(in srgb, var(--positive) 12%, transparent)" : "color-mix(in srgb, var(--negative) 12%, transparent)",
          }}>
            {card.direction === "benefit" ? "Tích cực" : card.direction === "harm" ? "Tiêu cực" : "Trung tính"}
          </span>
          <button onClick={onClose} aria-label="Đóng" style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 4, display: "flex" }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-secondary)", margin: "0 0 14px", lineHeight: 1.4 }}>{card.sourceTitle}</p>

        <div role="tablist" aria-label="Phân tích sâu" style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: "1px solid var(--border)", paddingBottom: 8, flexWrap: "wrap" }}>
          <SubTabButton active={subTab === "explain"} onClick={() => setSubTab("explain")}>Giải thích điểm</SubTabButton>
          <SubTabButton active={subTab === "forensics"} onClick={() => setSubTab("forensics")}>Sức khoẻ tài chính</SubTabButton>
          <SubTabButton active={subTab === "risk"} onClick={() => setSubTab("risk")}>Quản trị rủi ro</SubTabButton>
        </div>

        {subTab === "explain" && <ScoreExplanationPanel explanation={explanation} />}

        {subTab === "forensics" && (
          <div>
            {fin.isLoading && <Note>Đang tải BCTC năm từ VNDirect…</Note>}
            {fin.error && <Note warn>Không tải được BCTC: {fin.error.message}</Note>}
            {fin.data && !fin.data.applicable && <Note warn>{fin.data.reason}</Note>}
            {forensic && fin.data && (
              <>
                <Note>
                  BCTC năm {fin.data.fiscalDates?.[0]?.slice(0, 4)} so với {fin.data.fiscalDates?.[1]?.slice(0, 4)} · nguồn VNDirect (hợp nhất).
                  Beneish/Altman/Piotroski là công cụ hỗ trợ sàng lọc, không phải kết luận gian lận/phá sản. Altman Z dùng bản gốc cho doanh nghiệp sản xuất.
                </Note>
                <ForensicScoreBadge forensic={forensic} />
              </>
            )}
          </div>
        )}

        {subTab === "risk" && (
          <div>
            <label style={{ fontSize: 9.5, color: "var(--text-tertiary)", display: "block", marginBottom: 8 }}>
              Giá trị danh mục của bạn (₫)
              <input type="number" min={1_000_000} step={1_000_000} value={portfolioValue}
                onChange={(e) => setPortfolioValue(Math.max(1_000_000, Number(e.target.value) || DEFAULT_PORTFOLIO_VALUE))}
                style={{ width: "100%", padding: "5px 8px", fontSize: 11, marginTop: 3, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)" }} />
            </label>
            {risk.symbols.length === 0 && <Note warn>Danh mục ★ “{radar?.name ?? "Danh mục của tôi"}” đang trống — thêm mã để tính VaR/beta trên lợi suất thật.</Note>}
            {risk.isLoading && <Note>Đang tính lợi suất thật của {risk.symbols.length} mã trong danh mục ★…</Note>}
            {risk.error && <Note warn>Không tính được rủi ro danh mục: {risk.error.message}</Note>}
            {risk.data && (
              <Note>
                Danh mục ★ “{radar?.name}”: {risk.data.used.join(", ")} · cân bằng tỷ trọng · {risk.data.sampleSize} phiên ({risk.data.from} → {risk.data.to}) · giá điều chỉnh
                {risk.data.beta != null ? ` · beta ${risk.data.beta.toLocaleString("vi-VN")}` : " · chưa đủ dữ liệu ước lượng beta (stress test dùng beta 1)"}
                {risk.data.failed.length ? ` · không tải được: ${risk.data.failed.join(", ")}` : ""}
              </Note>
            )}
            {winRateIsDefault ? (
              <Note warn>Tỷ lệ thắng 50% của tín hiệu này là giá trị mặc định (chưa đủ mẫu hiệu chỉnh) — mục Kelly chỉ mang tính minh hoạ.</Note>
            ) : card.historicalWinRate < 50 ? (
              <Note warn>Tỷ lệ thắng lịch sử {card.historicalWinRate}% (&lt; 50%): nhóm tín hiệu này chưa tốt hơn ngẫu nhiên — Kelly sẽ ≈ 0.</Note>
            ) : null}
            {risk.data && risk.data.dailyReturns.length > 0 && (
              <PortfolioRiskPanel
                key={`${risk.data.used.join(",")}-${card.ticker}`}
                portfolioValue={portfolioValue}
                dailyReturns={risk.data.dailyReturns}
                portfolioBeta={risk.data.beta ?? 1}
                suggestedWinProbability={card.historicalWinRate / 100}
                suggestedWinLossRatio={1}
              />
            )}
            <Note>Tỷ lệ lãi/lỗ trung bình = 1 là GIẢ ĐỊNH (chưa có dữ liệu lãi/lỗ theo tín hiệu) — chỉnh theo kinh nghiệm của bạn.</Note>
          </div>
        )}

        <p style={{ fontSize: 8.5, color: "var(--text-tertiary)", marginTop: 16, lineHeight: 1.5 }}>
          Điểm số, giải thích và các chỉ số rủi ro trên là công cụ hỗ trợ phân tích, không phải khuyến nghị đầu tư.
        </p>
      </div>
    </div>
  );
}

function SubTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 6, cursor: "pointer",
        border: "1px solid " + (active ? "var(--gold-bright)" : "var(--border)"),
        background: active ? "color-mix(in srgb, var(--gold-bright) 10%, transparent)" : "transparent",
        color: active ? "var(--gold-bright)" : "var(--text-tertiary)",
      }}
    >
      {children}
    </button>
  );
}
