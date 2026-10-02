import { useSyncExternalStore } from "react";
import { isMarketGatewayEnabled } from "../services/marketDataClient";

// Bật/tắt giao diện tầng nghiên cứu (panel "AI học & thích ứng" + khối Action Center) ngay trên UI.
// - Mặc định TẮT (VITE_RESEARCH_UI=true chỉ đổi mặc định thành bật).
// - Lựa chọn của người xem nhớ trong localStorage của trình duyệt đó; localStorage lỗi/bị chặn thì
//   vẫn bật/tắt được trong phiên (giữ trong bộ nhớ).
// - Chỉ có khi Market Gateway bật (dữ liệu nghiên cứu nằm trên Gateway).

const KEY = "gq.researchUi";
const EVENT = "gq:research-ui";
let memory: boolean | null = null;

const defaultOn = () => String(import.meta.env.VITE_RESEARCH_UI ?? "").toLowerCase() === "true";

export const researchUiAvailable = () => isMarketGatewayEnabled();

function read(): boolean {
  if (!researchUiAvailable()) return false;
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch { /* localStorage không dùng được */ }
  return memory ?? defaultOn();
}

export function setResearchUi(on: boolean) {
  memory = on;
  try { window.localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* chỉ giữ trong phiên */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Trạng thái bật/tắt dùng chung cho mọi component (Siêu Quét, Action Center), đồng bộ giữa các tab. */
export function useResearchUi(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  return [on, setResearchUi];
}

/** Chỉ dùng trong test. */
export function resetResearchUiForTest() {
  memory = null;
}
