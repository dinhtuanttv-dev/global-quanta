import { featureFlags } from "../config.js";
import { createMemoryStore } from "./memoryStore.js";
import { createSupabaseStore } from "./supabaseStore.js";
import { createWarehouse } from "./warehouse.js";

/**
 * Kho đệm D1: thư mục đĩa bền = MARKET_WAREHOUSE_DIR hoặc Railway Volume (RAILWAY_VOLUME_MOUNT_PATH, Railway tự đặt khi gắn
 * volume) -> /<mount>/warehouse. Không có đĩa -> chỉ đệm RAM. MARKET_WAREHOUSE=off -> đọc thẳng Supabase như trước.
 */
export function warehouseFromEnv(env = process.env) {
  if (String(env.MARKET_WAREHOUSE ?? "on").toLowerCase() === "off") return null;
  const dir = env.MARKET_WAREHOUSE_DIR || (env.RAILWAY_VOLUME_MOUNT_PATH ? `${env.RAILWAY_VOLUME_MOUNT_PATH.replace(/\/+$/, "")}/warehouse` : null);
  return createWarehouse({ dir, ramMb: Number(env.MARKET_WAREHOUSE_RAM_MB) || 96 });
}

export function createStore() {
  const { store } = featureFlags();
  if (store === "supabase") return createSupabaseStore({ warehouse: warehouseFromEnv() });
  return createMemoryStore();
}
