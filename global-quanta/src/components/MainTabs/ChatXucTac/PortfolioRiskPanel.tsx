import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  computeHistoricalVar,
  computePositionSize,
  runStressTest,
} from "../../../lib/portfolioRisk";

interface Props {
  portfolioValue: number;
  dailyReturns: number[]; // loi suat lich su danh muc, dang thap phan
  portfolioBeta: number;
  suggestedWinProbability?: number; // vd. tu historicalWinRate cua catalyst dang chon
  suggestedWinLossRatio?: number;
}

// A.5 (Phase 1) - Portfolio Risk Overlay: sizing + VaR/CVaR + stress test,
// KHONG PHAI khuyen nghi dau tu. Input mau (portfolioValue/dailyReturns) la
// uoc tinh minh hoa - se thay bang du lieu danh muc that khi backend cung cap.
export default function PortfolioRiskPanel({
  portfolioValue,
  dailyReturns,
  portfolioBeta,
  suggestedWinProbability = 0.6,
  suggestedWinLossRatio = 1.5,
}: Props) {
  const [winProb, setWinProb] = useState(suggestedWinProbability);
  const [winLoss, setWinLoss] = useState(suggestedWinLossRatio);
  const [kellyFraction, setKellyFraction] = useState(0.25);

  const sizing = useMemo(
    () =>
      computePositionSize({
        winProbability: winProb,
        winLossRatio: winLoss,
        kellyFraction,
        portfolioValue,
        maxPositionPct: 0.1,
      }),
    [winProb, winLoss, kellyFraction, portfolioValue]
  );

  const varResult = useMemo(
    () => computeHistoricalVar({ dailyReturns, confidenceLevel: 0.95, portfolioValue }),
    [dailyReturns, portfolioValue]
  );

  const stress = useMemo(
    () => runStressTest(portfolioValue, portfolioBeta),
    [portfolioValue, portfolioBeta]
  );

  const inputStyle: CSSProperties = {
    width: "100%", padding: "5px 8px", fontSize: 11, marginTop: 3,
    background: "var(--bg-surface-2)", border: "1px solid var(--border)",
    borderRadius: 6, color: "var(--text-primary)", outline: "none",
  };
  const labelStyle: CSSProperties = { fontSize: 9.5, color: "var(--text-tertiary)", display: "block", marginBottom: 8 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
        <p style={{ fontSize: 11, fontWeight: 700, margin: "0 0 8px", color: "var(--text-secondary)" }}>
          Khoi luong vao lenh (1/4 Kelly - uoc tinh minh hoa)
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <label style={labelStyle}>Xac suat thang
            <input type="number" step="0.01" min={0.01} max={0.99} value={winProb}
              onChange={(e) => setWinProb(Number(e.target.value))} style={inputStyle} />
          </label>
          <label style={labelStyle}>Ty le lai/lo TB
            <input type="number" step="0.1" min={0.1} value={winLoss}
              onChange={(e) => setWinLoss(Number(e.target.value))} style={inputStyle} />
          </label>
          <label style={labelStyle}>He so Kelly
            <input type="number" step="0.05" min={0.05} max={1} value={kellyFraction}
              onChange={(e) => setKellyFraction(Number(e.target.value))} style={inputStyle} />
          </label>
        </div>
        <div style={{ marginTop: 4, fontSize: 11 }}>
          <div>Kelly day du: <b>{(sizing.fullKellyPct * 100).toFixed(1)}%</b></div>
          <div style={{ color: "var(--gold-bright)", fontWeight: 700, marginTop: 2 }}>
            De xuat: {(sizing.recommendedPct * 100).toFixed(1)}% NAV ({sizing.recommendedAmount.toLocaleString("vi-VN")}₫)
          </div>
          {sizing.capped && <div style={{ fontSize: 9.5, color: "var(--text-tertiary)", marginTop: 2 }}>Da ap tran toi da 10%/ma</div>}
        </div>
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
        <p style={{ fontSize: 11, fontWeight: 700, margin: "0 0 8px", color: "var(--text-secondary)" }}>VaR / CVaR (95%, 1 ngay)</p>
        <div style={{ fontSize: 11 }}>
          <div>VaR: <b style={{ color: "var(--negative)" }}>{(varResult.varPct * 100).toFixed(2)}%</b> ({varResult.varAmount.toLocaleString("vi-VN")}₫)</div>
          <div>CVaR: <b style={{ color: "var(--negative)" }}>{(varResult.cvarPct * 100).toFixed(2)}%</b> ({varResult.cvarAmount.toLocaleString("vi-VN")}₫)</div>
          <div style={{ fontSize: 9.5, color: "var(--text-tertiary)", marginTop: 4 }}>Co mau: {varResult.sampleSize} phien</div>
          {varResult.warning && <div style={{ fontSize: 9.5, color: "#fbbf24", marginTop: 2 }}>{varResult.warning}</div>}
        </div>
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
        <p style={{ fontSize: 11, fontWeight: 700, margin: "0 0 8px", color: "var(--text-secondary)" }}>Kich ban stress test</p>
        {stress.map((r) => (
          <div key={r.scenario.name} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "6px 0", borderBottom: "1px solid rgba(148,163,184,0.08)", gap: 8,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600 }}>{r.scenario.name}</div>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{r.scenario.description}</div>
            </div>
            <div style={{
              fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
              color: r.estimatedPnlPct < 0 ? "var(--negative)" : "var(--positive)",
            }}>
              {(r.estimatedPnlPct * 100).toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
