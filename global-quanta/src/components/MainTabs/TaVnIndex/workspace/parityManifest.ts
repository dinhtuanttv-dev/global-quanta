// SC0 — BẢN KÊ BẢO TOÀN TÍNH NĂNG của phần Chart + bảng phân tích tab TA VN-Index (TA_SUPER_CHART, anh duyệt 24/10/2026).
// Mỗi tính năng ĐANG CÓ: nhóm, vị trí hiện tại, vị trí đích sau nâng cấp (SC1–SC4) và phép kiểm tự động (E2E backend/e2e/ta-parity.ts).
// Quy tắc: SC1–SC6 được dời vị trí nhưng KHÔNG được làm đỏ bất kỳ dòng nào; selector là hợp đồng ổn định (data-testid / data-layer / data-tf / data-tool).
// Chỉ dùng cú pháp xoá-được-kiểu (type stripping của Node 24 chạy trực tiếp tệp này).

export type ParityGroup = "header" | "chart" | "pane" | "overlay" | "engine" | "drawing" | "analysis" | "elliott" | "structure" | "handoff";
export type ParityTarget = "Header" | "Toolbar" | "Lớp & pane" | "Chart" | "Inspector" | "Dock" | "Đối tượng";

export type ParityCheck =
  | { kind: "visible"; sel: string }
  | { kind: "layer"; key: string; pane?: boolean; expect?: string }
  | { kind: "tf"; tf: string }
  | { kind: "keys" }
  | { kind: "draw"; tool: string; clicks?: 1 | 2 }
  | { kind: "click"; sel: string; expect: string }
  | { kind: "steps"; clicks: string[]; expect: string }
  | { kind: "tabs"; sel: string; min: number }
  | { kind: "custom"; name: "ticker" | "pin" | "structureEvent" | "drawSaved" | "clearAll" | "countSave" };

export interface ParityItem { id: string; group: ParityGroup; feature: string; now: string; target: ParityTarget; check: ParityCheck }

const LAYER = (id: string, feature: string, target: ParityTarget, pane = false, expect?: string): ParityItem =>
  ({ id: `layer-${id}`, group: pane ? "pane" : "overlay", feature, now: "Hàng công tắc lớp trên chart", target, check: { kind: "layer", key: id, pane, ...(expect ? { expect } : {}) } });

