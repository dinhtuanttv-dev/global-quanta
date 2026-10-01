import { featureFlags } from "../config.js";
import { createMemoryStore } from "./memoryStore.js";
import { createSupabaseStore } from "./supabaseStore.js";

export function createStore() {
  const { store } = featureFlags();
  if (store === "supabase") return createSupabaseStore();
  return createMemoryStore();
}
