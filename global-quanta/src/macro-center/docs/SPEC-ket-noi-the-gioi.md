# Đặc tả: tab "Kết nối thế giới"

Phiên bản 1.2.0. Tài liệu này mô tả dữ liệu, công thức, API, công cụ chat, thành phần React và giao diện của tab, kèm bằng chứng kiểm chứng và những gì chưa làm. Mọi mô-đun nêu ở đây đều có trong `src/` và có test.

## 1. Mục tiêu và phạm vi

Trả lời câu hỏi: yếu tố và sự kiện của thế giới đi vào nhóm ngành và cổ phiếu Việt Nam qua kênh nào, mạnh đến đâu, và **bằng chứng cho từng mắt xích ở bậc nào**.

| Đã cài đặt và kiểm thử | Mới chỉ đặc tả hoặc chưa làm |
|---|---|
| Ma trận yếu tố thế giới × ngành, bậc A/B/C | TVP-VAR (tham số biến thiên theo thời gian), DCC-GARCH |
| Sự kiện: căn phiên, event study, BMP, cờ biên độ ±7% | MIDAS/nowcasting dữ liệu hỗn hợp tần suất |
| Kết nối thị trường: VAR, GFEVD, Diebold–Yilmaz, cuốn chiếu, phụ thuộc đuôi | Đường ống AI trích sự kiện từ tin tức (chỉ có lược đồ và rào chắn, mục 3.2) |
| Co rút phân cấp beta cổ phiếu về ngành | Đồ thị chuỗi cung ứng lưu bền vững và truy vấn |
| Kịch bản σ bằng chiếu cục bộ, hiệu ứng lên cổ phiếu | Dữ liệu thật và bộ kết nối nguồn (đang dùng dữ liệu mô phỏng) |
| API, công cụ chat, thành phần React, token sáng/tối | Kiểm thử giao diện với API sống trong trình duyệt |

## 2. Kiến trúc

```
Nguồn: giá thế giới (ngày/tháng) · lịch/tin sự kiện · báo cáo tài chính
   │  ETL (macro-data: vintage theo asOf)              world-types: validator + DDL
   ▼
Kho: VintageStore (tháng)  ·  WorldData (ngày: thị trường, ngành, sự kiện, phơi nhiễm, beta mã)
   ▼
Lõi tính toán (TypeScript thuần, có test)
   quant-macro      kiểm định nghiệm đơn vị, ma trận tác động, HAC, FDR
   world-events     căn phiên, event study, BMP        world-connectedness   VAR, GFEVD, lan truyền
   world-shrinkage  co rút phân cấp                    world-evidence        bậc A/B/C
   world-transmission  phơi nhiễm → kênh (bậc C)      macro-scenario        chiếu cục bộ
   ▼
world-api  (/api/world/*, không phụ thuộc framework)  ──►  world-chat-tools (5 tool cho LLM)
   ▼
React: WorldTab ← WorldMatrix · WorldPulse · ConnectednessPanel · EventPanels · ScenarioStock
```

## 3. Đặc tả dữ liệu

Nguồn sự thật: `src/world-types.ts` (kiểu, danh mục, validator, DDL).

### 3.1 Danh mục

| Thực thể | Nội dung |
|---|---|
| Yếu tố thế giới | 13 mã (FED, DXY, OIL, CNY, STEEL, CONTAINER, PMI_CN, PMI_US, SEMI, VIX, EM_FLOWS, TARIFF, MSCI_EM), mỗi mã có vùng và kênh. Dạng `SeriesMeta` nên đi thẳng vào động cơ vĩ mô. |
| Kênh truyền dẫn | `commodity`, `fx_rates`, `capital_flow`, `export_demand`, `risk_sentiment`, `policy_trade` |
| Ngành | 10 ngành (mã `S_*`), mỗi ngành là chuỗi chỉ số loại `target` |
| Thị trường | Mỹ, Trung Quốc, Nhật, Hàn Quốc, Thái Lan, Việt Nam (lợi suất ngày, %) |

### 3.2 Sự kiện (`WorldEvent`)

