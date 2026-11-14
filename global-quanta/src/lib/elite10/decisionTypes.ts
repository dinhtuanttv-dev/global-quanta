// Hợp đồng dữ liệu Gateway /api/elite/* (Elite 10 E1–E3).
export type Tier = "A" | "B" | "C";

export interface SignalSpec { id: string; tab: string; labelVi: string; unit: string; level: "stock" | "sector"; tier: Tier; evidenceVi?: string }

export interface SignalWeight { id: string; labelVi: string; tab: string; tier: Tier; mainH: number; n: number; icMeas: number; icPrior: number; icPost: number; w: number; wNaive?: number }

export interface EliteScore {
  ticker: string; rank: number; Z: number; alpha5Pct: number | null; pOutperform: number; eligible: boolean; reason: string | null;
  close: number | null; advBn: number | null; sigma20: number | null; sectorKey: string | null;
  /** E3-v4: Z của mô hình trước quy tắc RRG; góc phần tư ngành (2/1/−1/−2); có bị phạt ngành Tụt hậu. */
  zModel?: number; rrgQuadrant?: number | null; rrgPenalty?: boolean;
  contributions: { id: string; z: number | null; contribution: number }[];
}

export interface PortfolioPick {
  ticker: string; weight: number; Z: number; rank: number; alpha5Pct: number | null; pOutperform: number; sectorKey: string | null;
  zModel?: number; rrgQuadrant?: number | null; rrgPenalty?: boolean;
  close: number; stop: number; target: number; holdSessions: number | null;
  /** E3-v3: giữ từ danh mục phiên trước (vùng đệm) và đóng góp rủi ro Euler trong danh mục. */
  retained?: boolean; riskContribution?: number | null;
  /** E4-HL: chi tiết hợp lưu của vị thế (chỉ có ở danh mục Elite HL). */
  hl?: HlPosition;
}

/** E4-HL (12/11/2026): danh mục chính thức dựng trên quy tắc Hợp lưu HL-v1, cấu trúc G2r. */
export type HlClassCode = "STRONG" | "CONFLUENCE" | "T1_SECTOR_AGAINST" | "T1_SECTOR_NA" | "NOT_T1";
export interface HlPosition {
  rank: number; cls: HlClassCode; t1: number; t2: number; t3: number; lsPct: number | null; lsPts: number; taCount: number; taPts: number; rrg: number | null;
  status: "NEW" | "HOLD"; since: string | null; advBn: number | null; sigma20: number | null; exitBufferLs: number | null; warnings: string[]; miss?: number;
  /** N2 "Vì sao": điều kiện tầng 1 theo mã tín hiệu, phiếu tầng 3 (+1 / 0 / −1 / null = chưa có dữ liệu), giá tham chiếu và lãi/lỗ từ phiên khoá. */
  ta?: Record<string, boolean | null> | null; votes?: Record<string, number | null> | null; ref?: number | null; sinceRet?: number | null;
}
/**
 * Vị thế của danh mục Elite HL. Khác PortfolioPick (danh mục dòng tiền): Z / rank / pOutperform / giá CÓ THỂ null — mã đang giữ nhưng vắng
 * khỏi bảng tín hiệu phiên này vẫn được giữ (bộ đếm vắng mặt) và khi đó không có điểm, không có giá.
 */
