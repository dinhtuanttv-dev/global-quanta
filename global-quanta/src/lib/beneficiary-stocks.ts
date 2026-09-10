// MOI (2026-09-10): Bang Tong Hop Co Phieu Duoc Huong Loi - HARD_DATA,
// KHONG qua AI (khac voi StockImpactTable dua tren Gemini/ESTIMATED). Tinh
// truc tiep tu du lieu da fetch san (sector-pulse cac khu vuc + macro
// commodity deltas), khong ton phi, cap nhat lien tuc theo SSE/SWR co san.

import { lookupSectorMapping } from "./macro-mapping";
import { SECTOR_ETF_TO_SECTOR_KEY } from "./sector-etf-to-sectorkey";
import { EU_SECTOR_INSTRUMENTS, ASIA_SECTOR_PROXY_BASKETS } from "./region-sector-sources";
import type { SectorQuote } from "../hooks/useSectorPulse";
import type { MacroTrendRow, MacroCommodityDeltas } from "../hooks/useGlobalStream";

export interface BeneficiarySignal {
  ticker: string;
  sectorKey: string;
  sectorLabelVi: string;
  direction: "positive" | "negative";
  magnitude: number; // tong |%| cua tat ca tin hieu dong thuan tren ma nay - dung de sap xep
  sources: string[]; // moi phan tu: nhan hien thi 1 nguon tin hieu, VD "Nganh Nang luong (My) +0.8%"
}

// Nguong loc nhieu - tin hieu duoi nguong nay khong du tin cay de dua vao
// bang (tranh nhieu tin hieu "gia" tu bien dong nho, khong co y nghia).
const NOISE_THRESHOLD_PERCENT = 0.5;

// MOI (2026-09-10): gioi han so ma toi da hien thi cho MOI NGANH trong bang
// nay - tranh 1 nganh co nhieu vnTickers (VD Cong nghiep co 7 ma) chiem het
// cho, day ra nganh khac co tin hieu that su manh hon nhung it ma hon (VD
// Tien ich chi co... nhieu ma nhung xep sau do do it "tong magnitude" hon).
// Khong anh huong panel "Top Nganh Thi Truong" phia tren - chi ap dung rieng
// cho bang tong hop nay.
const MAX_TICKERS_PER_SECTOR = 2;

interface RawSignal {
  ticker: string;
  sectorKey: string;
  sectorLabelVi: string;
  direction: "positive" | "negative";
  magnitude: number;
  sourceLabel: string;
}

function fromSectorKeyChange(
  sectorKey: string | undefined,
  changePercent: number | null | undefined,
  sourceLabelPrefix: string,
): RawSignal[] {
  if (!sectorKey || typeof changePercent !== "number" || Math.abs(changePercent) < NOISE_THRESHOLD_PERCENT) return [];
  const mapping = lookupSectorMapping(sectorKey);
  if (!mapping || mapping.vnTickers.length === 0) return [];
  const direction: "positive" | "negative" = changePercent >= 0 ? "positive" : "negative";
  const sourceLabel = `${sourceLabelPrefix} ${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`;
  return mapping.vnTickers.map((ticker) => ({
    ticker,
    sectorKey,
    sectorLabelVi: mapping.sectorLabelVi,
    direction,
    magnitude: Math.abs(changePercent),
    sourceLabel,
  }));
}

function fromSectorQuotes(
  quotes: SectorQuote[],
  resolveSectorKey: (etfSymbol: string) => string | undefined,
  marketLabel: string,
): RawSignal[] {
  const out: RawSignal[] = [];
  for (const q of quotes) {
    const sectorKey = resolveSectorKey(q.etfSymbol);
    out.push(...fromSectorKeyChange(sectorKey, q.changePercent, `Ngành ${lookupSectorMapping(sectorKey ?? "")?.sectorLabelVi ?? q.sectorNameVi} (${marketLabel})`));
  }
  return out;
}

function resolveUsSectorKey(etf: string): string | undefined {
  return SECTOR_ETF_TO_SECTOR_KEY[etf];
}
function resolveEuSectorKey(ticker: string): string | undefined {
  return EU_SECTOR_INSTRUMENTS.find((i) => i.ticker === ticker)?.sectorKey;
}
function resolveAsiaSectorKey(basketId: string): string | undefined {
  return ASIA_SECTOR_PROXY_BASKETS.find((b) => b.sectorKey === basketId || b.tickers.includes(basketId))?.sectorKey;
}

export interface BeneficiaryInputs {
  usGainers: SectorQuote[];
  usLosers: SectorQuote[];
  euGainers: SectorQuote[]; // truyen mang rong neu chua co du lieu that (xem isGenuineRegionData o TopSectorsPanel)
  euLosers: SectorQuote[];
  asiaGainers: SectorQuote[];
  asiaLosers: SectorQuote[];
  macro: MacroTrendRow | null;
  commodityDeltas: MacroCommodityDeltas | null;
}