| Trường | Kiểu và ràng buộc |
|---|---|
| `id` | chuỗi khác rỗng |
| `kind` | `scheduled` hoặc `surprise` |
| `type` | một trong 7 loại (`monetary_policy`, `trade_policy`, `macro_release`, `commodity_shock`, `geopolitical`, `index_reclassification`, `other`) |
| `tsUtc` | ISO 8601 kết thúc bằng `Z` (thời điểm công bố, UTC) |
| `sectorsHint` | mã ngành **dự kiến** bị ảnh hưởng; là giả thuyết, không phải kết quả |
| `polarityHint` | −1, 0, 1 |
| `source` | tên nguồn bắt buộc; đường dẫn tuỳ chọn |
| `extraction` | `method` (`manual`/`llm`), `confidence` 0..1, `reviewed` |

**Rào chắn cho sự kiện do AI trích:** `llm` với độ tin cậy dưới 0,6 mà chưa `reviewed` thì validator **từ chối** (không được đưa vào đo). Sự kiện do AI trích chỉ trở thành kết quả khi event study xác nhận; trước đó luôn ở bậc C.

### 3.3 Phơi nhiễm cổ phiếu (`StockExposure`)

| Trường | Ràng buộc |
|---|---|
| `revenueByRegion` | % doanh thu theo vùng, mỗi giá trị 0..100, **cộng đủ 100 (±0,5)** |
| `commodityCostShare`, `fxRevenueShare`, `fxDebtShare` | 0..1 |
| `foreignOwnership` | tuỳ chọn, 0..1 |
| `asOfPeriod` | `YYYY-MM` |
| `sourceRef` | bắt buộc: truy xuất tới báo cáo và mục thuyết minh |

### 3.4 Lược đồ SQL

`WORLD_DDL` gồm `world_event`, `event_reaction` (mỗi lần chạy lại là dòng mới, không UPDATE), `stock_exposure`, `evidence_link`. Dữ liệu tháng dùng `MACRO_DDL` có sẵn (vintage theo `as_of`).

## 4. Công thức và phương pháp

### 4.1 Kiểm tra tính dừng và ma trận tác động
Mỗi chuỗi qua ADF (giá trị tới hạn MacKinnon 2010), KPSS và Zivot–Andrews, rồi biến đổi (log-sai phân, sai phân hoặc giữ mức). Hồi quy `y_t = a + Σ β_f x_{f,t-ℓ} + AR + e` với sai số chuẩn HAC (Newey–West); toàn bộ ô × độ trễ là một họ giả thuyết, hiệu chỉnh Benjamini–Yekutieli.

**Quy tắc phân xử mới (phát hiện khi kiểm chứng giao diện).** Chuỗi dừng nhưng dai dẳng (PMI, VIX, chênh lệch lãi suất) làm KPSS bác bỏ nhầm; quy tắc cũ "nghi ngờ thì lấy sai phân" biến PMI thành thay đổi PMI và đảo dấu kết quả. Nay: nếu ADF bác bỏ ở 1% và KPSS băng thông dài (Schwert) không bác bỏ ở 1% thì coi là I(0). Đo bằng Monte Carlo (300 lần, T=220):

| Chuỗi | Trước | Sau |
|---|---|---|
| AR(0,5) nhận đúng I(0) | 92% | 99,7% |
| AR(0,7) nhận đúng I(0) | 85% | 99,7% |
| AR(0,85) nhận đúng I(0) | 60% | 95% |
| Bước ngẫu nhiên nhận nhầm là I(0) | 1,3% | 2,3% |

### 4.2 Bậc bằng chứng
- **A:** q < 0,05 sau hiệu chỉnh, **ổn định** (cùng dấu ≥ 80% cửa sổ trượt) và **vượt kiểm định ngoài mẫu** (walk-forward một yếu tố, IC có ý nghĩa và thắng mô hình ngây thơ).
- **B:** q < 0,05 sau hiệu chỉnh.
- **C:** giả thuyết (cơ chế, đồ thị, tin do AI trích) hoặc chưa đủ bằng chứng.
- **Cổ phiếu:** bậc của mã không vượt bậc của ngành; chỉ giữ bậc ngành khi ước lượng riêng của mã cũng có ý nghĩa (A→B, B→C nếu không).
- **Sự kiện:** "ổn định" và "ngoài mẫu" được thay bằng **lặp lại** qua các sự kiện cùng loại (kiểm định BMP có ý nghĩa, cùng dấu).

