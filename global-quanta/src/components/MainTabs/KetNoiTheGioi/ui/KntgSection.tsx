// G3 (19/11/2026) — thu gọn TRONG CHỖ một khối của tab KẾT NỐI THẾ GIỚI (Giao-dien-KNTG/04, quyết định K5). Không phải tab con.
// • Khổ ≥ 768px: khối luôn mở, không có thanh thu gọn (bố cục máy tính không đổi).
// • Khổ < 768px: thanh tiêu đề + một dòng mô tả; bấm để mở / thu gọn. Mặc định chỉ mở các khối `openOnMobile`; lựa chọn được nhớ.
// Dùng <details>: nội dung luôn nằm trong DOM (trình đọc màn hình, tìm trong trang, vân tay số liệu đều đọc được).
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const KEY = "gq.world.sections.v1";
const MOBILE = "(max-width: 767px)";

function readStore(): Record<string, boolean> {
  try { const v = JSON.parse(window.localStorage.getItem(KEY) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
function writeStore(id: string, open: boolean) {
  try { window.localStorage.setItem(KEY, JSON.stringify({ ...readStore(), [id]: open })); } catch { /* chỉ nhớ trong phiên */ }
}
export function useIsMobile(): boolean {
  const get = () => typeof window !== "undefined" && !!window.matchMedia?.(MOBILE).matches;
  const [m, setM] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE);
    if (!mq) return undefined;
    const on = () => setM(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return m;
}

export default function KntgSection({ id, title, summary, openOnMobile = false, children }: { id: string; title: string; summary: string; openOnMobile?: boolean; children: ReactNode }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState<boolean>(() => readStore()[id] ?? openOnMobile);
  const shown = !mobile || open;
  return (
    <details className="kntg-section" data-kntg-section={id} open={shown}
      onToggle={(e) => { if (!mobile) return; const v = (e.currentTarget as HTMLDetailsElement).open; if (v !== open) { setOpen(v); writeStore(id, v); } }}>
      <summary className="kntg-section-bar" data-testid={`kntg-section-${id}`} aria-label={`${title}: ${shown ? "thu gọn" : "mở"}`}>
        <span className="min-w-0">
          <span className="kntg-section-title">{title}</span>
          <span className="kntg-section-sub">{summary}</span>
        </span>
        <ChevronDown className="kntg-section-chev" aria-hidden />
      </summary>
      <div className="kntg-section-body">{children}</div>
    </details>
  );
}
