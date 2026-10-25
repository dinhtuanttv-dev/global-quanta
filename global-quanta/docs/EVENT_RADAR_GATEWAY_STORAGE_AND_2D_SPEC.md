# Event Radar — Gateway ledger và giao diện 2D

**Trạng thái:** đặc tả triển khai cho kho Event Radar do Market Gateway quản lý.  
**Mục tiêu:** lưu sự kiện và revision bền vững, không phụ thuộc Supabase; trình bày luồng tin trong radar 2D có thể kiểm chứng.

## 1. Kiến trúc lưu trữ

Event Radar có repository riêng tại `backend/src/market/news/eventRadarRepository.js`; kho thị trường (`MARKET_STORE`) tiếp tục phục vụ giá và các dữ liệu khác. Repository ghi một ledger JSON tại `EVENT_RADAR_DATA_DIR/ledger.json`, gồm:

- `events`: snapshot mới nhất của từng sự kiện, giới hạn 2.500 bản ghi.
- `revisions`: các nội dung đã quan sát theo `event_id + content_hash`; không bị xóa khi event rời danh sách retention.
- `health`: thời điểm poll và trạng thái từng feed.

Mỗi lần ghi được tuần tự hóa trong tiến trình, ghi file tạm cùng thư mục, `fsync`, rồi atomic rename. Không cần thêm package hoặc gọi Supabase khi đọc/ghi ledger mới. Kho hiện hỗ trợ **một writer Gateway** cho mỗi thư mục dữ liệu; không dùng chung file trên nhiều replica.

### Bắt buộc để dữ liệu qua được deploy

Gateway cần volume persistent được platform mount thật, ví dụ:

```text
EVENT_RADAR_DATA_DIR=/data/event-radar
```

Trên Railway/Fly/VPS: mount volume tại `/data` và chỉ chạy một Gateway writer cho ledger. Nếu chỉ đặt biến môi trường mà không mount volume, container có thể mất file khi bị thay thế. API và giao diện báo `persistent_volume_required`/`local_path_volume_not_confirmed`; chúng không tự xác nhận volume của cloud.

Local development có thể bỏ trống biến để dùng `backend/data/event-radar`; thư mục này đã được gitignore.

### Chuyển dữ liệu cũ từ Supabase

1. Tạo volume và mount volume trước, sau đó đặt `EVENT_RADAR_DATA_DIR`.
2. Tạm đặt `EVENT_RADAR_IMPORT_FROM_MARKET_STORE=true`, đồng thời giữ `MARKET_STORE=supabase` và cấu hình server hiện có trong môi trường Gateway.
3. Khởi động Gateway một lần. Import chỉ chạy khi ledger Gateway còn rỗng; event/revision được sao chép sang ledger. Kiểm tra log `Legacy import` và API `GET /api/market/event-radar`.
4. Đặt `EVENT_RADAR_IMPORT_FROM_MARKET_STORE=false`, deploy lại và sao lưu ledger.
5. Sau khi đối soát event count, revision count và khôi phục thử từ bản sao, có thể ngừng giữ các bảng Event Radar trên Supabase. Không xóa các bảng cũ trước bước đối soát.

`MARKET_STORE=supabase` có thể còn được dùng bởi các miền khác của Gateway; Event Radar mới không đọc/ghi Supabase sau khi tắt import. Không đưa credential vào file tài liệu hoặc log.

## 2. Revision và tính toàn vẹn

- `content_hash` bao gồm tiêu đề, tóm tắt, URL/attachment, thời điểm công bố, nguồn, nhãn nguồn, usage status, loại sự kiện và mã liên quan.
- Mỗi thay đổi hash tạo revision mới; bản ghi trước được giữ nguyên. Revision `observed_at` là thời điểm Gateway phát hiện thay đổi, còn `firstSeenAt` của event giữ nguyên lần đầu quan sát.
- Xóa khỏi danh sách event retention không xóa lịch sử revision.
- Atomic replace chống file JSON nửa ghi khi tiến trình dừng giữa lúc cập nhật. Bản sao volume và kiểm tra phục hồi vẫn là trách nhiệm vận hành.
- Đây là ledger audit ở tầng ứng dụng, chưa phải nhật ký ký số/chống sửa bởi quản trị viên máy chủ. Bản production cần backup versioned/off-host nếu yêu cầu kiểm toán cao.

## 3. Giao diện Radar 2D

Đồ thị đặt **mức chú ý heuristic** trên trục dọc và **số nguồn ghi nhận trong cụm** trên trục ngang; kích thước dấu thể hiện độ mới tương đối. Chọn dấu bằng chuột hoặc Enter/Space để làm nổi sự kiện tương ứng trong danh sách. Tối đa 80 dấu được vẽ để giữ hiệu năng; bộ lọc và danh sách vẫn dùng toàn bộ kết quả API.

Mức chú ý là luật phân loại ưu tiên rà soát, không phải xác suất tác động. Nhiều nguồn trong cùng cụm là dấu hiệu đối chiếu nguồn, không phải các quan sát thống kê độc lập. Đồ thị không dự báo giá, không nhận diện chắc chắn “thiên nga đen”, và không thay thế xác minh nội dung.

## 4. Giới hạn triển khai

- File store là lựa chọn không phụ thuộc Supabase nhưng chỉ phù hợp một Gateway writer. Nếu cần nhiều replica hoặc dung lượng/event throughput lớn, chuyển repository này sang PostgreSQL do Gateway/platform sở hữu (không phải Supabase) và giữ nguyên interface miền.
- Các nguồn hiện cấu hình vẫn có giới hạn coverage và điều khoản sử dụng; dashboard nguồn phải được giám sát.
- H1 phản ứng sự kiện là nghiên cứu mô tả theo dữ liệu ngày hiện có; không tuyên bố quan hệ nhân quả hoặc khả năng giao dịch intraday khi thiếu quote/order-book.

## 5. Các bảo vệ đã nối bổ sung

- API `GET /api/market/event-radar` chỉ đọc snapshot hiện có, không đợi các feed bên ngoài. Poller nền vẫn do Gateway khởi chạy.
- `POST /api/market/event-radar/refresh` yêu cầu người dùng xác thực và có cooldown dùng chung 60 giây trước khi poll thủ công.
- `GET /api/market/event-radar/:eventId` hỗ trợ `revisionLimit` và cursor `before`; response báo `revisionPage.hasMore/nextBefore` để không cần gửi toàn bộ revision trong một lần.
- Giao diện H1 gửi timestamp bài viết; nếu chỉ có `firstSeenAt`, payload đánh dấu rõ nguồn thời gian. Với bài xuất hiện sau khi phiên bắt đầu, dữ liệu ngày dùng phiên đầy đủ kế tiếp và trả cảnh báo giới hạn intraday. Request date-only cũ vẫn được chấp nhận để giữ tương thích.
- Revision mới có sequence number riêng bên cạnh content hash, để thay đổi A→B→A vẫn được ghi thành ba lần quan sát.
- Chọn điểm radar cuộn tới sự kiện tương ứng; nút bàn phím có trạng thái focus và tuân theo reduced motion.

Các thay đổi này không bổ sung nguồn dữ liệu chính thức mới, không tạo xác suất tác động và không xác nhận volume cloud đã mount. Ledger JSON tiếp tục yêu cầu một Gateway writer; chuyển sang PostgreSQL Gateway-owned cần được thực hiện trước khi bật nhiều replica hoặc cần phân tích revision quy mô lớn.
