// StreamHub: gom các phiên SSE của trình duyệt, giữ kết nối SSI upstream và
// phát quote/chỉ số đã chuẩn hoá kèm provenance.
//
// - Chia shard upstream: mỗi kết nối SignalR tối đa 50 mã (channel X:...),
//   thêm 1 kết nối MI:... cho chỉ số. Thêm/bớt mã chỉ ảnh hưởng shard chứa mã đó.
// - Tách "trạng thái kết nối" khỏi "độ mới dữ liệu": một mã chỉ LIVE khi giá
//   mới nhất của nó đến từ SSI stream VÀ shard của nó còn nhận tick trong ngưỡng.
// - Shard mất kết nối / im lặng quá ngưỡng trong phiên -> poll nguồn dự phòng
//   (SourceRouter: SSI v3 REST -> FC v2 -> nguồn cũ) và phát với source tương ứng.
// - Ngoài phiên giao dịch không có tick là bình thường (session = CLOSED).

import { marketConfig } from "../config.js";
import { currentSession, expectsLiveTicks } from "../calendar.js";
import { canonicalSymbol, isValidSymbol, normalizeIndexSnapshot, normalizeQuote, ssiV2IndexId } from "../normalizer.js";
import { MarketDataError, ValidationError } from "../errors.js";

const STREAM_SOURCE = "SSI_STREAM";

function mergeQuote(prev, next) {
  if (!prev) return next;
  const merged = { ...prev };
  for (const [key, value] of Object.entries(next)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    merged[key] = value;
  }
  return merged;
}

export class StreamHub {
  /**
   * @param {{
   *   createConnection: (opts: { channel: string, onMessage: Function, onStatus: Function }) => { start(): void, stop(): void, setChannel(c: string): void },
   *   fetchFallbackQuotes: (symbols: string[]) => Promise<{ quotes: any[], source: string, fallbackReason: string|null }>,
   *   fetchFallbackIndex?: (code: string) => Promise<{ snapshot: any, source: string, fallbackReason: string|null }>,
   *   upstreamEnabled: () => boolean,
   *   now?: () => number,
   *   onTransportChange?: (state: string) => void,
   * }} deps
   */
  constructor({ createConnection, fetchFallbackQuotes, fetchFallbackIndex, upstreamEnabled, now = Date.now, onTransportChange, monitorIntervalMs = 5_000 }) {
    this.createConnection = createConnection;
    this.fetchFallbackQuotes = fetchFallbackQuotes;
    this.fetchFallbackIndex = fetchFallbackIndex;
    this.upstreamEnabled = upstreamEnabled;
    this.now = now;
    this.onTransportChange = onTransportChange;
    this.monitorIntervalMs = monitorIntervalMs;

    this.subscribers = new Map();
    this.shards = new Map(); // id -> { id, symbols:Set, conn, state, connectedAt, lastTickAt }
    this.symbolShard = new Map();
    this.indexShard = null;
    this.nextShardId = 1;

    this.quotes = new Map(); // symbol -> { quote, at, source, fallbackReason }
    this.indices = new Map(); // code -> { snapshot, at, source, fallbackReason }
    this.lastPollAt = new Map();
    this.polling = false;
    this.lastTransport = null;
    this.lastStatusKey = new Map();
    // Dòng lệnh có dấu theo Lee–Ready, gom theo phút, chỉ giữ phiên hiện tại (bộ nhớ).
    this.tickFlow = new Map(); // symbol -> { date, minutes: Map(minute -> agg), lastSide, classifiedVolume }
  }