export type HlPick = Omit<PortfolioPick, "Z" | "rank" | "pOutperform" | "close" | "stop" | "target" | "hl"> & {
  Z: number | null; rank: number | null; pOutperform: number | null; close: number | null; stop: number | null; target: number | null; hl: HlPosition;
};
export interface HlExit { ticker: string; weight: number | null; since: string | null; code: "ls" | "ta" | "rrg" | "no_data"; reasonVi: string; hlRank: number | null; lsPct: number | null; taCount: number | null; rrg: number | null }
export interface HlQueueItem { ticker: string; hlRank: number; cls: HlClassCode; t1: number; t2: number; t3: number; lsPct: number | null; taCount: number; rrg: number | null; sectorKey: string | null; advBn: number | null; code: "illiquid" | "wait" | "full" | "sector_cap" | "no_room"; reasonVi: string }
export interface EliteHlMeta {
  version: string; ruleVersion: string; date: string; rebalance: boolean; week: string; prevDate: string | null;
  /** N0: chốt dữ liệu — frozen = bảng tín hiệu thiếu nguồn, danh mục giữ nguyên phiên trước. */
  dataGuard?: { frozen: boolean; reasonsVi: string[] };
  rule: { slots: number; slotW: number; wMin: number; wMax: number; sectorCap: number; maxPerSector: number; minAdvBn: number; exitLsPct: number; exitTaMin: number; warnLsPct: number; costBuy: number; costSell: number; bandSessions: number;
    /** Gateway gửi nguyên HL_PF; các trường dưới chỉ để hiển thị. */
    minPrice?: number; wDust?: number; missSessions?: number };
  /** Ngưỡng tầng 1 của HL-v1 (Gateway cũ không gửi -> giao diện dùng mặc định). */
  tier1?: { lsLeaderPct: number; taMin: number; taModels: number; maxScore: number };
  k0: { period: string; cagr: number; vol: number; maxDd: number; turnover: number; vnIndexCagr: number; equalWeightCagr: number; t: number; noteVi: string };
  funnel: { panel: number; tradable: number; tier1: number; selected: number; selectedTradable: number; held: number };
  invested: number; cash: number; sigmaMedian: number | null;
  changes: { added: string[]; exits: HlExit[]; kept: number; turnover: number | null; costEst: number | null };
  sectors: { sectorKey: string; weight: number; names: number }[]; queue: HlQueueItem[];
  against: { ticker: string; hlRank: number; t1: number; rrg: number | null; rrgVi: string | null }[];
  market: { regime: string; regimeVi: string | null; bias: string | null; breadth: number | null; guard: boolean } | null;
  labelVi: string;
}

export interface LedgerHorizon {
  n: number; meanExcess: number | null; hitRate: number | null; excessCi95: [number, number] | null; meanPortfolioNet: number | null; meanVnIndex: number | null;
  ic: { n: number; mean: number | null; t: number | null }; curve: [string, number][];
  /** Danh mục THẬT tính cả tiền mặt (tiền mặt sinh lời 0), trước phí — chỉ từ bản ghi chấm sau 14/11/2026; null khi chưa có. */
  cashIncl?: { n: number; meanPortfolio: number; meanInvested: number; meanVnIndex: number | null } | null;
}
/** R3: chấm thực tế kiểu Việt Nam (mô tả) theo kỳ hạn -> quy mô vốn (đồng, dạng chuỗi). */
export interface RealisticSummary { version: string; horizons: Record<string, Record<string, { n: number; meanExcess: number | null; meanOfficialExcess: number | null; meanImpactBps: number | null; fillRate: number | null; delayedExits: number; meanInvested: number | null }>> }
export interface LedgerSummary { horizons: Record<string, LedgerHorizon>; criteria: { icPass: boolean; excessPass: boolean; sessions: number }; label: "EVIDENCE" | "EXPERIMENTAL"; labelVi: string; realistic?: RealisticSummary;
  /** E4-HL: sổ của danh mục Elite HL — chỉ mô tả; basisVi = cơ sở chấm (rổ mã đang giữ quy về 100% cổ phiếu). */
  kind?: "ELITE_HL"; basisVi?: string }

/** C1: ứng viên xếp sau danh mục + lý do chưa vào (Gateway phát lại thuật toán dựng danh mục trên tài liệu đã lưu). */
export type CandidateReason = "sector_cap" | "full" | "below";
export interface Candidate {
  ticker: string; rank: number; Z: number; alpha5Pct: number | null; pOutperform: number; sectorKey: string | null; close: number; sigma20: number;
  stop: number; target: number; holdSessions: number; inBuffer: boolean; reason: CandidateReason; sectorCount: number | null; maxPerSector: number; sectorHeld: number;
}

