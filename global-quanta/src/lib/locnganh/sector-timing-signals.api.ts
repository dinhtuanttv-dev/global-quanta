// Port từ locnganh-timing-engine (ui/sector-rotation/sector-timing-signals.api.ts).
import type { SectorTimingSignalsBulkV3 } from './types';
import { fetchValidatedJson } from './http-json';
import type { FetchJsonOptions } from './http-json';
import { parseSectorTimingSignals } from './sector-timing-signals.schema';

export function defaultBaseUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return (env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
}

const join = (base: string, path: string) => `${base.replace(/\/+$/, '')}${path}`;

export function buildSectorTimingSignalsUrl(base: string = defaultBaseUrl()): string {
  return join(base, '/api/locnganh/sector-timing-signals');
}

export interface SectorTimingSignalsApiOptions extends FetchJsonOptions {
  baseUrl?: string;
}

/**
 * Lấy SectorTimingSignal cho CẢ vũ trụ ngành trong MỘT request — dùng cho LocNganhPanel, thay
 * vì gọi sector-cycle-stats riêng cho từng dòng bảng (cùng lý do mục 12.1 docs-v3-design.md
 * của cotuc-timing-engine: tính nặng ở server, front-end chỉ hiển thị).
 */
export async function fetchSectorTimingSignals(opts: SectorTimingSignalsApiOptions = {}): Promise<SectorTimingSignalsBulkV3 | null> {
  return fetchValidatedJson(buildSectorTimingSignalsUrl(opts.baseUrl), parseSectorTimingSignals, 'sector-timing-signals', opts);
}
