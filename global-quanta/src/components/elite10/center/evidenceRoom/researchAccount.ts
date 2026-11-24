import { useSyncExternalStore } from "react";
import { currentUser } from "../../../../services/api";

export const readResearchAccount = () => currentUser()?.id ?? null;

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("focus", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("focus", callback);
  };
}

export function useResearchAccount() {
  return useSyncExternalStore(subscribe, readResearchAccount, () => null);
}

export function assertResearchAccount(account: string) {
  if (readResearchAccount() !== account) throw new Error("Tài khoản hiện tại đã đổi. Mở lại Phòng họp AI.");
}
