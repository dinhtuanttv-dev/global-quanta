// Super Chart SC1 — STORE BỐ CỤC: một nguồn sự thật cho mọi thành phần (React 18 useSyncExternalStore — không xé khung khi render đồng thời),
// lưu ngay trên máy (localStorage, đọc lại tức thì), đồng bộ giữa các tab cùng trình duyệt (BroadcastChannel), và đồng bộ theo TÀI KHOẢN
// qua Gateway /api/market/workspace (gom 1,5 giây). Lỗi đám mây không làm mất bản trên máy.
// A2: khoá trên máy GẮN THEO TÀI KHOẢN (đổi tài khoản -> nạp lại đúng bố cục của người đó); đồng bộ có PHIÊN BẢN máy chủ (không so giờ
// máy khách): máy có thay đổi chưa đồng bộ -> đẩy lên với phiên bản gốc; thiết bị khác vừa lưu (409) -> dùng bản mới nhất của máy chủ.
import { useSyncExternalStore } from "react";
import { fetchMarketJson, isMarketGatewayEnabled, MarketApiError } from "../../../../services/marketDataClient";
import { getAccessToken } from "../../../../services/api";
import { readScoped, userScope, writeScoped } from "../../../../lib/ta-command-center/userScope";
import { DEFAULT_WORKSPACE, sanitizeWorkspace, type Workspace } from "./workspaceModel";

const KEY = "gq.ta.workspace.v1";
const CHANNEL = "gq-ta-workspace";
const CLOUD_DEBOUNCE_MS = 1500;

/** `updatedAt` = phiên bản máy chủ lần đồng bộ cuối; `dirty` = đổi trên máy chưa lên đám mây. */
interface Saved { ws: Workspace; updatedAt: string | null; dirty: boolean }
type Listener = () => void;
const EMPTY: Saved = { ws: DEFAULT_WORKSPACE, updatedAt: null, dirty: false };

function readLocal(scope: string): Saved {
  try {
    const raw = JSON.parse(readScoped(KEY, scope) ?? "null") as { ws?: unknown; updatedAt?: string; dirty?: boolean } | null;
    if (!raw) return EMPTY;
    // Bản trước A2 (không có `dirty`, updatedAt là giờ máy khách) -> coi là thay đổi chưa đồng bộ.
    return typeof raw.dirty === "boolean"
      ? { ws: sanitizeWorkspace(raw.ws), updatedAt: raw.updatedAt ?? null, dirty: raw.dirty }
      : { ws: sanitizeWorkspace(raw.ws), updatedAt: null, dirty: true };
  } catch { return EMPTY; }
}

export type CloudState = "idle" | "saving" | "saved" | "local";

class WorkspaceStore {
  private scope = typeof window === "undefined" ? "guest" : userScope();
  private saved: Saved = typeof window === "undefined" ? EMPTY : readLocal(this.scope);
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;
  private cloudTimer: ReturnType<typeof setTimeout> | null = null;
  private cloudLoaded = false;
  cloud: CloudState = "idle";
  /** Thông báo gần nhất cho người dùng (VD bố cục vừa đổi ở thiết bị khác). */
  notice: string | null = null;

  constructor() {
    if (typeof window === "undefined") return;
    try {
      this.channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
      this.channel?.addEventListener("message", (e: MessageEvent<Saved & { scope?: string }>) => {
        if (e.data?.scope !== this.scope) return; // tab khác đang đăng nhập tài khoản khác
        this.saved = { ws: sanitizeWorkspace(e.data?.ws), updatedAt: e.data?.updatedAt ?? null, dirty: Boolean(e.data?.dirty) };
        this.emit();
      });
    } catch { this.channel = null; }
  }

  /** Đổi tài khoản (đăng nhập / đăng xuất) -> nạp bố cục của tài khoản mới, cho phép nạp lại bản đám mây. */
  private checkScope() {
    if (typeof window === "undefined") return;
    const s = userScope();
    if (s === this.scope) return;
    this.scope = s;
    this.saved = readLocal(s);
    this.cloudLoaded = false;
    this.cloud = "idle";
  }

  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = () => { this.checkScope(); return this.saved.ws; };
  private emit() { for (const l of this.listeners) l(); }
  private persist() {
    writeScoped(KEY, JSON.stringify(this.saved), this.scope);
    try { this.channel?.postMessage({ ...this.saved, scope: this.scope }); } catch { /* bỏ qua */ }
  }

