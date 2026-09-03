/**
 * priceTickEngine.ts
 * ────────────────────────────────────────────────────────────────
 * GIAI ĐOẠN 1 — Root-cause fix cho vấn đề hiệu năng của Watchlist.
 *
 * VẤN ĐỀ GỐC (theo báo cáo phân tích):
 *   Mỗi <WatchlistRow/> gọi usePriceTick() → tự tạo 1 setInterval(2500ms)
 *   riêng. Với 200 mã trong watchlist = 200 interval chạy song song,
 *   200 lần Math.random() + setState + toLocaleString mỗi 2.5s.
 *   Đây là nguyên nhân của cả 3 đề xuất riêng lẻ trong báo cáo gốc
 *   (3.3 memo equality, 3.5 virtualization, 3.7 WebSocket migration)
 *   — sửa engine này giải quyết gốc rễ của cả ba.
 *
 * GIẢI PHÁP:
 *   Một singleton duy nhất giữ Map<ticker, TickerState>. MỘT setInterval
 *   duy nhất (200ms granularity) quét toàn bộ map, chỉ update ticker nào
 *   đã đến "nextUpdateAt" của nó (stagger ngẫu nhiên 0–2500ms khi đăng ký
 *   để tránh "render storm" — tất cả row update cùng 1 frame).
 *
 *   Row không giữ state nội bộ nữa — subscribe qua useSyncExternalStore
 *   trong usePriceTick.ts. Điều này GIỮ NGUYÊN triết lý đúng đắn mà
 *   báo cáo đã ghi nhận: "không đổ tick vào Zustand toàn cục" — chỉ
 *   thay N interval bằng 1 interval + pub/sub theo ticker.
 *
 *   Khi có WebSocket thật (3.7 trong báo cáo): chỉ cần thay phần
 *   `tickAll()` bên dưới bằng handler nhận message từ socket và gọi
 *   `engine.applyExternalPrice(ticker, price)`. Toàn bộ phần subscribe
 *   ở React layer (usePriceTick) KHÔNG cần đổi gì.
 */

type Listener = (price: number) => void;

interface TickerState {
  basePrice: number;
  currentPrice: number;
  listeners: Set<Listener>;
  nextUpdateAt: number;
  refCount: number; // số row đang subscribe ticker này (thường = 1, có thể >1 nếu ticker xuất hiện 2 nơi)
}

const TICK_INTERVAL_MS = 2500;
const SCAN_INTERVAL_MS = 200; // độ mịn quét — đủ nhỏ để cảm giác mượt, đủ lớn để rẻ
const JITTER_RATIO = 0.0006;

class PriceTickEngine {
  private tickers = new Map<string, TickerState>();
  private scanHandle: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  /**
   * Nếu true (mặc định): random jitter khi không có giá từ external source.
   * Set false khi livePriceService đang chạy (giá thật từ Yahoo Finance).
   */
  private enableJitter = true;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private handleVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    this.paused = document.hidden;
    // Khi quay lại tab: không "bù" các tick đã bỏ lỡ, chỉ tiếp tục
    // từ giá hiện tại — tránh nhảy giá đột ngột gây hiểu lầm là biến động thật.
    if (!this.paused) {
      const now = Date.now();
      this.tickers.forEach((state) => {
        state.nextUpdateAt = now + Math.random() * TICK_INTERVAL_MS;
      });
    }
  };

  private ensureScanLoop() {
    if (this.scanHandle !== null) return;
    this.scanHandle = setInterval(() => this.tickAll(), SCAN_INTERVAL_MS);
  }

  private stopScanLoopIfIdle() {
    if (this.tickers.size === 0 && this.scanHandle !== null) {
      clearInterval(this.scanHandle);
      this.scanHandle = null;
    }
  }

  private tickAll() {
    if (this.paused) return;
    const now = Date.now();
    this.tickers.forEach((state, ticker) => {
      if (now < state.nextUpdateAt) return;
      if (this.enableJitter) {
        const jitter = (Math.random() - 0.5) * state.basePrice * JITTER_RATIO;
        state.currentPrice = Math.max(0, state.currentPrice + jitter);
      }
      state.nextUpdateAt = now + TICK_INTERVAL_MS;
      state.listeners.forEach((cb) => cb(state.currentPrice));
    });
  }

  /** Tắt random jitter (khi dùng livePriceService với giá thật). */
  setJitterEnabled(enabled: boolean): void {
    this.enableJitter = enabled;
  }

  /** Gọi khi backend/WebSocket thật đẩy giá xuống — bỏ qua random jitter */
  applyExternalPrice(ticker: string, price: number) {
    const state = this.tickers.get(ticker);
    if (!state) return;
    state.currentPrice = price;
    state.listeners.forEach((cb) => cb(state.currentPrice));
  }

  register(ticker: string, basePrice: number) {
    let state = this.tickers.get(ticker);
    if (!state) {
      state = {
        basePrice,
        currentPrice: basePrice,
        listeners: new Set(),
        nextUpdateAt: Date.now() + Math.random() * TICK_INTERVAL_MS, // stagger
        refCount: 0,
      };
      this.tickers.set(ticker, state);
    }
    state.refCount += 1;
    this.ensureScanLoop();
  }

  unregister(ticker: string) {
    const state = this.tickers.get(ticker);
    if (!state) return;
    state.refCount -= 1;
    if (state.refCount <= 0 && state.listeners.size === 0) {
      this.tickers.delete(ticker);
    }
    this.stopScanLoopIfIdle();
  }

  updateBasePrice(ticker: string, basePrice: number) {
    const state = this.tickers.get(ticker);
    if (!state) return;
    state.basePrice = basePrice;
    // Reset về giá gốc khi stock reload — tương đương Effect #1 cũ trong usePriceTick
    state.currentPrice = basePrice;
    state.listeners.forEach((cb) => cb(state.currentPrice));
  }

  subscribe(ticker: string, listener: Listener): () => void {
    const state = this.tickers.get(ticker);
    if (!state) {
      // Trường hợp hiếm: subscribe trước register (thứ tự effect) — tự tạo state tạm
      this.register(ticker, 0);
    }
    this.tickers.get(ticker)!.listeners.add(listener);
    return () => {
      const s = this.tickers.get(ticker);
      if (!s) return;
      s.listeners.delete(listener);
      if (s.refCount <= 0 && s.listeners.size === 0) {
        this.tickers.delete(ticker);
        this.stopScanLoopIfIdle();
      }
    };
  }

  getPrice(ticker: string): number | undefined {
    return this.tickers.get(ticker)?.currentPrice;
  }

  /** Lấy danh sách ticker đang được register (cho livePriceService polling). */
  getActiveTickers(): string[] {
    return Array.from(this.tickers.keys());
  }
}

// Singleton module-scope — tương tự _watchlistCache trong api.ts hiện tại
export const priceTickEngine = new PriceTickEngine();
