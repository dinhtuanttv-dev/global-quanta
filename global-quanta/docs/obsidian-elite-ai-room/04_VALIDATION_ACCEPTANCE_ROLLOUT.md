# 04 — Kiểm định, nghiệm thu và lộ trình

## 1. Ma trận kiểm định

| Nhóm | Trường hợp | Kết quả cần đạt |
|---|---|---|
| YAML | Dấu nháy, `:`, `#`, xuống dòng, emoji, tiếng Việt, ký tự điều khiển, `---` trong chuỗi | Frontmatter đọc được (kiểm bằng bộ đọc YAML đơn giản trong test); không chèn được khoá lạ |
| Nguyên văn | `\r\n`, Markdown phức tạp, khối mã, `[[...]]` có sẵn trong lời AI | `lane.text` xuất hiện nguyên vẹn; không chèn liên kết vào bên trong |
| Trạng thái | Đang chạy · xong · Dừng giữa chừng (`"Đã dừng."`) · làn rỗng · không có trọng tài · dự phòng | `evidence_status` và các dòng giới hạn đúng (03 §2) |
| Model | `lane.model` có hoặc thiếu; nhãn khác model thật | Frontmatter lấy `lane.model` (thiếu thì `null`), không lấy nhãn |
| Cắt 6.000 | Một phe dài 7.000 ký tự | `judge_input_clipped: true` + một dòng giới hạn |
| Allowlist | Kết quả công cụ có trường lạ hoặc object lớn | Chỉ trường thuộc 01 §2; có dòng "đã lược dữ liệu thô" |
| Wikilink | Mã hợp lệ/không hợp lệ, ngành có/không có tên, không có công cụ vĩ mô | Chỉ thực thể có nguồn; tên nút được làm sạch |
| Tên tệp | Ký tự cấm, `..`, thư mục có `/`, Unicode | An toàn, luôn mới, đúng mẫu |
| URI | Ngắn/dài, có/không Vault, thư mục `A/B` | Đúng encode (`%2F`, `%20`); vượt `URI_MAX` thì chuyển sang chế độ `clipboard`; không có `append/overwrite` |
| Hậu kiểm | Qua Tết, qua 30/4–1/5, qua cuối tuần | `review_*` đúng theo lịch giao dịch VN |
| Canvas | Cấu trúc JSON | Khớp JSON Canvas 1.0: `id` duy nhất, toạ độ nguyên, cạnh trỏ đúng `id` |
| Adapter | Clipboard bị chặn hoặc không có; tải tệp; storage bị chặn | Trả đúng `ExportResult`; không ném lỗi ra ngoài |
| **0 request** | Chạy mọi builder và adapter với `fetch / XMLHttpRequest / sendBeacon / WebSocket` bị giả lập | **0 lần gọi** |
| Giao diện (O2/O3) | 1440 · 390 · bàn phím · NVDA · axe-core | Không phá 3 vùng; không tràn ngang; menu và hộp thoại điều khiển được bằng bàn phím |

## 2. Năm cổng chứng minh (đều phải đạt trước mỗi lần merge)

1. **Không gỡ bỏ.** Script so diff với `origin/main`:
   - mọi tệp ngoài allowlist (01 §4) có **0 dòng thay đổi**;
   - ở 2 tệp "chỉ thêm", mọi dòng bị xoá phải xuất hiện nguyên văn trong dòng thay thế (chỉ được bọc);
   - script in bảng kết quả kèm PR.
2. **Test cũ không sửa vẫn xanh:** `EliteAiRoom.test.tsx`, `CatalystChatPanel.test.tsx` và toàn bộ bộ test giao diện (baseline 1476 test).
3. **0 request** (mục 1).
4. **Nguyên văn:** mỗi ghi chú chứa đúng `lane.text` của mọi làn; số công cụ, số `untraceable` và cờ `fallback` khớp.
5. **Hạn mức không đổi:** xuất ghi chú không làm giảm `meta.remaining`, vì không gọi dịch vụ chat.

Chỉ khi 5 cổng đều đạt mới được ghi "mã nguồn cũ được bảo toàn" trong PR, và chỉ trong phạm vi đã kiểm.

## 3. Tiêu chí nghiệm thu

**Chức năng**
1. Xuất được Tranh luận, Bản tin, Hỏi đáp (lượt cuối / toàn bộ), Nhật ký quyết định và Canvas đúng nội dung đang hiển thị.
2. Frontmatter đúng schema 1; mọi trường thiếu nguồn đều là `null`.
3. URI, chép, tải tệp và cấu hình Vault đều chạy; câu chữ phản hồi đúng 02 §4.
4. Không tự lưu, không tự gửi, không ghi nội dung ghi chú vào storage.

**Giao diện**
1. Giữ 3 vùng và thứ tự; "Lưu" là hành động phụ.
2. Đạt mọi yêu cầu ở 02 §6 cho phần mới. Không tuyên bố đạt WCAG trước khi có bằng chứng.

**Obsidian thật** (kiểm tay sau O3, trên Windows)
1. URI mở đúng Vault và đúng thư mục.
2. Bảng Dataview hiện đủ.
3. Graph view có nút mã và ngành.
4. Canvas mở được.
5. Ô hậu kiểm hiện trong ghi chú.

## 4. Lộ trình (chỉ giao diện: mỗi PR một lần build Vercel, không deploy Railway)

| PR | Nội dung | Cổng |
|---|---|---|
| **O1** | `src/lib/obsidian/*` (hàm thuần + adapter) + test + đặc tả v2. **Chưa có giao diện**: không tệp nào đang chạy import thư viện mới | 1–4 (cổng 5 không áp dụng) |
| **O2** | Thanh Obsidian + menu Lưu của Tranh luận và Bản tin + bản vết trong `EliteAiRoom` | 1–5 + E2E 1440/390 |
| **O3** | Hỏi đáp (React context `QaTapContext`, chỉ chèn 5 dòng vào `CatalystChatPanel`) + Nhật ký quyết định + Canvas + Bộ khởi tạo | 1–5 + tab Chat xúc tác không đổi |

**Quay lui:**
- O1 không có tệp nào import nên không ảnh hưởng ứng dụng.
- O2/O3: hoàn nguyên PR là xong, vì không có dữ liệu hay cấu hình nào cần dọn.

## 5. Backlog (ngoài phạm vi, cần duyệt riêng)
- `aria-live` bao toàn bộ lịch sử trong `CatalystChatPanel`.
- Chữ 10px `slate-500` (3,90:1) trong Phòng họp.
- Nhãn ô nhập dùng sai ngữ cảnh khi ở Elite 10.
- Kiểm mã chủ đề tranh luận với danh sách mã thật.
- Tự lấy giá để điền `outcome_*` (sẽ thêm request tới Gateway, cần duyệt riêng).