  /** Cập nhật bố cục (một phần hoặc hàm). Lưu máy ngay, báo các tab khác, hẹn lưu đám mây. */
  update = (patch: Partial<Workspace> | ((w: Workspace) => Partial<Workspace>)) => {
    this.checkScope();
    const p = typeof patch === "function" ? patch(this.saved.ws) : patch;
    const ws = sanitizeWorkspace({ ...this.saved.ws, ...p });
    if (JSON.stringify(ws) === JSON.stringify(this.saved.ws)) return;
    this.saved = { ws, updatedAt: this.saved.updatedAt, dirty: true };
    this.persist();
    this.emit();
    this.scheduleCloud();
  };

  private async token() {
    if (!isMarketGatewayEnabled()) return null;
    return getAccessToken().catch(() => null);
  }

  private scheduleCloud() {
    if (this.cloudTimer) clearTimeout(this.cloudTimer);
    this.cloudTimer = setTimeout(() => { void this.push(); }, CLOUD_DEBOUNCE_MS);
  }

  /** Đẩy bản trên máy lên với phiên bản gốc. 409 -> dùng bản mới nhất của máy chủ (bố cục là sở thích hiển thị, không gộp từng trường). */
  private async push(): Promise<void> {
    const token = await this.token();
    if (!token) { this.cloud = "local"; this.emit(); return; }
    this.cloud = "saving"; this.emit();
    const sent = this.saved;
    try {
      const r = await fetchMarketJson<{ updatedAt: string }>("/api/market/workspace", {}, {
        method: "PUT", body: JSON.stringify({ workspace: sent.ws, baseUpdatedAt: sent.updatedAt }), headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      });
      // Người dùng đổi tiếp trong lúc chờ -> giữ `dirty`, lần lưu sau dùng phiên bản mới.
      this.saved = { ...this.saved, updatedAt: r.updatedAt, dirty: this.saved !== sent };
      this.persist();
      this.cloud = "saved";
    } catch (e) {
      if (e instanceof MarketApiError && e.status === 409) {
        const cur = e.body.current as { workspace?: unknown; updatedAt?: string | null } | undefined;
        this.saved = { ws: sanitizeWorkspace(cur?.workspace), updatedAt: cur?.updatedAt ?? null, dirty: false };
        this.persist();
        this.notice = "Bố cục vừa được đổi ở thiết bị khác — đang dùng bản mới nhất.";
        this.cloud = "saved";
      } else this.cloud = "local";
    }
    this.emit();
  }

  /** Nạp bản đám mây một lần sau đăng nhập: máy không có thay đổi chưa đồng bộ -> dùng bản đám mây; có -> đẩy bản máy lên. */
  async loadCloud(): Promise<void> {
    this.checkScope();
    if (this.cloudLoaded) return;
    this.cloudLoaded = true;
    const token = await this.token();
    if (!token) return;
    const r = await fetchMarketJson<{ workspace: unknown; updatedAt: string | null }>("/api/market/workspace", {}, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
    if (!r) return;
    if (this.saved.dirty) {
      this.saved = { ...this.saved, updatedAt: r.updatedAt ?? null };
      void this.push();
      return;
    }
    if (!r.workspace || !r.updatedAt) return;
    this.saved = { ws: sanitizeWorkspace(r.workspace), updatedAt: r.updatedAt, dirty: false };
    this.persist();
    this.cloud = "saved";
    this.emit();
  }

  /** Chỉ dùng trong test. */
  reset(ws: Workspace = DEFAULT_WORKSPACE) { this.saved = { ws, updatedAt: null, dirty: false }; this.cloudLoaded = false; this.emit(); }
}

export const workspaceStore = new WorkspaceStore();

/** Bố cục hiện tại + hàm cập nhật (mọi thành phần dùng chung, render lại đúng phần đổi). */
export function useWorkspace(): [Workspace, WorkspaceStore["update"]] {
  const ws = useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getSnapshot, () => DEFAULT_WORKSPACE);
  return [ws, workspaceStore.update];
}
export const useCloudState = () => useSyncExternalStore(workspaceStore.subscribe, () => workspaceStore.cloud, () => "idle" as CloudState);
