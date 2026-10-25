# Hướng dẫn cấu hình Persistent Volume cho Event Radar

## Vấn đề
Event Radar lưu ledger sự kiện vào file JSON (`ledger.json`) tại `EVENT_RADAR_DATA_DIR`.
Nếu không mount persistent volume, **dữ liệu sẽ mất khi container bị restart/replace**.

## Giải pháp theo Platform

### Railway
1. Vào **Service** Gateway trên Railway dashboard
2. Tab **Volumes** → **Add Volume**
3. Cấu hình:
   - **Mount Path:** `/data`
   - **Size:** 1GB (đủ cho ~2500 sự kiện + revision audit log)
4. Tab **Variables** → thêm:
   ```
   EVENT_RADAR_ENABLED=true
   EVENT_RADAR_DATA_DIR=/data/event-radar
   EVENT_RADAR_POLL_MS=300000
   EVENT_RADAR_DISCLOSURE_SYMBOL_LIMIT=120
   ```
5. **Redeploy** service

### Fly.io
Thêm vào `fly.toml`:
```toml
[mounts]
  source = "event_radar_data"
  destination = "/data"
```
Tạo volume:
```bash
fly volumes create event_radar_data --size 1 --region sin
```
Đặt secret:
```bash
fly secrets set EVENT_RADAR_DATA_DIR=/data/event-radar EVENT_RADAR_ENABLED=true
```

### Docker Compose (local/VPS)
```yaml
services:
  gateway:
    build: ./backend
    volumes:
      - event_radar_data:/data
    environment:
      - EVENT_RADAR_ENABLED=true
      - EVENT_RADAR_DATA_DIR=/data/event-radar
      - EVENT_RADAR_POLL_MS=300000

volumes:
  event_radar_data:
    driver: local
```

## Kiểm tra sau khi cấu hình
```bash
# API phải trả storageInfo.configuredPath = true
curl https://your-gateway/api/market/event-radar | jq '.meta.storage'

# Kết quả mong đợi:
# {
#   "kind": "gateway_file",
#   "durability": "persistent_volume_required",
#   "configuredPath": true,
#   "singleWriter": true
# }
```

## Lưu ý quan trọng
- **Chỉ 1 writer**: Không chạy nhiều replica Gateway cùng ghi vào 1 thư mục
- **Backup**: Sao lưu file `/data/event-radar/ledger.json` định kỳ ra ngoài host
- **Import từ Supabase** (nếu cần): Bật `EVENT_RADAR_IMPORT_FROM_MARKET_STORE=true` một lần duy nhất khi ledger rỗng

## Trạng thái UI
Khi volume **chưa mount**: UI hiển thị `"cần xác nhận volume đã mount"`
Khi volume **đã mount** và `EVENT_RADAR_DATA_DIR` đặt đúng: UI hiển thị `"persistent_volume_required"` với `configuredPath: true`
