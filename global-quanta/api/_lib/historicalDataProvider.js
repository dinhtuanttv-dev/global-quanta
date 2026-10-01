// Bản Vercel dùng CHUNG logic với backend Express để hai runtime không lệch
// chính sách nguồn dữ liệu. Trên Vercel nên đặt HISTORICAL_DATA_SOURCE=market_gateway
// (kèm MARKET_GATEWAY_URL) vì serverless không giữ được kết nối SSI.
export * from "../../backend/src/services/historicalDataProvider.js";
