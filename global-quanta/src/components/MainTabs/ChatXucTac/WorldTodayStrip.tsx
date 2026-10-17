// Z3 (2026-10-17) — "Bối cảnh thế giới hôm nay" phía trên Phân tích vĩ mô: rủi ro toàn cầu, ngành nghiêng ngắn hạn, hàng hoá biến động mạnh.
// Dữ liệu Gateway (cùng nguồn Kết nối thế giới); bấm để mở bảng tác động ngành & cổ phiếu.
import { useMemo } from "react";
import { useWorldStrategy } from "../../../hooks/useWorldStrategy";
import { useCommoditySnapshot } from "../../../hooks/useCommoditySnapshot";
import { fmtZ } from "../../../lib/worldSectors/types";

const muted = { color: "var(--text-tertiary)" };
const fmtDate = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

export default function WorldTodayStrip({ onOpenImpact }: { onOpenImpact: () => void }) {
  const { data: st } = useWorldStrategy();
  const { data: cm } = useCommoditySnapshot();
  const movers = useMemo(() => (cm?.items ?? [])
    .filter((i) => i.available && i.freq === "day" && i.change?.pct != null)
    .sort((a, b) => Math.abs(b.change!.pct!) - Math.abs(a.change!.pct!)).slice(0, 4), [cm]);
  if (!st) return null;
  const rows = st.short.rows.filter((r) => r.alphaBps != null);
  const top = rows.filter((r) => r.stance === "overweight").slice(0, 3);
  const bottom = rows.filter((r) => r.stance === "underweight").slice(-3).reverse();
  return (
    <div className="tw-scope rounded-xl p-3 mb-3 space-y-1.5" data-testid="world-today-strip" style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>Bối cảnh thế giới hôm nay <span className="font-normal normal-case" style={muted}>· phiên VN {fmtDate(st.vnLast)}</span></p>
        <button type="button" onClick={onOpenImpact} className="text-[9.5px] font-bold px-2 py-0.5 rounded whitespace-nowrap" style={{ border: "1px solid rgba(232,184,75,0.4)", color: "var(--gold-bright, #e8b84b)" }}>
          Xem tác động ngành & cổ phiếu →
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10.5px]" style={{ color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
        <p style={{ minWidth: 0 }}>
          <span style={muted}>Rủi ro toàn cầu: </span>
          {st.regime.stressed ? <b style={{ color: "var(--gold, #fbbf24)" }}>căng thẳng</b> : <b style={{ color: "var(--text-primary)" }}>bình thường</b>}
          {" "}· VIX {st.regime.vix == null ? "—" : st.regime.vix.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ({fmtZ(st.regime.vixChg, 1)}%)
        </p>
        <p style={{ minWidth: 0 }}>
          <span style={muted}>Ngắn hạn nghiêng: </span>
          <span style={{ color: "var(--positive)" }}>▲ {top.map((r) => r.nameVi).join(", ") || "—"}</span>
          {" "}<span style={{ color: "var(--negative)" }}>▼ {bottom.map((r) => r.nameVi).join(", ") || "—"}</span>
        </p>
        <p style={{ minWidth: 0 }}>
          <span style={muted}>Hàng hoá biến động mạnh: </span>
          {movers.map((i) => <span key={i.id} className="mr-1.5 inline-block">{i.nameVi} <b style={{ color: i.change!.pct! >= 0 ? "var(--positive)" : "var(--negative)" }}>{fmtZ(i.change!.pct, 1)}%</b></span>)}
        </p>
      </div>
      <p className="text-[9px]" style={muted}>Xếp hạng ngắn hạn đã kiểm định (lợi thế nhỏ); màu hàng hoá là chiều giá, chưa phải chiều tác động lên ngành. Tham khảo — không phải khuyến nghị đầu tư.</p>
    </div>
  );
}
