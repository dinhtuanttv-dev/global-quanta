# 05 — Giao diện

Chuẩn: **QUANTA UI** (`src/styles/quanta-ui.css`, `.q-ui` trên `#main-tab-panel`) — màu nhấn xanh `--q-accent #4f8ef7` cho trạng thái chọn; vàng chỉ cho cảnh báo; xanh lá / đỏ chỉ cho chiều có bằng chứng; chữ ≥ 10 px; số dùng IBM Plex Mono, chữ Inter.

## 1. Thanh đầu hợp nhất

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ NAF  Nafoods Group · Thực phẩm & Đồ uống (ICB 3570)   50.100  +2,66%   phiên 27/11            │
│ ● Trong Elite HL · hạng hợp lưu 1 · Lõi · tỷ trọng 10,7% · cách ngưỡng bán LS 38 điểm          │
│ ⚠ 3 cảnh báo · 1 lưu ý     Dữ liệu: E1 15:47 · KQKD 17:44 · thiếu: dòng tiền                    │
│ [Tổng quan] [Tín hiệu] [Doanh nghiệp] [Sự kiện & thời điểm]     [Chart →] [Phòng họp AI →] [Chu kỳ →] │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Góc Tổng quan (≈ 1 màn hình)

```
┌ Luận điểm ─────────────────────────────────────┐ ┌ Giá 90 phiên (điều chỉnh) ───────────┐
│ Vị thế: Trong Elite HL · Lõi · hạng 1           │ │  ╱╲    ___╱‾‾   ─ pivot 48.200        │
│ Điểm mạnh có bằng chứng                          │ │ ╱  ╲__╱         ▒ vùng mua PZ         │
│  ✓ Dòng tiền: Stealth 20 = +1,8 z  [ĐẠT · SQS 96]│ │                 ┄ cắt lỗ sổ 45.100    │
│  ✓ Ngành: Dẫn dắt (RRG)            [MỘT PHẦN]    │ └───────────────────────────────────────┘
│ Rủi ro                                           │
│  ! LS-v1 còn cách ngưỡng bán 38 điểm (an toàn)    │
│  ! Beneish cảnh báo (FA-r1: chỉ cảnh báo)         │
│ Sự kiện kế tiếp: hạn công bố KQKD Q4 — 20/01/2027 │
└──────────────────────────────────────────────────┘
┌ Lớp phân tích ───────────────────────────────────────────────────────────────────────────────┐
│ Lớp          Hôm nay                                   Chiều   Bằng chứng        Nguồn       │
│ Dẫn dắt      LS-v1 phân vị 98, z +2,03, cổng H4 chưa đạt  ▲      C · SQS 58        E1 15:47 ▸ │
│ Kỹ thuật     6/7 mô hình TA · CAN SLIM: — · PA: chờ        ▲      HL-r2 MỘT PHẦN    E1 15:47 ▸ │
│ Ngành        Dẫn dắt — ủng hộ                              ▲      C · SQS 79        RRG 26/11 ▸│
│ Dòng tiền    thiếu dữ liệu phiên này                       —      A · ĐÃ CHỨNG MINH  —        ▸ │
│ Cơ bản       LNST cả năm ước +72,8% · Piotroski 7          ▲      B · mới           KQKD     ▸ │
│ …                                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
┌ Bộ não AI (gọn) ┐
```

- Bấm ▸ mở khối chi tiết cũ ngay dưới dòng (một khối mở mỗi lúc), có nút "Thu gọn".
- Ma trận ở điện thoại: mỗi lớp một thẻ 2 dòng (Lớp + chiều + dấu / Hôm nay).

## 3. Góc Tín hiệu

```
[Tất cả 25] [Siêu quét AI 10] [TA VN-Index 7] [Lọc ngành 2] [Cơ bản 1] [Cổ tức 1] [Chất xúc tác 1] [KNTG 1]   ☐ chỉ bất lợi  ☐ chỉ A/B
┌ Tín hiệu ───────────── Hôm nay ─── Phân vị (toàn TT / ngành) ─ Bậc ─ SQS · xu hướng ─── IC chế độ hiện tại ─ Đóng góp Z ┐
│ Stealth 20 (z)         +1,82       ████████░░ 86 / 91          A     96 Đã chứng minh   +0,021 (xu hướng giảm, 74 ngày)  +0,31 │
│ KQKD — LNST cả năm     +72,8%      █████████░ 94 / 88          B     mới                chưa đủ                          +0,12 │
│ CAN SLIM Cốc tay cầm   —           (không đạt mẫu hình)        B     mới                chưa đủ                          0     │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
▸ Bối cảnh ngoài E2 (Giai đoạn Minervini · RVOL log)
▸ Điểm Elite — danh mục dòng tiền (đối chứng): Hạng 31/269 · Z 0,94 · thác đóng góp
```

## 4. Góc Doanh nghiệp

Giữ thứ tự hiện tại, chỉ:
- Bỏ `PriceActionConfirmation` khỏi khối thanh khoản (đã chuyển sang lớp Kỹ thuật).
- Sửa nhãn nowcast → "Ước tính LNST cả năm" + chip bậc E2 `kq_nowcast` + SQS.
- Thêm dòng so sánh ngành cho các chỉ số chính (tăng trưởng LNST, biên LN ròng TTM, ROE) — phân vị trong ICB cấp 2.

## 5. Góc Sự kiện & thời điểm

Giữ nguyên; thêm liên kết "Xem trong khung Mã đang chọn (tab 1) →" cho mục Săn cổ tức TO để hai nơi không trôi lệch.

## 6. Truy cập và hiệu năng

- Tab / góc nhìn: `role="tablist"`, phím mũi tên, `aria-selected` (giữ cách làm của `ProfileHeader`).
- Dòng ma trận: `button` có `aria-expanded`, `aria-controls`.
- Màu không phải kênh duy nhất: mọi chiều có ký hiệu ▲ / ▼ / — và chữ.
- Không cuộn ngang trang ở 390 px; bảng tín hiệu cuộn ngang trong khung.
- Mục tiêu: góc Tổng quan hiện nội dung ≤ 1,5 s sau khi có ảnh chụp (một yêu cầu mạng).
