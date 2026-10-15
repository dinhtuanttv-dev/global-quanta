# Changelog

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