### 4.3 Event study
- **Căn phiên:** giờ Việt Nam = UTC+7; công bố trước 15:00 thuộc phiên đó, sau 15:00 hoặc ngoài ngày giao dịch dời sang phiên kế tiếp (cần truyền lịch phiên, kể cả ngày lễ).
- **Mô hình thị trường** ước lượng trên phiên −250 đến −30: `r_t = α + β m_t + ε_t`; lợi suất bất thường `AR_t = r_t − α̂ − β̂ m_t`.
- **Phương sai CAR đầy đủ** (gồm sai số ước lượng): `Var(CAR) = σ̂² [ L + L²/N + (Σ_t (m_t − m̄))² / S_mm ]`, `L` = độ dài cửa sổ, `N` = số phiên ước lượng.
- **BMP:** chuẩn hoá từng CAR theo sai số chuẩn riêng, `t = mean(SCAR) · √n / sd(SCAR)`; chống lại phương sai tăng vì sự kiện.
- **Biên độ ±7% (HOSE):** phiên chạm biên độ được đánh dấu; có tuỳ chọn loại khỏi cửa sổ ước lượng; số phiên chạm biên độ trong cửa sổ được báo cáo.

### 4.4 Kết nối thị trường
VAR(p) bằng OLS từng phương trình (QR); phân rã phương sai sai số dự báo **tổng quát** (Pesaran–Shin), không phụ thuộc thứ tự biến, chuẩn hoá hàng bằng 1: `θ_ij(H) = σ_jj⁻¹ Σ_h (e_i' Φ_h Σ e_j)² / Σ_h (e_i' Φ_h Σ Φ_h' e_i)`. Các số đo Diebold–Yilmaz: `FROM_i = Σ_{j≠i} θ_ij`, `TO_j = Σ_{i≠j} θ_ij`, `NET_j = TO_j − FROM_j`, chỉ số tổng = trung bình `FROM`. Bản cuốn chiếu (cửa sổ 250 phiên). Phụ thuộc đuôi: `P(Y trong 5% tệ nhất | X trong 5% tệ nhất)`, hai chuỗi độc lập cho ≈ 5%.

### 4.5 Co rút phân cấp
Beta từng mã `b_i ~ N(β_i, v_i)`, `β_i ~ N(μ, τ²)` (τ² theo DerSimonian–Laird). Trung bình hậu nghiệm `β̂_i = μ + B_i (b_i − μ)`, `B_i = τ² / (τ² + v_i)`. Hai tầng: mã → ngành → thị trường; ngành dưới 3 mã mượn τ² trung bình của các ngành khác.

### 4.6 Kịch bản
Cú sốc tính bằng độ lệch chuẩn, đổi sang đơn vị đã biến đổi của từng yếu tố. Đáp ứng là chiếu cục bộ (Jordà 2005): hồi quy lợi suất cộng dồn `Σ_{j≤h} y_{t+j}` trên vector cú sốc cộng điều khiển, sai số HAC có tính chồng lấn; mỗi tầm nhìn có khoảng tin cậy riêng. Các cú sốc được cộng tuyến tính.

### 4.7 Truyền dẫn theo phơi nhiễm
Chuyển phơi nhiễm báo cáo thành phơi nhiễm theo kênh (ví dụ `policy_trade = % doanh thu Mỹ`, `fx_rates = doanh thu ngoại tệ − nợ ngoại tệ`) nhân hệ số dấu cố định. Kết quả luôn **bậc C**: suy ra từ dữ kiện, không ước lượng từ lợi suất.

## 5. API `/api/world/*`

