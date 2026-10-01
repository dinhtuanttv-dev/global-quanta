import test from "node:test";
import assert from "node:assert/strict";

import { createSsiFcV2Provider } from "../src/market/providers/ssiFcV2Provider.js";
import { createSsiV3Provider } from "../src/market/providers/ssiV3Provider.js";

test("SSI FC v2: tham số đúng định dạng SSI (dd/mm/yyyy, pageSize hợp lệ) và phân trang", async () => {
  const calls = [];
  const call = async (endpoint, query) => {
    calls.push({ endpoint, query });
    const page = Number(query.pageIndex);
    const data = page === 1
      ? Array.from({ length: 1000 }, (_, i) => ({ Symbol: "SSI", TradingDate: `${String((i % 28) + 1).padStart(2, "0")}/01/2026`, Close: 1 }))
      : [{ Symbol: "SSI", TradingDate: "29/01/2026", Close: 2 }];
    return { status: "Success", totalRecord: 1001, data };
  };
  const provider = createSsiFcV2Provider({ call });
  const bars = await provider.getDailyOhlcv("ssi", "2026-01-01", "2026-01-29");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    endpoint: "DailyOhlc",
    query: { symbol: "SSI", fromDate: "01/01/2026", toDate: "29/01/2026", ascending: "true", pageIndex: "1", pageSize: "1000" },
  });
  assert.equal(calls[1].query.pageIndex, "2");
  assert.equal(bars.at(-1).date, "2026-01-29");
});

test("SSI FC v2: khoảng ngày dài được chia cửa sổ theo SSI_V2_MAX_RANGE_DAYS", async () => {
  process.env.SSI_V2_MAX_RANGE_DAYS = "30";
  try {
    const windows = [];
    const provider = createSsiFcV2Provider({ call: async (endpoint, q) => { windows.push([q.fromDate, q.toDate]); return { data: [] }; } });
    await provider.getDailyOhlcv("FPT", "2026-01-01", "2026-03-15");
    assert.deepEqual(windows, [["01/01/2026", "30/01/2026"], ["31/01/2026", "01/03/2026"], ["02/03/2026", "15/03/2026"]]);
  } finally {
    delete process.env.SSI_V2_MAX_RANGE_DAYS;
  }
});

test("SSI FC v2: giá điều chỉnh dùng ClosePriceAdjusted/ClosePrice làm hệ số cho cả OHLC", async () => {
  const provider = createSsiFcV2Provider({
    call: async () => ({
      data: [{ Symbol: "FPT", TradingDate: "02/01/2026", OpenPrice: 100, HighestPrice: 110, LowestPrice: 90, ClosePrice: 100, ClosePriceAdjusted: 50, TotalMatchVol: 7 }],
    }),
  });
  const [bar] = await provider.getDailyOhlcvAdjusted("FPT", "2026-01-02", "2026-01-02");
  assert.deepEqual([bar.open, bar.high, bar.low, bar.close, bar.volume], [50, 55, 45, 50, 7]);
});

test("SSI FC v2: thành phần chỉ số và mã chỉ số HNX theo cách đặt tên của SSI", async () => {
  const seen = [];
  const provider = createSsiFcV2Provider({
    call: async (endpoint, q) => {
      seen.push(q.indexCode);
      return { data: [{ IndexCode: q.indexCode, IndexComponent: [{ StockSymbol: "shs" }, { StockSymbol: "PVS" }, { StockSymbol: "PVS" }] }] };
    },
  });
  assert.deepEqual(await provider.getIndexComponents("HNX"), ["SHS", "PVS"]);
  assert.deepEqual(seen, ["HNXIndex"]);
});