export const PARITY_MANIFEST = [
  // ---- Thanh đầu: mã, dữ liệu, khung thời gian
  { id: "ticker-selector", group: "header", feature: "Chọn mã (ô nhập + VN-Index/VN30/HNX)", now: "Đầu tab", target: "Header", check: { kind: "visible", sel: "[data-testid=ta-ticker-selector]" } },
  { id: "ticker-change", group: "header", feature: "Đổi mã -> tải lại nến + phân tích", now: "Đầu tab", target: "Header", check: { kind: "custom", name: "ticker" } },
  { id: "price-basis", group: "header", feature: "Cơ sở giá · số phiên · khoảng ngày · cảnh báo · sự kiện quyền", now: "Dòng chữ nhỏ trên khung thời gian", target: "Header", check: { kind: "visible", sel: "[data-testid=price-basis]" } },
  ...["1m", "5m", "15m", "1H", "D", "W", "M"].map((tf): ParityItem => ({ id: `tf-${tf}`, group: "header", feature: `Khung ${tf}`, now: "Hàng khung thời gian", target: "Header", check: { kind: "tf", tf } })),
  { id: "tf-note", group: "header", feature: "Ghi chú nguồn nến (phút SSI / gộp từ D)", now: "Cuối hàng khung thời gian", target: "Header", check: { kind: "visible", sel: "[data-testid=tf-note]" } },
  // ---- Chart
  { id: "chart-canvas", group: "chart", feature: "Biểu đồ nến (Lightweight Charts v5) + crosshair", now: "Giữa tab", target: "Chart", check: { kind: "visible", sel: "[data-testid=ta-chart] [role=application]" } },
  { id: "chart-keys", group: "chart", feature: "Bàn phím ← → (Shift) + − Home End", now: "Khi chart được focus", target: "Chart", check: { kind: "keys" } },
  { id: "chart-pin", group: "chart", feature: "Lớp phủ ghim chặt vào nến khi kéo / zoom", now: "Lớp phủ canvas", target: "Chart", check: { kind: "custom", name: "pin" } },
  // ---- Pane + lớp phủ + engine
  LAYER("volume", "Pane Khối lượng", "Lớp & pane", true), LAYER("rsi", "Pane RSI 14", "Lớp & pane", true),
  LAYER("orderflow", "Pane Order Flow (delta / CVD)", "Lớp & pane"), LAYER("foreign", "Pane Khối ngoại", "Lớp & pane"),
  LAYER("vprofile", "Volume Profile", "Lớp & pane"), LAYER("avwap", "Anchored VWAP", "Lớp & pane"),
  LAYER("smc", "SMC (OB, FVG, BOS/CHoCH, thanh khoản, premium/discount)", "Lớp & pane"), LAYER("vsa", "VSA", "Lớp & pane"),
  LAYER("wyckoff", "Wyckoff", "Lớp & pane"), LAYER("corporate", "Sự kiện quyền ■", "Lớp & pane"),
  LAYER("pring", "Mô hình giá (Pring)", "Lớp & pane"),
  LAYER("structure", "Cấu trúc MTF (lớp + bảng)", "Lớp & pane", false, "[data-testid=structure-panel]"),
  LAYER("elliottPro", "Elliott Pro (lớp + chip 3 chế độ)", "Lớp & pane", false, "[data-testid=elliott-pro-chip]"),
  LAYER("elliottMine", "Elliott của tôi (cách đếm chỉnh tay)", "Lớp & pane"),
  LAYER("trendline", "Lớp hình vẽ Trendline", "Lớp & pane"), LAYER("demandzone", "Lớp hình vẽ Demand Zone", "Lớp & pane"),
  LAYER("elliott", "Elliott vẽ tay cũ (chỉ đọc)", "Lớp & pane"),
  { id: "confluence", group: "engine", feature: "Confluence Engine (đối chiếu hình vẽ với SMC·VSA·Wyckoff)", now: "Cuối hàng công tắc", target: "Toolbar", check: { kind: "click", sel: "[data-testid=confluence-engine]", expect: "[data-testid=confluence-engine][aria-pressed=true]" } },
  // ---- Vẽ
  { id: "draw-trendline", group: "drawing", feature: "Vẽ Trendline", now: "Thanh icon dọc trên chart", target: "Toolbar", check: { kind: "draw", tool: "trendline" } },
  { id: "draw-zone", group: "drawing", feature: "Vẽ Zone (chữ nhật)", now: "Thanh icon dọc trên chart", target: "Toolbar", check: { kind: "draw", tool: "rectangle" } },
  { id: "draw-fib", group: "drawing", feature: "Fibonacci thoái lui", now: "Thanh icon dọc trên chart", target: "Toolbar", check: { kind: "draw", tool: "fibonacci" } },
  { id: "draw-fibtime", group: "drawing", feature: "Fibonacci Time Zones (1 click)", now: "Thanh icon dọc trên chart", target: "Toolbar", check: { kind: "draw", tool: "fibTimeZone", clicks: 1 } },
  { id: "fib-ext", group: "drawing", feature: "Fib Extension 127,2/161,8/261,8%", now: "Nút 'Ext'", target: "Toolbar", check: { kind: "click", sel: "[data-testid=fib-ext]", expect: "[data-testid=fib-ext][aria-pressed=true]" } },
  { id: "draw-saved", group: "drawing", feature: "Lưu hình vẽ theo mã (máy / tài khoản) + báo đã lưu", now: "Chip trên chart", target: "Đối tượng", check: { kind: "custom", name: "drawSaved" } },
  { id: "draw-clear", group: "drawing", feature: "Xoá hình vẽ", now: "Nút đỏ trên chart", target: "Đối tượng", check: { kind: "custom", name: "clearAll" } },
  // ---- Bảng phân tích
  { id: "smart-note", group: "analysis", feature: "Smart Note (tóm tắt + hỏi AI)", now: "Nút đè góc phải chart", target: "Inspector", check: { kind: "click", sel: "[data-testid=smart-note-open]", expect: "[data-testid=smart-note]" } },
  { id: "smc-panel", group: "analysis", feature: "Thẻ SMC", now: "Dưới chart", target: "Dock", check: { kind: "visible", sel: "[data-testid=smc-panel]" } },
  { id: "vsa-panel", group: "analysis", feature: "Thẻ VSA", now: "Dưới chart", target: "Dock", check: { kind: "visible", sel: "[data-testid=vsa-panel]" } },
  { id: "backtest", group: "analysis", feature: "Event study CHoCH (khung D/W/M)", now: "Dưới chart", target: "Dock", check: { kind: "visible", sel: "[data-testid=backtest-panel]" } },
  { id: "orderflow-panel", group: "analysis", feature: "Bảng Order Flow / Khối ngoại", now: "Dưới chart", target: "Dock", check: { kind: "visible", sel: "[data-testid=orderflow-panel]" } },
  { id: "oscillators", group: "analysis", feature: "RSI / MACD / ADX", now: "Dưới chart", target: "Dock", check: { kind: "visible", sel: "[data-testid=oscillator-panel]" } },
  { id: "signal-log", group: "analysis", feature: "Nhật ký tín hiệu (AI Signal Log)", now: "Cuối phần chart", target: "Dock", check: { kind: "visible", sel: "[data-testid=signal-log]" } },
  // ---- Elliott Pro
  { id: "elliott-pro", group: "elliott", feature: "Bảng Elliott Pro", now: "Dưới chart", target: "Dock", check: { kind: "visible", sel: "[data-testid=elliott-pro-panel]" } },
  { id: "elliott-pro-tabs", group: "elliott", feature: "6 tab Elliott Pro (Tổng quan…Theo sách)", now: "Trong bảng Elliott Pro", target: "Dock", check: { kind: "tabs", sel: "[data-testid^=elliott-pro-tab-]", min: 6 } },
  { id: "elliott-edit", group: "elliott", feature: "Chỉnh tay cách đếm (trình chỉnh + undo/redo)", now: "Tab 'Của tôi'", target: "Toolbar", check: { kind: "steps", clicks: ["[data-testid=elliott-pro-tab-mine]", "[data-testid=elliott-edit]"], expect: "[data-testid=elliott-count-editor]" } },
  { id: "elliott-history", group: "elliott", feature: "Lưu phiên bản cách đếm + lịch sử phiên bản", now: "Tab 'Của tôi'", target: "Dock", check: { kind: "custom", name: "countSave" } },
  { id: "elliott-alerts", group: "elliott", feature: "Cảnh báo giá Elliott", now: "Tab 'Của tôi'", target: "Dock", check: { kind: "steps", clicks: ["[data-testid=elliott-pro-tab-mine]"], expect: "[data-testid=elliott-alerts]" } },
  { id: "elliott-book", group: "elliott", feature: "Tab 'Theo sách' (engine GET, 6 lớp cũ)", now: "Bảng Elliott Pro", target: "Dock", check: { kind: "steps", clicks: ["[data-testid=elliott-pro-tab-book]"], expect: "[data-testid=elliott-pro-book]" } },
  // ---- Cấu trúc MTF
  { id: "structure-open", group: "structure", feature: "Nút 'Phân tích cấu trúc' -> bật lớp + bảng", now: "Dưới hàng công tắc", target: "Toolbar", check: { kind: "click", sel: "[data-testid=structure-open]", expect: "[data-testid=structure-panel]" } },
  { id: "structure-modes", group: "structure", feature: "3 chế độ Tổng quan / Giao dịch / Chuyên sâu", now: "Bảng Cấu trúc", target: "Dock", check: { kind: "tabs", sel: "[data-structure-mode]", min: 3 } },
  { id: "structure-replay", group: "structure", feature: "Phát lại (khung D/W)", now: "Bảng Cấu trúc", target: "Dock", check: { kind: "visible", sel: "[data-testid=structure-replay]" } },
  { id: "structure-chip", group: "structure", feature: "Chip kết luận trên chart", now: "Góc phải chart", target: "Chart", check: { kind: "visible", sel: "[data-testid=structure-chip]" } },
  // ---- Bàn giao từ bộ lọc
  { id: "handoff-structure", group: "handoff", feature: "Bộ lọc 'Mở trên biểu đồ với cấu trúc' (sự kiện gq:structure-open)", now: "Bảng phụ bộ lọc -> chart", target: "Chart", check: { kind: "custom", name: "structureEvent" } },
] as const satisfies readonly ParityItem[];

export const PARITY_IDS = PARITY_MANIFEST.map((x) => x.id);