| Route | Nội dung chính của kết quả |
|---|---|
| `GET series` | yếu tố (vùng, kênh), ngành, thị trường, kịch bản, ý nghĩa các bậc |
| `GET overview` | `pulse` (z mở rộng, số liên kết), `tierCounts`, `spillover`, số sự kiện chờ đo |
| `POST matrix` `{asOf?, maxLag?}` | `cells[]`: `factor, sector, direction, beta, t, q, lag, tier, reasonVi, stable, oosPass`; `counts` |
| `GET connectedness?window&H&step` | `full`, `recent` (bảng, from, to, net, total), `rolling`, `vnReceivesFrom`, `tailDependence` |
| `GET events` | `events[]`: CAR, `ci90`, `q`, `tier` (`A`/`B`/`C`/`pending`), `bmp`, `extraction` |
| `GET events/:id` | `alignment`, `path` (AR và CAR theo phiên), `model`, `sectors[]` |
| `GET stock/:code` | `exposure`, `channels`, `betas[]` (own, sectorPrior, shrunk, ownWeight, tier) |
| `POST scenario` `{scenarioId \| shocks:[{factor,sigma}], horizon?}` | `sectors[]` (IRF, est, lo, hi, conclusive), `stocks[]`, `conclusiveCount` |

Quy ước lỗi: 400 đầu vào sai, 404 không tìm thấy, 405 route không hỗ trợ, 422 thiếu dữ liệu. Mọi payload mang `notice` khi dữ liệu là mô phỏng. Cache theo phiên bản dữ liệu.

## 6. Công cụ chat (`world-chat-tools.ts`)

`world_links`, `world_events`, `world_connectedness`, `world_scenario`, `world_stock_profile`. Cùng hợp đồng với `macro-chat-tools`: tham số được kiểm tra, kết quả gọn (dưới 5,5 KB) lấy nguyên từ API, kèm `guidance`. `WORLD_CHAT_GUIDELINES` nối vào system prompt: nêu bậc khi nêu liên kết, bậc C không phải "có tác động", sự kiện `pending` chưa đo được, kết nối không phải dự báo, kịch bản `conclusive = false` là chưa kết luận hướng.

## 7. Thành phần React (`src/ui/world/`)

| Thành phần | Props chính | Ghi chú |
|---|---|---|
| `WorldTab` | `client?`, `baseUrl?`, `theme: 'light'\|'dark'\|'auto'`, `initialStock?` | Container, sáu phần con, `useAsync` huỷ yêu cầu cũ |
| `WorldMatrix` / `WorldFilterBar` | `view`, `selected`, `onSelect` / `state`, `onChange`, `channels` | Bảng có `scope`, mỗi ô là nút có `aria-label` |
| `WorldPulse` | `pulse[]` | |
| `ConnectednessPanel` | `data` | bảng lan truyền, cột thời gian, phụ thuộc đuôi |
| `EventList` / `EventDetail` | `events`, `selected`, `onSelect` / `d` | biểu đồ cột AR và CAR kèm khoảng tin cậy |
| `WorldScenario` | kịch bản, tầm nhìn, kết quả, ngành đang xem | thanh khoảng tin cậy, đường đáp ứng, bảng cổ phiếu |
| `StockProfile` | `d` | doanh thu theo vùng, hàng co rút (ngành, riêng, sau co rút) |
| `EvidenceChip`, `CiTrack`, `ColumnChart`, `Notice` | | thành phần dùng chung |

Mô hình hiển thị thuần (không React) ở `src/world-view.ts`: `buildWorldMatrixView`, `ciBar`, `columnBars`, token và `contrastRatio`. Client: `src/world-client.ts`.

**Token và chế độ tối.** Một nguồn duy nhất `WORLD_THEME` (36 token, sáng và tối). `scripts/gen-world-tokens.ts` sinh `world-tokens.css` từ nguồn đó; test kiểm tra CSS khớp TypeScript. `theme="auto"` theo hệ điều hành. Mọi cặp chữ/nền đạt WCAG AA (≥ 4,5:1) ở cả hai chế độ và dấu không phải chữ (trục, viền sọc) đạt 3:1; điều này được kiểm bằng test.

## 8. Thiết kế

Canvas thiết kế (7 màn hình): Tổng quan, Hồ sơ cổ phiếu, Điện thoại, Sự kiện, Kịch bản, và hai bản tối (Tổng quan, Điện thoại); mỗi màn hình có nút sáng/tối trong Tweaks. Bảng token thiết kế trùng `WORLD_THEME`. Số liệu trên canvas là minh hoạ. Ánh xạ: Tổng quan → `WorldPulse` + `WorldMatrix`; Sự kiện → `EventList` + `EventDetail`; Kịch bản → `WorldScenario`; Hồ sơ cổ phiếu → `StockProfile`; Điện thoại → bố cục dưới 640px. Ảnh chụp giao diện React thật ở `docs/preview-world-*.png`.

