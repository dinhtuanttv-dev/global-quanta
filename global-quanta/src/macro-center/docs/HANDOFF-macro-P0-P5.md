# Trung tâm vĩ mô — bàn giao v1.1

Phiên bản 1.1.0, 2026-10-12. 131 test (10 bộ) đạt; `tsc --strict` sạch cho toàn bộ TypeScript/TSX. Xem `README.md` để chạy thử nhanh; xem `docs/INTEGRATION-chat-xuc-tac.md` để tích hợp vào tab chat.

## 1. Phạm vi đã hoàn thành

| Mảng | Nội dung | File chính |
|---|---|---|
| Dữ liệu | Danh mục 18 chuỗi (12 biến vĩ mô, 6 chỉ số HOSE); kho vintage theo `asOf` (bộ nhớ và SQLite bền vững); nạp CSV kiểu Việt Nam; kiểm tra chất lượng; DDL | `macro-data.ts`, `macro-store-sqlite.ts`, `macro-import.ts` |
| Lõi thống kê | ADF, KPSS, Zivot-Andrews, Engle-Granger; OLS-QR + HAC; FDR (BY/BH/Holm); ma trận tác động; rolling beta, Chow, Granger, bootstrap; MacroScore ngoài mẫu | `quant-macro.ts` |
| Chế độ vĩ mô | HMM Gauss (Baum-Welch, Viterbi, lọc forward); độ nhạy theo chế độ (mô hình tương tác, Wald HAC) | `macro-regime.ts` |
| Phân tích ứng dụng | Kịch bản (local projections), cảnh báo, lịch công bố ước tính, nhiệt kế, backtest có cổng kiểm định, báo cáo tháng Markdown | `macro-scenario.ts`, `macro-backtest.ts`, `macro-report.ts` |
| API | 11 route, validation, cache theo phiên bản dữ liệu, adapter HTTP, client | `macro-api.ts`, `macro-http.ts`, `macro-client.ts` |
| Giao diện | Nhiệt kế, bộ lọc, ma trận, chi tiết ô, kịch bản, lịch, cảnh báo; CSS riêng | `macro-filter.ts`, `src/ui/*` |
| Chat | 6 tool cho LLM, bộ thực thi gọn và trung thực, system prompt, adapter Anthropic/OpenAI | `macro-chat-tools.ts` |
| Vận hành | `serve`, `import`, `report`, `sample-csv`, `validate:montecarlo`, `preview` | `scripts/*`, `package.json` |

## 2. API

| Route | Việc |
|---|---|
| `GET /api/macro/health` | Phiên bản dữ liệu, thống kê cache |
| `GET /api/macro/series` | Danh mục, số quan sát, vấn đề chất lượng, danh sách kịch bản |
| `POST /api/macro/impact` | Ma trận tác động đầy đủ (mọi độ trễ), q-value, độ ổn định, cảnh báo phương pháp |
| `POST /api/macro/cell` | Hệ số trượt và khoảng tin cậy bootstrap cho một ô |
| `POST /api/macro/regime-impact` | Hệ số theo từng chế độ vĩ mô và kiểm định bằng nhau |
| `POST /api/macro/scenario` | Kịch bản có tên hoặc tuỳ chỉnh; đường đáp ứng và xếp hạng thắng/thua |
| `POST /api/macro/score` | Nhiệt kế, chuỗi MacroScore, backtest, cờ `usableForDecisions` |
| `GET /api/macro/regime` | Chế độ vĩ mô (xác suất lọc, an toàn thời gian thực) |
| `GET /api/macro/alerts`, `GET /api/macro/calendar` | Cảnh báo; lịch công bố ước tính |
| `GET /api/macro/report` | Báo cáo tháng dạng Markdown |

Mọi route nhận `asOf` (YYYY-MM-DD) để tái hiện đúng những gì đã biết tại ngày đó. Mã không có trong danh mục trả 400; thiếu dữ liệu trả 422.

## 3. Kết quả kiểm chứng

| Hạng mục | Kết quả |
|---|---|
| Test | 36 + 19 + 8 + 16 + 11 + 6 + 7 + 8 + 9 + 11 = 131 đạt |
| Kích thước kiểm định ADF (Monte Carlo, T=200, mức 5%) | 4,5% / 4,5% / 4,8% (không hằng / hằng số / hằng số + xu hướng) |
| Khôi phục hiệu ứng cài sẵn (dữ liệu mô phỏng) | CPI→VN-Index −3,48 (thật −3,0); M2→Smallcap 1,70 (1,8); IR −1,89 (−2,0); 0 dương tính giả trong 7 biến không liên quan |
| Cổng backtest trên nhiễu thuần | Tỷ lệ lọt cổng dưới 15% trong 24 lần thử |
| Độ nhạy theo chế độ | Phát hiện đổi dấu cài sẵn (p < 1e-6); dương tính giả dưới 15% khi hiệu ứng không đổi |
| Không look-ahead | Có test cho MacroScore, xác suất lọc HMM, z-score mở rộng, và truy vấn `asOf` |
| Kho SQLite | Cho kết quả giống hệt kho bộ nhớ dưới 400 thao tác ngẫu nhiên; bền vững qua mở lại; giao dịch nguyên tử |
| Giao diện | Chụp bằng trình duyệt thật ở 1200px và 390px, không tràn ngang (`docs/preview-*.png`) |
| Gói .zip | Giải nén vào thư mục sạch và chạy lại toàn bộ test, đạt 131/131 |

