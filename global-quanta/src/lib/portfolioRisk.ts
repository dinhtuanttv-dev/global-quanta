import {
  PositionSizeInput,
  PositionSizeResult,
  StressScenario,
  StressTestResult,
  VarInput,
  VarResult,
} from "../types/financialEngineering";

/**
 * A.5 - Portfolio Risk Overlay (Phase 1, tich hop tu goi ban giao Chat Xuc Tac 2.0)
 *
 * Bien diem so catalyst thanh hanh dong co ky luat, thay vi de nguoi dung
 * tu uoc luong khoi luong vao lenh theo cam tinh tu compositeScore.
 * Day KHONG phai khuyen nghi dau tu - la cong cu tinh toan ho tro, nguoi
 * dung chiu trach nhiem quyet dinh cuoi cung.
 */

// ── Position sizing: fractional Kelly co tran cung ──────────────────────────
export function computePositionSize(input: PositionSizeInput): PositionSizeResult {
  const { winProbability: p, winLossRatio: b, kellyFraction, portfolioValue, maxPositionPct } =
    input;

  if (p <= 0 || p >= 1 || b <= 0) {
    return {
      fullKellyPct: 0,
      recommendedPct: 0,
      recommendedAmount: 0,
      capped: false,
    };
  }

  const q = 1 - p;
  // Cong thuc Kelly co dien: f* = (b*p - q) / b
  const fullKelly = (b * p - q) / b;
  const fullKellyClamped = Math.max(0, fullKelly); // khong short qua Kelly am

  const discounted = fullKellyClamped * kellyFraction;
  const capped = discounted > maxPositionPct;
  const recommendedPct = Math.min(discounted, maxPositionPct);

  return {
    fullKellyPct: fullKellyClamped,
    recommendedPct,
    recommendedAmount: recommendedPct * portfolioValue,
    capped,
  };
}

// ── Historical VaR / CVaR (Expected Shortfall) ──────────────────────────────
export function computeHistoricalVar(input: VarInput): VarResult {
  const { dailyReturns, confidenceLevel, portfolioValue } = input;
  const n = dailyReturns.length;

  if (n === 0) {
    return {
      varPct: 0,
      varAmount: 0,
      cvarPct: 0,
      cvarAmount: 0,
      sampleSize: 0,
      warning: "Khong co du lieu loi suat lich su de tinh VaR.",
    };
  }

  const sorted = [...dailyReturns].sort((a, b) => a - b); // tang dan, lo nang nhat dung dau
  const cutoffIndex = Math.max(0, Math.floor((1 - confidenceLevel) * n) - 1);
  const varReturn = sorted[cutoffIndex]; // am = lo

  const tailLosses = sorted.slice(0, cutoffIndex + 1);
  const cvarReturn =
    tailLosses.length > 0
      ? tailLosses.reduce((sum, r) => sum + r, 0) / tailLosses.length
      : varReturn;

  const varPct = Math.abs(Math.min(0, varReturn));
  const cvarPct = Math.abs(Math.min(0, cvarReturn));

  const warning =
    n < 60
      ? `Co mau chi ${n} phien - duoi 60 phien (~3 thang), do tin cay thong ke thap. Nen coi day la uoc tinh so bo.`
      : null;

  return {
    varPct,
    varAmount: varPct * portfolioValue,
    cvarPct,
    cvarAmount: cvarPct * portfolioValue,
    sampleSize: n,
    warning,
  };
}

// ── Stress test theo kich ban ─────────────────────────────────────────────
export const DEFAULT_STRESS_SCENARIOS: StressScenario[] = [
  {
    name: "Fed tang lai suat bat ngo",
    description: "Fed tang 50bp ngoai du bao, dong von toan cau dao chieu",
    shockPct: -0.045,
  },
  {
    name: "Ty gia USD/VND pha gia 3-5%",
    description: "NHNN buoc dieu chinh bien do ty gia do ap luc du tru ngoai hoi",
    shockPct: -0.03,
  },
  {
    name: "Khoi ngoai rut rong manh",
    description: "Ban rong lien tuc >5 phien voi gia tri vuot trung binh 3 lan",
    shockPct: -0.055,
  },
  {
    name: "Gia dau tang soc",
    description: "Xung dot dia chinh tri day gia dau Brent tang >15% trong 1 tuan",
    shockPct: -0.02,
  },
];

/**
 * Mo hinh tuyen tinh don gian: NAV danh muc phan ung theo shockPct * portfolioBeta.
 * portfolioBeta la do nhay trung binh co trong so theo danh muc nam giu
 * (>1 = nhay hon thi truong chung, tinh tu hoi quy beta lich su - khong tinh o day).
 */
export function runStressTest(
  portfolioValue: number,
  portfolioBeta: number,
  scenarios: StressScenario[] = DEFAULT_STRESS_SCENARIOS
): StressTestResult[] {
  return scenarios.map((scenario) => {
    const estimatedPnlPct = scenario.shockPct * portfolioBeta;
    return {
      scenario,
      estimatedPnlPct,
      estimatedPnlAmount: estimatedPnlPct * portfolioValue,
    };
  });
}
