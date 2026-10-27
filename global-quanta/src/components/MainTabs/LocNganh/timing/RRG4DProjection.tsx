import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { GatewaySectorRrg } from "../../../../lib/locnganh/types";

type Props = {
  sectors: GatewaySectorRrg[];
  selectedSector?: string | null;
  onSelectSector?: (code: string) => void;
};

const W = 1000;
const H = 600;
const CENTER = { x: 500, y: 298 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const nfmt = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: digits });
const correlationColor = (value: number) => {
  const t = clamp((value + 1) / 2, 0, 1);
  const a = [245, 158, 11], b = [34, 211, 238];
  return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(",")})`;
};

type Rotation = { yaw: number; pitch: number; zoom: number };
type Point3 = { x: number; y: number; z: number };
type ProjectedPoint = { sector: GatewaySectorRrg; x: number; y: number; depth: number; color: string };
type DragState = { x: number; y: number; moved: boolean };

function project(point: Point3, rotation: Rotation): { x: number; y: number; depth: number } {
  const cy = Math.cos(rotation.yaw), sy = Math.sin(rotation.yaw);
  const cp = Math.cos(rotation.pitch), sp = Math.sin(rotation.pitch);
  const x1 = point.x * cy - point.z * sy;
  const z1 = point.x * sy + point.z * cy;
  const y2 = point.y * cp - z1 * sp;
  const z2 = point.y * sp + z1 * cp;
  const perspective = 4 / (4 + z2);
  return {
    x: CENTER.x + x1 * 220 * rotation.zoom * perspective,
    y: CENTER.y - y2 * 190 * rotation.zoom * perspective,
    depth: z2,
  };
}

/** Three spatial RRG dimensions are projected from an interactive 3D camera; W is color. */
export default function RRG4DProjection({ sectors, selectedSector, onSelectSector }: Props) {
  const [rotation, setRotation] = useState<Rotation>({ yaw: 0.62, pitch: -0.38, zoom: 1 });
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const eligible = useMemo(() => sectors.filter((s) =>
    s.rrg4d?.correlationStatus === "ready"
    && s.rrg4d.flowShareZ != null
    && s.rrg4d.marketCorrelation60 != null
    && Number.isFinite(s.latestClosed.ratio)
    && Number.isFinite(s.latestClosed.momentum)
  ), [sectors]);

  const domain = useMemo(() => Math.max(1.5, ...eligible.flatMap((s) => [
    Math.abs(s.latestClosed.ratio - 100), Math.abs(s.latestClosed.momentum - 100),
  ])), [eligible]);

  const points = useMemo<ProjectedPoint[]>(() => eligible.map((sector) => {
    const p = project({
      x: (sector.latestClosed.ratio - 100) / domain,
      y: (sector.latestClosed.momentum - 100) / domain,
      z: clamp(sector.rrg4d!.flowShareZ! / 3, -1, 1),
    }, rotation);
    return { sector, ...p, color: correlationColor(sector.rrg4d!.marketCorrelation60!) };
  }), [eligible, domain, rotation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !eligible.length) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#0b1424"); bg.addColorStop(1, "#080d18");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    const p = (v: Point3) => project(v, rotation);
    const path3 = (vertices: Point3[], close = false) => {
      const projected = vertices.map(p);
      ctx.beginPath();
      projected.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y));
      if (close) ctx.closePath();
      return projected;
    };

    // RRG base plane (Z=0) and a wireframe cube establish actual 3D depth.
    path3([{ x: -1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: -1, y: 1, z: 0 }], true);
    ctx.fillStyle = "rgba(14,165,233,.07)"; ctx.fill();
    ctx.strokeStyle = "rgba(56,189,248,.32)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.setLineDash([3, 6]); ctx.strokeStyle = "rgba(148,163,184,.17)";
    for (const t of [-0.5, 0, 0.5]) {
      path3([{ x: t, y: -1, z: 0 }, { x: t, y: 1, z: 0 }]); ctx.stroke();
      path3([{ x: -1, y: t, z: 0 }, { x: 1, y: t, z: 0 }]); ctx.stroke();
    }
    ctx.setLineDash([]);
    const cube = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => ({ x, y, z }))));
    ctx.strokeStyle = "rgba(100,116,139,.24)"; ctx.lineWidth = 1;
    for (const a of cube) for (const b of cube) {
      const changed = Number(a.x !== b.x) + Number(a.y !== b.y) + Number(a.z !== b.z);
      if (changed === 1 && (a.x < b.x || a.y < b.y || a.z < b.z)) {
        const pa = p(a), pb = p(b); ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      }
    }

    // Three independently visible, labeled axes.
    const axes: { end: Point3; color: string; label: string; positive: string }[] = [
      { end: { x: 1.18, y: 0, z: 0 }, color: "#60a5fa", label: "X · RS-Ratio − 100", positive: "RS mạnh hơn" },
      { end: { x: 0, y: 1.18, z: 0 }, color: "#4ade80", label: "Y · RS-Momentum − 100", positive: "động lượng tăng" },
      { end: { x: 0, y: 0, z: 1.18 }, color: "#fbbf24", label: "Z · z-score thị phần GTGD", positive: "dòng tiền cao hơn nền" },
    ];
    for (const axis of axes) {
      const start = p({ x: 0, y: 0, z: 0 }), end = p(axis.end);
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = axis.color; ctx.lineWidth = 2; ctx.stroke();
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      ctx.beginPath(); ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - 9 * Math.cos(angle - 0.4), end.y - 9 * Math.sin(angle - 0.4));
      ctx.lineTo(end.x - 9 * Math.cos(angle + 0.4), end.y - 9 * Math.sin(angle + 0.4));
      ctx.closePath(); ctx.fillStyle = axis.color; ctx.fill();
      ctx.font = "600 11px system-ui, sans-serif"; ctx.fillStyle = axis.color;
      ctx.fillText(axis.label, end.x + (end.x >= start.x ? 8 : -8), end.y + (end.y >= start.y ? 16 : -8));
    }

    // Points are drawn back-to-front. Size stays fixed so the map encodes exactly X/Y/Z/W.
    for (const point of [...points].sort((a, b) => b.depth - a.depth)) {
      const active = selectedSector === point.sector.code || hoveredCode === point.sector.code;
      ctx.beginPath(); ctx.arc(point.x, point.y, active ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = point.color; ctx.fill();
      ctx.lineWidth = active ? 2.5 : 1; ctx.strokeStyle = active ? "#fff" : "rgba(7,12,22,.95)"; ctx.stroke();
      if (active) {
        ctx.beginPath(); ctx.arc(point.x, point.y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.font = active ? "700 10px system-ui, sans-serif" : "600 9px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillStyle = "#e2e8f0"; ctx.fillText(point.sector.code, point.x, point.y + 10);
    }
  }, [eligible.length, points, rotation, selectedSector, hoveredCode]);

  const canvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height };
  };
  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const pos = canvasPoint(event);
    dragRef.current = { ...pos, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const pos = canvasPoint(event);
    const drag = dragRef.current;
    if (drag && (event.buttons & 1) === 1) {
      const dx = pos.x - drag.x, dy = pos.y - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      if (drag.moved) setRotation((r) => ({ ...r, yaw: r.yaw + dx * 0.008, pitch: clamp(r.pitch + dy * 0.008, -1.25, 1.25) }));
      drag.x = pos.x; drag.y = pos.y;
      return;
    }
    const nearest = points.reduce<{ code: string; distance: number } | null>((best, point) => {
      const distance = Math.hypot(point.x - pos.x, point.y - pos.y);
      return distance < 18 && (!best || distance < best.distance) ? { code: point.sector.code, distance } : best;
    }, null);
    setHoveredCode(nearest?.code ?? null);
  };
  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.moved) {
      const pos = canvasPoint(event);
      const nearest = points.reduce<ProjectedPoint | null>((best, point) => {
        const distance = Math.hypot(point.x - pos.x, point.y - pos.y);
        return distance < 18 && (!best || distance < Math.hypot(best.x - pos.x, best.y - pos.y)) ? point : best;
      }, null);
      if (nearest) { setHoveredCode(nearest.sector.code); onSelectSector?.(nearest.sector.code); }
    }
  };
  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    setRotation((r) => ({ ...r, zoom: clamp(r.zoom * (event.deltaY < 0 ? 1.08 : 0.93), 0.65, 1.8) }));
  };

  if (!eligible.length) {
    return <div data-testid="rrg4d-insufficient" role="status" style={{ padding: 12, color: "var(--text-tertiary)", fontSize: 11 }}>
      Chưa đủ lịch sử đồng bộ để dựng bản đồ 4D. Cần tối thiểu 30 phiên ghép cặp cho tương quan; không tạo dữ liệu thay thế.
    </div>;
  }

  const detail = points.find((point) => point.sector.code === (hoveredCode ?? selectedSector)) ?? null;
  const reset = () => { setRotation({ yaw: 0.62, pitch: -0.38, zoom: 1 }); setHoveredCode(null); };

  return <section data-testid="rrg4d-projection" aria-label="Bản đồ RRG 4D nghiên cứu" style={{ width: "100%" }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "7px 16px", padding: "9px 11px", border: "1px solid var(--bg-surface-2)", borderRadius: 8, marginBottom: 8, fontSize: 10, color: "var(--text-secondary)" }}>
      <span><b style={{ color: "#60a5fa" }}>X</b> RS-Ratio − 100</span>
      <span><b style={{ color: "#4ade80" }}>Y</b> RS-Momentum − 100</span>
      <span><b style={{ color: "#fbbf24" }}>Z</b> z-score thị phần GTGD</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><b>W / màu</b><i aria-hidden="true" style={{ display: "inline-block", width: 82, height: 7, borderRadius: 8, background: `linear-gradient(90deg, ${correlationColor(-1)}, ${correlationColor(0)}, ${correlationColor(1)})` }} />−1 nghịch chiều · 0 ít tương quan tuyến tính · +1 đồng biến mạnh</span>
      <span style={{ marginLeft: "auto", color: "var(--text-tertiary)" }}>{eligible.length}/{sectors.length} ngành đủ mẫu · điểm cùng kích thước</span>
    </div>

    <div style={{ position: "relative", width: "100%", overflow: "hidden", border: "1px solid var(--bg-surface-2)", borderRadius: 10, background: "#080d18" }}>
      <canvas ref={canvasRef} data-testid="rrg4d-canvas" width={W} height={H}
        role="img" aria-label="Đồ thị không gian 3D: X là RS-Ratio, Y là RS-Momentum, Z là z-score thị phần giao dịch; màu W là tương quan với VNINDEX. Kéo để xoay, cuộn để phóng to. Dữ liệu chính xác nằm trong bảng bên dưới."
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragRef.current = null; }} onPointerLeave={() => { if (!dragRef.current) setHoveredCode(null); }} onWheel={onWheel}
        style={{ display: "block", width: "100%", height: "auto", aspectRatio: `${W} / ${H}`, cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none" }} />
      <div style={{ position: "absolute", top: 9, left: 10, display: "flex", alignItems: "center", gap: 6, pointerEvents: "none", fontSize: 10, color: "#cbd5e1", background: "rgba(5,10,20,.76)", padding: "5px 8px", borderRadius: 6 }}>
        <span>3D · kéo để xoay · cuộn để zoom</span><span style={{ color: "#64748b" }}>·</span><span>{Math.round(rotation.zoom * 100)}%</span>
      </div>
      <button type="button" onClick={reset} style={{ position: "absolute", right: 10, top: 8, border: "1px solid #334155", borderRadius: 6, color: "#cbd5e1", background: "rgba(5,10,20,.84)", fontSize: 10, padding: "5px 8px", cursor: "pointer" }}>Đặt lại góc nhìn</button>
      {detail && <div aria-live="polite" style={{ position: "absolute", left: 10, bottom: 10, maxWidth: "min(390px, calc(100% - 20px))", padding: "8px 10px", border: "1px solid #334155", borderRadius: 8, background: "rgba(5,10,20,.9)", color: "#e2e8f0", fontSize: 10, pointerEvents: "none" }}>
        <b style={{ color: detail.color }}>{detail.sector.name}</b> · X {nfmt(detail.sector.latestClosed.ratio - 100)} · Y {nfmt(detail.sector.latestClosed.momentum - 100)} · Z {nfmt(detail.sector.rrg4d!.flowShareZ)} · W ρ {nfmt(detail.sector.rrg4d!.marketCorrelation60)} (n={detail.sector.rrg4d!.correlationObservations})
      </div>}
    </div>

    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0", fontSize: 10, color: "var(--text-tertiary)" }}>
      <span style={{ color: "#4ade80" }}>● Leading: X&gt;0, Y&gt;0</span><span style={{ color: "#60a5fa" }}>● Improving: X&lt;0, Y&gt;0</span><span style={{ color: "#fbbf24" }}>● Lagging: X&lt;0, Y&lt;0</span><span>● Weakening: X&gt;0, Y&lt;0</span>
      <span style={{ marginLeft: "auto" }}>Snapshot tuần đã đóng · Z là trục không gian thứ ba · W là màu tương quan 60 phiên với VNINDEX</span>
    </div>
    <div style={{ overflowX: "auto", maxHeight: 260, overflowY: "auto", border: "1px solid var(--bg-surface-2)", borderRadius: 8 }}>
      <table data-testid="rrg4d-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, minWidth: 680 }}>
        <caption style={{ textAlign: "left", padding: "7px 9px", color: "var(--text-secondary)", fontWeight: 700 }}>Ngành và tọa độ 4D · chọn dòng để mở phân tích ngành</caption>
        <thead><tr style={{ color: "var(--text-tertiary)", textAlign: "left", position: "sticky", top: 0, background: "var(--bg-surface-1, #0b1220)" }}>
          <th scope="col" style={{ padding: 6 }}>Mã / ngành</th><th scope="col" style={{ padding: 6 }}>X · RS-Ratio</th><th scope="col" style={{ padding: 6 }}>Y · RS-Momentum</th><th scope="col" style={{ padding: 6 }}>Z · thị phần GTGD</th><th scope="col" style={{ padding: 6 }}>W · ρ VNINDEX</th><th scope="col" style={{ padding: 6 }}>n phiên</th>
        </tr></thead>
        <tbody>{eligible.map((sector) => {
          const active = selectedSector === sector.code;
          const label = `${sector.name}; X RS-Ratio ${nfmt(sector.latestClosed.ratio - 100)}; Y RS-Momentum ${nfmt(sector.latestClosed.momentum - 100)}; Z thị phần GTGD ${nfmt(sector.rrg4d!.flowShareZ)}; W tương quan ${nfmt(sector.rrg4d!.marketCorrelation60)}; n=${sector.rrg4d!.correlationObservations}`;
          return <tr key={sector.code} data-testid={`rrg4d-row-${sector.code}`} style={{ borderTop: "1px solid var(--bg-surface-2)", background: active ? "rgba(56,189,248,.08)" : undefined }}>
            <th scope="row" style={{ padding: 5, textAlign: "left" }}><button type="button" data-testid={`rrg4d-sector-${sector.code}`} aria-label={label} aria-pressed={onSelectSector ? active : undefined} onMouseEnter={() => setHoveredCode(sector.code)} onMouseLeave={() => setHoveredCode(null)} onClick={() => { setHoveredCode(sector.code); onSelectSector?.(sector.code); }} style={{ border: 0, padding: 0, background: "transparent", color: correlationColor(sector.rrg4d!.marketCorrelation60!), cursor: onSelectSector ? "pointer" : "default", font: "inherit", textAlign: "left" }}>{sector.code} · {sector.name}</button></th>
            <td style={{ padding: 5 }}>{nfmt(sector.latestClosed.ratio - 100)}</td><td style={{ padding: 5 }}>{nfmt(sector.latestClosed.momentum - 100)}</td><td style={{ padding: 5 }}>{nfmt(sector.rrg4d!.flowShareZ)}</td>
            <td style={{ padding: 5, color: correlationColor(sector.rrg4d!.marketCorrelation60!) }}>{nfmt(sector.rrg4d!.marketCorrelation60)}</td><td style={{ padding: 5 }}>{sector.rrg4d!.correlationObservations}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "7px 0 0" }}>Kéo hoặc chạm-kéo để đổi góc nhìn; cuộn để zoom. Màu W mô tả tương quan, không phải độ an toàn hay tín hiệu mua. Ngành thiếu mẫu tương quan không xuất hiện trên đồ thị và được giải thích bằng số lượng ngành đủ mẫu.</p>
  </section>;
}
