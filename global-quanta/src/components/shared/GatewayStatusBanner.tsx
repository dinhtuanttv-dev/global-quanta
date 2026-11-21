// Băng thông báo chung khi máy chủ dữ liệu (Gateway) gián đoạn — thay cho hàng chục dòng "Failed to fetch" rời rạc.
// Chỉ lắng nghe trạng thái từ gatewayResilience (không tự gọi mạng). Vị trí cố định nên không đổi bố cục lưới của ứng dụng.
import { useEffect, useState } from "react";
import { getGatewayHealth, subscribeGatewayHealth, type GatewayHealth } from "../../services/gatewayResilience";

const hm = (t: number | string | null) => (t == null ? "—" : new Date(t).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }));

export default function GatewayStatusBanner() {
  const [h, setH] = useState<GatewayHealth>(getGatewayHealth());
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine !== false);
  const [recovered, setRecovered] = useState(false);
  useEffect(() => subscribeGatewayHealth((next) => {
    setH((prev) => { if (prev.mode !== "ok" && next.mode === "ok") setRecovered(true); return next; });
  }), []);
  useEffect(() => {
    if (!recovered) return;
    const id = setTimeout(() => setRecovered(false), 6_000);
    return () => clearTimeout(id);
  }, [recovered]);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  let text: string | null = null, tone = "amber";
  if (!online) text = "Thiết bị đang mất kết nối mạng. Dữ liệu sẽ tự cập nhật khi có mạng trở lại.";
  else if (h.mode === "offline-copy") text = `Máy chủ dữ liệu đang gián đoạn từ ${hm(h.since)}. Đang hiện bản lưu gần nhất (lúc ${hm(h.savedAt)}), số liệu có thể cũ. Hệ thống tự thử lại.`;
  else if (h.mode === "down") text = `Máy chủ dữ liệu đang gián đoạn từ ${hm(h.since)}. Hệ thống tự thử lại; dữ liệu sẽ tự hiện khi kết nối lại.`;
  else if (recovered) { text = "Đã kết nối lại máy chủ dữ liệu."; tone = "emerald"; }
  if (!text) return null;
  const cls = tone === "emerald" ? "border-emerald-400/40 bg-emerald-950/90 text-emerald-200" : "border-amber-400/40 bg-[#1c1408]/95 text-amber-100";
  return (
    <div role="status" aria-live="polite" data-testid="gateway-status" data-mode={!online ? "offline" : recovered && h.mode === "ok" ? "recovered" : h.mode}
      className={`fixed bottom-3 left-1/2 z-[60] flex max-w-[min(92vw,720px)] -translate-x-1/2 items-start gap-2 rounded-xl border px-3 py-2 text-[12px] shadow-xl shadow-black/50 ${cls}`}>
      <span aria-hidden>{tone === "emerald" ? "✓" : "⚠"}</span>
      <span>{text}</span>
    </div>
  );
}
