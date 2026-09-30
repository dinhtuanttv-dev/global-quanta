import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { CatalystCard } from "../../../types/catalyst";
import type { FinancialStatementInput } from "../../../types/financialEngineering";
import { computeForensicScore } from "../../../lib/forensics";
import { buildScoreExplanation } from "../../../lib/explainability";
import ForensicScoreBadge from "./ForensicScoreBadge";
import ScoreExplanationPanel from "./ScoreExplanationPanel";
import PortfolioRiskPanel from "./PortfolioRiskPanel";

interface Props {
  card: CatalystCard;
  onClose: () => void;
}

type SubTab = "explain" | "forensics" | "risk";

// Du lieu minh hoa - CHUA CO backend cung cap 2 ky bao cao tai chinh lien ke
// that cho tung ma. Gan nhan ro "uoc tinh minh hoa" o UI, khong dung de
// quyet dinh dau tu. Se thay bang API that o Phase 2 khi CatalystEngine
// duoc mo rong.
function buildDemoFinancials(ticker: string): { current: FinancialStatementInput; prior: FinancialStatementInput } {
  const current: FinancialStatementInput = {
    ticker, period: "2026Q3",
    receivables: 150e6, sales: 420e6, costOfGoodsSold: 256e6, currentAssets: 380e6,
    ppeGross: 200e6, totalAssets: 800e6, depreciation: 45e6, sgaExpense: 120e6,
    netIncome: 85e6, totalLongTermDebt: 200e6, operatingCashFlow: 100e6,
    currentLiabilities: 180e6, retainedEarnings: 120e6, ebit: 130e6,
    bookValueEquity: 420e6, totalLiabilities: 380e6, workingCapital: 200e6,
    sharesOutstanding: 12e6,
  };
  return { current, prior: { ...current } };
}

const MOCK_PORTFOLIO_DAILY_RETURNS = [0.012, -0.008, 0.015, -0.021, 0.005, 0.018, -0.003, 0.009, 0.011, -0.014];

export default function DeepAnalysisDrawer({ card, onClose }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("explain");

  const forensic = useMemo(() => {
    const { current, prior } = buildDemoFinancials(card.ticker);
    return computeForensicScore(current, prior, card.direction);
  }, [card.ticker, card.direction]);

  const explanation = useMemo(() => buildScoreExplanation(card, forensic), [card, forensic]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000,
        display: "flex", justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 100%)", height: "100%", background: "var(--bg-surface-2)",
          borderLeft: "1px solid var(--border)", overflowY: "auto", padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{card.ticker}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
            color: card.direction === "benefit" ? "var(--positive)" : "var(--negative)",
            background: card.direction === "benefit" ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
          }}>
            {card.direction === "benefit" ? "Tich cuc" : card.direction === "harm" ? "Tieu cuc" : "Trung tinh"}
          </span>
          <button onClick={onClose} style={{
            marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer",
            color: "var(--text-tertiary)", padding: 4, display: "flex",
          }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-secondary)", margin: "0 0 14px", lineHeight: 1.4 }}>
          {card.sourceTitle}
        </p>

        <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
          <SubTabButton active={subTab === "explain"} onClick={() => setSubTab("explain")}>Giai thich diem</SubTabButton>
          <SubTabButton active={subTab === "forensics"} onClick={() => setSubTab("forensics")}>Forensics</SubTabButton>
          <SubTabButton active={subTab === "risk"} onClick={() => setSubTab("risk")}>Quan tri rui ro</SubTabButton>
        </div>

        {subTab === "explain" && <ScoreExplanationPanel explanation={explanation} />}

        {subTab === "forensics" && (
          <div>
            <p style={{ fontSize: 9.5, color: "var(--text-tertiary)", margin: "0 0 8px" }}>
              ⚠ Du lieu tai chinh minh hoa - chua noi API bao cao tai chinh that cua {card.ticker}.
              Beneish/Altman/Piotroski la cong cu ho tro sang loc, khong phai ket luan gian lan/pha san.
            </p>
            <ForensicScoreBadge forensic={forensic} />
          </div>
        )}

        {subTab === "risk" && (
          <div>
            <p style={{ fontSize: 9.5, color: "var(--text-tertiary)", margin: "0 0 8px" }}>
              ⚠ Du lieu danh muc minh hoa - chua noi voi danh muc that cua ban.
            </p>
            <PortfolioRiskPanel
              portfolioValue={500_000_000}
              dailyReturns={MOCK_PORTFOLIO_DAILY_RETURNS}
              portfolioBeta={1.15}
              suggestedWinProbability={card.historicalWinRate / 100}
              suggestedWinLossRatio={card.historicalWinRate >= 99 ? 1.5 : card.historicalWinRate / (100 - card.historicalWinRate)}
            />
          </div>
        )}

        <p style={{ fontSize: 8.5, color: "var(--text-tertiary)", marginTop: 16, lineHeight: 1.5 }}>
          Diem so, giai thich va cac chi so rui ro tren la cong cu ho tro phan tich, khong phai khuyen nghi dau tu.
        </p>
      </div>
    </div>
  );
}

function SubTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 6, cursor: "pointer",
        border: "1px solid " + (active ? "var(--gold-bright)" : "var(--border)"),
        background: active ? "rgba(251,191,36,0.1)" : "transparent",
        color: active ? "var(--gold-bright)" : "var(--text-tertiary)",
      }}
    >
      {children}
    </button>
  );
}
