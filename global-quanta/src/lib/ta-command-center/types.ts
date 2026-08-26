export interface OhlcvBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PatternType = "INVERSE_HS" | "TRIANGLE" | "FLAT_SQUEEZE" | "CUP_HANDLE";

export interface PatternMatch {
  ticker: string;
  sector: string;
  pattern: PatternType;
  patternLabel: string;
  tag: string;
  timeframe: "D" | "W";
  confidenceScore: number;
  status: "forming" | "confirmed";
  dateRangeStart: string;
  dateRangeEnd: string;
}
