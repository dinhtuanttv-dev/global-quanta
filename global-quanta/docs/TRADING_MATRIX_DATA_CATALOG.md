# Trading Matrix — Danh mục dữ liệu, thuật ngữ và rule registry v0 (Phase 0 / M0)

**Ngày:** 22/10/2026 · **Căn cứ:** `docs/TRADING_MATRIX_INTEGRATION_SPEC.md` §11 Phase 0
**Trạng thái nguồn đo trực tiếp trên Gateway production ngày 22/10/2026.**

Cổng Phase 0 (spec §11): *không còn trường giao diện nào thiếu nguồn / định nghĩa, hoặc thiếu nhãn "ước tính / chưa có".*
Mọi trường dưới đây có: nguồn, endpoint, tần suất, `sourceAsOf`, mẫu số (nếu là tỷ lệ), dự phòng và trạng thái.

---

## 1. Kiến trúc lưu trữ sau M0 (ràng buộc gói miễn phí)

| Lớp | Vai trò | Ghi chú |
|---|---|---|
| **Railway Volume `/data/local`** | Kho CHÍNH cho dữ liệu thị trường / nghiên cứu (`localStore`) | Dựng lại được từ SSI / VCI / TradingView (`localBootstrap`) |
| Supabase (`market_*`) | Bản sao phụ, ghi nền; đọc **một lần** khi kho cục bộ thiếu (hydrate) | Cầu dao 15 phút khi lỗi; lượt đọc ≈ 0 khi kho cục bộ đã đủ |
| Supabase (dữ liệu người dùng) | Danh mục, trạng thái biểu đồ, radar — giữ nguyên như cũ | Không chuyển sang cục bộ (tránh mất dữ liệu người dùng) |
| Neon (Project A) | Không còn là phụ thuộc bắt buộc của tab | Sự kiện / ngành Project A lỗi -> nhãn UNAVAILABLE, không giả "không có" |

Trading Matrix (M1–M3) lưu snapshot / sổ tín hiệu / kết quả **trên Volume** (`tbl/market_matrix_*`, `kv/matrix:*`), không tạo bảng Supabase mới.

---

## 2. Danh mục nguồn

