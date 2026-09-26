/**
 * vn-holidays.ts - Lich nghi le GIAO DICH CHUNG KHOAN Viet Nam THAT
 * (HOSE + HNX, KHONG PHAI lich nghi hanh chinh chung - 2 lich co the
 * khac nhau) - dung cho Timing Engine v3 (dem NGAY TUONG LAI hien thi
 * tham khao, VD "con bao nhieu ngay den DHCD sap toi").
 *
 * NGUON: thong bao CHINH THUC cua HNX (hnx.vn, Thong bao 5305/TB-SGDHN
 * ngay 03/12/2025) va HOSE (Thong bao 2294/TB-SGDHCM ngay 09/12/2025)
 * ve lich nghi giao dich nam 2026 - xac nhan qua nhieu nguon bao chi
 * tai chinh doc lap (thoi diem tra cuu: 26/09/2026).
 *
 * CHI co nam 2026 (nam hien tai) - KHONG bia cho cac nam khac. Khi
 * sang nam moi, CAN CAP NHAT danh sach nay theo thong bao chinh thuc
 * moi cua HOSE/HNX (thuong cong bo vao thang 12 nam truoc).
 *
 * LUU Y QUAN TRONG: day CHI dung cho phan "dem ngay TUONG LAI" (hien
 * thi tham khao trong OptimalTimingTab/CalendarTabV3/StockModal).
 * Phan BACKTEST LICH SU (tinh CAR o backend) dung giai phap KHAC - tu
 * suy lich giao dich TU CHINH chuoi gia THAT da tai ve (xem comment
 * trong qms-clean/lib/cotuc/timing-v3/date-utils.ts) - KHONG can danh
 * sach nay, tu dong dung voi moi nam co du lieu, khong bao gio can sua.
 */
import { makeHolidayCalendar } from "../quant-cotuc";

export const VN_STOCK_HOLIDAYS_2026: readonly string[] = [
  // Tet Duong lich (Thong bao HOSE 25/12/2025: nghi 01/01 - 02/01,
  // hoan doi lam bu 10/01 thu Bay - KHONG tinh 10/01 la ngay nghi vi
  // do la ngay LAM BU, khong phai ngay nghi)
  "2026-01-01", "2026-01-02",
  // Tet Nguyen Dan (16/02 thu Hai - 20/02 thu Sau, 5 ngay nghi le
  // chinh thuc; T7-CN 14-15/2 va 21-22/2 da la cuoi tuan, khong can
  // liet ke rieng vi WEEKEND_ONLY_CALENDAR da tu loai T7/CN)
  "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20",
  // Gio To Hung Vuong (10/3 am lich = 27/04/2026 duong lich, thu Hai)
  "2026-04-27",
  // 30/4 (Giai phong mien Nam) - 1/5 (Quoc te Lao dong)
  "2026-04-30", "2026-05-01",
  // Quoc khanh 2/9 (31/08 thu Hai - 02/09 thu Tu, gom hoan doi)
  "2026-08-31", "2026-09-01", "2026-09-02",
] as const;

export const vnHolidayCalendar = makeHolidayCalendar(VN_STOCK_HOLIDAYS_2026);