## 9. Kiểm chứng

| Hạng mục | Kết quả |
|---|---|
| Test | 200 đạt (16 bộ); `tsc --strict` sạch |
| GFEVD | khớp công thức đóng ở H=1; không phụ thuộc thứ tự biến; bất biến theo thang đo; hàng cộng đủ 100% |
| Kết nối | thị trường độc lập → chỉ số tổng < 3%; nguồn truyền một chiều → net dương; nhận diện được chế độ kết nối tăng |
| Event study | kích thước kiểm định 5% rơi trong 2–9% (500 lần); tỷ lệ phương sai thực nghiệm/dự báo 0,85–1,18 (800 lần); BMP kiểm soát dương tính giả |
| Co rút | giảm sai số bình phương trung bình ít nhất 15% so với ước lượng thô (mô phỏng 200 lần) |
| Khôi phục hiệu ứng cài sẵn | các liên kết cài sẵn được nhận đúng hướng; PMI Trung Quốc→Cảng t = 8, bậc A sau khi sửa quy tắc phân xử; ≤ 2 dương tính giả trong 130 ô |
| Giao diện | dựng bằng trình duyệt thật ở 1280px và 390px, sáng và tối, không tràn ngang |

## 10. Giới hạn (không che giấu)

1. **Mọi kết quả dùng dữ liệu mô phỏng.** Chưa biết các liên kết có tồn tại trên số liệu thật hay không; các con số trên canvas và ảnh chụp đều là minh hoạ.
2. **Chưa chạy bằng Vitest thật** (môi trường tạo gói không có mạng; test chạy qua lớp shim tối giản). Giao diện chưa được thử trong trình duyệt với API sống; mới kiểm tra bằng render phía server và ảnh chụp tĩnh.
3. **Chưa có:** TVP-VAR, DCC-GARCH, MIDAS, đường ống AI trích sự kiện, đồ thị chuỗi cung ứng lưu bền, nguồn dữ liệu thật. Danh sách này không phải "đã tích hợp tất cả công nghệ": mới cài những phần kiểm chứng được.
4. Kiểm định ngoài mẫu cho bậc A dùng walk-forward **một yếu tố**, ngưỡng (IC ≥ 0,05; p ≤ 0,10; thắng mô hình ngây thơ) do người viết chọn, chưa hiệu chỉnh trên dữ liệu thật.
5. Căn phiên cần truyền lịch phiên Việt Nam đầy đủ (kể cả ngày lễ); giờ đóng cửa mặc định 15:00 là tham số. Biên độ ±7% áp cho HOSE; HNX và UPCoM khác.
6. Event study dùng mô hình thị trường một nhân tố; sự kiện cùng ngày làm chồng lấn cửa sổ chưa được xử lý riêng.
7. Beta cổ phiếu trong bản demo chỉ có cho hai yếu tố (TARIFF, CONTAINER); kịch bản cộng tuyến tính các cú sốc.
8. API không có xác thực hay giới hạn tần suất; cache nằm trong bộ nhớ một tiến trình.

## 11. Lộ trình tiếp theo

| Bước | Việc | Nghiệm thu |
|---|---|---|
| G1 | Nối dữ liệu thật (giá thế giới theo ngày, lịch phiên, 13 yếu tố tháng, chỉ số ngành) qua `VintageStore`; kiểm tra chất lượng | `issues` không còn mức error; ma trận chạy được |
| G2 | So kết quả với kỳ vọng kinh tế; ghi lại các dấu khác nhau | tài liệu nhận định, không chỉnh để khớp |
| G3 | Nạp phơi nhiễm cổ phiếu từ báo cáo tài chính có `sourceRef` | validator đạt toàn bộ |
| G4 | Đường ống AI trích sự kiện với rào chắn ở 3.2 và hàng đợi kiểm duyệt | không sự kiện chưa kiểm duyệt nào vào đo |
| G5 | TVP-VAR cho kết nối biến thiên theo thời gian; DCC-GARCH cho tương quan có điều kiện | vượt bản cuốn chiếu trên dữ liệu thật |
| G6 | Thử `WorldTab` với API sống; thêm xác thực | luồng đầu cuối trong trình duyệt |
