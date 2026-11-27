# Tab TỔNG QUAN — nâng cấp giao diện U0–U5

Chốt ngày 27/11/2026. Mục tiêu là giao diện kiểu "terminal tài chính trầm", nhìn ra tay chuyên gia làm, không mang dấu vết AI. Nguyên tắc xuyên suốt: chỉ đổi giao diện và khung bảng, mọi tính năng và mã nguồn được giữ 100%.

## Quyết định

1. **Nguồn component.** Nền là shadcn/ui + Radix (giấy phép MIT). Component từ 21st.dev chỉ dùng chọn lọc, sau khi đã kiểm bản quyền từng mục. Không dùng chức năng sinh giao diện bằng AI. Mỗi component lấy từ bên thứ ba được ghi vào `docs/ui/THIRD_PARTY.md`.
2. **Màu nhấn: xanh dương** `#4f8ef7` (đậm hơn: `#79a8ff`). Thay vàng Quanta trong phạm vi tab TỔNG QUAN.
   - Màu giá giữ đúng quy ước bảng điện Việt Nam: trần tím, sàn xanh lơ, tham chiếu vàng, tăng xanh lá, giảm đỏ.
3. **Hướng thẩm mỹ.** Nền tối, viền nhạt, không gradient và không phát sáng. Tiêu đề màu trung tính, nhãn nhóm cột viết thường (sentence case). Badge viền mảnh có chấm màu.
4. **Font.** Tiêu đề và chữ thường dùng Inter. Số liệu dùng IBM Plex Mono (tabular).
5. **Nhịp làm.** PR đầu gộp U0 và U1. Từ U2 đến U5, mỗi bước một PR, duyệt qua link preview trước khi merge.

## Các bước

| PR | Nội dung | Trạng thái |
|---|---|---|
| U0+U1 | Token `@theme` (q-*) và biến CSS `--ov-*`. Token hoá toàn bộ tab con Bảng giao dịch: bảng Siêu Quét, Bảng giá, thanh lệnh, popover ngành, tab con, dải VN-Index | PR này |
| U2 | Radix Tabs/ToggleGroup/Popover/Tooltip cho thanh lệnh và tab con; tooltip thay `title=` | Chưa làm |
| U3 | Bảng: khung phân tích khối lượng khi mở dòng (VolumeAnalysisPanel, IntentFootprint, IntradayCycle) theo token | Chưa làm |
| U4 | Tab Thị trường: Trung tâm thị trường và Trạng thái thị trường theo token, Card chung, khung chờ tải | Chưa làm |
| U5 | Trạng thái trống/lỗi/đang tải, giảm chuyển động, kiểm điện thoại, axe | Chưa làm |

## Bảo toàn

- Không đổi logic, dữ liệu, sắp xếp, luồng realtime hay `data-testid`.
- `priceColor` giữ nguyên mã màu, vì bài kiểm khoá cứng các mã này.
- Ký tự "▾" của nút lọc ngành giữ nguyên, vì bài kiểm khoá chuỗi này.
- Ảnh đối chiếu trước/sau chụp ở 1440px và 390px trên bản build production.
- Thanh điều hướng chính của toàn trang (pill vàng "TỔNG QUAN") nằm ngoài phạm vi. Muốn đổi màu nhấn cho cả trang thì cần quyết định riêng.
