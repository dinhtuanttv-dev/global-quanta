// Vision Capture Service — tương ứng Mục 2 & Mục 11 tài liệu kỹ thuật.
// Mặc định chạy MOCK để package chạy được ngay không cần trình duyệt headless.
//
// Để bật chụp ảnh THẬT bằng Playwright:
//   1) cd backend && npm install playwright && npx playwright install chromium
//   2) đặt USE_MOCK_DATA=false trong .env
//   3) cung cấp targetUrl hợp lệ (vd: trang biểu đồ TradingView/DNSE)
//
// ĐÃ SỬA: trước đây dùng `({ chromium } = await import("playwright"))`
// (dynamic import) — với package CommonJS như `playwright`, cách này có
// thể trả về `chromium: undefined` do cơ chế tương thích CJS/ESM của Node
// đôi khi không "phẳng hóa" đúng named export qua dynamic import(), dù
// package đã cài đúng (đã tự gặp lỗi thật: "Cannot read properties of
// undefined (reading 'launch')"). Chuyển sang static import ở đầu file —
// Node xử lý tương thích CJS/ESM cho named import đáng tin cậy hơn nhiều.
//
// Đánh đổi: nếu `playwright` CHƯA được cài, static import sẽ làm cả file
// (và cả server) lỗi ngay khi khởi động, thay vì lỗi runtime gọn gàng lúc
// gọi API như trước. Bọc try/catch quanh việc load module bằng
// createRequire để vẫn giữ được thông báo lỗi thân thiện khi chưa cài.

import { createRequire } from "module";

const USE_MOCK = process.env.USE_MOCK_DATA !== "false";

function loadChromium() {
  try {
    // eslint-disable-next-line no-undef
    const require = createRequire(import.meta.url);
    const playwright = require("playwright");
    if (!playwright?.chromium) {
      throw new Error("Module 'playwright' đã cài nhưng không thấy export 'chromium'.");
    }
    return playwright.chromium;
  } catch (err) {
    throw new Error(
      `Chưa cài đặt Playwright hoặc cài lỗi (${err.message}). Chạy: npm install playwright && npx playwright install chromium`
    );
  }
}

export async function captureCharts(symbol, timeframes) {
  if (USE_MOCK) {
    return mockCapture(symbol, timeframes);
  }
  return realCapture(symbol, timeframes);
}

function mockCapture(symbol, timeframes) {
  return timeframes.map((tf) => ({
    timeframe: tf,
    symbol,
    imageBase64: null,
    capturedAt: new Date().toISOString(),
    source: "mock",
  }));
}

async function realCapture(symbol, timeframes) {
  const chromium = loadChromium();
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const tf of timeframes) {
      const page = await browser.newPage({ deviceScaleFactor: 2 });
      const targetUrl = buildChartUrl(symbol, tf);
      await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 });

      const chartSelector = process.env.CHART_CANVAS_SELECTOR || "canvas";
      const el = await page.$(chartSelector);
      const buffer = el ? await el.screenshot({ type: "png" }) : await page.screenshot({ type: "png" });

      results.push({
        timeframe: tf,
        symbol,
        imageBase64: buffer.toString("base64"),
        capturedAt: new Date().toISOString(),
        source: "playwright",
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }

  return results;
}

function buildChartUrl(symbol, timeframe) {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}&interval=${timeframe}`;
}
