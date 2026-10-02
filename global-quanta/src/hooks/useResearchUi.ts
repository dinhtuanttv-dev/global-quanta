import { useSyncExternalStore } from "react";
import { isMarketGatewayEnabled } from "../services/marketDataClient";

// Hiện/ẩn các khối AI (Bảng phân tích khối lượng, panel "AI học & thích ứng", Action Center).
// - Mặc định HIỆN trên trang chính (không cần cờ môi trường); công tắc trên UI chỉ để ẩn khi không cần.
// - Lựa chọn của người xem nhớ trong localStorage của trình duyệt đó; localStorage lỗi/bị chặn thì
//   vẫn bật/tắt được trong phiên (giữ trong bộ nhớ).
// - Chỉ có khi Market Gateway bật (dữ liệu nghiên cứu nằm trên Gateway).

// Khoá mới: lựa chọn "ẩn" theo quy ước cũ (mặc định tắt) không còn áp dụng.
const KEY = "gq.researchUi.v2";
const EVENT = "gq:research-ui";
let memory: boolean | null = null;

export const researchUiAvailable = () => isMarketGatewayEnabled();

function read(): boolean {
  if (!researchUiAvailable()) return false;
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch { /* localStorage không dùng được */ }
  return memory ?? true;
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
