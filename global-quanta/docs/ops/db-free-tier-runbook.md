# Runbook: giữ Supabase + Neon trong gói miễn phí

Cập nhật lần cuối: 2026-10-20 (D0–D5).

## Hạn mức

| Dịch vụ | Hạn mức miễn phí | Ai dùng |
|---|---|---|
| Supabase | 5 GB egress mỗi tháng, **tính chung cho cả tổ chức** | Gateway (dữ liệu thị trường) và Project A (dữ liệu thế giới) |
| Neon | Thời gian compute thức (CU-giờ) mỗi tháng; máy ngủ sau 5 phút không có truy vấn | Project A (Prisma) |
| Upstash | 500 nghìn lệnh mỗi tháng | Project A: đệm truy vấn và phiên bản dữ liệu |

## Cơ chế

- **Gateway (D0/D1):**
  - Mọi lượt đọc Supabase được đo theo job hoặc route (`/api/health/db-budget`, huy hiệu "● Kho x%" trên thanh trên cùng).
  - Các lượt đọc đi qua kho đệm: RAM, rồi Railway Volume (`/data/warehouse`), rồi mới tới Supabase. Khởi động lại hoặc deploy không phải đọc lại lịch sử.
  - Mỗi lần ghi đánh dấu phần bị đổi trước và sau lệnh ghi, có nhật ký ghi trước. Nhờ vậy kết quả luôn giống hệt đọc thẳng.
- **Ngân sách Gateway:**
  - Ngày (chỉ để bắt bất thường): vượt 150 MB thì cảnh báo; vượt 600 MB thì chặn route; vượt 800 MB thì chặn cả job. Lần nạp đầy kho đệm đầu tiên sau khi khôi phục tốn khoảng 250–300 MB.
  - Tháng: dùng tới 90% của 3,5 GB thì chặn route; tới 97% thì chặn cả job.
  - Gặp ngưỡng chặn: dữ liệu đã đệm vẫn phục vụ bình thường, có cảnh báo Telegram.
- **Project A (D3):**
  - Prisma extension đệm kết quả từng truy vấn trong Upstash theo phiên bản model. Lần ghi khoá model và tăng phiên bản; lượt đọc chỉ dùng đệm khi phiên bản khớp và không có khoá.
  - Lượt xem trang không còn đánh thức Neon. Neon chỉ thức trong các khung cron ghi dữ liệu.
  - Supabase dữ liệu thế giới dùng cùng cơ chế, qua `global.fetch` của supabase-js.

## Việc định kỳ

1. Mỗi tuần, xem huy hiệu "● Kho": dự báo tháng phải dưới 80%. Bấm vào để thấy job hoặc route nào tốn nhiều nhất.
2. Trong Neon console, đặt compute **cố định 0,25 CU** (tắt tự tăng lên cao hơn). Theo dõi mục Usage.
3. Xem `GET <Project A>/api/ops/read-cache` để biết tỉ lệ trúng đệm và số lệnh KV của từng instance.

## Khi sửa dữ liệu từ NGOÀI ứng dụng (script, SQL Editor)

Đệm không biết về những thay đổi này. Sau khi sửa phải xoá đệm:

- Gateway: `POST /api/health/db-budget/reset-warehouse` (Bearer `MARKET_ADMIN_TOKEN`).
- Project A: `POST /api/ops/read-cache` (Bearer `CRON_SECRET`).

## Tắt khẩn cấp

| Biến môi trường | Tác dụng |
|---|---|
| `MARKET_WAREHOUSE=off` (Railway) | Gateway đọc thẳng Supabase |
| `QUERY_CACHE=off` (Vercel, Project A) | Đọc thẳng Neon và Supabase |

## Điều chỉnh

| Biến môi trường | Tác dụng |
|---|---|
| `MARKET_EGRESS_SOFT_MB`, `MARKET_EGRESS_HARD_MB`, `MARKET_EGRESS_JOB_MB` | Ngưỡng egress ngày |
| `MARKET_EGRESS_MONTH_QUOTA_MB` | Phần hạn mức tháng của Gateway |
| `MARKET_WAREHOUSE_RAM_MB` | Trần RAM của kho đệm (mặc định 64; heap thật khoảng 1,2–1,45 lần trần) |
| `QUERY_CACHE_SNAPSHOT_MS` | Mặc định 0, tức chính xác tuyệt đối. Đặt lớn hơn 0 chỉ khi lệnh Upstash gần chạm hạn mức; khi đó lần ghi của instance khác có thể hiện ra chậm tối đa N ms. |
