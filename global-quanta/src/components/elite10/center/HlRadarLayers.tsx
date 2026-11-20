// HL-RADAR P1 (20/11/2026, tài liệu 20 mục 4) — các lớp hiển thị lấy từ ELITE COMMAND RADAR, gắn THÊM vào bảng Danh mục Elite HL.
// Mọi phần tử gốc giữ nguyên; mọi phần tử ở đây mang data-hl-layer (test vân tay gỡ chúng ra và so với bảng gốc từng ký tự).
//  - HlLayerToggles: công tắc từng lớp (nhớ theo trình duyệt).
//  - HlTickerBadge: "radar mini" cạnh mã — vòng nhấp nháy tin nóng 24h (R1), vòng ⏱ điểm mua (R4), ◆ Stealth 20 (R5) — kèm thẻ rê (R11):
//    giá trong phiên, tin nổi bật + phản ứng ESA, Stealth, ý đồ HMM (tham khảo), vùng điểm mua.
//  - rimStyle: vạch cảm xúc 72 giờ ở mép trái dòng (R2), không đổi bố cục.
//  - HlLivePrice: giá trong phiên + lóe màu khi giá đổi.
// Hiệu ứng (R13): chỉ chạy khi huy hiệu trong màn hình và trang đang hiện; tắt khi hệ điều hành bật "giảm chuyển động" (CSS App.css).
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { esaOf, type HlRowSignal } from "../../../lib/elite10/hlRowSignals";
import { HL_LAYER_VI, type HlLayer, type HlLayers } from "../../../hooks/elite10/useHlRowSignals";
import { NEWS_HOT_IMPORTANCE, NEWS_SENT_THRESHOLD } from "../../../lib/newsSignals";

const UP = "#34d399", DOWN = "#fb7185", AMBER = "#f59e0b", CYAN = "#38bdf8";
const RING: Record<string, string> = { in: UP, soon: AMBER, near: "#94a3b8", later: "#64748b" };
const RING_VI: Record<string, string> = { in: "đang trong vùng mua", soon: "≤ 5 phiên tới vùng mua", near: "vùng gần đạt (chưa qua kiểm định)", later: "vùng mua xa hơn" };
const ESA_TONE: Record<string, string> = { up: "border-emerald-400/50 text-emerald-200", warn: "border-amber-400/50 text-amber-200", muted: "border-white/15 text-slate-400" };
const hm = (iso: string | null) => { if (!iso) return "—"; const v = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString(); return `${v.slice(8, 10)}/${v.slice(5, 7)} ${v.slice(11, 16)}`; };
const pc = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d).replace(".", ",")}%`);

function useVisible<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(true);
  const [shown, setShown] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const el = ref.current;
    const onVis = () => setShown(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVis);
    let io: IntersectionObserver | null = null;
    if (el && typeof IntersectionObserver !== "undefined") { io = new IntersectionObserver((es) => setInView(es.some((e) => e.isIntersecting))); io.observe(el); }
    return () => { document.removeEventListener("visibilitychange", onVis); io?.disconnect(); };
  }, []);
  return [ref, inView && shown];
}

export function HlLayerToggles({ layers, onToggle, note }: { layers: HlLayers; onToggle: (k: HlLayer) => void; note?: string | null }) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1 text-[10px]" role="group" aria-label="Lớp hiển thị của bảng" data-hl-layer="toggles" data-testid="hl-layers">
      <span className="text-slate-500">Lớp hiển thị (MÔ TẢ, không đổi danh mục):</span>
      {(Object.keys(HL_LAYER_VI) as HlLayer[]).map((k) => (
        <button key={k} type="button" aria-pressed={layers[k]} onClick={() => onToggle(k)} data-testid={`hl-layer-${k}`}
          className={`min-h-[24px] rounded border px-1.5 ${layers[k] ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-500 hover:text-slate-300"}`}>{HL_LAYER_VI[k]}</button>
      ))}
      {note && <span className="text-amber-300/90" data-testid="hl-layers-note">{note}</span>}
    </div>
  );
}

