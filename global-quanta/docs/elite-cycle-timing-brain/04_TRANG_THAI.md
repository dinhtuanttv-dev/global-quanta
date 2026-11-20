# 04 — Trạng thái và danh tính sự kiện

## 1. Danh tính

`key = ticker | lane | period`

| Làn | `period` | Nguồn |
|---|---|---|
| `DIV_W` | GDKHQ dự kiến (`YYYY-MM-DD`) | Timeline, dòng `kind = DIVIDEND` |
| `DIV_TO` | GDKHQ của sự kiện TO | `/api/corp-events/to` |
| `EARN` | quý báo cáo (`2026Q4`) | Timeline, dòng `kind = EARNINGS` |

Hai làn `DIV_W` và `DIV_TO` có thể trỏ tới **cùng một GDKHQ**. Khi đó `byTicker` liệt kê cả hai, vì hai nghĩa khác nhau (01 K-A). Giao diện gộp chúng thành một dòng với hai nhãn.

## 2. Các miền trạng thái (giữ nguyên văn)

| Miền | Giá trị | Nơi định nghĩa |
|---|---|---|
| Timeline | `UPCOMING`, `IN_WINDOW`, `PASSED` | `lib/cotuc/buy-timeline.ts:15` (zod) |
| Bậc Timeline | `VALIDATED`, `NEAR`, … | Timeline |
| Bậc TO trên Elite | `EXPLORATORY` | `withToRows` |
| Quyết định | `FAVORABLE`, `WATCH`, `AVOID` (nhãn: Thuận lợi / Quan sát / Chưa nên) | `lib/cotuc/decision.ts:11` |
| Buồng lái (D1) | Danh mục, Vừa ra, Hàng chờ, Chưa giao dịch được, Chờ nền, Ngành phản đối | `lib/elite10/cockpit` |

Tầng 2 **không tạo miền trạng thái mới cho tín hiệu**. Thứ duy nhất nó thêm là bậc bằng chứng `Tier` (02 mục 3), suy từ sổ đăng ký ở 06 mục 1. Đây là nhãn, không phải tín hiệu.

## 3. Chuẩn hoá phiên (sửa M5 mà không tính lại)

| Nguồn `sessionsToEntry` | `sessions.toEntry` | `sessions.elapsed` |
|---|---|---|
| UPCOMING, giá trị v ≥ 0 | v | null |
| IN_WINDOW/PASSED, PA cho v < 0 | 0 | −v |
| IN_WINDOW/PASSED, chỉ có GW (0) | 0 | null, hiện "đã mở cửa sổ" và không ghi số phiên |

Nhãn: "còn N phiên", "đã mở N phiên" hoặc "đã mở cửa sổ". Không bao giờ hiện số âm.

## 4. Đối soát ngày công bố KQKD

Thứ tự ưu tiên cho `primary`:

1. Ngày **đã công bố** (S8, nguồn thật), nếu có cho kỳ đó.
2. LC-v1 "dự kiến", kèm dải và hạn luật.
3. Timeline (HISTORICAL_LAG).
4. Event-study (PA).

Quy tắc chung:

- Mọi nguồn được giữ trong `claims`.
- `spreadDays > 0` sinh cảnh báo dạng "Ngày công bố lệch N ngày giữa các nguồn". Cảnh báo này hiện ở khối đang dùng ngày.
- Khối nào dùng ngày phụ (ví dụ `TimingSimPanel` dùng event-study) thì ghi chữ nhỏ "theo nguồn …".

Ví dụ thật, MSH Q4/2026:
- claims: Timeline 2027-02-01, LC 2027-02-01 (dải 01–11/02, hạn 20/01 và 14/02), event-study 2027-01-30;
- primary là 2027-02-01, spreadDays là 2, nên có cảnh báo.

Thứ tự ưu tiên này là **đề xuất**, chờ anh duyệt (08, Q3).

## 5. Vòng đời một sự kiện trên giao diện

```
(chưa có) ─► UPCOMING (còn N phiên) ─► IN_WINDOW (đã mở N phiên) ─► PASSED ─► (ra khỏi lịch sau T+exit)
                     ▲ nguồn đổi asOf → đối chiếu lại; lệch ngày → cảnh báo
```

Chuyển trạng thái lấy hoàn toàn từ nguồn. Tầng 2 chỉ đọc lại.
