// Cấu hình tầng dữ liệu thị trường. Mọi giá trị đọc lúc gọi (không cache ở
// module scope) để test có thể đổi process.env giữa các ca.

const DEFAULT_CHAINS = {
  // SSI API mới (SDK v3) -> SSI FC Data v2 -> nguồn cũ (Project A/Yahoo).
  securities: ["ssiV3", "ssiFcV2", "legacy"],
  indexComponents: ["ssiV3", "ssiFcV2", "legacy"],
  ohlcvDaily: ["ssiV3", "ssiFcV2", "legacy"],
  ohlcvIntraday: ["ssiV3", "ssiFcV2", "legacy"],
  indexDaily: ["ssiFcV2", "ssiV3", "legacy"],
  quotes: ["ssiV3", "ssiFcV2", "legacy"],
  priceLimits: ["ssiV3", "ssiFcV2"],
  indexSnapshot: ["ssiV3", "ssiFcV2", "legacy"],
};

function list(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function num(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function chainFor(dataset) {
  return list(`MARKET_CHAIN_${dataset.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`, DEFAULT_CHAINS[dataset] || []);
}

export function marketConfig() {
  return {
    staleMs: num("MARKET_STALE_MS", 60_000),
    fallbackPollMs: num("MARKET_FALLBACK_POLL_MS", 15_000),
    cacheTtlMs: {
      quotes: num("MARKET_CACHE_QUOTES_MS", 5_000),
      ohlcvDaily: num("MARKET_CACHE_OHLCV_MS", 10 * 60_000),
      ohlcvIntraday: num("MARKET_CACHE_INTRADAY_MS", 30_000),
      indexDaily: num("MARKET_CACHE_INDEX_MS", 60_000),
      securities: num("MARKET_CACHE_SECURITIES_MS", 6 * 60 * 60_000),
      indexComponents: num("MARKET_CACHE_SECURITIES_MS", 6 * 60 * 60_000),
      priceLimits: num("MARKET_CACHE_SECURITIES_MS", 6 * 60 * 60_000),
      indexSnapshot: num("MARKET_CACHE_INDEX_SNAPSHOT_MS", 15_000),
    },
    breaker: {
      failureThreshold: num("MARKET_BREAKER_FAILURES", 3),
      windowMs: num("MARKET_BREAKER_WINDOW_MS", 60_000),
      cooldownMs: num("MARKET_BREAKER_COOLDOWN_MS", 30_000),
      // Hysteresis: số lần thành công liên tiếp ở HALF_OPEN trước khi coi là khoẻ lại.
      recoverySuccesses: num("MARKET_BREAKER_RECOVERY_SUCCESSES", 3),
    },
    streamShardSize: Math.min(num("MARKET_STREAM_SHARD_SIZE", 50), 50),
    streamMaxSymbols: num("MARKET_STREAM_MAX_SYMBOLS", 500),
    streamIndices: list("MARKET_STREAM_INDICES", ["VNINDEX", "VN30", "HNXINDEX", "HNXUPCOMINDEX"]),
    eodUniverseIndices: list("MARKET_EOD_UNIVERSE_INDICES", ["VN30", "VN100"]),
    eodExtraSymbols: list("MARKET_EOD_EXTRA_SYMBOLS", []),
    backfillYears: num("MARKET_BACKFILL_YEARS", 3),
    holidays: new Set(list("MARKET_HOLIDAYS", [])), // YYYY-MM-DD
  };
}

export function featureFlags() {
  return {
    ingestorEnabled: String(process.env.MARKET_INGESTOR_ENABLED).toLowerCase() === "true",
    store: (process.env.MARKET_STORE || "memory").toLowerCase(),
  };
}
