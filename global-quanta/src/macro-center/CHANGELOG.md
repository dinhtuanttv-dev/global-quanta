# Changelog

## 1.3.0-gq — 2026-10-16 (rà soát chuyên sâu Kết nối thế giới, W1–W7)
- W1: Risk-On Index kiểm định đặt trước 10 năm (Gateway `riskOnValidation/`): IC +0,049, KTC95 [−0,10; +0,22] → KHÔNG ĐẠT; nhãn heuristic, bị loại khỏi quyết định Lọc ngành (Project A #27).
- W2: 8 rổ ngành dùng chỉ số ICB toàn ngành của Gateway từ 2022-02 (giảm thiên lệch sống sót); đoạn trước + Thuỷ sản/Dệt may vẫn là rổ, gắn cờ.
- W3: cổng xác nhận đặt trước 12 cặp (`world-confirmatory.ts`, `GET /api/world/confirmatory`, `docs/WORLD-W3-*`): 0/12 đạt; tín hiệu ngành chỉ lấy cặp đã xác nhận.
- W4: TARIFF ← FRED EPUTRADE, PMI_US ← Philly Fed (proxy). PMI_CN/CONTAINER/EM_FLOWS vẫn chưa có nguồn mở.
- W5: event study với ngành định trước, kiểm chiều, cờ trùng cửa sổ, BMP bỏ trùng + quy chiều; thêm PBoC 24/09/2024 và Geneva 12/05/2025 (`docs/WORLD-W5-results.md`).
- W6/W7: `GET /api/world/pulse` (một nguồn có ngày cho giá ngày, dự phòng Project A); ẩn hồ sơ cổ phiếu khi chưa có dữ liệu phơi nhiễm; quy tắc ưu tiên heuristic ↔ bằng chứng; công cụ chat `world_confirmatory`.

## 1.2.0-gq — 2026-10-16 (Kết nối thế giới)
- Đưa module world của gói 1.2 vào repo; gói chuyển tới `src/macro-center/` (dùng chung 2 tab). Lõi `quant-macro` lên 1.2 (quy tắc phân xử ADF/KPSS cho chuỗi dai dẳng).
- Dữ liệu THẬT: 6 thị trường, 10 rổ ngành (giá điều chỉnh, 6 năm), 8 yếu tố tháng (FRED/Yahoo), 35 sự kiện thật đã kiểm duyệt; yếu tố không có nguồn mở để trống.
- Engine world chạy trong worker thread trên Gateway (`/api/world/*`); UI nhúng trong tab Kết nối thế giới (theme tối, không tải Google Fonts).
- Test của gói lần đầu chạy bằng Vitest thật: sửa 2 lỗi môi trường (đường dẫn CSS, adapter HTTP).

## 1.2.0-gq — 2026-10-16 (bản tích hợp Global Quanta)
- Số liệu thật tự động: FED, Brent (FRED), DXY, USD/VND (Yahoo) + chỉ số HOSE từ Gateway; loại chuỗi ngừng cập nhật.
- Giao diện: nguồn & chất lượng dữ liệu, chế độ vĩ mô (HMM) + độ nhạy theo chế độ, báo cáo tháng (trước đây API có nhưng UI chưa hiển thị).
- Báo cáo tháng: câu kết luận cổng MacroScore luôn kèm lưu ý chỉ tham khảo / mô phỏng.
- Gỡ phần không dùng trong ứng dụng: kho SQLite (`node:sqlite` không có trên Gateway Node 20), adapter HTTP và CLI (`scripts/`), bản nháp Python, CSV mô phỏng mẫu, ảnh preview, package.json/tsconfig riêng. Bản gốc vẫn ở `C:\Users\HP\macro-center`.

## 1.1.0 — 2026-10-12
- Lớp công cụ cho chat (`macro-chat-tools.ts`): 6 tool (tổng quan, tra cứu tác động, kịch bản, chi tiết ô, lịch và cảnh báo, báo cáo), kiểm tra tham số, kết quả gọn kèm `guidance` trung thực, adapter Anthropic/OpenAI, system prompt tiếng Việt.
- Tài liệu bàn giao tích hợp cho AI: `docs/INTEGRATION-chat-xuc-tac.md`.
- 131 test (thêm 11).

## 1.0.0 — 2026-10-12
Bản phát hành đầu tiên của Trung tâm vĩ mô.

### Lõi thống kê
- Chẩn đoán chuỗi: ADF (giá trị tới hạn MacKinnon 2010), KPSS, Zivot-Andrews, Engle-Granger; xử lý chuỗi dừng quanh xu hướng bằng sai phân.
- OLS bằng QR Householder, sai số chuẩn HAC Newey-West, hiệu chỉnh kiểm định bội BY/BH/Holm.
- Rolling beta, Chow, Granger, bootstrap dừng, MacroScore ngoài mẫu (co rút empirical-Bayes).
- HMM Gauss (Baum-Welch, Viterbi, lọc forward) và độ nhạy theo chế độ (mô hình tương tác, Wald HAC).
- Local projections cho kịch bản; backtest walk-forward có cổng kiểm định.

### Dữ liệu
- Danh mục 18 chuỗi, kho vintage theo `asOf`, kho SQLite bền vững (`node:sqlite`), nạp CSV kiểu Việt Nam, kiểm tra chất lượng (chịu được chuỗi bậc thang).

### API và giao diện
- 11 route `/api/macro/*`, adapter HTTP, cache theo phiên bản dữ liệu, báo cáo tháng Markdown.
- Giao diện React: nhiệt kế, ma trận tác động, bộ lọc, chi tiết ô, kịch bản, lịch, cảnh báo.

### Công cụ
- `serve`, `import`, `report`, `sample-csv`, `validate:montecarlo`, `preview`.
- 120 test Vitest.
