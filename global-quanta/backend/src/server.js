import "dotenv/config";
import express from "express";
import cors from "cors";
import scanRouter from "./routes/scan.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }));
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

app.use((req, res) => {
  res.status(404).json({ error: "Không tìm thấy route." });
});

app.listen(PORT, () => {
  console.log(`AI Chart Vision backend đang chạy tại http://localhost:${PORT}`);
  console.log(`Mock mode: ${process.env.USE_MOCK_DATA !== "false" ? "BẬT (không cần API key)" : "TẮT (dùng API thật)"}`);
});
