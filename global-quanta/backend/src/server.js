import "dotenv/config";
import express from "express";
import cors from "cors";
import scanRouter from "./routes/scan.js";
import ssiRouter from "./routes/ssi.js";
import marketRouter from "./routes/market.js";
import { createMacroRouter } from "./routes/macro.js";
import { createMacroService } from "./market/macro/macroService.js";
import { createWorldRouter } from "./routes/world.js";
import { createWorldService } from "./market/world/worldService.js";
import { createCommodityService } from "./market/commodities/commodityService.js";
import { createCommoditiesRouter } from "./routes/commodities.js";
import { createWorldSectorService } from "./market/worldSectors/worldSectorService.js";
import { createWorldSectorsRouter } from "./routes/worldSectors.js";
import { SECTOR_RRG_HISTORY_KV } from "./market/sectors/sectorRotation.js";
import { startMarketIngestor, getMarketRuntime } from "./market/runtime.js";
import { isOriginAllowed, parseAllowedOrigins } from "./utils/corsOrigins.js";

const app = express();

// Chỉ số ngành ICB (KV `sectors:rrg:history`, ~1–2 MB) dùng chung cho Kết nối thế giới / hàng hoá / ngành thế giới — đệm 15 phút
// để mỗi request không đọc lại KV (egress Supabase).
let sectorDocMemo = null;
const sectorIndices = async () => {
  if (sectorDocMemo && Date.now() - sectorDocMemo.at < 15 * 60_000) return sectorDocMemo.value;
  const value = (await getMarketRuntime().store.getKv(SECTOR_RRG_HISTORY_KV))?.value?.sectors ?? null;
  if (value) sectorDocMemo = { at: Date.now(), value };
  return value;
};
const PORT = process.env.PORT || 4000;

// FRONTEND_ORIGIN: danh sách phân tách bằng dấu phẩy, hỗ trợ "*" cho URL preview
// Vercel (xem utils/corsOrigins.js) khi Gateway chạy ở domain riêng.
const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_ORIGIN || "http://localhost:5173");
app.use(cors({ origin: (origin, callback) => callback(null, isOriginAllowed(origin, allowedOrigins)) }));
app.use(express.json({ limit: "15mb" })); // ảnh base64 cần payload lớn hơn mặc định

function healthHandler(req, res) {
  res.json({
    status: "ok",
    mock_mode: process.env.USE_MOCK_DATA !== "false",
    time: new Date().toISOString(),
  });
}

app.get("/health", healthHandler);
// ĐÃ THÊM: alias /api/health — khớp với route trên bản Vercel
// (api/health.js) để frontend (checkHealth() trong api.ts) gọi đúng cùng
// 1 đường dẫn dù đang chạy local hay đã deploy, không cần code rẽ nhánh
// theo môi trường cho riêng health check.
app.get("/api/health", healthHandler);

app.use("/api", scanRouter);
app.use("/api/ssi", ssiRouter);
app.use("/api/market", marketRouter);
// Trung tâm vĩ mô (tab Chất xúc tác): engine MacroCenter chạy trong worker thread, số liệu thật chỉ-thêm trong KV.
let macroService = null;
const getMacroService = () => (macroService ??= createMacroService({ store: getMarketRuntime().store, history: getMarketRuntime().nominalHistory }));
app.use("/api/macro", createMacroRouter({ getService: getMacroService }));
// Kết nối thế giới (engine world của gói macro-center 1.2): dữ liệu thật dựng 2 lần/ngày, engine trong worker thread.
let worldService = null;
const getWorldService = () => (worldService ??= createWorldService({
  store: getMarketRuntime().store, history: getMarketRuntime().nominalHistory, corporateActions: getMarketRuntime().corporateActions,
  macroObservations: () => getMacroService().observations(),
  sectorIndices,
}));
app.use("/api/world", createWorldRouter({ getService: getWorldService }));
// Nhịp đập hàng hoá (C1): Yahoo (ngày) + World Bank Pink Sheet (tháng), mỗi số kèm kỳ + nguồn.
let commodityService = null;
const getCommodityService = () => (commodityService ??= createCommodityService({
  store: getMarketRuntime().store, taSeries: getMarketRuntime().taSeries,
  sectorIndices,
}));
app.use("/api/commodities", createCommoditiesRouter({ getService: getCommodityService }));
// Nhịp đập thị trường (M1): ngành thế giới (STOXX 600 / SPDR / TOPIX-17 / KODEX …) ↔ ngành ICB Việt Nam.
let worldSectorService = null;
const getWorldSectorService = () => (worldSectorService ??= createWorldSectorService({
  sectorIndices, taSeries: getMarketRuntime().taSeries, commoditySeries: (id) => getCommodityService().seriesOf(id),
}));
app.use("/api/world-sectors", createWorldSectorsRouter({ getService: getWorldSectorService }));

app.use((req, res) => {
  res.status(404).json({ error: "Không tìm thấy route." });
});

app.listen(PORT, () => {
  console.log(`AI Chart Vision backend đang chạy tại http://localhost:${PORT}`);
  console.log(`Mock mode: ${process.env.USE_MOCK_DATA !== "false" ? "BẬT (không cần API key)" : "TẮT (dùng API thật)"}`);
  // Đồng bộ dữ liệu SSI vào kho theo lịch (chỉ khi MARKET_INGESTOR_ENABLED=true).
  startMarketIngestor();
});

// Railway gửi SIGTERM khi deploy/khởi động lại: ghi nốt dòng lệnh tick còn trong bộ nhớ rồi thoát.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, async () => {
    try {
      await Promise.race([getMarketRuntime().tickRecorder.flush(), new Promise((r) => setTimeout(r, 8_000))]);
    } finally {
      process.exit(0);
    }
  });
}
