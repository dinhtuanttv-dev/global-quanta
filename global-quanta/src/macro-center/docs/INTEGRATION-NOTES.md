# Ghi chú tích hợp — Kết nối thế giới (gói macro-center 1.2), 2026-10-16

## 1. Điểm tích hợp

| Thành phần | Vị trí |
|---|---|
| Gói (TS thuần + UI) | `src/macro-center/` (chuyển từ `src/components/MainTabs/ChatXucTac/MacroCenter/`, vì gói giờ dùng chung cho 2 tab) |
| Đóng gói cho Gateway | `npm run bundle:macro` → `backend/src/market/macro/vendor/macroEngine.mjs` (gồm cả engine world) |
| Dữ liệu thật | `backend/src/market/world/worldData.js` (rổ ngành, nguồn, sự kiện thật, hàm dựng thuần), `worldService.js` (dựng tối đa 2 lần/ngày, lưu KV `world:data`) |
| Engine | `backend/src/market/world/worldCore.js`, chạy trong worker thread (`worldWorker.js`, proxy dùng chung `macro/workerProxy.js`) |
| API | `backend/src/routes/world.js`, gắn tại `/api/world/*` (8 route của gói, thêm `GET /source` và `POST /admin/refresh`) |
| Giao diện | Tab Kết nối thế giới → sub-tab **Truyền dẫn & bằng chứng**: `WorldSourcePanel` + `WorldTab` (theme tối, ẩn tiêu đề trùng) |

## 2. Baseline và kiểm thử

- Trước tích hợp: frontend 584/584, backend 355/355.
- Sau tích hợp: frontend 653/653, gồm toàn bộ test của gói **lần đầu chạy bằng Vitest thật**. Backend 362/362, gồm 7 test world mới. `tsc --noEmit` sạch.
- Hai test của gói hỏng khi chạy bằng Vitest thật, cả hai do môi trường, không do logic:
  1. Test token đọc CSS theo đường dẫn tương đối với thư mục chạy test; đã đổi sang đường dẫn tính từ gốc repo.
  2. Test HTTP dùng `macro-http` (không đưa vào repo); đã thay bằng fetch trong tiến trình, vẫn đi qua `api.handle`.

## 3. Giả định của tài liệu bàn giao — kết quả xác minh

| Giả định | Kết quả |
|---|---|
| React + Vite + TS, Vitest | Đúng |
| Backend là API riêng, chạy host khác | Đúng: Gateway (Railway) |
| Có tab Kết nối thế giới sẵn | Đúng. Tab đang có Risk-On, chỉ số thế giới (SSE), ngành Mỹ, hàng hoá, phân tích AI Gemini, bảng tác động AI. Tất cả lấy từ Project A |
| Kho SQLite `node:sqlite` | Không dùng được (Gateway chạy Node 20, Vercel FS chỉ đọc). Dùng `InMemoryVintageStore` nạp từ KV |
| Xác thực API | Route đọc để công khai (chỉ tính toán trên số liệu thị trường công bố, không có dữ liệu người dùng). Có giới hạn tần suất theo IP; route nặng có hạn mức riêng. Dựng lại dữ liệu cần token admin |

## 4. Trùng lặp và quyết định

- Nhịp đập thị trường (SSE, giá thời gian thực) và WorldPulse (độ lệch chuẩn của yếu tố tháng) đo hai thứ khác nhau → **giữ cả hai**.
- Bảng tác động AI (Gemini, ESTIMATED) và ma trận world (thống kê, bậc A/B/C) cũng khác bản chất → **giữ cả hai**. Bảng AI giờ có cảnh báo khi đã cũ quá 3 ngày; bản hiện tại tạo ngày 17/09/2026.
- Không xoá chức năng nào của tab cũ.

## 5. Dữ liệu (thật hay mô phỏng)

**Dữ liệu thật:**
- Lịch phiên HOSE và VN-Index lấy từ Gateway.
- 10 ngành là rổ cân bằng tỷ trọng, dùng giá điều chỉnh cộng dồn theo sự kiện quyền, lịch sử 6 năm.
- Thị trường Mỹ (S&P 500), Trung Quốc, Nhật, Hàn lấy từ Yahoo.
  - Riêng **Thái Lan dùng ETF THD** (USD, giao dịch giờ Mỹ) vì Yahoo không có lịch sử SET.
  - Mỹ và THD lấy phiên ngày trước, vì sàn đóng cửa sau giờ VN.
- Yếu tố tháng:
  - FED, Brent: FRED;
  - DXY, CNY, thép HRC (Mỹ), bán dẫn SOX, VIX, MSCI EM (ETF EEM): Yahoo.
- Sự kiện thật đã kiểm duyệt:
  - 32 phiên FOMC 2023–2026, giờ công bố 14:00 ET theo mùa;
  - Mỹ công bố thuế đối ứng 02/04/2025;
  - Mỹ hoãn thuế đối ứng 09/04/2025;
  - FTSE Russell nâng hạng Việt Nam 07/10/2025.

**Không có nguồn mở, không bịa:**
- Cước container, PMI Trung Quốc và PMI Mỹ, dòng vốn EM, chỉ số bất định thương mại.
- Phơi nhiễm doanh thu theo vùng của từng cổ phiếu (cần BCTC có `sourceRef`). Vì vậy hồ sơ cổ phiếu trả 422 kèm lý do.

**Kết quả đầu tiên trên số liệu thật (chạy thử 16/10/2026), ghi như phát hiện:**
- Chỉ số lan truyền tổng khoảng 41%. VN nhận lan truyền nhiều nhất từ Trung Quốc rồi Mỹ.
- Toàn bộ event study ở **bậc C** (không đạt sau hiệu chỉnh BY).
  - Thuế đối ứng: CAR ngành Cảng −10,4%, q = 0,29.
  - Lệnh hoãn thuế: cửa sổ [−1, +3] chứa cả phiên giảm 09/04, nên CAR âm. Đây là chồng lấn cửa sổ, một giới hạn đã nêu ở SPEC mục 10.6.

## 6. Rủi ro và việc tiếp theo

1. **Lần dựng đầu cần tải lịch sử 6 năm cho khoảng 75 mã**, trong khi ngân sách chung chỉ 40 lần/giờ. Job tự dừng khi gặp 503 và thử lại sau khoảng 1 giờ. Chỉ dùng bản dựng **đủ cả 10 ngành**; bản thiếu sẽ tạo chuỗi 0 và cho kết quả giả. Trong lúc chờ, tab ở chế độ mô phỏng và có biểu ngữ.
2. Ngưỡng kiểm định ngoài mẫu cho bậc A do tác giả gói chọn, chưa hiệu chỉnh trên dữ liệu thật.
3. Chưa nối công cụ chat `world_*` vào "Hỏi đáp xúc tác" (Giai đoạn 5 chỉ làm khi người dùng yêu cầu).
4. Không đưa tín hiệu world vào bộ máy quyết định (Giai đoạn 6).
