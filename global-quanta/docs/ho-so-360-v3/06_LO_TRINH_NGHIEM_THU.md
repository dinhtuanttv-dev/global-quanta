# 06 — Lộ trình, kiểm thử, nghiệm thu

## 1. Lộ trình

| Bước | Nội dung | Phạm vi | Deploy | Phụ thuộc |
|---|---|---|---|---|
| **P0** | **Sửa F1:** bảng E1 phải có đặc trưng dòng tiền của chính phiên. (a) Dựng bảng E1 sau khi `researchFlow` (16:00) xong, hoặc dựng lại khi đặc trưng phiên đó xuất hiện mà bảng còn thiếu `researchFeatures`; (b) cảnh báo trong nhật ký khi bảng còn thiếu dòng tiền lúc 17:30. Không dựng lại các phiên cũ (giữ đúng lịch sử đã ghi); chỉ ghi rõ trong tài liệu. | Gateway | railway up | — |
| H1 | Thanh đầu hợp nhất + mặc định mã (Q6) + gộp vị thế HL (F2, F3) | Giao diện | Vercel | — |
| H2 | Góc **Tín hiệu**: bảng 25 tín hiệu + SQS / xu hướng / IC chế độ + định dạng `kq_nowcast` / `camslim_cup` + khối Z đối chứng (F5, F8, F9) | Giao diện | Vercel | EV-4 (#405) |
| H3 | Ảnh chụp `GET /api/elite/profile/:ticker` (Q5) + phân vị ngành | Gateway + kiểm thử | railway up | P0 |
| H4 | Góc **Tổng quan**: thẻ Luận điểm + ma trận Lớp × Bằng chứng + biểu đồ giá 90 phiên (Q4, Q7); chuyển PA × KL (F6) | Giao diện | Vercel | H3 |
| H5 | Góc Doanh nghiệp: sửa nhãn nowcast (F7), so sánh ngành; Sự kiện: liên kết tab 1 | Giao diện | Vercel | H3 |

Mỗi bước một PR, merge và deploy theo câu cho phép đích danh của chủ dự án.

## 2. Kiểm thử bắt buộc mỗi PR

- `node --test backend/test/*.test.js` đạt toàn bộ; vitest toàn bộ; `tsc --noEmit`; `vite build`.
- **Vân tay Hồ sơ** (mới, như `EliteHlBoard.board-fingerprint`): ghi tệp nền từ main trước H1; mỗi PR chỉ được thay đúng danh sách testid khai báo trong PR.
- E2E bản build với Gateway thật, 1440 px và 390 px: không lỗi trang, không cuộn ngang, đủ testid cũ (trong DOM, kể cả trong khối thu gọn).
- P0: kiểm thử lịch — bảng dựng trước khi có đặc trưng phải được dựng lại khi đặc trưng xuất hiện; không dựng lại phiên đã đủ dữ liệu.
- Ảnh chụp H3: một nguồn lỗi → phần đó `null` + `missing`; tài liệu vẫn 200. Kiểm danh sách từ cấm trong mọi `textVi`.

## 3. Tiêu chí nghiệm thu

| # | Tiêu chí | Cách đo |
|---|---|---|
| A1 | Bảng E1 có dòng tiền ở ≥ 95% phiên sau P0 (trước: 1/10) | `/api/elite/panel?date=` 10 phiên liên tiếp |
| A2 | Mở tab 2 lần đầu không còn trạng thái "không nằm trong vũ trụ" | E2E |
| A3 | Vị thế Elite HL hiện đúng **1** lần ở góc Tổng quan | Đếm chuỗi trong DOM |
| A4 | Góc Tổng quan ≤ 1.100 px khi mọi khối chi tiết thu gọn (trước 2.509 px) | E2E 1440 px |
| A5 | 25 tín hiệu có SQS + xu hướng khi `evidence-evolution` sẵn sàng; định dạng `kq_nowcast` dạng % | Kiểm thử + E2E |
| A6 | Không mất `data-testid` nào ngoài danh sách khai báo | Vân tay |
| A7 | Góc Tổng quan dùng 1 yêu cầu hồ sơ (+ luồng giá) sau H3 | Đếm yêu cầu mạng |
| A8 | Không có từ cấm trong văn bản do code dựng | Kiểm thử |

## 4. Rủi ro và cách lùi

| Rủi ro | Giảm thiểu | Lùi |
|---|---|---|
| P0 dựng lại bảng E1 làm Elite HL phiên đó khác bản đã công bố | Chỉ dựng lại **trước** khi dựng quyết định của phiên (`publishEliteDecision`), hoặc chặn dựng quyết định tới khi có dòng tiền | Revert PR P0, `railway up` |
| Người dùng quen bố cục cũ | Khối cũ còn nguyên trong phần mở rộng; liên kết sâu `v=` | Revert PR giao diện |
| Ảnh chụp chậm khi Gateway mới khởi động | Bộ đệm theo phiên; giao diện vẫn dùng endpoint cũ khi ảnh chụp lỗi | Tắt bằng biến môi trường giao diện |
| Thẻ Luận điểm bị hiểu như lời khuyên | Mẫu câu cố định, từ cấm, nhãn "mô tả theo quy tắc" | — |

## 5. Ngoài phạm vi

- Đổi quy tắc Elite HL, bậc E2, trọng số E3 (cần đăng ký trước).
- Bộ lọc Elite (chế độ 🔎).
- Định giá (P/E, P/B mục tiêu) — cần nguồn dữ liệu và kiểm định riêng (đề án v1 §12).
