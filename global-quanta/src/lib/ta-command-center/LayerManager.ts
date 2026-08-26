import { EventEmitter } from "./EventEmitter";

export type LayerKey = "trendline" | "demandzone" | "smc" | "vsa" | "wyckoff" | "elliott";

export interface LayerState {
  trendline: boolean; demandzone: boolean; smc: boolean;
  vsa: boolean; wyckoff: boolean; elliott: boolean;
  aiDetectionMaster: boolean;
}

interface LayerEvents extends Record<string, unknown> { "layers:changed": LayerState; }

const DEFAULT_STATE: LayerState = {
  trendline: true, demandzone: true, smc: true,
  vsa: false, wyckoff: false, elliott: false,
  aiDetectionMaster: false,
};

export class LayerManager {
  private state: LayerState = { ...DEFAULT_STATE };
  private emitter = new EventEmitter<LayerEvents>();

  on(handler: (state: LayerState) => void) { return this.emitter.on("layers:changed", handler); }
  getState(): LayerState { return this.state; }
  toggle(key: LayerKey): void { this.state = { ...this.state, [key]: !this.state[key] }; this.emitter.emit("layers:changed", this.state); }
  setMaster(on: boolean): void { this.state = { ...this.state, aiDetectionMaster: on }; this.emitter.emit("layers:changed", this.state); }
}
