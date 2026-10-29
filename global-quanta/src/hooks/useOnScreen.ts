import { useEffect, useState, type RefObject } from "react";

/** Đang hiện trên màn hình VÀ tab trình duyệt đang mở — dùng để dừng hoạt ảnh khi không ai xem (cùng cách Elite Command Radar). */
export function useOnScreen(ref: RefObject<Element>): boolean {
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const el = ref.current;
    const onVis = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVis);
    if (!el || typeof IntersectionObserver === "undefined") return () => document.removeEventListener("visibilitychange", onVis);
    const io = new IntersectionObserver((es) => setInView(es.some((e) => e.isIntersecting)), { rootMargin: "64px" });
    io.observe(el);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, [ref]);
  return inView && visible;
}
