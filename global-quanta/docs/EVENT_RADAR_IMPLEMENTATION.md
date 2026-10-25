# Event Radar — triển khai và vận hành

> **Cập nhật kiến trúc:** Event Radar hiện dùng Gateway file ledger thay cho Supabase. Hướng dẫn cấu hình volume, import dữ liệu cũ, revision và giới hạn single-writer ở [EVENT_RADAR_GATEWAY_STORAGE_AND_2D_SPEC.md](./EVENT_RADAR_GATEWAY_STORAGE_AND_2D_SPEC.md). Các đoạn bên dưới mô tả trạng thái tích hợp trước đây và không còn là hướng dẫn storage hiện hành.

**Trạng thái:** bản tích hợp đầu tiên; nguồn và phân loại cần được quản trị trước khi dùng như sản phẩm phân tích.  
**Phạm vi:** thu thập RSS/công bố được gắn nhãn, sổ sự kiện có revision, Event Radar trong Chat Xúc Tác, mở nghiên cứu phản ứng H1.

## Đã tích hợp

- `GET /api/market/event-radar`: trả cụm sự kiện, tình trạng nguồn, phạm vi lấy công bố và trạng thái storage.
- `GET /api/market/event-radar/:eventId`: trả sự kiện cùng các revision đã ghi nhận.
- Bộ thu thập có poller độc lập với Market Ingestor, mặc định chạy 5 phút khi backend khởi động; tắt bằng `EVENT_RADAR_ENABLED=false`.
- Mặc định tái sử dụng RSS CafeF/Vietstock và tìm công bố VNDirect có gắn mã cho một tập mã giới hạn. Tập công bố không bao phủ toàn bộ sàn; bảng trạng thái nguồn công bố rõ số mã và việc giới hạn.
- RSS bổ sung cấu hình qua `EVENT_RADAR_RSS_FEEDS`, chỉ nhận HTTPS. Định dạng mỗi nguồn: `ID|LABEL|URL|official/editorial|review_required/approved`, nhiều nguồn phân tách bằng `;`. Nhãn `official` chỉ là cấu hình vận hành, không thay kiểm chứng nội dung hoặc quyền sử dụng.
- Sự kiện được phân nhóm theo nội dung tương đồng, thời gian và mã liên quan; nguồn/tài liệu riêng vẫn giữ được trong danh sách nguồn của cụm.
- Cập nhật nội dung tạo revision mới. Thay đổi được đánh dấu cần rà soát; không ghi đè lịch sử revision.
- Panel hỗ trợ lọc mã/nhóm, hiển thị thời điểm đăng và lần đầu thấy, trạng thái xác minh, độ chắc chắn ghép mã, liên kết nguồn và mở nghiên cứu H1 cho mã có ngày công bố.
- Mức chú ý và phân loại hiện là heuristic. Chúng không phải model probability, dự báo lợi suất hoặc khuyến nghị giao dịch.

## Thiết lập môi trường

1. Cấu hình `EVENT_RADAR_DATA_DIR` trỏ vào thư mục nằm trên persistent volume Gateway; xem hướng dẫn mới ở `EVENT_RADAR_GATEWAY_STORAGE_AND_2D_SPEC.md`.
2. Event Radar không yêu cầu migration Supabase mới. Các bảng/migration cũ chỉ phục vụ việc import ledger legacy một lần hoặc rollback đối soát; không xóa trước khi kiểm đếm.
3. Kiểm tra quyền sử dụng, tần suất truy cập, attribution và khả năng lưu trích đoạn cho từng nguồn. Chỉ sau khi chủ sở hữu nguồn/điều khoản được xác minh mới cấu hình RSS bổ sung và đánh dấu `approved`.
4. Cấu hình `EVENT_RADAR_POLL_MS` và `EVENT_RADAR_DISCLOSURE_SYMBOL_LIMIT` theo giới hạn nguồn, tải máy chủ và phạm vi dữ liệu được cấp phép.
5. Mở Chat Xúc Tác → Event Radar; kiểm tra source heartbeat, coverage, timestamp và các link nguồn trước khi dùng nội bộ.

## Quy ước dữ liệu

- `configured_official_feed`: nguồn được vận hành khai báo là feed chính thức; nội dung vẫn chưa được đối chiếu chéo.
- `disclosure_tagged_aggregator`: nhà cung cấp trung gian gắn nhãn công bố; không đồng nghĩa đã xác thực trực tiếp với sàn.
- `editorial_media` / `unconfirmed`: nguồn báo chí hoặc chưa có xác nhận độc lập.
- `usageTermsStatus=review_required` là trạng thái mặc định. UI báo trạng thái này; cần kiểm tra quyền sử dụng trước khi phát hành rộng.
- Lần đầu thấy (`firstSeenAt`) được ghi theo thời gian hệ thống quan sát nguồn, không phải thời gian sự kiện có hiệu lực.
- `critical_watch` chỉ là mức ưu tiên rà soát dựa trên từ khóa. Không coi đây là mô hình dự báo thiên nga đen.
- Phản ứng H1 dùng endpoint nghiên cứu hiện hữu và dữ liệu thị trường sẵn có; một quan sát không chứng minh quan hệ nhân quả hay drift có thể giao dịch.

## Giới hạn hiện tại

- Chưa có feed chính thức HOSE/HNX/SSC/NHNN/GSO/VSDC nào được hard-code làm nguồn trực tiếp. Nguồn RSS bổ sung cần được xác minh và khai báo bởi vận hành; không tự dò/thu thập URL tùy tiện.
- VNDirect disclosure feed được truy vấn theo mã và có giới hạn universe. Sự kiện vĩ mô không gắn mã phụ thuộc các RSS hiện cấu hình.
- Phân loại sự kiện, độ nghiêm trọng, sentiment và entity linking dựa trên luật/từ khóa; cần kiểm duyệt và đánh giá precision/recall theo taxonomy trước khi dùng cảnh báo tự động.
- “Hấp thụ” từ dữ liệu ngày chỉ là proxy phản ứng ngày. Không có dữ liệu quote/order book phù hợp thì không gọi là đo tốc độ hấp thụ intraday.
- Memory store mất ledger khi tiến trình khởi động lại; dùng Supabase để giữ sự kiện qua restart.
- Điều khoản RSS và quyền lưu/nội suy nội dung chưa được xác nhận bằng hợp đồng cho từng nhà cung cấp. Không phân phối lại toàn văn bài báo; hiện chỉ lưu tiêu đề, trích đoạn ngắn, attribution và link.

## Tiêu chí nâng cấp trước phát hành rộng

- Có source registry được chủ sở hữu duyệt, gồm endpoint, quyền sử dụng, cadence, timezone, attribution và phương thức đính chính.
- Đánh giá độ trễ, độ đầy đủ, lỗi ghép mã, duplicate clustering, false positives/false negatives theo từng loại nguồn và sự kiện.
- Có workflow người rà soát để xác nhận, sửa hoặc thu hồi phân loại; giữ audit trail người thao tác và thời điểm.
- Nghiên cứu phản ứng theo thời điểm hệ thống biết tin, phiên giao dịch kế tiếp, benchmark phù hợp, chi phí và nhóm đối chứng; tách đánh giá ngoài mẫu.
- Có monitoring/alert theo health của nguồn, lỗi schema, độ trễ và thời lượng im lặng bất thường.

