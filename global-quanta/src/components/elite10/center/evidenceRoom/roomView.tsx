import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactElement, type ReactNode, type Ref } from "react";
import { CircleHelp, Wrench } from "lucide-react";
import "./evidenceRoom.css";

export interface RoomReference {
  ticker: ReactElement;
  left: ReactElement;
  right: ReactElement;
  world: ReactElement<{ style?: CSSProperties }>;
  chart: ReactElement;
  chartNotes: ReactElement;
  footer: ReactElement;
}

export const numberVi = (value: number | null | undefined, digits = 2) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("vi-VN", { maximumFractionDigits: digits }) : "—";

const vnDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" });
export function sessionDay(value?: string | null): string | null {
  if (!value) return null;
  const slot = new Date(value);
  if (!Number.isFinite(slot.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = Object.fromEntries(vnDay.formatToParts(slot).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function dateVi(value?: string | null, year = false) {
  const day = sessionDay(value);
  if (!day) return "—";
  const [y, m, d] = day.split("-");
  return year ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export function DetailDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    if (dialog && typeof dialog.showModal === "function") dialog.showModal();
    else dialog?.setAttribute("open", "");
    return () => {
      dialog?.close?.();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog className="eb-dialog" ref={ref} aria-labelledby={titleId}
    onCancel={(e) => { e.preventDefault(); onClose(); }}
    onClick={(e) => {
      if (e.target !== e.currentTarget) return;
      const { left, right, top, bottom } = e.currentTarget.getBoundingClientRect();
      if (e.clientX < left || e.clientX > right || e.clientY < top || e.clientY > bottom) onClose();
    }}>
    <div className="eb-dialog-head"><h2 id={titleId}>{title}</h2><button type="button" autoFocus className="small-link" onClick={onClose}>Đóng ×</button></div>
    {children}
  </dialog>;
}

export function ReferenceRoomHeader() {
  return <>
    <div className="demo-ribbon">Mẫu giao diện · dữ liệu minh họa · không phải tín hiệu thị trường</div>
    <header className="eb-topbar">
      <div className="brand"><div className="brand-icon">DT</div>{" ĐINH TUẤN "}<span>/ QUYẾT ĐỊNH</span></div>
      <div className="top-right"><span className="market-chip"><i />THẾ GIỚI RISK-OFF</span><span>VN-INDEX <b>1.688,8</b></span><span>·</span><span>Phiên mô phỏng 20/11/2026</span></div>
    </header>
  </>;
}

export function ReferenceRoomIntro() {
  return <>
    <div className="crumbs"><b>QUYẾT ĐỊNH</b><span>›</span><strong>3. PHÒNG HỌP AI</strong><span>·</span><span>Evidence Brain</span></div>
    <div className="title-row">
      <div><h1>Phòng họp AI <span style={{ color: "var(--cyan)" }}>/ Evidence Brain</span></h1><div className="subtitle">Đối chiếu funnel, doanh nghiệp, Price Action, xúc tác, khối lượng và rủi ro trên một snapshot.</div></div>
      <div className="inline" style={{ gap: 7 }}><span className="status-chip" style={{ fontSize: 9, color: "#becade" }}>GPT + Gemini · read-only</span><RoomHelp reference /></div>
    </div>
  </>;
}

function RoomHelp({ reference = false }: { reference?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    {reference
      ? <button type="button" className="small-link" onClick={() => setOpen(true)}>Nguyên tắc kiểm chứng ↗</button>
      : <button type="button" className="eb-toolbar-action" aria-label="Nguyên tắc kiểm chứng" aria-haspopup="dialog"
          title="Nguyên tắc kiểm chứng" onClick={() => setOpen(true)}>
        <CircleHelp aria-hidden="true" /><span>Nguyên tắc kiểm chứng</span>
      </button>}
    {open && <DetailDialog title="Nguyên tắc kiểm chứng" onClose={() => setOpen(false)}>
      <p>GPT trình bày lập luận phe thuận và làm trọng tài (Claude dự phòng). Gemini phản biện. Hai mô hình đọc và đối chiếu bằng chứng trong Phòng họp AI.</p>
      <p>Hai phe và trọng tài cùng tham chiếu snapshot đã khóa. Ref và số khớp xác nhận dữ liệu trích dẫn; ý nghĩa của luận điểm vẫn được đối chiếu riêng. Nguồn thiếu, quá hạn, nến chưa đóng và volume trong phiên giữ nguyên trạng thái.</p>
    </DetailDialog>}
  </>;
}

export function RoomToolbarActions({ toolsId, toolsButton, onOpenTools }: {
  toolsId: string; toolsButton: Ref<HTMLButtonElement>; onOpenTools: () => void;
}) {
  return <div className="eb-toolbar-actions">
    <button type="button" ref={toolsButton} className="eb-toolbar-action" aria-label="Công cụ phiên"
      aria-controls={toolsId} title="Tranh luận, bản tin, hỏi đáp và Obsidian" onClick={onOpenTools}>
      <Wrench aria-hidden="true" /><span>Công cụ phiên</span>
    </button>
    <RoomHelp />
  </div>;
}

export type Box = { x: number; y: number; width: number; height: number };
type Camera = { x: number; y: number; zoom: number };
const home = { x: 0, y: 0, zoom: 1 };
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function GraphViewport({ world, bounds, visibleCount, edgeCount, reference = false, details }: {
  world: ReactElement<{ style?: CSSProperties }>; bounds: Box; visibleCount: number; edgeCount: number;
  reference?: boolean; details?: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; camera: Camera } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [manualCamera, setCamera] = useState<Camera | null>(null);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const fit = (): Camera => {
    if (!size.width || !size.height) return home;
    const zoom = clamp(Math.min((size.width - 24) / bounds.width, (size.height - 64) / bounds.height), .36, 1);
    return { x: zoom * (460 - bounds.x - bounds.width / 2), y: zoom * (215 - bounds.y - bounds.height / 2) - 6, zoom };
  };
  const initial = size.width && (size.width < 920 || (!reference && bounds.height > size.height - 35)) ? fit() : home;
  const camera = manualCamera ?? initial;
  function zoomBy(delta: number, x = 0, y = 0) {
    setCamera((last) => {
      const current = last ?? initial;
      const zoom = clamp(Math.round((current.zoom + delta) * 100) / 100, .36, 1.35);
      const ratio = zoom / current.zoom;
      return { x: x + (current.x - x) * ratio, y: y + (current.y - y) * ratio, zoom };
    });
  }
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const wheel = (e: WheelEvent) => {
      if ((!e.ctrlKey && !e.metaKey) || e.deltaY === 0) return;
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? .05 : -.05, e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [initial.x, initial.y, initial.zoom]);
  function startDrag(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || drag.current || (e.target instanceof Element && e.target.closest(".node,button,a"))) return;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, camera };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.id !== e.pointerId) return;
    const limitX = Math.max(300, size.width / 2 + bounds.width * camera.zoom / 2 - 48);
    const limitY = Math.max(200, size.height / 2 + bounds.height * camera.zoom / 2 - 48);
    setCamera({ zoom: start.camera.zoom, x: clamp(start.camera.x + e.clientX - start.startX, -limitX, limitX), y: clamp(start.camera.y + e.clientY - start.startY, -limitY, limitY) });
  }
  function stop(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  }
  const graph = cloneElement(world, { style: { ...world.props.style, transform: `translate(calc(-50% + ${camera.x}px),calc(-50% + ${camera.y}px)) scale(${camera.zoom})` } });
  return <div className="panel canvas-panel">
    <div className="canvas-top">
      <div><div className="eyebrow">{reference ? "Evidence workspace" : "Phòng họp AI / Evidence Brain"}</div><div style={{ fontSize: 10, fontWeight: 800, marginTop: 3 }}>Luận điểm &amp; bằng chứng <span className="soft-label">{`· ${visibleCount} nodes · ${edgeCount} links`}</span></div></div>
      <div className="toolrow">
        <button type="button" className="eb-icon-btn" onClick={() => zoomBy(-.1)} aria-label="Thu nhỏ">−</button>
        <span className="zoom-label" aria-live="polite">{Math.round(camera.zoom * 100)}%</span>
        <button type="button" className="eb-icon-btn" onClick={() => zoomBy(.1)} aria-label="Phóng to">+</button>
        <button type="button" className="eb-icon-btn" onClick={() => setCamera(fit())} aria-label="Đưa toàn bộ canvas vào khung">⌗</button>
        <button type="button" className="eb-icon-btn" onClick={() => setCamera(null)} aria-label="Đặt lại bố cục">↺</button>
      </div>
    </div>
    <div className={`canvas-viewport${reference ? "" : " eb-live-viewport"}${dragging ? " dragging" : ""}`} ref={element} aria-label="Canvas 2D các luận điểm và bằng chứng"
      onFocusCapture={(e) => {
        if (reference || !(e.target instanceof HTMLElement) || !e.target.matches(".node:focus-visible")) return;
        const target = e.target.getBoundingClientRect();
        const frame = e.currentTarget.getBoundingClientRect();
        const dx = target.left < frame.left + 12 ? frame.left + 12 - target.left : Math.min(0, frame.right - 12 - target.right);
        const dy = target.top < frame.top + 22 ? frame.top + 22 - target.top : Math.min(0, frame.bottom - 40 - target.bottom);
        if (dx || dy) setCamera({ ...camera, x: camera.x + dx, y: camera.y + dy });
      }}
      onPointerDown={startDrag} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}>
      <div className="canvas-hint">{reference ? "Kéo nền để di chuyển · chọn thẻ để xem nguồn · dữ liệu mẫu" : "Kéo nền để di chuyển · chọn thẻ để xem nguồn"}</div>
      {graph}
      <div className="canvas-legend"><span className="eb-legend-item"><i />Hỗ trợ</span><span className="eb-legend-item"><i className="lg-red" />Phản biện</span><span className="eb-legend-item"><i className="lg-cyan" />Bằng chứng trong snapshot</span><span className="eb-legend-item"><i className="lg-violet" />Trọng tài dẫn nguồn</span><span className="eb-legend-item"><i className="lg-gold" />Luồng phiên</span><span className="eb-legend-item"><i className="lg-amber" />Cần rà soát</span></div>
    </div>
    {details}
  </div>;
}

export function TimelinePanel({ period, chart, notes }: { period: string; chart: ReactNode; notes?: ReactNode }) {
  return <section className="panel timeline">
    <div className="timeline-head"><h3>Timeline đồng bộ · Giá / khối lượng / sự kiện / setup</h3><span>{period}</span></div>
    {chart}{notes}
  </section>;
}

export function WorkspaceFrame({ ticker, left, graph, timeline, right, footer, onClick }: {
  ticker: ReactNode; left: ReactNode; graph: ReactNode; timeline: ReactNode; right: ReactNode; footer: ReactNode;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
}) {
  return <div onClick={onClick} onKeyDown={onClick ? (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target instanceof HTMLElement && e.target.getAttribute("role") === "button") {
      e.preventDefault();
      e.target.click();
    }
  } : undefined}>
    {ticker}
    <div className="layout">{left}<section className="center-column">{graph}{timeline}</section>{right}</div>
    {footer}
  </div>;
}

export function ReferenceWorkspace({ fixture }: { fixture: RoomReference }) {
  const [detail, setDetail] = useState<string | null>(null);
  return <>
    <WorkspaceFrame ticker={fixture.ticker} left={fixture.left} right={fixture.right} footer={fixture.footer}
      graph={<GraphViewport world={fixture.world} bounds={{ x: 137, y: 49, width: 773, height: 364 }} visibleCount={8} edgeCount={11} reference />}
      timeline={<TimelinePanel period="01/10 → 20/11 · daily · minh họa" chart={fixture.chart} notes={fixture.chartNotes} />}
      onClick={(e) => {
        if (!(e.target instanceof Element)) return;
        const source = e.target.closest<HTMLElement>("[data-source]")?.dataset.source;
        if (source) setDetail(source);
        else if (e.target.closest(".primary-btn")) setDetail("Mô phỏng quy trình tranh luận");
      }} />
    {detail && <DetailDialog title={detail} onClose={() => setDetail(null)}><p>Dữ liệu minh họa · FPT · Snapshot EB-7F31 · phiên 20/11/2026.</p></DetailDialog>}
  </>;
}