| Mã nguồn | Dữ liệu | Nhà cung cấp → Gateway | Tần suất | `sourceAsOf` | Trạng thái 22/10 | Dự phòng |
|---|---|---|---|---|---|---|
| S1 `quotes` | Giá / % / KL realtime | SSI FastConnect stream → `/api/market/stream` (SSE), `/quotes` | tick | thời điểm tick | LIVE trong phiên | REST snapshot; nhãn DELAYED |
| S2 `daily` | Dữ liệu ngày toàn thị trường (OHLC, giá điều chỉnh, KL, GT, khối ngoại, trần/sàn) | SSI DailyStockPrice → job `syncMarketDaily` 15:20 → kho cục bộ | 1 lần/phiên | `trading_date` | Dựng lại sau M0 | `backfillMarketDaily` từ SSI |
| S3 `index` | Nến VN-Index | SSI DailyIndex + `/ta-series` | 1 lần/phiên + intraday | `date` | OK | VNDirect |
| S4 `breadth` | Số mã tăng/giảm/đứng, % trên MA | `/api/market/breadth` | trong phiên | `asOf` | **200 OK** | Breadth cuối phiên từ S2 |
| S5 `scanner` | Universe, ngành 2 cấp, Smart Score, RS, xu hướng | job `scanUniverse` 15:40 → KV `scanner:latest` | 1 lần/phiên | `dataAsOf` | **502 trước M0** → sửa ở M0 | — |
| S6 `research` | Regime ngày, Impulse, HMM/Bayes intel, mô hình thích ứng | jobs `research*` 16:00–16:40 → `/research/overview` | 1 lần/phiên | `generatedAt`, ngày regime | **502 trước M0** → dựng lại sau M0 | Regime tính trực tiếp từ S3 |
| S7 `ife` | Dòng lệnh Lee–Ready theo phút, trạng thái ý đồ | tick recorder → kho cục bộ (M0: không sao Supabase) | phút | phút cuối | Có, có nhãn kiểm định | BVC từ nến phút khi thiếu tick |
| S8 `foreign` | Khối ngoại mua/bán ròng | S2 (cuối phiên) | 1 lần/phiên | `trading_date` | Có (đã chốt phiên) | — (trong phiên: chưa có) |
| S9 `calendar` | Pha phiên PRE_OPEN/ATO/LO/BREAK/ATC/PT/CLOSED, ngày nghỉ | `calendar.js` + lịch tự quan sát | tức thời | đồng hồ Gateway | OK | Quy tắc âm lịch |
| S10 `taxonomy` | Ngành / nhóm ngành 2 cấp, ICB | KV `scanner:taxonomy`, ICB | tuần | `updatedAt` | Có | Bản trước |
| S11 `sectorFlow` | RRG ngành, dòng tiền ngành (tab Lọc ngành) | jobs `buildSectorRotation` 15:50 | 1 lần/phiên | `dataAsOf` | Dựng lại sau M0 | — |
| S12 `structure` | Giai đoạn chu kỳ, xác suất chuyển giai đoạn (HMM, **đã kiểm định T3**) | `/api/market/structure*` (PR #143) | 1 lần/phiên + 60 giây | `asOf` | Chờ deploy | — |
| S13 `events` | Sự kiện đã xác nhận | Project A `/api/sieu-quet-ai/events` | 3 lần/ngày | `createdAt` | **Lỗi (Neon khoá)** | UNAVAILABLE |
| S14 `indexWeights` | Trọng số VN30 / VNINDEX | SSI chỉ có **thành phần**, không có trọng số | — | — | **Không có** | Nhãn "Mã biến động đáng chú ý" (spec §6.8) |
| S15 `proprietary` | Dòng tự doanh | Không có nguồn | — | — | **Không có** | Ẩn (spec §6.4) |
| S16 `orderbook` | Sổ lệnh / độ sâu | Chưa có feed lịch sử | — | — | **Không có** | Không dùng thuật ngữ "lệnh tổ chức" |

---

## 3. Định nghĩa trường của Matrix (MVP)

| Trường | Định nghĩa | Nguồn | Mẫu số / phạm vi | Trạng thái |
|---|---|---|---|---|
| `regime.daily` | UPTREND: giá > MA50, MA20 > MA50, MA50 dốc lên 10 phiên · DOWNTREND đối xứng · còn lại SIDEWAY (`research/regime.js`) | S3 | VN-Index | Có |
| `regime.stageOdds` | P(sang Tăng / sang Giảm trong 10 phiên) — HMM + thời lượng giai đoạn | S12 | VN-Index | Đã kiểm định (lợi thế nhỏ) |
| `breadth.aboveMa20Pct` | % mã có đóng cửa > MA20 | S2 | `eligibleCount` = mã trong universe có ≥ 20 phiên; `observedCount`; `excludedCount` (tạm ngừng, thiếu dữ liệu) | Có |
| `breadth.adv/dec/unch` | Số mã tăng / giảm / đứng giá so với tham chiếu | S4 (trong phiên) / S2 (cuối phiên) | phạm vi ghi rõ: VNINDEX / VN30 / universe Siêu Quét | Có |
| `breadth.medianReturn` | Trung vị lợi suất phiên | S2/S1 | như trên | Có |
| `volatility.atrPercentile` | ATR14 VN-Index so với 250 phiên | S3 | — | Có |
| `volatility.rangeZ` | Biên độ trong phiên so với cùng pha phiên lịch sử (tách ATO/ATC) | S7 nến phút | — | Cần baseline trong phiên (M1) |
| `session.phase` | Pha phiên từ Gateway | S9 | — | Có |
| `flow.ife` | Trạng thái ý đồ IFE + Stealth z + phương pháp (Lee–Ready / BVC) + độ phủ tick | S7 | độ phủ = phút có tick / phút phiên | Có |
| `flow.foreign` | Mua − bán ròng, chuỗi phiên liên tiếp theo lịch giao dịch | S8 | — | Có (cuối phiên) |
| `flow.proprietary` | — | S15 | — | **Không hiển thị** |
| `dataHealth` | LIVE / DELAYED / STALE / PARTIAL / UNAVAILABLE theo từng nguồn | tất cả | — | M1 |
| `sector.*` | RS so VN-Index, breadth ngành, giá trị giao dịch, Smart Score TB, độ phủ | S2, S5, S10, S11 | số mã ngành | M2 |
| `movers` | Mã biến động đáng chú ý (KHÔNG phải đóng góp chỉ số) | S1/S2 + S14 thiếu | VN30 / universe | M2 |

Quy tắc chung: thiếu dữ liệu -> `null` + nhãn, **không** thay bằng trung tính; mọi tỷ lệ có mẫu số; ngày và trong phiên không trộn.

---

## 4. Từ điển thuật ngữ

| Thuật ngữ | Nghĩa trong dự án |
|---|---|
| Regime | Trạng thái xu hướng theo một khung (ngày hoặc trong phiên), theo quy tắc công khai ở §3 |
| Breadth | Mức lan toả của biến động trong một phạm vi mã có mẫu số rõ ràng |
| Flow | Ước lượng thống kê chiều chủ động của lệnh khớp (Lee–Ready / BVC) — **không** phải danh tính nhà đầu tư |
| Liquidity sweep | Không dùng trong MVP (chưa có dữ liệu sổ lệnh lịch sử) |
| Confidence | Độ bất định thống kê của một ước lượng đã kiểm định — tách khỏi freshness và coverage |
| Freshness | Tuổi dữ liệu so với pha phiên |
| Coverage | Tỷ lệ phạm vi có dữ liệu hợp lệ |
| Confirmation | Đủ điều kiện tối thiểu + ≥ 2 nhóm bằng chứng độc lập + dữ liệu hợp lệ (chỉ bật sau kiểm định — M4) |
| Invalidation | Điều kiện phủ định của kịch bản đã khai báo trước |
| THỰC NGHIỆM | Hiển thị công khai nhưng chưa qua kiểm định ngoài mẫu; không dùng để xếp hạng / quyết định |

Trường hợp đặc biệt: ngày nghỉ (lịch tự quan sát), phiên thiếu nến (bỏ khỏi mẫu số, ghi `excludedCount`), sự kiện quyền (giá điều chỉnh cộng dồn), mã tạm ngừng (loại khỏi breadth, ghi rõ).

---

## 5. Rule registry v0 (ỨNG VIÊN — chưa kiểm định, spec §9.1)

| ID | Kịch bản / cờ | Điều kiện ứng viên | Nhóm bằng chứng | Trạng thái |
|---|---|---|---|---|
| SC1 | Xu hướng có độ rộng hỗ trợ | regime.daily = UPTREND ∧ aboveMa20Pct tăng/giữ 5 phiên ∧ flow không âm ∧ atrPercentile < 80 | giá, breadth, flow | Ứng viên |
| SC2 | Chỉ số dẫn dắt, thị trường phân hoá | VN-Index tăng 5 phiên ∧ medianReturn 5 phiên ≤ 0 ∧ breadth giảm | giá chỉ số, breadth | Ứng viên |
| SC3 | Cú sốc biến động / theo dõi hồi phục | rangeZ ≥ 2 ∧ aboveMa20Pct giảm ≥ 15 điểm trong 5 phiên | biến động, breadth | Ứng viên |
| SC0 | Chuyển pha / chưa xác định | còn lại, hoặc coverage < 80%, hoặc xác suất regime chênh < 0,15 | chất lượng | Ứng viên |
| RF1 | News extension | sự kiện đã xác nhận + gap > 2 ATR + breadth/flow yếu | sự kiện, giá, flow | Chờ S13 |
| RF2 | Auction anomaly | KL ATO/ATC > 2σ so cùng pha | phiên | Ứng viên |
| RF3 | Chỉ số vs breadth phân kỳ | như SC2 | — | Ứng viên |
| RF4 | Flow phân kỳ | IFE và khối ngoại ngược chiều 3 phiên giao dịch | flow | Ứng viên |
| RF5 | Kế hoạch thiếu mức vô hiệu / rủi ro tối đa | kiểm tra quy trình | — | Không cần kiểm định |

Mọi ngưỡng trên là **ứng viên**; trước M3 phải đăng ký trước giao thức kiểm định (train / tune / holdout theo ngày, purge / embargo theo kỳ hạn, độ nhạy ngưỡng, phí, trần/sàn, so với baseline breadth-only).

---

## 6. Giao thức kiểm định (tóm tắt, chi tiết đăng ký trước ở M3)

- Outcome định trước: VN-Index T+1/3/5/10 (kịch bản thị trường); mã vượt VN-Index (cờ theo mã).
- Báo cáo: n, n hiệu dụng (bootstrap theo cụm ngày), tỷ lệ nền, KTC 95%, Brier / AUC, theo regime.
- Đa kiểm định: BH-FDR q = 0,10 trên các kịch bản.
- Chỉ kịch bản ĐẠT mới được trạng thái CONFIRMED (M4); không đạt giữ nhãn THỰC NGHIỆM.

---

## 7. Trạng thái triển khai (22/10/2026)

| Giai đoạn | Nội dung | Kiểm định | Trạng thái |
|---|---|---|---|
| M0 | Kho ưu tiên cục bộ (Volume), tự dựng lại từ SSI / VCI | Kiểm thử tương đương + Supabase 402 | Xong |
| M1 | Dải 6 ô + sức khoẻ dữ liệu | — (mô tả) | Xong |
| M2 | Heatmap ngành (cùng phân ngành bảng) + mã biến động đáng chú ý | — (mô tả) | Xong |
| M3 | Kịch bản SC1–SC3 + SC0, cờ RF1–RF5, sổ tín hiệu | Prereg 341e569: SC1 thiếu mẫu, SC2 KHÔNG ĐẠT, SC3 thiếu mẫu → THỰC NGHIỆM | Xong |
| M4 | "Xác nhận" cho kịch bản ĐẠT | Chưa kịch bản nào đạt → chưa bật; sổ thực tế đang tích luỹ | Chờ bằng chứng |
| M5 | Champion / challenger, sổ đăng ký mô hình, quay lui | Prereg c5edd78: giữ champion B0 (C1 Brier skill −16 %) | Xong |
| M6 | Báo cáo vận hành, cảnh báo, phát lại, sổ tay vận hành | Diễn tập sự cố có kiểm thử | Xong (`docs/TRADING_MATRIX_RUNBOOK.md`) |