export interface EliteDecision {
  version: string; date: string; builtAt: string; icComb: number; sigma5: number | null; weights: SignalWeight[];
  universe: { panel: number; eligible: number }; portfolio: PortfolioPick[]; scores: EliteScore[]; ledgerSummary: LedgerSummary | null;
  signalWeighting?: { method: "correlation" | "ic"; corr: { ids: string[]; matrix: number[][]; shrink: number; names: number } | null; noteVi: string | null };
  construction?: { method: "erc" | "inverse-vol" | "hl-g2r"; sessions: number | null; retained: number; previous: number; turnover: number | null };
  candidates?: Candidate[];
  /** E4-HL: `portfolio` là danh mục Elite HL; danh mục E3 "dòng tiền" (cũ) nằm ở flowPortfolio với sổ riêng. */
  /** Số liệu hiển thị do Gateway cấp (không nằm trong tài liệu đã khoá): chi phí sổ, ngưỡng đủ điều kiện của danh mục dòng tiền. */
  display?: { ledgerCostRoundTrip: number; flowMinAdvBn: number; flowMinPrice: number; flowRrgPenalty?: number; flowBufferRank?: number; flowMaxPerSector?: number; flowWeightCap?: number };
  /** Độ mới so với lịch phiên thật: số phiên đã đóng sau phiên của tài liệu (0 = mới nhất; ≥ 2 = job dựng lỡ phiên). */
  freshness?: { latestSession: string | null; sessionsBehind: number; /** chậm ≥ 1 phiên và đã quá 20:00 giờ VN của phiên mới nhất */ overdue?: boolean } | null;
  hl?: EliteHlMeta; flowVersion?: string; flowPortfolio?: PortfolioPick[]; flowConstruction?: EliteDecision["construction"]; flowLedgerSummary?: LedgerSummary | null;
}

/**
 * Danh mục Elite HL của một tài liệu E4-HL với kiểu đúng (có null). `portfolio` giữ kiểu PortfolioPick[] vì cùng trường đó là danh mục
 * dòng tiền ở tài liệu cũ và sau `flowView`; mọi nơi đọc vị thế HL phải đi qua hàm này. Tài liệu không phải E4-HL -> mảng rỗng.
 */
export function hlPicks(d: EliteDecision | null | undefined): HlPick[] {
  return d?.hl ? (d.portfolio as unknown as Partial<HlPick>[]).filter((p): p is HlPick => Boolean(p.hl)) : [];
}

export interface EvidenceHorizon { n: number; mean: number | null; t: number | null; pPos: number | null; q: number | null; stable: boolean; halves: [number, number] | null; from: string | null; to: string | null }
export interface EvidenceSignal {
  id: string; tab: string; labelVi: string; priorTier: Tier; priorEvidenceVi: string; tier: Tier; change: "up" | "down" | "none"; reasonVi: string; mainH: number;
  source: string; byH: Record<string, EvidenceHorizon>;
}
export interface EliteEvidence { version: string; generatedAt: string; calendarLast: string | null; tests: number; counts: Record<Tier, number>; signals: EvidenceSignal[] }

export interface PanelTicker { date: string; ticker: string; icb: { l1?: string; l2?: string; l3?: string } | null; sector: string | null; values: Record<string, number | null>; signals: SignalSpec[]; missingSources: string[] }
export interface DecisionTicker extends EliteScore { date: string; version: string; icComb: number; weights: SignalWeight[]; inPortfolio: boolean; universe: { panel: number; eligible: number } }

export const TIER_LABEL: Record<Tier, string> = { A: "Bậc A", B: "Bậc B", C: "Bậc C" };
export const TIER_TITLE: Record<Tier, string> = {
  A: "Đạt kiểm định đặt trước — có trọng số",
  B: "Có lợi thế một phần / mẫu mỏng — có trọng số nhỏ",
  C: "Thăm dò / chưa kiểm định — chỉ làm bối cảnh, không có trọng số",
};

