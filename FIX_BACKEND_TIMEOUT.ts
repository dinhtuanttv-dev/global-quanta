/**
 * ============================================================
 * FIX: Backend API Timeout
 * File: quant-macro-scanner/app/api/sector-filter/rrg/route.ts
 * Change: export const maxDuration = 30; // FROM 10 TO 30 SECONDS
 * ============================================================
 */

// BEFORE:
export const maxDuration = 10;

// AFTER:
export const maxDuration = 30;


/**
 * ============================================================
 * FIX: Sector Key Consistency
 * File: quant-macro-scanner/lib/sector-filter/constants.ts
 * Create this file if not exists
 * ============================================================
 */

export const SECTOR_KEYS = {
  BANKING: 'banking',
  REAL_ESTATE: 'real_estate',
  STEEL: 'steel',
  TECH: 'technology',
  RETAIL: 'retail',
  SECURITIES: 'securities',
  OIL_GAS: 'oil_gas',
  SHIPPING: 'shipping',
} as const;

export type SectorKey = typeof SECTOR_KEYS[keyof typeof SECTOR_KEYS];

// Update rrg/route.ts to use standardized keys:
/*
import { SECTOR_KEYS } from '@/lib/sector-filter/constants';

const SECTOR_PROXIES = [
  { sectorKey: SECTOR_KEYS.BANKING, sectorLabel: "Ngân hàng", proxyTicker: "VCB" },
  { sectorKey: SECTOR_KEYS.REAL_ESTATE, sectorLabel: "Bất động sản", proxyTicker: "VHM" },
  { sectorKey: SECTOR_KEYS.STEEL, sectorLabel: "Thép & Vật liệu", proxyTicker: "HPG" },
  { sectorKey: SECTOR_KEYS.TECH, sectorLabel: "Công nghệ", proxyTicker: "FPT" },
  { sectorKey: SECTOR_KEYS.RETAIL, sectorLabel: "Bán lẻ", proxyTicker: "MWG" },
  { sectorKey: SECTOR_KEYS.SECURITIES, sectorLabel: "Chứng khoán", proxyTicker: "VCI" },
  { sectorKey: SECTOR_KEYS.OIL_GAS, sectorLabel: "Dầu khí", proxyTicker: "GAS" },
  { sectorKey: SECTOR_KEYS.SHIPPING, sectorLabel: "Vận tải biển", proxyTicker: "GMD" },
];
*/