  /**
   * Lee–Ready trên tick X: KL khớp = ΔTotalVol giữa hai tick; chiều = so giá khớp với
   * giá chào bán/mua tốt nhất TRƯỚC lệnh (≥ ask: mua chủ động, ≤ bid: bán chủ động),
   * nằm giữa thì dùng tick rule; không xác định được thì giữ chiều trước đó.
   */
  #recordTick(prev, next) {
    if (!prev || !next?.symbol || !Number.isFinite(next.totalVolume) || !Number.isFinite(prev.totalVolume)) return;
    const qty = next.totalVolume - prev.totalVolume;
    if (!(qty > 0) || !(next.price > 0)) return;
    const date = String(next.time ?? "").slice(0, 10);
    const m = String(next.time ?? "").match(/T(\d{2}):(\d{2})/);
    if (!date || !m) return;
    const minute = Number(m[1]) * 60 + Number(m[2]);
    let flow = this.tickFlow.get(next.symbol);
    if (!flow || flow.date !== date) {
      flow = { date, minutes: new Map(), lastSide: 0, classifiedVolume: 0, dirty: new Set() };
      this.tickFlow.set(next.symbol, flow);
    }
    const bid = prev.bid?.[0]?.price, ask = prev.ask?.[0]?.price;
    let side = 0;
    if (ask > 0 && next.price >= ask) side = 1;
    else if (bid > 0 && next.price <= bid) side = -1;
    else if (prev.price > 0 && next.price !== prev.price) side = next.price > prev.price ? 1 : -1;
    else side = flow.lastSide;
    if (side !== 0) flow.lastSide = side;
    const agg = flow.minutes.get(minute) ?? { minute, buy: 0, sell: 0, unknown: 0, prints: 0, sizes: {} };
    if (side > 0) agg.buy += qty; else if (side < 0) agg.sell += qty; else agg.unknown += qty;
    agg.prints++;
    agg.sizes[qty] = (agg.sizes[qty] ?? 0) + 1;
    flow.minutes.set(minute, agg);
    flow.dirty.add(minute);
    flow.classifiedVolume += qty;
  }

  /**
   * Lấy các phút đã thay đổi kể từ lần gọi trước (bản tổng hợp đầy đủ của phút, nên ghi
   * lại nhiều lần vẫn idempotent) để lưu bền vững; xoá cờ "bẩn".
   * @returns {{ symbol, date, minute, buy, sell, unknown, prints, sizes }[]}
   */
  drainTickFlow() {
    const rows = [];
    for (const [symbol, flow] of this.tickFlow) {
      for (const minute of flow.dirty) {
        const m = flow.minutes.get(minute);
        if (m) rows.push({ symbol, date: flow.date, minute, buy: m.buy, sell: m.sell, unknown: m.unknown, prints: m.prints, sizes: { ...m.sizes } });
      }
      flow.dirty.clear();
    }
    return rows;
  }

  /** Ghi thất bại -> đánh dấu lại để lần sau ghi tiếp (bỏ qua nếu đã sang phiên khác). */
  markTickFlowDirty(rows) {
    for (const r of rows) {
      const flow = this.tickFlow.get(r.symbol);
      if (flow && flow.date === r.date && flow.minutes.has(r.minute)) flow.dirty.add(r.minute);
    }
  }

  /** Dòng lệnh có dấu (Lee–Ready) của phiên hiện tại cho một mã, nếu đang được theo dõi. */
  getTickFlow(symbol) {
    const flow = this.tickFlow.get(canonicalSymbol(symbol));
    if (!flow) return null;
    return { date: flow.date, classifiedVolume: flow.classifiedVolume, minutes: [...flow.minutes.values()].sort((a, b) => a.minute - b.minute) };
  }

  // ---------- API cho route SSE ----------

  /**
   * @param {{ symbols: string[], indices?: string[], send: (event: string, data: any) => void, raw?: boolean }} sub
   * @returns {() => void} hàm huỷ đăng ký
   */
  subscribe({ symbols = [], indices = [], send, raw = false }) {
    const cfg = marketConfig();
    const syms = [...new Set(symbols.map(canonicalSymbol).filter(Boolean))];
    const idx = [...new Set(indices.map(canonicalSymbol).filter(Boolean))];
    if (!syms.length && !idx.length) throw new ValidationError("Cần ít nhất 1 mã hoặc 1 chỉ số.");
    if (syms.some((s) => !isValidSymbol(s)) || idx.some((s) => !isValidSymbol(s))) throw new ValidationError("Mã chứng khoán không hợp lệ.");
    const union = new Set([...this.#neededSymbols(), ...syms]);
    if (union.size > cfg.streamMaxSymbols) {
      throw new MarketDataError("Stream đang có quá nhiều mã đăng ký đồng thời.", { kind: "client", statusCode: 429 });
    }

    const sub = { symbols: new Set(syms), indices: new Set(idx), send, raw };
    this.subscribers.set(sub, sub);
    this.#ensureMonitor();
    this.#reconcileUpstream();

    // Gửi ngay dữ liệu đang có, phần còn thiếu sẽ được poll snapshot.
    for (const symbol of sub.symbols) {
      const entry = this.quotes.get(symbol);
      if (entry && !raw) send("quote", this.#quotePayload(symbol, entry));
    }
    for (const code of sub.indices) {
      const entry = this.indices.get(code);
      if (entry && !raw) send("index", this.#indexPayload(code, entry));
    }
    this.#sendStatus(sub);
    void this.#pollFallback();

    return () => {
      this.subscribers.delete(sub);
      this.#reconcileUpstream();
      if (this.subscribers.size === 0) this.#stopMonitor();
    };
  }

  /** Các mã đang có người theo dõi realtime. */
  trackedSymbols() {
    return [...this.#neededSymbols()];
  }

  getQuote(symbol) {
    const entry = this.quotes.get(canonicalSymbol(symbol));
    return entry ? this.#quotePayload(canonicalSymbol(symbol), entry) : null;
  }

  /** Quote từ stream còn mới (dùng cho REST /quotes). */
  getFreshStreamQuote(symbol) {
    const sym = canonicalSymbol(symbol);
    const entry = this.quotes.get(sym);
    if (!entry || entry.source !== STREAM_SOURCE) return null;
    return this.#symbolState(sym) === "LIVE" ? this.#quotePayload(sym, entry) : null;
  }

  getFreshIndex(code) {
    const entry = this.indices.get(canonicalSymbol(code));
    if (!entry || entry.source !== STREAM_SOURCE || !this.indexShard || this.indexShard.state !== "connected") return null;
    if (this.now() - entry.at > marketConfig().staleMs && expectsLiveTicks(new Date(this.now()))) return null;
    return this.#indexPayload(canonicalSymbol(code), entry);
  }

  status() {
    const symbols = [...this.#neededSymbols()];
    const states = Object.fromEntries(symbols.map((s) => [s, this.#symbolState(s)]));
    return {
      transport: this.#transport(),
      session: currentSession(new Date(this.now())),
      subscribers: this.subscribers.size,
      shards: [...this.shards.values()].map((s) => ({
        id: s.id, state: s.state, symbols: s.symbols.size,
        lastTickAt: s.lastTickAt ? new Date(s.lastTickAt).toISOString() : null,
      })),
      indexShard: this.indexShard ? { state: this.indexShard.state, codes: [...this.indexShard.codes] } : null,
      counts: Object.values(states).reduce((acc, st) => ({ ...acc, [st]: (acc[st] || 0) + 1 }), {}),
    };
  }

  shutdown() {
    this.#stopMonitor();
    for (const shard of this.shards.values()) shard.conn.stop();
    this.shards.clear();
    this.symbolShard.clear();
    this.indexShard?.conn.stop();
    this.indexShard = null;
  }

  // ---------- Quản lý upstream ----------

  #neededSymbols() {
    const set = new Set();
    for (const sub of this.subscribers.values()) for (const s of sub.symbols) set.add(s);
    return set;
  }

  #neededIndices() {
    const set = new Set();
    if (this.subscribers.size) for (const code of marketConfig().streamIndices) set.add(canonicalSymbol(code));
    for (const sub of this.subscribers.values()) for (const c of sub.indices) set.add(c);
    return set;
  }

  #channelFor(shard) {
    return `X:${[...shard.symbols].sort().join("-")}`;
  }

  #reconcileUpstream() {
    const enabled = this.upstreamEnabled();
    const needed = enabled ? this.#neededSymbols() : new Set();
    const shardSize = marketConfig().streamShardSize;
    const touched = new Set();

    // Bỏ mã không còn ai cần.
    for (const [symbol, shardId] of this.symbolShard) {
      if (needed.has(symbol)) continue;
      this.symbolShard.delete(symbol);
      const shard = this.shards.get(shardId);
      shard?.symbols.delete(symbol);
      if (shard) touched.add(shard);
    }
    // Thêm mã mới vào shard còn chỗ (giữ ổn định shard của các mã cũ).
    for (const symbol of needed) {
      if (this.symbolShard.has(symbol)) continue;
      let shard = [...this.shards.values()].find((s) => s.symbols.size < shardSize);
      if (!shard) shard = this.#createShard();
      shard.symbols.add(symbol);
      this.symbolShard.set(symbol, shard.id);
      touched.add(shard);
    }
    for (const shard of touched) {
      if (shard.symbols.size === 0) {
        shard.conn.stop();
        this.shards.delete(shard.id);
      } else {
        shard.conn.setChannel(this.#channelFor(shard));
      }
    }

    // Kết nối chỉ số (MI).
    const indices = enabled ? this.#neededIndices() : new Set();
    if (!indices.size) {
      this.indexShard?.conn.stop();
      this.indexShard = null;
    } else {
      const channel = `MI:${[...indices].sort().map(ssiV2IndexId).join("-")}`;
      if (!this.indexShard) {
        const shard = { id: "MI", codes: indices, state: "connecting", connectedAt: null, lastTickAt: null };
        shard.conn = this.createConnection({
          channel,
          onMessage: (content) => this.#onMessage(shard, content),
          onStatus: (state) => this.#onShardStatus(shard, state),
        });
        this.indexShard = shard;
        shard.conn.start();
      } else {
        this.indexShard.codes = indices;
        this.indexShard.conn.setChannel(channel);
      }
    }
    this.#emitTransportIfChanged();
  }

  #createShard() {
    const shard = { id: `X${this.nextShardId++}`, symbols: new Set(), state: "connecting", connectedAt: null, lastTickAt: null };
    shard.conn = this.createConnection({
      channel: "",
      onMessage: (content) => this.#onMessage(shard, content),
      onStatus: (state) => this.#onShardStatus(shard, state),
    });
    this.shards.set(shard.id, shard);
    shard.conn.start();
    return shard;
  }

  #onShardStatus(shard, state) {
    shard.state = state;
    if (state === "connected") shard.connectedAt = this.now();
    this.#emitTransportIfChanged();
    this.#broadcastStatus();
  }

  #onMessage(shard, content) {
    const at = this.now();
    shard.lastTickAt = at;
    const body = content?.Content ?? content;
    const dataType = String(content?.DataType ?? "").toUpperCase();

    if (dataType === "MI" || body?.IndexId !== undefined) {
      const snapshot = normalizeIndexSnapshot(body);
      if (!snapshot) return;
      this.indices.set(snapshot.code, { snapshot, at, source: STREAM_SOURCE, fallbackReason: null });
      const payload = this.#indexPayload(snapshot.code, this.indices.get(snapshot.code));
      for (const sub of this.subscribers.values()) if (!sub.raw && sub.indices.has(snapshot.code)) sub.send("index", payload);
      return;
    }

    // Chỉ X/Quote/Trade mang giá; các loại khác (F, B, R...) không được tạo
    // một quote "LIVE" không có giá.
    if (dataType && !["X", "QUOTE", "TRADE"].includes(dataType)) return;
    const quote = normalizeQuote(body);
    if (!quote?.symbol) return;
    if (quote.price === null && !quote.bid.length && !quote.ask.length && !this.quotes.has(quote.symbol)) return;
    const prev = this.quotes.get(quote.symbol);
    const merged = prev?.source === STREAM_SOURCE ? mergeQuote(prev.quote, quote) : mergeQuote(prev?.quote, quote);
    if (prev?.source === STREAM_SOURCE) this.#recordTick(prev.quote, merged);
    const wasLive = this.#symbolState(quote.symbol) === "LIVE";
    this.quotes.set(quote.symbol, { quote: merged, at, source: STREAM_SOURCE, fallbackReason: null });
    const payload = this.#quotePayload(quote.symbol, this.quotes.get(quote.symbol));
    for (const sub of this.subscribers.values()) {
      if (!sub.symbols.has(quote.symbol)) continue;
      sub.send("quote", sub.raw ? content : payload);
    }
    if (!wasLive) this.#broadcastStatus();
  }

  // ---------- Độ mới dữ liệu & fallback ----------

  #shardFresh(shard) {
    if (!shard || shard.state !== "connected") return false;
    const ref = shard.lastTickAt ?? shard.connectedAt ?? 0;
    return this.now() - ref < marketConfig().staleMs;
  }

  #symbolState(symbol) {
    const entry = this.quotes.get(symbol);
    const shard = this.shards.get(this.symbolShard.get(symbol));
    const live = expectsLiveTicks(new Date(this.now()));
    if (entry?.source === STREAM_SOURCE && shard?.state === "connected" && (!live || this.#shardFresh(shard))) return "LIVE";
    if (entry && entry.source !== STREAM_SOURCE && this.now() - entry.at < marketConfig().fallbackPollMs * 3) return "FALLBACK";
    if (!entry) return "PENDING"; // chưa có dữ liệu nào (đang lấy snapshot)
    if (!live) return "CLOSED";
    return "STALE";
  }

  /** Mã cần lấy từ nguồn dự phòng ở lượt này. */
  #symbolsNeedingFallback() {
    const cfg = marketConfig();
    const live = expectsLiveTicks(new Date(this.now()));
    const out = [];
    for (const symbol of this.#neededSymbols()) {
      const lastPoll = this.lastPollAt.get(symbol) ?? 0;
      if (this.now() - lastPoll < cfg.fallbackPollMs) continue;
      const entry = this.quotes.get(symbol);
      if (!entry) { out.push(symbol); continue; } // snapshot ban đầu
      if (!live) continue; // ngoài phiên: giữ giá cuối, không poll liên tục
      const shard = this.shards.get(this.symbolShard.get(symbol));
      if (!this.#shardFresh(shard)) out.push(symbol);
    }
    return out;
  }

  async #pollFallback() {
    if (this.polling || !this.subscribers.size) return;
    const symbols = this.#symbolsNeedingFallback();
    const indexCodes = this.fetchFallbackIndex ? [...this.#neededIndices()].filter((code) => {
      const entry = this.indices.get(code);
      const lastPoll = this.lastPollAt.get(`#${code}`) ?? 0;
      if (this.now() - lastPoll < marketConfig().fallbackPollMs) return false;
      if (!entry) return true;
      return expectsLiveTicks(new Date(this.now())) && !this.#shardFresh(this.indexShard);
    }) : [];
    if (!symbols.length && !indexCodes.length) return;

    this.polling = true;
    try {
      const at = this.now();
      for (const s of symbols) this.lastPollAt.set(s, at);
      for (const c of indexCodes) this.lastPollAt.set(`#${c}`, at);

      if (symbols.length) {
        try {
          const { quotes, source, fallbackReason } = await this.fetchFallbackQuotes(symbols);
          for (const quote of quotes) {
            const current = this.quotes.get(quote.symbol);
            // Không ghi đè tick stream mới hơn bằng dữ liệu poll.
            if (current?.source === STREAM_SOURCE && this.#symbolState(quote.symbol) === "LIVE") continue;
            this.quotes.set(quote.symbol, { quote: mergeQuote(current?.quote, quote), at: this.now(), source, fallbackReason });
            const payload = this.#quotePayload(quote.symbol, this.quotes.get(quote.symbol));
            for (const sub of this.subscribers.values()) if (!sub.raw && sub.symbols.has(quote.symbol)) sub.send("quote", payload);
          }
        } catch (error) {
          console.warn(`[market] Poll dự phòng thất bại: ${error.message}`);
        }
      }
      for (const code of indexCodes) {
        try {
          const { snapshot, source, fallbackReason } = await this.fetchFallbackIndex(code);
          if (!snapshot) continue;
          this.indices.set(code, { snapshot, at: this.now(), source, fallbackReason });
          const payload = this.#indexPayload(code, this.indices.get(code));
          for (const sub of this.subscribers.values()) if (!sub.raw && sub.indices.has(code)) sub.send("index", payload);
        } catch (error) {
          console.warn(`[market] Poll chỉ số ${code} thất bại: ${error.message}`);
        }
      }
    } finally {
      this.polling = false;
      this.#broadcastStatus();
    }
  }

  // ---------- Trạng thái ----------

  #transport() {
    if (!this.upstreamEnabled()) return "disabled";
    const shards = [...this.shards.values()];
    if (this.indexShard) shards.push(this.indexShard);
    if (!shards.length) return "idle";
    const connected = shards.filter((s) => s.state === "connected").length;
    if (connected === shards.length) return "connected";
    if (connected > 0) return "degraded";
    return shards.some((s) => s.state === "connecting") ? "connecting" : "down";
  }

  #emitTransportIfChanged() {
    const transport = this.#transport();
    if (transport === this.lastTransport) return;
    this.lastTransport = transport;
    this.onTransportChange?.(transport);
  }

  #statusFor(sub) {
    const live = [], stale = [], fallback = [], closed = [], pending = [];
    for (const symbol of sub.symbols) {
      const st = this.#symbolState(symbol);
      if (st === "LIVE") live.push(symbol);
      else if (st === "FALLBACK") fallback.push(symbol);
      else if (st === "CLOSED") closed.push(symbol);
      else if (st === "PENDING") pending.push(symbol);
      else stale.push(symbol);
    }
    const transport = this.#transport();
    return {
      transport,
      // Tương thích client cũ: chỉ true khi socket SSI đang mở.
      connected: transport === "connected" || transport === "degraded",
      session: currentSession(new Date(this.now())),
      live, stale, fallback, closed, pending,
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  #sendStatus(sub, force = false) {
    const status = this.#statusFor(sub);
    const payload = sub.raw ? { connected: status.connected } : status;
    const key = JSON.stringify({ ...payload, updatedAt: undefined });
    if (!force && this.lastStatusKey.get(sub) === key) return;
    this.lastStatusKey.set(sub, key);
    sub.send("status", payload);
  }

  #broadcastStatus() {
    for (const sub of this.subscribers.values()) this.#sendStatus(sub);
  }

  #quotePayload(symbol, entry) {
    const live = expectsLiveTicks(new Date(this.now()));
    return {
      ...entry.quote,
      provenance: {
        source: entry.source,
        asOf: entry.quote.time ?? new Date(entry.at).toISOString(),
        receivedAt: new Date(entry.at).toISOString(),
        isStale: live && this.#symbolState(symbol) === "STALE",
        fallbackReason: entry.fallbackReason ?? null,
      },
    };
  }

  #indexPayload(code, entry) {
    return {
      ...entry.snapshot,
      provenance: {
        source: entry.source,
        asOf: entry.snapshot.time ?? new Date(entry.at).toISOString(),
        receivedAt: new Date(entry.at).toISOString(),
        isStale: false,
        fallbackReason: entry.fallbackReason ?? null,
      },
    };
  }

  #ensureMonitor() {
    if (this.monitor) return;
    this.monitor = setInterval(() => {
      this.#emitTransportIfChanged();
      this.#broadcastStatus();
      void this.#pollFallback();
    }, this.monitorIntervalMs);
    this.monitor.unref?.();
  }

  #stopMonitor() {
    clearInterval(this.monitor);
    this.monitor = undefined;
  }

  /** Dùng trong test: chạy một vòng giám sát ngay lập tức. */
  async tick() {
    this.#emitTransportIfChanged();
    this.#broadcastStatus();
    await this.#pollFallback();
  }
}
