import { featureFlags } from "../config.js";
import { createMemoryStore } from "./memoryStore.js";
import { createSupabaseStore } from "./supabaseStore.js";
import { createWarehouse } from "./warehouse.js";
import { createLocalStore } from "./localStore.js";
import { createLocalFirstStore } from "./localFirstStore.js";

/**
 * M0: kho cục bộ trên Railway Volume (MARKET_LOCAL_DIR hoặc <volume>/local). MARKET_LOCAL_STORE=off -> quay lại đọc Supabase
 * như trước (nút dừng khẩn cấp vận hành, không phải cờ tính năng).
 */
export function localDirFromEnv(env = process.env) {
  if (String(env.MARKET_LOCAL_STORE ?? "on").toLowerCase() === "off") return undefined;
  return env.MARKET_LOCAL_DIR || (env.RAILWAY_VOLUME_MOUNT_PATH ? `${env.RAILWAY_VOLUME_MOUNT_PATH.replace(/\/+$/, "")}/local` : null);
}

/**
 * Kho đệm D1: thư mục đĩa bền = MARKET_WAREHOUSE_DIR hoặc Railway Volume (RAILWAY_VOLUME_MOUNT_PATH, Railway tự đặt khi gắn
 * volume) -> /<mount>/warehouse. Không có đĩa -> chỉ đệm RAM. MARKET_WAREHOUSE=off -> đọc thẳng Supabase như trước.
 */
export function warehouseFromEnv(env = process.env) {
  if (String(env.MARKET_WAREHOUSE ?? "on").toLowerCase() === "off") return null;
  const dir = env.MARKET_WAREHOUSE_DIR || (env.RAILWAY_VOLUME_MOUNT_PATH ? `${env.RAILWAY_VOLUME_MOUNT_PATH.replace(/\/+$/, "")}/warehouse` : null);
  return createWarehouse({ dir, ramMb: Number(env.MARKET_WAREHOUSE_RAM_MB) || 64 /* heap thật ≈ 1,2–1,45 × trần (đo 2026-10-20) */ });
}

export function createStore() {
  const { store } = featureFlags();
  if (store === "supabase") {
    const inner = createSupabaseStore({ warehouse: warehouseFromEnv() });
    const dir = localDirFromEnv();
    if (!dir) return inner; // tắt bằng MARKET_LOCAL_STORE=off, hoặc không gắn volume (chạy local) -> như trước
    return createLocalFirstStore({ local: createLocalStore({ dir, ramMb: Number(process.env.MARKET_LOCAL_RAM_MB) || 96 }), inner });
  }
  return createMemoryStore();
}