export interface VarBlock { level: number; historical: { var: number; cvar: number }; gaussian: { var: number; cvar: number }; cornishFisher: { var: number }; moments: { mean: number; sd: number; skew: number; exKurt: number } }
export interface EliteRisk {
  date: string; version: string; generatedAt: string; label: string; available: boolean; reasonVi?: string;
  /** E4-HL: loại danh mục đang đo, tỷ trọng cổ phiếu / tiền mặt (phân số 0–1); empty = danh mục 100% tiền mặt. */
  kind?: "ELITE_HL" | "ELITE_FLOW"; invested?: number; cash?: number; empty?: boolean;
  sessions?: number; from?: string; to?: string;
  shrinkage?: { delta: number; avgCorrelation: number; method: string };
  volatility?: { daily: number; annual: number };
  holdings?: { ticker: string; weight: number; volAnnual: number; riskContribution: number; sector: string | null }[];
  diversification?: { ratio: number; effectiveN: number | null; enb: number; hhi: number | null };
  var?: { "0.95": VarBlock; "0.99": VarBlock; tenDayNoteVi: string };
  beta?: number | null; corrWithVnIndex?: number | null;
  maxDrawdown?: { value: number; from: string | null; to: string | null };
  stress?: { worstVnIndexDays: { date: string; vnIndex: number; portfolio: number }[]; worst10Sessions: { from: string; to: string; vnIndex: number; portfolio: number } | null };
  sectors?: { key: string; weight: number }[];
  correlation?: { tickers: string[]; matrix: (number | null)[][] };
}

export interface LedgerEntry {
  date: string; lockedAt: string; holdings: { ticker: string; weight: number }[]; universeSize: number | null;
  /** E4-HL: tỷ lệ tiền mặt lúc khoá; empty = danh mục 100% tiền mặt (không chấm); frozen = phiên bị chốt dữ liệu. */
  cash?: number; empty?: boolean; frozen?: boolean; rebalance?: boolean;
  results: Record<string, { from: string; to: string; portfolioNet: number; universeNet: number; excess: number; vnIndex: number | null; ic: number | null; names: number }>;
}
export interface EliteLedger { version: string; updatedAt: string; summary: LedgerSummary; entries: LedgerEntry[] }

export interface EliteRetro {
  version: string; generatedAt: string; prereg: string; label: "EVIDENCE" | "EXPERIMENTAL"; verdictVi: string;
  period: { from: string | null; to: string | null; sessions: number };
  criteria: { icPass: boolean; excessPass: boolean; sessions: number };
  horizons: Record<string, LedgerHorizon>;
  descriptive: { nonOverlapping10: { n: number; mean: number | null; ci95: [number, number] | null }; annualisedExcess: number | null; dailyTurnover: number | null; tierDays: Record<string, Record<Tier, number>>; realistic?: RealisticSummary };
  lastWeights: { id: string; tier: Tier; w: number; icPost: number }[];
}

/** CG-r1 Cổng tiền mặt (Gateway /api/elite/cash-gate). */
export type CashGateRuleId = "H1" | "H1b" | "H2" | "H3";
export interface CashGateHoldoutRule { cagr: number; mdd: number; sharpe: number; deltaSharpe: number; pHolm: number; pctReduced: number; episodes: number; criteria: { C1: boolean; C2: boolean; C3: boolean; C4: boolean }; pass: boolean }
export interface CashGateStatus {
  version: string; generatedAt: string; asOf: string;
  inputs: { regime: string; vix: number | null; vix3m: number | null; volSlope: number | null; volAnnual: number | null; volTargetAnnual: number | null };
  rules: Record<CashGateRuleId, { target: number; active: boolean }>;
  official: { equityShare: number; reasonVi: string };
  holdout: { version: string; ranAt: string; prereg: string; period: { from: string; to: string; sessions: number }; summaryVi: string; base: { cagr: number; mdd: number; sharpe: number }; rules: Record<CashGateRuleId, CashGateHoldoutRule>; passed: CashGateRuleId[] } | null;
  ledger: { entries: number; first: string | null; last: string | null };
  /** R4: nguồn tạm lỗi -> bản gần nhất. */
  stale?: boolean; staleReason?: string;
}

