// Vision Capture Service — tương ứng Mục 2 & Mục 11 tài liệu kỹ thuật.
// Mặc định chạy MOCK để package chạy được ngay không cần trình duyệt headless.
//
// Để bật chụp ảnh THẬT bằng Playwright:
//   1) cd backend && npm install playwright && npx playwright install chromium
//   2) đặt USE_MOCK_DATA=false trong .env
//   3) cung cấp targetUrl hợp lệ (vd: trang biểu đồ TradingView/DNSE)
//
// Công thức tối ưu khung hình (Mục 2.1):
//   - Dynamic Bounding Box qua DOM Selector của vùng canvas biểu đồ
//   - Device Pixel Ratio ép 2x để nét chữ chỉ báo không bị vỡ khi nén ảnh

const USE_MOCK = process.env.USE_MOCK_DATA !== "false";

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
    // ảnh thật sẽ là base64 PNG; ở mock mode chỉ trả về placeholder
    imageBase64: null,
    capturedAt: new Date().toISOString(),
    source: "mock",
  }));
}

async function realCapture(symbol, timeframes) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (err) {
    throw new Error(
      "Chưa cài đặt Playwright. Chạy: npm install playwright && npx playwright install chromium"
    );
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const tf of timeframes) {
      const page = await browser.newPage({ deviceScaleFactor: 2 }); // Pixel Density 2x
      const targetUrl = buildChartUrl(symbol, tf);
      await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 });

      // Dynamic Bounding Box — chỉnh selector này theo nền tảng biểu đồ thực tế
      const chartSelector = process.env.CHART_CANVAS_SELECTOR || "canvas";
      const el = await page.$(chartSelector);
      const buffer = el
        ? await el.screenshot({ type: "png" })
        : await page.screenshot({ type: "png" });

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
  // Tùy biến theo nền tảng biểu đồ đang dùng (TradingView, DNSE, v.v.)
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}&interval=${timeframe}`;
}
