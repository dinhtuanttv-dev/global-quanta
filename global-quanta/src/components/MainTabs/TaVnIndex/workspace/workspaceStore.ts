// Super Chart SC1 — STORE BỐ CỤC: một nguồn sự thật cho mọi thành phần (React 18 useSyncExternalStore — không xé khung khi render đồng thời),
// lưu ngay trên máy (localStorage, đọc lại tức thì), đồng bộ giữa các tab cùng trình duyệt (BroadcastChannel), và đồng bộ theo TÀI KHOẢN
// qua Gateway /api/market/workspace (gom 1,5 giây; bản mới hơn thắng). Lỗi đám mây không làm mất bản trên máy.
import { useSyncExternalStore } from "react";
import { fetchMarketJson, isMarketGatewayEnabled } from "../../../../services/marketDataClient";
import { getAccessToken } from "../../../../services/api";
import { DEFAULT_WORKSPACE, sanitizeWorkspace, type Workspace } from "./workspaceModel";

const KEY = "gq.ta.workspace.v1";
const CHANNEL = "gq-ta-workspace";
const CLOUD_DEBOUNCE_MS = 1500;

interface Saved { ws: Workspace; updatedAt: string | null }
type Listener = () => void;

function readLocal(): Saved {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as { ws?: unknown; updatedAt?: string } | null;
    return raw ? { ws: sanitizeWorkspace(raw.ws), updatedAt: raw.updatedAt ?? null } : { ws: DEFAULT_WORKSPACE, updatedAt: null };
  } catch { return { ws: DEFAULT_WORKSPACE, updatedAt: null }; }
}

export type CloudState = "idle" | "saving" | "saved" | "local";

class WorkspaceStore {
  private saved: Saved = typeof window === "undefined" ? { ws: DEFAULT_WORKSPACE, updatedAt: null } : readLocal();
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;
  private cloudTimer: ReturnType<typeof setTimeout> | null = null;
  private cloudLoaded = false;
  cloud: CloudState = "idle";

  constructor() {
    if (typeof window === "undefined") return;
    try {
      this.channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
      this.channel?.addEventListener("message", (e: MessageEvent<Saved>) => { this.saved = { ws: sanitizeWorkspace(e.data?.ws), updatedAt: e.data?.updatedAt ?? null }; this.emit(); });
    } catch { this.channel = null; }
  }

  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = () => this.saved.ws;
  private emit() { for (const l of this.listeners) l(); }

  /** Cập nhật bố cục (một phần hoặc hàm). Lưu máy ngay, báo các tab khác, hẹn lưu đám mây. */
  update = (patch: Partial<Workspace> | ((w: Workspace) => Partial<Workspace>)) => {
    const p = typeof patch === "function" ? patch(this.saved.ws) : patch;
    const ws = sanitizeWorkspace({ ...this.saved.ws, ...p });
    if (JSON.stringify(ws) === JSON.stringify(this.saved.ws)) return;
    this.saved = { ws, updatedAt: new Date().toISOString() };
    try { window.localStorage.setItem(KEY, JSON.stringify(this.saved)); } catch { /* riêng tư / đầy bộ nhớ */ }
    try { this.channel?.postMessage(this.saved); } catch { /* bỏ qua */ }
    this.emit();
    this.scheduleCloud();
  };

  private async token() {
    if (!isMarketGatewayEnabled()) return null;
    return getAccessToken().catch(() => null);
  }

  private scheduleCloud() {
    if (this.cloudTimer) clearTimeout(this.cloudTimer);
    this.cloudTimer = setTimeout(async () => {
      const token = await this.token();
      if (!token) { this.cloud = "local"; this.emit(); return; }
      this.cloud = "saving"; this.emit();
      const r = await fetchMarketJson<{ updatedAt: string }>("/api/market/workspace", {}, {
        method: "PUT", body: JSON.stringify({ workspace: this.saved.ws }), headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      }).catch(() => null);
      this.cloud = r ? "saved" : "local"; this.emit();
    }, CLOUD_DEBOUNCE_MS);
  }

  /** Nạp bản đám mây một lần sau đăng nhập; bản mới hơn thắng (không ghi đè thay đổi vừa làm trên máy). */
  async loadCloud(): Promise<void> {
    if (this.cloudLoaded) return;
    this.cloudLoaded = true;
    const token = await this.token();
    if (!token) return;
    const r = await fetchMarketJson<{ workspace: unknown; updatedAt: string | null }>("/api/market/workspace", {}, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
    if (!r?.workspace || !r.updatedAt) return;
    if (this.saved.updatedAt && this.saved.updatedAt >= r.updatedAt) return;
    this.saved = { ws: sanitizeWorkspace(r.workspace), updatedAt: r.updatedAt };
    try { window.localStorage.setItem(KEY, JSON.stringify(this.saved)); } catch { /* bỏ qua */ }
    this.cloud = "saved";
    this.emit();
  }

  /** Chỉ dùng trong test. */
  reset(ws: Workspace = DEFAULT_WORKSPACE) { this.saved = { ws, updatedAt: null }; this.cloudLoaded = false; this.emit(); }
}

export const workspaceStore = new WorkspaceStore();

/** Bố cục hiện tại + hàm cập nhật (mọi thành phần dùng chung, render lại đúng phần đổi). */
export function useWorkspace(): [Workspace, WorkspaceStore["update"]] {
  const ws = useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getSnapshot, () => DEFAULT_WORKSPACE);
  return [ws, workspaceStore.update];
}
export const useCloudState = () => useSyncExternalStore(workspaceStore.subscribe, () => workspaceStore.cloud, () => "idle" as CloudState);