export function computeBeneficiaryStocks(inputs: BeneficiaryInputs): BeneficiarySignal[] {
  const raw: RawSignal[] = [];

  raw.push(...fromSectorQuotes([...inputs.usGainers, ...inputs.usLosers], resolveUsSectorKey, "Mỹ"));
  raw.push(...fromSectorQuotes([...inputs.euGainers, ...inputs.euLosers], resolveEuSectorKey, "Châu Âu"));
  raw.push(...fromSectorQuotes([...inputs.asiaGainers, ...inputs.asiaLosers], resolveAsiaSectorKey, "Châu Á"));

  if (inputs.macro) {
    const d = inputs.commodityDeltas;
    raw.push(...fromSectorKeyChange("PRECIOUS_METALS", d?.goldChangePercent, "Giá Vàng"));
    raw.push(...fromSectorKeyChange("ENERGY_OIL_GAS", d?.oilBrentChangePercent, "Dầu Brent"));
    raw.push(...fromSectorKeyChange("ENERGY_OIL_GAS", d?.oilWtiChangePercent, "Dầu WTI"));
    raw.push(...fromSectorKeyChange("SHIPPING_LOGISTICS", d?.balticDryChangePercent, "Cước tàu hàng rời (BDI)"));
    raw.push(...fromSectorKeyChange("SHIPPING_LOGISTICS", inputs.macro.container_freight_proxy_change_percent, "Cước container (Proxy)"));
    raw.push(...fromSectorKeyChange("AGRICULTURE_COFFEE", d?.robustaCoffeeChangePercent, "Cà phê Robusta"));
    raw.push(...fromSectorKeyChange("STEEL_MATERIALS", inputs.macro.iron_ore_proxy_change_percent, "Quặng sắt (Proxy)"));
    // Cao su: vnTickers trong RUBBER_NATURAL chi chua nhom huong loi (PHR/DPR/TRC)
    // nen khong can xu ly rieng chieu nguoc - da dung sẵn trong mapping.
    raw.push(...fromSectorKeyChange("RUBBER_NATURAL", inputs.macro.rubber_change_percent, "Giá Cao su"));
    raw.push(...fromSectorKeyChange("FERTILIZER", inputs.macro.fertilizer_urea_change_percent, "Giá Phân bón (Urea)"));
  }

  // Gop nhieu tin hieu tren cung 1 ma thanh 1 dong. Neu 2 tin hieu tren
  // cung ma NGUOC chieu nhau, giu tin hieu MANH HON (khong cong don) de
  // tranh nhieu loan; neu CUNG chieu, cong don magnitude va gop nguon.
  const merged = new Map<string, BeneficiarySignal>();
  for (const s of raw) {
    const existing = merged.get(s.ticker);
    if (!existing) {
      merged.set(s.ticker, { ticker: s.ticker, sectorKey: s.sectorKey, sectorLabelVi: s.sectorLabelVi, direction: s.direction, magnitude: s.magnitude, sources: [s.sourceLabel] });
    } else if (existing.direction === s.direction) {
      existing.magnitude += s.magnitude;
      existing.sources.push(s.sourceLabel);
    } else if (s.magnitude > existing.magnitude) {
      merged.set(s.ticker, { ticker: s.ticker, sectorKey: s.sectorKey, sectorLabelVi: s.sectorLabelVi, direction: s.direction, magnitude: s.magnitude, sources: [s.sourceLabel] });
    }
    // Neu tin hieu ngoai chieu yeu hon tin hieu da co - bo qua, giu nguyen ban ghi manh hon.
  }

  // MOI (2026-09-10): gioi han so ma toi da MOI NGANH (theo sectorKey,
  // rieng cho tung chieu positive/negative) truoc khi sap xep tong the -
  // tranh 1 nganh nhieu vnTickers (VD Cong nghiep 7 ma) chiem het bang,
  // day nganh khac (VD Tien ich) ra ngoai du tin hieu cung manh khong kem.
  const bySectorDirection = new Map<string, BeneficiarySignal[]>();
  for (const sig of merged.values()) {
    const key = `${sig.sectorKey}__${sig.direction}`;
    if (!bySectorDirection.has(key)) bySectorDirection.set(key, []);
    bySectorDirection.get(key)!.push(sig);
  }

  const capped: BeneficiarySignal[] = [];
  for (const group of bySectorDirection.values()) {
    group.sort((a, b) => b.magnitude - a.magnitude);
    capped.push(...group.slice(0, MAX_TICKERS_PER_SECTOR));
  }

  return capped.sort((a, b) => b.magnitude - a.magnitude);
}
