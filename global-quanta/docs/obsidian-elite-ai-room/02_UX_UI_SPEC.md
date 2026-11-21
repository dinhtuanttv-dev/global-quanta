# 02 — Giao diện và khả năng tiếp cận (tab con 3 · Phòng họp AI)

## 1. Bố cục (giữ nguyên 3 vùng và thứ tự)

```
┌ Phòng họp AI ─────────────────────────────────────────────────────────────┐
│ Obsidian · Vault: (chưa chọn) · Global Quanta/Elite 10 [Cấu hình] [Gói khởi tạo] │  ← ObsidianBar (mới, 1 dòng)
│ · 2 kết quả chưa lưu — rời tab QUYẾT ĐỊNH sẽ mất                            │
├ TRANH LUẬN CÓ TRỌNG TÀI ─────────────────────────── [Lưu ▾] ──────────────┤
│  (giữ nguyên: ô mã · Bắt đầu/Dừng · 2 làn · trọng tài · ghi chú)          │
├ BẢN TIN PHIÊN ────────────────── [Tạo/Viết lại] [Lưu ▾] ──────────────────┤
├ HỎI ĐÁP ELITE 10 ─────────────────────────────── [Lưu cuộc trao đổi ▾] ───┤
└───────────────────────────────────────────────────────────────────────────┘
```

**Nội dung menu:**
- **Lưu ▾ của Tranh luận:** Xem trước… · Mở trong Obsidian · Tải .md · Sao chép Markdown · **Nhật ký quyết định** · **Tải Canvas**.
- **Lưu ▾ của Bản tin:** Xem trước… · Mở trong Obsidian · Tải .md · Sao chép Markdown.
- **Lưu cuộc trao đổi ▾:** Lượt cuối / Toàn bộ, mỗi lựa chọn đi với Mở trong Obsidian / Tải / Sao chép.

**Phân cấp:** nút Bắt đầu, Tạo và Gửi vẫn là nút chính. "Lưu" là nút phụ (viền mảnh, chữ `slate-200`).

## 2. Trạng thái (suy ra từ làn, không từ `phase`)

| Điều kiện | Huy hiệu chữ | Menu Lưu |
|---|---|---|
| Còn làn chưa `done` | "Đang chạy" | Khoá (`aria-disabled`, có lý do) |
| Mọi làn `done`, không `error`, có `text` | — | Mở |
| Có làn `error` (gồm "Đã dừng.") hoặc làn rỗng | "Dở dang" | Mở; ghi chú gắn `evidence_status: partial` |
| Có `fallback` | "Mô hình dự phòng" | Mở; `evidence_status: fallback` (nếu không dở dang) |
| Hai phe rỗng nên không có trọng tài | "Không có phán quyết" | Mở; ghi chú nói rõ |
| Chưa có kết quả | — | Ẩn |

## 3. Xem trước (hộp thoại)
- Dùng `<dialog>` gốc của trình duyệt, có `aria-labelledby`. Focus giữ bên trong, Escape để đóng, đóng xong focus trả về nút gọi.
- Hiển thị tên tệp, thư mục, và Markdown trong khung cuộn (`overflow-wrap:anywhere`; tệp xuất vẫn giữ nguyên văn).
- 3 công tắc: **Gồm câu hỏi của tôi** · **Gồm bằng chứng công cụ** · **Gồm liên kết**. Cả ba mặc định bật và được nhớ trong `localStorage` (bọc `try/catch`).

## 4. Phản hồi (một vùng `role="status"` riêng, đặt cạnh thanh Obsidian)

| Kết quả | Câu chữ |
|---|---|
| `uri-requested` | "Đã gửi yêu cầu mở Obsidian. Nếu Obsidian không mở, dùng Tải .md." |
| `uri-clipboard` | "Đã chép ghi chú và gửi yêu cầu mở Obsidian (nội dung dài). Nếu ghi chú trống, dán bằng Ctrl+V." |
| `clipboard-copied` | "Đã chép Markdown — dán vào một ghi chú mới." |
| `download-started` | "Đang tải tệp …md." |
| `clipboard-denied` | "Trình duyệt chặn bộ nhớ tạm — hãy dùng Tải .md." |
| `failed` | "Không xuất được ghi chú — hãy dùng Tải .md." |

**Không bao giờ** viết "Đã lưu vào Obsidian". Thông báo không được che ô nhập, nút Dừng hay khung trọng tài.

## 5. Cấu hình Vault
- Ô "Tên hoặc ID Vault": để trống thì Obsidian tự chọn Vault đang mở.
- Ô "Thư mục": mặc định `Global Quanta/Elite 10`.
- Kiểm hợp lệ: cắt khoảng trắng; tối đa 100 ký tự; cấm ký tự điều khiển, `..`, `\ : * ? " < > |`. Thư mục có thể có `/`.

## 6. Khả năng tiếp cận (áp cho mọi phần MỚI; mục tiêu WCAG 2.2 AA, chưa tuyên bố đạt)
- Menu theo mẫu nút bấm + danh sách: `aria-haspopup="menu"`, `aria-expanded`, `role="menu"` và `menuitem`. Điều khiển bằng mũi tên, Home/End, Enter/Space, Escape. Focus trả về nút gọi.
- Chữ ≥ 11px, tương phản ≥ 4,5:1 trên nền `#0E131F`: `slate-300`/`slate-200`; **không** dùng `slate-500`, vì chỉ đạt 3,90:1.
- Vùng bấm ≥ 32×32 px. Focus ring rõ, không bị ô nhập dính đáy che.
- Không dựa vào màu. Mọi trạng thái có chữ. Tôn trọng `prefers-reduced-motion`.
- Ở 390px: thanh Obsidian xuống dòng, nút Lưu thu còn biểu tượng có `aria-label`. Không có cuộn ngang.
- **Lỗi cũ không sửa trong đợt này** (backlog, ngoài phạm vi): vùng `aria-live` bao toàn bộ lịch sử Hỏi đáp; chữ ghi chú 10px `slate-500` (3,90:1); nhãn ô nhập "Câu hỏi về chất xúc tác hoặc vĩ mô" khi dùng ở Elite 10.

## 7. Đo hiệu quả
Chỉ kiểm tay và kiểm cục bộ (không thêm analytics):
- thời gian tìm được thao tác Lưu;
- tỷ lệ mở URI, chép và tải thành công;
- menu điều khiển được bằng bàn phím;
- không tràn ngang ở 390px;
- tìm được model, bằng chứng và `data_as_of` trong ghi chú.
