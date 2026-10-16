# Trung tâm vĩ mô (MacroCenter) — bản tích hợp Global Quanta

Engine của gói `macro-center` 1.1: kiểm định tính dừng, OLS-HAC, hiệu chỉnh kiểm định bội, HMM, kịch bản, backtest và báo cáo. Gói này đã được đưa vào tab **Chất xúc tác → 1. Phân tích vĩ mô**. Bản gốc độc lập vẫn nằm ở `C:\Users\HP\macro-center`; tài liệu trong `docs/` là tài liệu bàn giao của gói gốc và được giữ lại để tham khảo.

## Chạy ở đâu

| Thành phần | Vị trí |
|---|---|
| Engine (TS thuần) | `src/*.ts`, đóng gói cho Gateway bằng `npm run bundle:macro` thành `backend/src/market/macro/vendor/macroEngine.mjs`. Test `macroEngineBundle.test.ts` báo đỏ nếu quên đóng gói lại |
| API `/api/macro/*` | Gateway (Railway): `backend/src/routes/macro.js`, `backend/src/market/macro/*`. Engine chạy trong worker thread |
| Giao diện | `src/ui/*` (`MacroCenterTab`, các panel nguồn dữ liệu / chế độ / báo cáo trong `MacroExtraPanels.tsx`) |
| Công cụ chat | `src/macro-chat-tools.ts`, chạy trên Gateway (`POST /api/macro/tools/:name`), dùng cho tab "3. Hỏi đáp xúc tác" |

## Dữ liệu

- **Không bao giờ trộn số liệu thật với số liệu mô phỏng.** Chế độ `real` chỉ bật khi có ít nhất 1 biến vĩ mô VÀ 1 chỉ số thật đủ 60 tháng và **còn cập nhật**. Chuỗi đã ngừng cập nhật (ví dụ chỉ số đổi mã) bị loại, nếu không nó sẽ kéo cả phân tích về quá khứ.
- Nguồn tự động (chỉ lấy tháng đã đóng, 2 lần/ngày):
  - chỉ số HOSE lấy từ lịch sử giá của Gateway;
  - FED (FRED `FEDFUNDS`);
  - dầu Brent (FRED `DCOILBRENTEU`);
  - DXY (Yahoo `DX-Y.NYB`);
  - USD/VND thị trường (Yahoo `VND=X`).
- Biến nội địa (CPI, lãi suất liên ngân hàng, M2, tín dụng, FDI, xuất khẩu, IIP, PMI) chưa có nguồn mở. Quản trị viên nạp bằng `POST /api/macro/admin/import` (Bearer `MARKET_ADMIN_TOKEN`), body `{ seriesId, csv, source, asOf?, dryRun?, force? }`. Thiếu các biến này thì phần chế độ vĩ mô (cần IR/CPI/M2) báo rõ là chưa đủ dữ liệu.
- Mọi số liệu thật được lưu theo kiểu chỉ-thêm trong KV `macro:observations`, kèm nguồn của từng quan sát.
- MacroScore **chỉ để tham khảo**, kể cả trong báo cáo tháng.

## Test

`npx vitest run src/components/MainTabs/ChatXucTac/MacroCenter` cho frontend và engine; `cd backend && node --test test/macroCenter.test.js` cho Gateway.
