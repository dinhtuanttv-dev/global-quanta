// Feature Extraction Service — Vision-to-Quant Indicator Mapping (Mục 4.2)
// và Market Microstructure Layer (Mục 6).
//
// Đây là nơi kết nối dữ liệu thô từ API sàn (Binance/DNSE/SSI...) để tính
// Order Flow Imbalance, Volume Profile POC, Liquidity Pool Mapping và
// Cross-Asset Correlation. Bản MVP trả về dữ liệu mock có cấu trúc đúng
// schema — thay các hàm bên dưới bằng lệnh gọi API sàn thật khi triển khai.

export async function extractQuantFeatures(symbol) {
  // TODO (production): gọi API sàn thật, ví dụ:
  //   const orderBook = await fetch(`https://api.exchange.com/depth?symbol=${symbol}`)
  //   const cvd = computeCumulativeVolumeDelta(orderBook)
  return {
    order_flow_bias: mockOrderFlowBias(),
    liquidity_pools: mockLiquidityPools(),
    correlation_flag: mockCorrelationFlag(),
    volume_profile_poc: mockPOC(),
  };
}

function mockOrderFlowBias() {
  const options = ["Bullish CVD", "Bearish CVD", "Neutral"];
  return options[Math.floor(Math.random() * options.length)];
}

function mockLiquidityPools() {
  const base = 1200 + Math.round(Math.random() * 50);
  return [base, base + 30, base + 65];
}

function mockCorrelationFlag() {
  const options = ["Aligned with macro", "Conflicting with DXY", "Neutral correlation"];
  return options[Math.floor(Math.random() * options.length)];
}

function mockPOC() {
  return 1225 + Math.round(Math.random() * 20);
}
