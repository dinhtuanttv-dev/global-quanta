/**
 * vn-holidays.ts — Lịch nghỉ giao dịch dùng cho Timing Engine v3 phía giao diện (đếm "còn N phiên tới GDKHQ/ĐHCĐ").
 *
 * KHÔNG còn danh sách nhập tay: quy tắc tự tính cho mọi năm (vn-trading-calendar.ts — âm lịch + Bộ luật Lao động, kiểm
 * chứng 10 năm phiên thật) + lớp Market Gateway /api/market/trading-calendar (quan sát phiên thật + ngày nghỉ nối chính
 * thức). `vnHolidayCalendar` dùng được ngay (chỉ quy tắc); hook useVnTradingCalendar() trả lịch đã có lớp Gateway.
 */
import { getMarketGateway } from '../../config/marketGateway';
import { useEffect, useState } from 'react';
import type { HolidayCalendar } from '../quant-cotuc';
import { fetchGatewayHolidays, makeVnTradingCalendar, type GatewayHolidays } from './vn-trading-calendar';

/** Lịch theo quy tắc tự tính (đồng bộ, không I/O) — đúng cho mọi năm, trừ ngày nghỉ nối chưa biết trước. */
export const vnHolidayCalendar: HolidayCalendar = makeVnTradingCalendar(null);

let gatewayPromise: Promise<GatewayHolidays | null> | null = null;

function loadGatewayHolidays(): Promise<GatewayHolidays | null> {
  const gw = getMarketGateway();
  if (!gw.enabled) return Promise.resolve(null);
  if (!gatewayPromise) {
    const y = new Date().getUTCFullYear();
    gatewayPromise = fetchGatewayHolidays(gw.baseUrl, `${y - 1}-01-01`, `${y + 2}-12-31`);
  }
  return gatewayPromise;
}

/** Lịch giao dịch đầy đủ: quy tắc ngay lập tức, rồi thay bằng bản có lớp Gateway khi tải xong (một lần mỗi phiên trang). */
export function useVnTradingCalendar(): HolidayCalendar {
  const [cal, setCal] = useState<HolidayCalendar>(vnHolidayCalendar);
  useEffect(() => {
    let alive = true;
    void loadGatewayHolidays().then((g) => { if (alive && g) setCal(makeVnTradingCalendar(g)); });
    return () => { alive = false; };
  }, []);
  return cal;
}
