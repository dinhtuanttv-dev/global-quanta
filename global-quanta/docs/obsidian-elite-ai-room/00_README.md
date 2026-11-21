# Bàn nghiên cứu Obsidian · Phòng họp AI Elite 10 — đặc tả v2

**Phiên bản:** v2, ngày 21/11/2026.
- Thay v1 cùng ngày. Bản v1 được lưu ở `C:\Users\HP\Ho-so-360-v2\obsidian-spec-v1-backup\`.
- Bản thẩm định là tệp `Ho-so-360-v2/23`, giải pháp là tệp `24`.

**Baseline mã nguồn:** `origin/main @ 3f640830`.
- Không dùng checkout `global-quanta-react_1` (HEAD `dd93fb32`), vì checkout này chậm 299 commit.
- Mọi việc triển khai làm trên **worktree tạo từ `origin/main`**.

**Phạm vi:** chỉ tab QUYẾT ĐỊNH › **3. Phòng họp AI**.

## Mục tiêu
Phòng họp AI trở thành đầu vào của một **kho tri thức đầu tư trong Obsidian**, gồm 4 lớp:

| Lớp | Nội dung |
|---|---|
| L1 · Ghi chú chuẩn | Tranh luận · Bản tin phiên · Hỏi đáp · **Nhật ký quyết định** (Markdown + frontmatter Dataview) |
| L2 · Mạng tri thức | Wikilinks lấy từ **dữ liệu công cụ có cấu trúc**: mã, ngành ICB, chủ đề vĩ mô |
| L3 · Bộ khởi tạo Vault | Ghi chú "Bàn điều khiển Elite 10" (truy vấn Dataview) + 3 mẫu ghi chú (Mã, Ngành, Vĩ mô) |
| L4 · Hậu kiểm | Mốc xem lại **+5, +10, +20 phiên** theo lịch giao dịch Việt Nam; bản đồ **Canvas** (JSON Canvas 1.0) |

## Ràng buộc bất biến (chủ dự án, 21/11/2026)
1. **Không gỡ bỏ bất kỳ mã nguồn nào.** Mã mới nằm trong `src/lib/obsidian/` và `src/components/elite10/center/obsidian/`. Hai tệp cũ chỉ được **thêm** mã, xem 01 §4.
2. Không đổi logic AI, câu lệnh gửi AI, công cụ, luồng SSE, `laneReducer`, `LaneView`, API, backend, Gateway hay cấu hình.
3. **0 request mới**: không route, cron, lưu trữ máy chủ hay analytics mới. Xuất ghi chú chỉ chạy khi người dùng bấm.
4. Giữ 3 vùng và thứ tự: Tranh luận → Bản tin phiên → Hỏi đáp Elite 10.
5. Không tuyên bố "bảo toàn" bằng lời. Chỉ tuyên bố khi **5 cổng chứng minh** ở 04 §2 đều đạt, và chỉ trong phạm vi đã kiểm.

## Quyết định đã chốt (21/11/2026)
- Duyệt giải pháp 4 lớp và phạm vi tệp (01 §4).
- Thư mục mặc định trong Vault: `Global Quanta/Elite 10`.
- Mốc hậu kiểm: **+5, +10 và +20 phiên**. Ba mốc nằm trong một hằng số cấu hình duy nhất.
- **Không sửa** `laneReducer`. Thay vào đó dùng **bản vết song song** trong `EliteAiRoom` (01 §3).
- **Không sửa** lỗi `aria-live` và độ tương phản cũ của `CatalystChatPanel` (dùng chung với tab Chat xúc tác) trong đợt này. Hai lỗi này được ghi vào backlog; mọi giao diện **mới** tự đạt chuẩn.

## Trạng thái triển khai (21/11/2026)

| PR | Nội dung | Trạng thái |
|---|---|---|
| O1 #376 | Thư viện `src/lib/obsidian/` + đặc tả v2 | Đã merge (`71a1c47f`) |
| O2 #377 | Thanh Obsidian + menu Lưu cho Tranh luận và Bản tin + bản vết song song | Đã merge (`97f4f344`); E2E production 1440/390 đạt |
| O3 | Hỏi đáp (context `QaTapContext`), Nhật ký quyết định, Canvas, Gói khởi tạo Vault | Xem PR O3 |

**Mã có từ trước Obsidian** (so với `3f640830`): `EliteAiRoom.tsx` và `CatalystChatPanel.tsx` **chỉ chèn dòng, 0 dòng sửa hoặc xoá**.

## Bộ tài liệu
- [01 — Hiện trạng và kiến trúc](01_CURRENT_STATE_AND_ARCHITECTURE.md)
- [02 — Giao diện và khả năng tiếp cận](02_UX_UI_SPEC.md)
- [03 — Ghi chú, Obsidian URI, Canvas, Bộ khởi tạo](03_OBSIDIAN_EXPORT_SPEC.md)
- [04 — Kiểm định, nghiệm thu, lộ trình](04_VALIDATION_ACCEPTANCE_ROLLOUT.md)