/** E7-v3 (Gateway /api/elite/retro-v3): hồi cứu có hiệu chỉnh quá khớp. */
export interface EliteRetroV3 {
  version: string; period: { from: string; to: string; sessions: number; dailyN: number };
  criteria: { icPass: boolean; excessPass: boolean; dsrPass: boolean; pboPass: boolean }; pass: boolean; label: string; verdictVi: string;
  horizons: Record<string, { n: number; meanExcess: number | null; excessCi95: [number, number] | null; ic: { n: number; mean: number | null; t: number | null } }>;
  deflatedSharpe: { dsr: number; sr: number; sr0: number; N: number; T: number; sensitivityN24: number };
  pbo: { pbo: number; splits: number; blockLength: number };
  grid: { id: string; size: number; bufferRank: number; weighting: string; primary: boolean; sharpeAnnual: number; annualExcess: number }[];
}

/** Elite × TO Giai đoạn II (ELITE-TO-prereg.md): sổ ảo — không đổi danh mục chính thức. */
export interface EliteToShadowStat { mean: number | null; ci95: [number | null, number | null]; total: number | null }
export interface EliteToShadow {
  version: string; start: string; updatedAt: string | null; days: number; from: string | null; to: string | null;
  nav: { core: number | null; guard: number | null; sleeve: number | null; comp: number | null; vn: number | null };
  maxDD: { core: number | null; guard: number | null; sleeve: number | null; comp: number | null };
  delta: { guard: EliteToShadowStat; sleeve: EliteToShadowStat; comp: EliteToShadowStat }; guardDays: number; sleeveDays: number;
  compVerdict: "CHƯA ĐỦ MẪU" | "ĐẠT" | "KHÔNG ĐẠT"; ic: { days: number; mean: number | null; t: number | null; verdict: string }; label: string;
  ex: { n: number; stats: { n: number; mean: number | null; ci95: [number | null, number | null]; hit: number | null }; looks: { n: number; mean: number | null; upper975: number | null; pass: boolean }[]; nextLook: number | null; ref: { mean: number; ci95: [number, number]; n: number }; label: string } | null;
  curve: [string, number, number, number][];
  recent: { d: string; core: number; guard: number; sleeve: number; comp: number; vn: number; k: number; guarded: string[]; sleeveT: string[] }[];
  rule: { start: string; minDays: number; sleeveSlot: number; sleeveMax: number };
  /** Lõi CORE là danh mục nào và các phiên không được tính lại (sau khi danh mục chính thức đổi sang Elite HL). */
  coreNoteVi?: string;
}

/** LS-r1: GET /api/elite/leadership/:ticker */
export interface LeadershipTicker {
  version: string; prereg: string; ticker: string; date: string | null;
  ls: number | null; pct: number | null; band: string | null;
  components: { id: string; labelVi: string; value: number | null; pct: number | null }[];
  market: { regime: "UP" | "ACC" | "WEAK" | null; regimeVi: string | null; bias: string | null; breadth: number | null; guard: boolean } | null;
  evidence: { tier: "A" | "B" | "C"; reasonVi: string; main: { n: number; mean: number | null; t: number | null; q: number | null; stable: boolean } | null;
    weighting: { n: number; icDec: number | null; neff: number; icRegime: number | null; neffRegime: number; icRegPost: number | null } | null; icPost: number | null; gateLive: boolean } | null;
  gate: { pass: boolean; ranAt: string; verdictVi: string } | null;
  scanner: { dataAsOf: string | null; consensusCode: string | null; consensus: string | null; trendTag: string | null; rsRating: number | null; breakout: boolean;
    smartScore: number | null; fScore: number | null; fScoreMax: number | null; fScoreApplicable: boolean | null; foreignNetBuy: boolean | null } | null;
}