test("SSI v3: tắt khi chưa có khoá; có khoá thì dùng SDK, không cần OTP", async () => {
  const off = createSsiV3Provider({ loadSdk: async () => { throw new Error("không được gọi"); } });
  delete process.env.SSI_V3_API_KEY;
  delete process.env.SSI_V3_API_SECRET;
  assert.equal(off.isConfigured(), false);

  process.env.SSI_V3_API_KEY = "k";
  process.env.SSI_V3_API_SECRET = "s";
  try {
    const authCalls = [];
    const sdk = {
      Auth: class {
        constructor(options) { this.options = options; this.tokenManager = { isTokenExpired: () => false }; }
        async authenticate(otp) { authCalls.push(otp); }
      },
      Data: class {
        constructor() {
          this.marketData = {
            getOhlc1DayHistorical: async (symbol, from, to, page, size) => {
              assert.equal(from, "2026/09/01 00:00:00");
              assert.equal(to, "2026/09/02 23:59:59");
              assert.equal(size, 1000);
              return [{ symbol, tradingDate: "2026/09/02", openPrice: 1, highPrice: 2, lowPrice: 1, closePrice: 2, volume: 5, value: 10 }];
            },
            getSecuritiesInfoByBoard: async (board) => [{ symbol: `${board}1`, board, symbolNameVi: "X", icbName: "Ngân hàng" }],
          };
        }
      },
    };
    const provider = createSsiV3Provider({ loadSdk: async () => sdk });
    assert.equal(provider.isConfigured(), true);
    const bars = await provider.getDailyOhlcv("fpt", "2026-09-01", "2026-09-02");
    assert.deepEqual(bars, [{ date: "2026-09-02", open: 1, high: 2, low: 1, close: 2, volume: 5, value: 10 }]);
    const secs = await provider.getSecurities({ exchange: "hose" });
    assert.deepEqual(secs.map((s) => [s.symbol, s.exchange, s.sector]), [["HOSE1", "HOSE", "Ngân hàng"]]);
    assert.deepEqual(authCalls, [undefined], "xác thực một lần, không truyền OTP");
  } finally {
    delete process.env.SSI_V3_API_KEY;
    delete process.env.SSI_V3_API_SECRET;
  }
});

// ---------- Hồi quy cho các điểm lạ quan sát được từ dữ liệu SSI thật (01/10/2026) ----------

import { normalizeIndexSnapshot, normalizePriceLimit } from "../src/market/normalizer.js";

test("SSI quirk: DailyIndex.Change lệch tỉ lệ -> tính lại từ RatioChange", () => {
  const snap = normalizeIndexSnapshot({ IndexId: "VNINDEX", IndexValue: "1749.3", Change: "-0.1931999999999990", RatioChange: "-1.09", Advances: "103", Declines: "172" });
  assert.ok(Math.abs(snap.change - -19.28) < 0.05, `change=${snap.change}`);
  assert.equal(snap.changePct, -1.09);
  // Khi hai trường khớp nhau thì giữ nguyên.
  assert.equal(normalizeIndexSnapshot({ IndexId: "VN30", IndexValue: 101, Change: 1, RatioChange: 1 }).change, 1);
});

test("SSI quirk: DailyStockPrice toàn sàn có bản ghi rác -> bị loại khỏi giá trần/sàn", () => {
  assert.equal(normalizePriceLimit({ Symbol: "0.8536:", TradingDate: "01/10/2026", CeilingPrice: "0", FloorPrice: "10946161920", RefPrice: "5473080960" }), null);
  assert.deepEqual(
    normalizePriceLimit({ Symbol: "FPT", TradingDate: "01/10/2026", CeilingPrice: "67400", FloorPrice: "58600", RefPrice: "63000" }),
    { symbol: "FPT", date: "2026-10-01", refPrice: 63000, ceiling: 67400, floor: 58600 },
  );
});

test("SSI quirk: 'There is no data' là kết quả rỗng hợp lệ, không phải sự cố", async () => {
  const provider = createSsiFcV2Provider({ call: async () => { throw Object.assign(new Error("There is no data"), { statusCode: 502 }); } });
  assert.deepEqual(await provider.getDailyOhlcv("XYZ", "2026-09-01", "2026-09-05"), []);
});

test("SSI quirk: Securities chỉ trả một phần -> ghép mã cổ phiếu từ DailyStockPrice toàn sàn", async () => {
  const provider = createSsiFcV2Provider({
    call: async (endpoint, q) => {
      if (q.market !== "HOSE") throw new Error("There is no data");
      if (endpoint === "Securities") return { data: [{ Market: "HOSE", Symbol: "CFPT2601", StockName: "Chứng quyền FPT" }] };
      return { data: [{ Symbol: "FPT" }, { Symbol: "HPG" }, { Symbol: "0.8536:" }, { Symbol: "02006052" }] };
    },
  });
  const secs = await provider.getSecurities();
  assert.deepEqual(secs.map((s) => [s.symbol, s.exchange]), [["CFPT2601", "HOSE"], ["FPT", "HOSE"], ["HPG", "HOSE"]]);
});

test("SSI quirk: IntradayOhlc.Value thực tế là giá -> bỏ, không coi là giá trị giao dịch", async () => {
  const provider = createSsiFcV2Provider({
    call: async () => ({ data: [{ Symbol: "FPT", Value: "62700", TradingDate: "01/10/2026", Time: "14:45:00", Open: "62700", High: "62700", Low: "62700", Close: "62700", Volume: "174900" }] }),
  });
  const [bar] = await provider.getIntradayOhlcv("FPT", "2026-10-01");
  assert.equal(bar.date, "2026-10-01T14:45:00+07:00");
  assert.equal(bar.value, null);
});