/** Vạch cảm xúc 72 giờ ở mép trái dòng (inset, không đổi bố cục). */
export function rimStyle(s: HlRowSignal | undefined, on: boolean): CSSProperties | undefined {
  if (!on || !s?.rim) return undefined;
  return { boxShadow: `inset 3px 0 0 ${s.rim === "up" ? UP : DOWN}` };
}

export function HlTickerBadge({ s, layers, mobile = false }: { s: HlRowSignal | undefined; layers: HlLayers; mobile?: boolean }) {
  const [ref, animate] = useVisible<HTMLSpanElement>();
  const [open, setOpen] = useState(false);
  if (!s) return null;
  const hot = layers.news && s.news?.hot;
  const buy = layers.buy ? s.buy : null;
  const st = layers.signals ? s.stealth : null;
  const top = layers.news ? s.top : null;
  const live = layers.live ? s.live : null;
  if (!hot && !buy && !st && !top && !live && !(layers.news && s.rim)) return null;
  const rim = layers.news && s.rim ? (s.rim === "up" ? UP : DOWN) : null;
  const esa = esaOf(top);
  const label = [`${s.ticker}`, hot ? "có tin nóng 24 giờ" : null, rim ? `cảm xúc tin 3 ngày ${s.rim === "up" ? "tích cực" : "tiêu cực"}` : null,
    buy ? `điểm mua: ${RING_VI[buy.ring]}` : null, st ? `Stealth 20 ${st.dir > 0 ? "tích luỹ" : "phân phối"}` : null].filter(Boolean).join(", ");
  return (
    <span ref={ref} className="relative ml-1 inline-flex align-middle" data-hl-layer="badge" data-testid={`hl-badge-${mobile ? "m-" : ""}${s.ticker}`}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={`Tín hiệu mô tả của ${label}`} aria-expanded={open} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }} onClick={() => setOpen(true)} className="inline-flex min-h-[24px] min-w-[24px] items-center justify-center rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300">
        <svg width={22} height={22} viewBox="-11 -11 22 22" aria-hidden="true" className={animate ? "" : "radar-paused"}>
          {hot && <circle r={6} fill="none" stroke={rim ?? AMBER} strokeWidth={1.4} className="radar-pulse" data-testid={`hl-hot-${mobile ? "m-" : ""}${s.ticker}`} />}
          {buy && <circle r={8.6} fill="none" stroke={RING[buy.ring]} strokeWidth={buy.ring === "in" ? 1.6 : 1.2} data-buy-ring={buy.ring}
            strokeDasharray={buy.ring === "near" ? "2 2" : buy.ring === "later" ? "1 3" : undefined} opacity={buy.ring === "near" || buy.ring === "later" ? 0.7 : 0.95}
            className={buy.ring === "in" ? "radar-buy-pulse" : undefined} />}
          <circle r={4} fill={rim ?? CYAN} opacity={rim ? 0.9 : 0.55} />
          {st && <rect x={-2.3} y={-2.3} width={4.6} height={4.6} transform="translate(6.2 -6.2) rotate(45)" fill={st.edge ? (st.dir > 0 ? UP : DOWN) : "#0d111a"} stroke={st.dir > 0 ? UP : DOWN} strokeWidth={1.1} data-testid={`hl-stealth-${mobile ? "m-" : ""}${s.ticker}`} />}
        </svg>
      </button>
      {open && (
        <span role="tooltip" className="absolute left-0 top-full z-30 mt-1 block w-72 rounded-lg border border-cyan-400/35 bg-[#0f1420] p-2 text-left text-[10.5px] font-normal leading-snug text-slate-300 shadow-xl" data-testid={`hl-tip-${mobile ? "m-" : ""}${s.ticker}`}>
          <span className="flex items-baseline justify-between"><b className="font-mono text-slate-100">{s.ticker}</b><span className="rounded border border-white/15 px-1 text-[10px] text-slate-400">MÔ TẢ</span></span>
          {live && <span className="block font-mono">Trong phiên <b className="text-slate-100">{live.price.toLocaleString("vi-VN")}</b> <span style={{ color: (live.changePct ?? 0) >= 0 ? UP : DOWN }}>{pc(live.changePct)}</span></span>}
          {layers.news && (top ? (
            <span className="mt-1 block">
              <span className="block text-slate-100">{top.title}</span>
              <span className="block text-[10px] text-slate-400">{top.sourceLabel}{top.corroboration > 1 ? ` · ${top.corroboration} nguồn` : ""} · {hm(top.publishedAt)} · quan trọng {top.importance}</span>
              {esa && <span className={`mt-0.5 inline-block rounded border px-1 text-[10px] ${ESA_TONE[esa.tone]}`}>Phản ứng giá: {esa.text}</span>}
              {top.insight && <span className="block text-[10px] text-slate-400">{top.insight.tone === "up" ? "▲" : top.insight.tone === "down" ? "▼" : "◐"} {top.insight.text}</span>}
              <span className="block text-[10px] text-slate-500">{s.items.length} tin / 14 ngày · cảm xúc 3 ngày {s.news ? pc(s.news.sentiment * 100, 0).replace("%", "") : "—"}{s.news?.hot ? " · tin nóng 24h" : ""}</span>
            </span>
          ) : <span className="mt-1 block text-slate-500">Không có tin trong 14 ngày.</span>)}
          {st && <span className="mt-1 block" style={{ color: st.dir > 0 ? UP : DOWN }}>◆ Stealth 20: {st.dir > 0 ? "tích luỹ âm thầm" : "phân phối âm thầm"} (z {st.z == null ? "—" : st.z.toFixed(2).replace(".", ",")}) · {st.edge ? "đã kiểm định có lợi thế" : "chưa đạt kiểm định"}</span>}
          {layers.signals && s.intent && <span className="block text-slate-400">◐ Ý đồ HMM: {s.intent.label}{s.intent.p != null ? ` ${Math.round(s.intent.p * 100)}%` : ""} — chỉ tham khảo, chưa có lợi thế</span>}
          {buy && <span className="mt-1 block" style={{ color: RING[buy.ring] }}>⏱ {RING_VI[buy.ring]}: {buy.row.windowLabel} · vào {buy.row.entryFromDate.slice(8, 10)}/{buy.row.entryFromDate.slice(5, 7)}{buy.row.tier === "NEAR" ? " · gần đạt" : ""}</span>}
          <span className="mt-1 block text-[10px] text-slate-500">Ngưỡng hiển thị: tin nóng = quan trọng ≥ {NEWS_HOT_IMPORTANCE} trong 24 giờ; viền = cảm xúc 3 ngày ≥ ±{String(NEWS_SENT_THRESHOLD).replace(".", ",")}. Không đổi hạng, tỷ trọng hay ngưỡng ra.</span>
        </span>
      )}
    </span>
  );
}