Trong quá trình kiểm chứng đã phát hiện và sửa: MAIC chọn độ trễ quá dài làm mất công suất (mặc định đổi sang BIC); rò rỉ nhẹ trong mẫu của MacroScore (nay hoàn toàn ngoài mẫu); kiểm tra chất lượng gắn nhãn sai với chuỗi bậc thang; tràn ngang trên điện thoại.

## 4. Giới hạn (không che giấu)

1. **Chưa chạy bằng Vitest thật.** Môi trường tạo gói không có mạng; test chạy qua lớp shim `describe/it/expect` tối giản. Chạy `npm install && npm test` ở repo của bạn để xác nhận. Kho SQLite dùng `node:sqlite` (Node ≥ 22.5, còn ở trạng thái thử nghiệm).
2. **Dịch vụ Python (`python/macro_service.py`) chưa được thực thi** (không có statsmodels); mới kiểm tra cú pháp. Là bản nháp để rà soát; engine TypeScript không phụ thuộc vào nó.
3. **Dữ liệu demo là mô phỏng.** Độ trễ công bố (`pubLagMonths`) và ngày công bố điển hình trong danh mục là mặc định cần đối chiếu từng nguồn; ngày trên lịch là ƯỚC TÍNH và được ghi rõ như vậy. Chưa từng chạy với số liệu thật của GSO/NHNN/HOSE, nên chưa biết các dấu của bài báo 2015 còn đúng hay không.
4. **Giao diện chưa chạy trong trình duyệt với API sống.** Đã kiểm tra bằng render phía server và ảnh chụp từ dữ liệu API thật; các hook gọi API (`useAsync`) chưa được thử trong trình duyệt. Chưa có chế độ tối; phông Be Vietnam Pro tải từ Google Fonts.
5. **API không có xác thực hay giới hạn tần suất.** Đặt sau lớp xác thực của ứng dụng. Cache nằm trong bộ nhớ một tiến trình.
6. **Ngưỡng cổng backtest** (IC ≥ 0,05; p ≤ 0,10; thắng mô hình ngây thơ; đúng hướng > 50%) là lựa chọn của người viết, chưa được hiệu chỉnh bằng dữ liệu thật; chưa hiệu chỉnh bội giữa các chỉ số. Chi phí giao dịch mặc định 10 bps, chưa tính lãi suất phi rủi ro. Điểm mặc định dùng sáu biến của bài gốc (cố định từ trước, không chọn theo dữ liệu).
7. **Kịch bản** dùng local projections, công suất thấp khi nhiễu lớn; khoảng tin cậy 90% có thể chứa 0. Giao diện đánh dấu chấm rỗng và "?" cho trường hợp đó.
8. **HMM** chỉ dùng ba đặc trưng (lãi suất, CPI, tăng trưởng M2 so cùng kỳ) và được ước lượng trên toàn mẫu; độ nhạy theo chế độ mang tính mô tả và chưa được đưa vào MacroScore.
9. Chuỗi dừng quanh xu hướng được xử lý bằng sai phân (an toàn, không look-ahead) thay vì khử xu hướng.
10. Báo cáo chỉ xuất Markdown; chuyển sang PDF/DOCX bằng công cụ bên ngoài.

## 5. Chưa làm

- Gắn độ nhạy vĩ mô vào RRG hiện có, độ nhạy theo ngành/mã: cần mã nguồn RRG và dữ liệu chỉ số ngành của bạn. Engine đã xử lý được chỉ số ngành như thêm một `target` vào danh mục.
- Nowcasting; event study và surprise score trên dữ liệu thật (có sẵn `surpriseZ` và `surpriseReaction` nhưng chưa có nguồn consensus).
- Bộ kết nối tự động tới GSO/NHNN/HOSE và ETL theo lịch.
- Cache dùng chung giữa nhiều tiến trình.

## 6. Việc nên làm tiếp (theo thứ tự)

1. `npm install && npm test && npm run typecheck` ở môi trường thật.
2. Nạp dữ liệu thật của 6 biến gốc và 6 chỉ số bằng `npm run import`; xem cột `issues` của `GET /api/macro/series`.
3. So kết quả `impact` với bài báo 2015; kỳ vọng nhiều dấu sẽ khác.
4. Đối chiếu `pubLagMonths` theo từng nguồn rồi mới mở rộng sang các biến bổ sung.
5. Chỉ bật `MacroScore` vào bộ máy quyết định khi cổng backtest đạt trên dữ liệu thật.
6. Thêm xác thực, rồi chạy thử `MacroCenterTab` trong ứng dụng thật.
