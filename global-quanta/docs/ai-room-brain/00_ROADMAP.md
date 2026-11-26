# Phòng họp AI — Bộ não của toàn dự án · Lộ trình M1–M5

Chốt ngày 27/11/2026 theo quyết định QĐ1–QĐ5 của chủ dự án. Lộ trình lập ngược từ kết quả mong muốn.

## Đích đến

1. **Thấy hết.** Mọi engine của dự án nằm trong một snapshot đúng thời điểm. Mỗi bằng chứng mang nhãn cấp độ ĐẠT / KHÔNG ĐẠT / THĂM DÒ.
2. **Nghĩ mỗi phiên.** Vòng nền tự chạy cho mọi mã trong phạm vi. Có chỉ số sức khoẻ và cảnh báo.
3. **Phán quyết đo được.** Gồm hướng, xác suất, kỳ hạn, điều kiện vô hiệu và cờ đỏ, ghi vào sổ trước khi biết kết quả.
4. **Tự học.** Có độ chuẩn xác của xác suất, đóng góp của từng engine, và cổng đăng ký trước.
5. **Quyền tác động có điều kiện.** Bộ não chỉ được làm phanh hoặc giảm tỷ trọng Elite HL, sau khi AR-r1 ĐẠT. Bộ não không bao giờ được tự thêm mã.

## Quyết định đã chốt

| QĐ | Nội dung |
|---|---|
| QĐ1 | **Gemini (hạn mức miễn phí) là làn chính cho cả ba vai.** GPT là dự phòng thứ nhất, Claude là dự phòng thứ hai. API của OpenAI không có bậc miễn phí. |
| QĐ2 | Phạm vi: mã lõi, hàng chờ và ứng viên (khoảng 25–30 mã). Bắt đầu với mã lõi, đo hạn mức Gemini thật, rồi mới mở rộng. |
| QĐ3 | Bộ não chỉ được làm phanh hoặc giảm tỷ trọng, và chỉ khi AR-r1 ĐẠT. Không được tự thêm mã. |
| QĐ4 | Nâng hợp đồng phán quyết lên claims-1.1: thêm hướng, xác suất, kỳ hạn, mức vô hiệu, cờ đỏ. |
| QĐ5 | Engine KHÔNG ĐẠT vẫn vào snapshot, có gắn nhãn cấp độ. Trọng tài phải cân theo nhãn. |

## Cột mốc

| Mốc | Kết quả | Trạng thái |
|---|---|---|
| M1 | Bộ não chạy thật: Gemini trả lời cả ba vai, làn dự phòng tự chuyển, chỉ số "x/y mã đủ ba vai" | PR M1 (27/11/2026) |
| M2 | Snapshot v2 thêm MTF3, KQKD/EPS, Sức mạnh dẫn dắt, MS-GARCH/Cash Gate, RRG ngành, truyền dẫn thế giới, tác động cổ phiếu, TO; tất cả có nhãn cấp độ | Chưa làm |
| M3 | claims-1.1, ARL-v2 (độ chuẩn xác, đóng góp engine), bản đăng ký trước AR-r1 commit **trước** khi tích dữ liệu | Chưa làm |
| M4 | Chấm AR-r1 đúng một lần (dự kiến cuối 02/2027) | Chờ đủ mẫu |
| M5 | Nối phán quyết vào cổng Elite HL (phanh / giảm tỷ trọng) nếu AR-r1 ĐẠT | Cần câu cho phép |

Ràng buộc đã chốt cho AR-r1:

- So sánh với **hai đối chứng**: (a) danh mục Elite HL; (b) một quy tắc tính điểm không dùng AI trên cùng bằng chứng.
- Giả thuyết chính là **vai phanh**: cờ đỏ của bộ não có tránh được mã thua hay không.
- Sai số chuẩn gộp theo mã.

## M1: chi tiết kỹ thuật

- `researchAutonomy.js` dùng `LANES = ["gemini", "claude"]` cho mọi vai.
  - Khi một làn bị giới hạn (429), hết tín dụng hoặc sai khoá: ngắt mạch làn đó và thử ngay làn kế tiếp trong cùng lượt.
  - Khi mọi làn đều ngắt: ghi hạn mở lại sớm nhất. Không tính vào số lần thử của vai.
  - Lỗi kiểm luận điểm vẫn tính lần thử như cũ.
- Bản ghi lưu `lanes` (vai nào do làn nào trả lời). `health()` trả `lanes` gồm số vai theo từng làn.
- `chatService.analyzeSealed(side, message, snapshot, lane)`:
  - Làn Gemini dùng schema bị giới hạn theo đúng snapshot, vai, mã và ref, áp dụng cho mọi vai.
  - Làn "claude" giữ nguyên thứ tự GPT trước, Claude sau.
- Giao diện có chip "Bộ não phiên này · x/y mã đủ ba vai". Nhãn làn hiển thị là "Gemini (làn chính)" và "Dự phòng GPT / Claude".
- Không đổi: hợp đồng claims-1.0, câu lệnh, sổ ARL-v1, phiên tranh luận tương tác do người dùng bấm.
