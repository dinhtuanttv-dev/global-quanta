import { EventEmitter } from "./EventEmitter";

export type LayerKey = "volume" | "rsi" | "vprofile" | "avwap" | "smc" | "vsa" | "wyckoff" | "corporate" | "trendline" | "demandzone" | "elliott";

export interface LayerState {
  volume: boolean; rsi: boolean; vprofile: boolean; avwap: boolean; smc: boolean; vsa: boolean; wyckoff: boolean; corporate: boolean;
  trendline: boolean; demandzone: boolean; elliott: boolean;
  aiDetectionMaster: boolean;
}

interface LayerEvents extends Record<string, unknown> { "layers:changed": LayerState; }

// Yêu cầu 03/10/2026: MỌI chỉ báo/công cụ trên biểu đồ mặc định TẮT — biểu đồ chỉ có nến; người dùng bật lớp nào thì
// lớp đó mới được vẽ. Riêng hình vẽ tay: vẽ xong (hoặc nạp hình đã lưu) thì lớp tương ứng tự bật để thấy ngay.
export const DEFAULT_LAYER_STATE: LayerState = {
  volume: false, rsi: false, vprofile: false, avwap: false, smc: false, vsa: false, wyckoff: false, corporate: false,
  trendline: false, demandzone: false, elliott: false,
  aiDetectionMaster: false,
};

export class LayerManager {
  private state: LayerState = { ...DEFAULT_LAYER_STATE };
  private emitter = new EventEmitter<LayerEvents>();

  on(handler: (state: LayerState) => void) { return this.emitter.on("layers:changed", handler); }
  getState(): LayerState { return this.state; }
  /** Bật một lớp (không đổi nếu đã bật) — dùng khi người dùng vừa vẽ hình thuộc lớp đó. */
  enable(key: LayerKey): void { if (!this.state[key]) this.toggle(key); }
  toggle(key: LayerKey): void { this.state = { ...this.state, [key]: !this.state[key] }; this.emitter.emit("layers:changed", this.state); }
  setMaster(on: boolean): void { this.state = { ...this.state, aiDetectionMaster: on }; this.emitter.emit("layers:changed", this.state); }
}