/** Giá trong phiên (luồng giá) + lóe màu 0,6 giây khi giá đổi. */
export function HlLivePrice({ s, on, mobile = false }: { s: HlRowSignal | undefined; on: boolean; mobile?: boolean }) {
  const live = on ? s?.live ?? null : null;
  const prev = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (!live) return;
    const p = prev.current; prev.current = live.price;
    if (p == null || p === live.price) return;
    const reduce = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    setFlash(live.price > p ? "up" : "down");
    const id = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(id);
  }, [live?.price]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!live || !s) return null;
  const tone = (live.changePct ?? 0) >= 0 ? UP : DOWN;
  return (
    <span className={`${mobile ? "ml-1 inline" : "block"} rounded px-0.5 text-[10px] transition-colors duration-500 ${flash === "up" ? "bg-emerald-400/25" : flash === "down" ? "bg-rose-400/25" : ""}`}
      data-hl-layer="live" data-testid={`hl-live-${mobile ? "m-" : ""}${s.ticker}`} title="Giá trong phiên từ luồng giá (bảng dùng giá đóng cửa của phiên dựng bảng)">
      trong phiên <b className="text-slate-200">{live.price.toLocaleString("vi-VN")}</b> <span style={{ color: tone }}>{pc(live.changePct)}</span>
    </span>
  );
}
