import useSWR from "swr";
import { DIVIDEND_STOCKS } from "../lib/quant-cotuc";

// PHUONG AN C: RS (Relative Strength) 3 thang = % thay doi gia cua ma so voi
// % thay doi cua VN-Index trong cung ky. Du lieu gia lay tu route
// /api/ohlcv da co san o Project A (theo bang route trong
// Global-Quanta-Data-Sharing-Guide.md - route nay goi Yahoo Finance that,
// server-side).
//
// !!! GIA DINH CAN XAC NHAN (2026-08-25), CHUA TEST THAT !!!
// 1. Ticker dai dien VN-Index goi qua /api/ohlcv la "VNINDEX" - CAN XAC NHAN
//    dung ky hieu Project A dang dung (co the la "^VNINDEX" kieu Yahoo, hoac
//    ten khac). Kiem tra bang:
//      curl "https://<domain-project-A>/api/ohlcv?ticker=VNINDEX&range=3mo&limit=100"
// 2. Ten field trong response (open/close/date) CHUA duoc xac nhan cau truc
//    that - ham parseCloses() ben duoi thu nhieu ten field pho bien, nhung
//    neu response that dung ten khac hoan toan se tra ve [] (safe fallback,
//    khong crash) - luc do RS se hien "-" thay vi loi, nhung se khong tinh
//    duoc gi ca. Neu vao production thay RS luon "-" cho moi ma, day la
//    nghi pham dau tien can kiem tra.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const BENCHMARK_TICKER = "VNINDEX"; // TODO xac nhan dung ky hieu that

interface OhlcvBar {
  date: string;
  close: number;
}

// Du phong nhieu ten field khac nhau, giong pattern da dung o vci-financials-adapter.ts,
// vi chua co quyen curl /api/ohlcv de xac nhan cau truc that.
function parseCloses(raw: any): OhlcvBar[] {
  const rows: any[] = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.bars) ? raw.bars : Array.isArray(raw) ? raw : [];
  return rows
    .map((row) => {
      const close = row.close ?? row.c ?? row.closePrice ?? row.Close ?? null;
      const date = row.date ?? row.d ?? row.time ?? row.Date ?? null;
      if (close === null || date === null) return null;
      return { date: String(date), close: Number(close) };
    })
    .filter((r): r is OhlcvBar => r !== null && !isNaN(r.close));
}

async function fetchOhlcv(ticker: string): Promise<OhlcvBar[]> {
  try {
    const res = await fetch(`${API_BASE}/api/ohlcv?ticker=${ticker}&range=3mo&limit=100`);
    if (!res.ok) return [];
    const json = await res.json();
    return parseCloses(json);
  } catch {
    return [];
  }
}

function calc3moReturn(bars: OhlcvBar[]): number | null {
  if (bars.length < 2) return null;
  // FIX (ra soat 2026-08-25): KHONG gia dinh thu tu mang tra ve la cu->moi.
  // Nhieu API tra ve moi->cu (VD Yahoo Finance thuong tra ve theo thu tu
  // giam dan). Neu doan sai chieu, ket qua se bi NGUOC DAU (RS am thanh
  // duong) ma khong crash - loi rat kho phat hien khi debug. Luon tu sap
  // xep theo ngay (ISO string sap xep dung thu tu neu dang YYYY-MM-DD)
  // truoc khi lay gia dau ky/cuoi ky, khong phu thuoc thu tu API tra ve.
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0].close;
  const last = sorted[sorted.length - 1].close;
  if (!first || first === 0) return null;
  return ((last - first) / first) * 100;
}

async function fetchAllRs(): Promise<Record<string, number | null>> {
  const tickers = DIVIDEND_STOCKS.map((s) => s.ticker);
  const [benchmarkBars, ...tickerBars] = await Promise.all([
    fetchOhlcv(BENCHMARK_TICKER),
    ...tickers.map((t) => fetchOhlcv(t)),
  ]);

  const benchmarkReturn = calc3moReturn(benchmarkBars);
  const result: Record<string, number | null> = {};

  tickers.forEach((ticker, i) => {
    const tickerReturn = calc3moReturn(tickerBars[i]);
    if (tickerReturn === null || benchmarkReturn === null) {
      result[ticker] = null;
      return;
    }
    result[ticker] = Math.round((tickerReturn - benchmarkReturn) * 10) / 10;
  });

  return result;
}

export function useRealRsData() {
  // dedupingInterval dai (60 phut) vi day la 18 lan goi /api/ohlcv moi lan
  // refresh (17 ma + 1 benchmark) - tranh goi Yahoo qua nhieu lan, dung tinh
  // than "nhe, tranh goi lien tuc" da neu trong guide cho /api/universe.
  const { data, error, isLoading } = useSWR("cotuc-real-rs-3mo", fetchAllRs, {
    refreshInterval: 60 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 60 * 60 * 1000,
  });

  return {
    realRsMap: data ?? {},
    isRealRsLoading: isLoading,
    error,
  };
}
