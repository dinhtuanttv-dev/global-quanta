import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { GatewaySectorRrg, Quadrant } from "../../../../lib/locnganh/types";

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
const QUADRANTS: Record<Quadrant, { label: string; short: string; color: string; x: -1 | 1; y: -1 | 1 }> = {
  LEADING: { label: "Dẫn dắt", short: "Dẫn dắt", color: "#22c55e", x: 1, y: 1 },
  IMPROVING: { label: "Cải thiện", short: "Cải thiện", color: "#38bdf8", x: -1, y: 1 },
  WEAKENING: { label: "Suy yếu", short: "Suy yếu", color: "#f59e0b", x: 1, y: -1 },
  LAGGING: { label: "Tụt hậu", short: "Tụt hậu", color: "#f87171", x: -1, y: -1 },
};
const rawQuadrant = (ratio: number, momentum: number): Quadrant => ratio >= 100
  ? momentum >= 100 ? "LEADING" : "WEAKENING"
  : momentum >= 100 ? "IMPROVING" : "LAGGING";
const compactName = (name: string, max = 15) => name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;

type Rotation = { yaw: number; pitch: number; zoom: number };
type Point3 = { x: number; y: number; z: number };
type TrailPoint = NonNullable<GatewaySectorRrg["rrg4dTrail"]>["points"][number];
type RRG4DPoint = Pick<TrailPoint, "week" | "date" | "ratio" | "momentum" | "quadrant" | "flowShareZ" | "marketCorrelation60" | "correlationObservations">;
type ProjectedPoint = { sector: GatewaySectorRrg; snapshot: RRG4DPoint; previousSnapshot: RRG4DPoint | null; rawQuadrant: Quadrant; x: number; y: number; depth: number; color: string };
type ProjectedTrack = { sector: GatewaySectorRrg; points: ProjectedPoint[] };
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
  const [trailWeeks, setTrailWeeks] = useState<8 | 13 | 26>(13);
  const [playbackIndex, setPlaybackIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [focusedQuadrant, setFocusedQuadrant] = useState<Quadrant | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const eligible = useMemo(() => sectors.filter((s) =>
    s.rrg4d?.correlationStatus === "ready"
    && s.rrg4d.flowShareZ != null
    && s.rrg4d.marketCorrelation60 != null
    && Number.isFinite(s.latestClosed.ratio)
    && Number.isFinite(s.latestClosed.momentum)
  ), [sectors]);

  const allWeeks = useMemo(() => [...new Set(eligible.flatMap((sector) =>
    (sector.rrg4dTrail?.points ?? []).filter((point) => point.quality === "complete").map((point) => point.week),
  ))].sort(), [eligible]);
  const activeWeeks = useMemo(() => allWeeks.slice(-trailWeeks), [allWeeks, trailWeeks]);
  const latestIndex = Math.max(0, activeWeeks.length - 1);
  const frameIndex = playbackIndex == null ? latestIndex : clamp(playbackIndex, 0, latestIndex);
  const frameWeek = activeWeeks[frameIndex] ?? null;
  const frameDate = frameWeek
    ? eligible.flatMap((sector) => sector.rrg4dTrail?.points ?? []).find((point) => point.week === frameWeek)?.date ?? frameWeek
    : eligible[0]?.rrg4d?.asOf ?? null;

  const domain = useMemo(() => Math.max(1.5, ...eligible.flatMap((sector) => {
    const trail = sector.rrg4dTrail?.points ?? [];
    return trail.flatMap((point) => [Math.abs(point.ratio - 100), Math.abs(point.momentum - 100)]);
  })), [eligible]);

  const tracks = useMemo<ProjectedTrack[]>(() => eligible.flatMap((sector) => {
    const history = sector.rrg4dTrail?.points ?? [];
    let snapshots: RRG4DPoint[];
    if (frameWeek) {
      const end = history.find((point) => point.week === frameWeek && point.quality === "complete");
      if (!end) return [];
      snapshots = history.filter((point) => point.week <= frameWeek && point.quality === "complete").slice(-trailWeeks);
    } else if (sector.rrg4d?.correlationStatus === "ready" && sector.rrg4d.flowShareZ != null && sector.rrg4d.marketCorrelation60 != null) {
      const latestWeek = sector.tail[sector.tail.length - 1]?.week ?? sector.rrg4d.asOf ?? "unknown";
      snapshots = [{
        week: latestWeek, date: sector.rrg4d.asOf ?? latestWeek, ratio: sector.latestClosed.ratio,
        momentum: sector.latestClosed.momentum, quadrant: sector.quadrant, flowShareZ: sector.rrg4d.flowShareZ,
        marketCorrelation60: sector.rrg4d.marketCorrelation60, correlationObservations: sector.rrg4d.correlationObservations,
      }];
    } else return [];

    const points = snapshots.map((snapshot, index) => {
      const projected = project({
        x: (snapshot.ratio - 100) / domain,
        y: (snapshot.momentum - 100) / domain,
        z: clamp(snapshot.flowShareZ! / 3, -1, 1),
      }, rotation);
      const previous = snapshots[index - 1] ?? null;
      const adjacent = previous && (Date.parse(snapshot.week) - Date.parse(previous.week)) === 7 * 86_400_000;
      return { sector, snapshot, previousSnapshot: adjacent ? previous : null, rawQuadrant: rawQuadrant(snapshot.ratio, snapshot.momentum), ...projected, color: correlationColor(snapshot.marketCorrelation60!) };
    });
    return points.length ? [{ sector, points }] : [];
  }), [eligible, frameWeek, trailWeeks, domain, rotation]);
  const framePoints = useMemo(() => tracks.map((track) => track.points[track.points.length - 1]), [tracks]);
  const visibleTracks = useMemo(() => focusedQuadrant
    ? tracks.filter((track) => track.points[track.points.length - 1].snapshot.quadrant === focusedQuadrant)
    : tracks, [tracks, focusedQuadrant]);
  const points = useMemo(() => visibleTracks.map((track) => track.points[track.points.length - 1]), [visibleTracks]);
  const quadrantCounts = useMemo(() => Object.fromEntries((Object.keys(QUADRANTS) as Quadrant[]).map((quadrant) => [
    quadrant, framePoints.filter((point) => point.snapshot.quadrant === quadrant).length,
  ])) as Record<Quadrant, number>, [framePoints]);

  useEffect(() => {
    if (!playing || activeWeeks.length < 2) return;
    const timer = window.setTimeout(() => setPlaybackIndex((index) => Math.min((index ?? 0) + 1, activeWeeks.length - 1)), 850);
    return () => window.clearTimeout(timer);
  }, [playing, playbackIndex, activeWeeks.length]);
  useEffect(() => {
    if (playing && playbackIndex != null && playbackIndex >= activeWeeks.length - 1) setPlaying(false);
  }, [playing, playbackIndex, activeWeeks.length]);

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
    // Four RRG regions are defined only by X/Y and are shown as a floor at the back of the Z volume.
    for (const quadrant of Object.keys(QUADRANTS) as Quadrant[]) {
      const q = QUADRANTS[quadrant], x0 = q.x > 0 ? 0 : -1, x1 = q.x > 0 ? 1 : 0, y0 = q.y > 0 ? 0 : -1, y1 = q.y > 0 ? 1 : 0;
      path3([{ x: x0, y: y0, z: -0.96 }, { x: x1, y: y0, z: -0.96 }, { x: x1, y: y1, z: -0.96 }, { x: x0, y: y1, z: -0.96 }], true);
      ctx.globalAlpha = 0.16; ctx.fillStyle = q.color; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = q.color; ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
    }
    // The two vertical reference planes make all four XY regions legible at any Z value.
    path3([{ x: 0, y: -1, z: -1 }, { x: 0, y: 1, z: -1 }, { x: 0, y: 1, z: 1 }, { x: 0, y: -1, z: 1 }], true);
    ctx.fillStyle = "rgba(148,163,184,.035)"; ctx.fill(); ctx.strokeStyle = "rgba(148,163,184,.25)"; ctx.stroke();
    path3([{ x: -1, y: 0, z: -1 }, { x: 1, y: 0, z: -1 }, { x: 1, y: 0, z: 1 }, { x: -1, y: 0, z: 1 }], true);
    ctx.fillStyle = "rgba(148,163,184,.035)"; ctx.fill(); ctx.stroke();
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

    // Historical movement is made only from complete weekly observations; W colors each segment.
    for (const track of visibleTracks) {
      const focus = selectedSector === track.sector.code || hoveredCode === track.sector.code;
      const count = track.points.length;
      for (let i = 1; i < count; i++) {
        const previous = track.points[i - 1], current = track.points[i];
        const elapsedWeeks = (Date.parse(current.snapshot.week) - Date.parse(previous.snapshot.week)) / (7 * 86_400_000);
        if (elapsedWeeks !== 1) continue; // Preserve visible breaks; never imply an unobserved path across missing weeks.
        const age = i / Math.max(1, count - 1);
        ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(current.x, current.y);
        ctx.strokeStyle = correlationColor((previous.snapshot.marketCorrelation60! + current.snapshot.marketCorrelation60!) / 2);
        ctx.globalAlpha = focus ? 0.3 + age * 0.65 : 0.07 + age * 0.25;
        ctx.lineWidth = focus ? 2.8 : 1.15; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(current.x, current.y, focus ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = current.color; ctx.globalAlpha = focus ? 0.85 : 0.4; ctx.fill(); ctx.globalAlpha = 1;

        // One directional chevron near the newest end makes time direction obvious without arrow clutter.
        if (focus && i === count - 1 && count > 1) {
          const angle = Math.atan2(current.y - previous.y, current.x - previous.x);
          ctx.beginPath(); ctx.moveTo(current.x, current.y);
          ctx.lineTo(current.x - 10 * Math.cos(angle - 0.48), current.y - 10 * Math.sin(angle - 0.48));
          ctx.lineTo(current.x - 10 * Math.cos(angle + 0.48), current.y - 10 * Math.sin(angle + 0.48));
          ctx.closePath(); ctx.fillStyle = current.color; ctx.fill();
        }
      }
    }

    // Points are drawn back-to-front. Size stays fixed so the map encodes exactly X/Y/Z/W.
    for (const point of [...points].sort((a, b) => b.depth - a.depth)) {
      const active = selectedSector === point.sector.code || hoveredCode === point.sector.code;
      ctx.beginPath(); ctx.arc(point.x, point.y, active ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = point.color; ctx.fill();
      ctx.lineWidth = active ? 3 : 2; ctx.strokeStyle = QUADRANTS[point.snapshot.quadrant].color; ctx.stroke();
      if (active) {
        ctx.beginPath(); ctx.arc(point.x, point.y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.font = active ? "700 10px system-ui, sans-serif" : "600 9px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillStyle = "#e2e8f0";
    }

    const occupied: { left: number; top: number; right: number; bottom: number }[] = [];
    // Quadrant title chips are screen-facing, so text remains readable while the 3D camera rotates.
    for (const quadrant of Object.keys(QUADRANTS) as Quadrant[]) {
      const q = QUADRANTS[quadrant], anchor = p({ x: q.x * 0.56, y: q.y * 0.56, z: -0.9 });
      const count = quadrantCounts[quadrant], label = `${q.label} · ${count}`;
      ctx.font = "700 11px system-ui, sans-serif";
      const width = ctx.measureText(label).width + 14, height = 22;
      const left = clamp(anchor.x - width / 2, 4, W - width - 4), top = clamp(anchor.y - height / 2, 4, H - height - 4);
      occupied.push({ left, top, right: left + width, bottom: top + height });
      ctx.fillStyle = "rgba(5,10,20,.88)"; ctx.fillRect(left, top, width, height);
      ctx.strokeStyle = q.color; ctx.globalAlpha = 0.85; ctx.lineWidth = 1; ctx.strokeRect(left, top, width, height); ctx.globalAlpha = 1;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = q.color; ctx.fillText(label, left + width / 2, top + height / 2);
    }

    // Screen-space name labels use a small candidate set and collision checks; selected names win placement.
    const labelCandidates = [
      (x: number, y: number, w: number, h: number) => ({ left: x + 10, top: y - h / 2 }),
      (x: number, y: number, w: number, h: number) => ({ left: x - w - 10, top: y - h / 2 }),
      (x: number, y: number, w: number, h: number) => ({ left: x - w / 2, top: y - h - 9 }),
      (x: number, y: number, w: number, h: number) => ({ left: x - w / 2, top: y + 9 }),
      (x: number, y: number, w: number, h: number) => ({ left: x + 14, top: y - h - 8 }),
      (x: number, y: number, w: number, h: number) => ({ left: x - w - 14, top: y + 8 }),
    ];
    const labelPoints = [...points].sort((a, b) => Number(b.sector.code === (hoveredCode ?? selectedSector)) - Number(a.sector.code === (hoveredCode ?? selectedSector)));
    for (const point of labelPoints) {
      const active = point.sector.code === (hoveredCode ?? selectedSector);
      const text = compactName(point.sector.name, active ? 24 : 15);
      ctx.font = `${active ? "700" : "600"} ${active ? 11 : 9}px system-ui, sans-serif`;
      const width = ctx.measureText(text).width + (active ? 12 : 8), height = active ? 20 : 17;
      let box: { left: number; top: number; right: number; bottom: number } | null = null;
      for (const candidate of labelCandidates) {
        const origin = candidate(point.x, point.y, width, height);
        const left = clamp(origin.left, 4, W - width - 4), top = clamp(origin.top, 4, H - height - 4);
        const next = { left, top, right: left + width, bottom: top + height };
        if (occupied.every((other) => next.right + 3 < other.left || next.left - 3 > other.right || next.bottom + 3 < other.top || next.top - 3 > other.bottom)) { box = next; break; }
      }
      if (!box) continue;
      occupied.push(box);
      const qColor = QUADRANTS[point.snapshot.quadrant].color;
      const edgeX = clamp(point.x, box.left, box.right), edgeY = clamp(point.y, box.top, box.bottom);
      ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(edgeX, edgeY); ctx.strokeStyle = qColor; ctx.globalAlpha = active ? 0.9 : 0.45; ctx.lineWidth = active ? 1.4 : 0.8; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = active ? "rgba(5,10,20,.96)" : "rgba(5,10,20,.78)"; ctx.fillRect(box.left, box.top, width, height);
      ctx.strokeStyle = qColor; ctx.globalAlpha = active ? 1 : 0.68; ctx.lineWidth = active ? 1.4 : 0.8; ctx.strokeRect(box.left, box.top, width, height); ctx.globalAlpha = 1;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#f1f5f9"; ctx.fillText(text, box.left + width / 2, box.top + height / 2);
    }
  }, [eligible.length, visibleTracks, points, rotation, selectedSector, hoveredCode, quadrantCounts]);

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
  const detailQuadrant = detail ? QUADRANTS[detail.snapshot.quadrant] : null;
  const detailRawQuadrant = detail ? QUADRANTS[detail.rawQuadrant] : null;
  const detailTransition = detail?.previousSnapshot && detail.previousSnapshot.quadrant !== detail.snapshot.quadrant
    ? `${QUADRANTS[detail.previousSnapshot.quadrant].label} → ${detailQuadrant?.label}` : null;
  const detailDx = detail?.previousSnapshot ? detail.snapshot.ratio - detail.previousSnapshot.ratio : null;
  const detailDy = detail?.previousSnapshot ? detail.snapshot.momentum - detail.previousSnapshot.momentum : null;
  const detailDz = detail?.previousSnapshot && detail.snapshot.flowShareZ != null && detail.previousSnapshot.flowShareZ != null
    ? detail.snapshot.flowShareZ - detail.previousSnapshot.flowShareZ : null;
  const reset = () => { setRotation({ yaw: 0.62, pitch: -0.38, zoom: 1 }); setHoveredCode(null); };
  const setWindow = (weeks: 8 | 13 | 26) => { setTrailWeeks(weeks); setPlaybackIndex(null); setPlaying(false); };
  const step = (delta: number) => { setPlaying(false); setPlaybackIndex(clamp(frameIndex + delta, 0, latestIndex)); };
  const startPlayback = () => {
    if (activeWeeks.length < 2) return;
    if (frameIndex >= latestIndex) setPlaybackIndex(0);
    setPlaying(true);
  };

  return <section data-testid="rrg4d-projection" aria-label="Bản đồ RRG 4D nghiên cứu" style={{ width: "100%" }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "7px 16px", padding: "9px 11px", border: "1px solid var(--bg-surface-2)", borderRadius: 8, marginBottom: 8, fontSize: 10, color: "var(--text-secondary)" }}>
      <span><b style={{ color: "#60a5fa" }}>X</b> RS-Ratio − 100</span>
      <span><b style={{ color: "#4ade80" }}>Y</b> RS-Momentum − 100</span>
      <span><b style={{ color: "#fbbf24" }}>Z</b> z-score thị phần GTGD</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><b>W / màu</b><i aria-hidden="true" style={{ display: "inline-block", width: 82, height: 7, borderRadius: 8, background: `linear-gradient(90deg, ${correlationColor(-1)}, ${correlationColor(0)}, ${correlationColor(1)})` }} />−1 nghịch chiều · 0 ít tương quan tuyến tính · +1 đồng biến mạnh</span>
      <span style={{ marginLeft: "auto", color: "var(--text-tertiary)" }}>{eligible.length}/{sectors.length} ngành đủ mẫu · điểm cùng kích thước</span>
    </div>

    <div data-testid="rrg4d-playback" style={{ display: "grid", gridTemplateColumns: "auto minmax(150px, 1fr)", alignItems: "center", gap: "8px 12px", padding: "9px 11px", border: "1px solid var(--bg-surface-2)", borderRadius: 8, marginBottom: 8, background: "rgba(15,23,42,.55)", fontSize: 10 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <b style={{ color: "#cbd5e1", marginRight: 3 }}>Quỹ đạo lịch sử</b>
        {([8, 13, 26] as const).map((weeks) => <button key={weeks} type="button" aria-pressed={trailWeeks === weeks} onClick={() => setWindow(weeks)} style={{ border: `1px solid ${trailWeeks === weeks ? "#38bdf8" : "#334155"}`, borderRadius: 5, padding: "4px 7px", color: trailWeeks === weeks ? "#7dd3fc" : "#94a3b8", background: "transparent", cursor: "pointer", fontSize: 10 }}>{weeks} tuần</button>)}
        <button type="button" aria-label="Lùi một tuần" disabled={activeWeeks.length < 2 || frameIndex <= 0} onClick={() => step(-1)} style={{ border: "1px solid #334155", borderRadius: 5, padding: "4px 7px", color: "#cbd5e1", background: "transparent", cursor: "pointer", fontSize: 10 }}>◀</button>
        <button type="button" aria-label={playing ? "Tạm dừng phát lại" : "Phát lại lịch sử"} disabled={activeWeeks.length < 2} onClick={() => playing ? setPlaying(false) : startPlayback()} style={{ border: "1px solid #0e7490", borderRadius: 5, padding: "4px 8px", color: "#a5f3fc", background: "rgba(8,145,178,.12)", cursor: activeWeeks.length < 2 ? "not-allowed" : "pointer", fontSize: 10 }}>{playing ? "Ⅱ Tạm dừng" : "▶ Phát"}</button>
        <button type="button" aria-label="Tiến một tuần" disabled={activeWeeks.length < 2 || frameIndex >= latestIndex} onClick={() => step(1)} style={{ border: "1px solid #334155", borderRadius: 5, padding: "4px 7px", color: "#cbd5e1", background: "transparent", cursor: "pointer", fontSize: 10 }}>▶</button>
        <button type="button" onClick={() => { setPlaybackIndex(null); setPlaying(false); }} style={{ border: "1px solid #334155", borderRadius: 5, padding: "4px 7px", color: "#94a3b8", background: "transparent", cursor: "pointer", fontSize: 10 }}>Hiện mới nhất</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <input aria-label="Chọn tuần lịch sử RRG" data-testid="rrg4d-week-slider" type="range" min={0} max={latestIndex} step={1} value={frameIndex} disabled={activeWeeks.length < 2} onChange={(event) => { setPlaying(false); setPlaybackIndex(Number(event.currentTarget.value)); }} style={{ width: "100%", accentColor: "#22d3ee" }} />
        <b data-testid="rrg4d-frame-date" style={{ minWidth: 78, textAlign: "right", color: "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>{frameDate ?? "Chưa có tuần"}</b>
      </div>
      <span role="status" style={{ gridColumn: "1 / -1", color: "var(--text-tertiary)" }}>
        {activeWeeks.length > 1 ? `${playing ? "Đang phát" : playbackIndex == null ? "Tuần mới nhất" : "Phát lại lịch sử"} · ${frameIndex + 1}/${activeWeeks.length} tuần đã đóng · ${points.length}/${eligible.length} ngành có quan sát đầy đủ` : "Gateway chưa có đủ hai tuần 4D đồng bộ để phát lại; không nội suy hoặc tạo quỹ đạo giả."}
        {" · "}Độ đậm tăng từ cũ → mới; rê/chọn ngành để xem mũi tên chiều di chuyển. Màu đường/điểm vẫn mã hóa W.
      </span>
    </div>

    <div data-testid="rrg4d-quadrant-summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 7, marginBottom: 8 }}>
      {(Object.keys(QUADRANTS) as Quadrant[]).map((quadrant) => {
        const meta = QUADRANTS[quadrant], members = framePoints.filter((point) => point.snapshot.quadrant === quadrant);
        const active = focusedQuadrant === quadrant;
        return <button key={quadrant} type="button" data-testid={`rrg4d-quadrant-${quadrant.toLowerCase()}`} aria-pressed={active} onClick={() => setFocusedQuadrant(active ? null : quadrant)} title={members.map((point) => point.sector.name).join(" · ") || "Không có ngành trong vùng ở tuần này"} style={{ minWidth: 0, textAlign: "left", padding: "8px 9px", borderTop: `1px solid ${active ? meta.color : "var(--bg-surface-2)"}`, borderRight: `1px solid ${active ? meta.color : "var(--bg-surface-2)"}`, borderBottom: `1px solid ${active ? meta.color : "var(--bg-surface-2)"}`, borderLeft: `3px solid ${meta.color}`, borderRadius: 7, color: "var(--text-secondary)", background: active ? `${meta.color}18` : "rgba(15,23,42,.45)", cursor: "pointer" }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><b style={{ color: meta.color, fontSize: 11 }}>{meta.label}</b><b style={{ color: "#e2e8f0", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{members.length}</b></span>
          <span style={{ display: "block", marginTop: 4, fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{members.length ? members.slice(0, 3).map((point) => point.sector.name).join(" · ") : "Không có ngành trong vùng"}{members.length > 3 ? ` · +${members.length - 3}` : ""}</span>
        </button>;
      })}
      {focusedQuadrant && <button type="button" onClick={() => setFocusedQuadrant(null)} style={{ border: "1px solid var(--bg-surface-2)", borderRadius: 7, background: "transparent", color: "var(--text-tertiary)", fontSize: 10, cursor: "pointer" }}>Hiện mọi vùng</button>}
    </div>

    <div style={{ position: "relative", width: "100%", overflow: "hidden", border: "1px solid var(--bg-surface-2)", borderRadius: 10, background: "#080d18" }}>
      <canvas ref={canvasRef} data-testid="rrg4d-canvas" width={W} height={H}
        role="img" aria-label="Bản đồ RRG 3D có bốn vùng Dẫn dắt, Cải thiện, Suy yếu và Tụt hậu theo X là RS-Ratio, Y là RS-Momentum; Z là z-score thị phần giao dịch; màu W là tương quan với VNINDEX. Nhãn cạnh điểm là tên ngành. Kéo để xoay, cuộn để phóng to; bảng bên dưới có số liệu và trạng thái."
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragRef.current = null; }} onPointerLeave={() => { if (!dragRef.current) setHoveredCode(null); }} onWheel={onWheel}
        style={{ display: "block", width: "100%", height: "auto", aspectRatio: `${W} / ${H}`, cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none" }} />
      <div style={{ position: "absolute", top: 9, left: 10, display: "flex", alignItems: "center", gap: 6, pointerEvents: "none", fontSize: 10, color: "#cbd5e1", background: "rgba(5,10,20,.76)", padding: "5px 8px", borderRadius: 6 }}>
        <span>3D · kéo để xoay · cuộn để zoom</span><span style={{ color: "#64748b" }}>·</span><span>{Math.round(rotation.zoom * 100)}%</span>
      </div>
      <button type="button" onClick={reset} style={{ position: "absolute", right: 10, top: 8, border: "1px solid #334155", borderRadius: 6, color: "#cbd5e1", background: "rgba(5,10,20,.84)", fontSize: 10, padding: "5px 8px", cursor: "pointer" }}>Đặt lại góc nhìn</button>
      {detail && <div aria-live="polite" style={{ position: "absolute", left: 10, bottom: 10, maxWidth: "min(390px, calc(100% - 20px))", padding: "8px 10px", border: "1px solid #334155", borderRadius: 8, background: "rgba(5,10,20,.9)", color: "#e2e8f0", fontSize: 10, pointerEvents: "none" }}>
        <b style={{ color: detailQuadrant?.color }}>{detail.sector.name}</b> · {detail.snapshot.date} · {detailTransition ? `Chuyển ${detailTransition}` : detailQuadrant?.label}
        {detailRawQuadrant?.label !== detailQuadrant?.label && <span style={{ color: "#fbbf24" }}> · vị trí hình học {detailRawQuadrant?.label}; trạng thái lọc đang giữ góc trước</span>}
        <br />X {nfmt(detail.snapshot.ratio - 100)} ({detailDx == null ? "—" : `${detailDx >= 0 ? "+" : ""}${nfmt(detailDx)}`}) · Y {nfmt(detail.snapshot.momentum - 100)} ({detailDy == null ? "—" : `${detailDy >= 0 ? "+" : ""}${nfmt(detailDy)}`}) · Z {nfmt(detail.snapshot.flowShareZ)} ({detailDz == null ? "—" : `${detailDz >= 0 ? "+" : ""}${nfmt(detailDz)}`}) · W ρ {nfmt(detail.snapshot.marketCorrelation60)} (n={detail.snapshot.correlationObservations})
      </div>}
    </div>

    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0", fontSize: 10, color: "var(--text-tertiary)" }}>
      <span style={{ color: QUADRANTS.LEADING.color }}>● Dẫn dắt: X≥100, Y≥100</span><span style={{ color: QUADRANTS.IMPROVING.color }}>● Cải thiện: X&lt;100, Y≥100</span><span style={{ color: QUADRANTS.WEAKENING.color }}>● Suy yếu: X≥100, Y&lt;100</span><span style={{ color: QUADRANTS.LAGGING.color }}>● Tụt hậu: X&lt;100, Y&lt;100</span>
      <span style={{ marginLeft: "auto" }}>Snapshot tuần đã đóng · Z là trục không gian thứ ba · W là màu tương quan 60 phiên với VNINDEX · khung {frameDate ?? "hiện tại"}</span>
    </div>
    <div style={{ overflowX: "auto", maxHeight: 260, overflowY: "auto", border: "1px solid var(--bg-surface-2)", borderRadius: 8 }}>
      <table data-testid="rrg4d-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, minWidth: 780 }}>
        <caption style={{ textAlign: "left", padding: "7px 9px", color: "var(--text-secondary)", fontWeight: 700 }}>Ngành và tọa độ 4D · chọn dòng để mở phân tích ngành</caption>
        <thead><tr style={{ color: "var(--text-tertiary)", textAlign: "left", position: "sticky", top: 0, background: "var(--bg-surface-1, #0b1220)" }}>
          <th scope="col" style={{ padding: 6 }}>Mã / ngành</th><th scope="col" style={{ padding: 6 }}>Vùng RRG</th><th scope="col" style={{ padding: 6 }}>Tuần</th><th scope="col" style={{ padding: 6 }}>X · RS-Ratio</th><th scope="col" style={{ padding: 6 }}>Y · RS-Momentum</th><th scope="col" style={{ padding: 6 }}>Z · thị phần GTGD</th><th scope="col" style={{ padding: 6 }}>W · ρ VNINDEX</th><th scope="col" style={{ padding: 6 }}>n phiên</th>
        </tr></thead>
        <tbody>{points.map((point) => {
          const { sector, snapshot } = point;
          const active = selectedSector === sector.code;
          const label = `${sector.name}; ${QUADRANTS[snapshot.quadrant].label}; tuần ${snapshot.week}; X RS-Ratio ${nfmt(snapshot.ratio - 100)}; Y RS-Momentum ${nfmt(snapshot.momentum - 100)}; Z thị phần GTGD ${nfmt(snapshot.flowShareZ)}; W tương quan ${nfmt(snapshot.marketCorrelation60)}; n=${snapshot.correlationObservations}`;
          return <tr key={sector.code} data-testid={`rrg4d-row-${sector.code}`} style={{ borderTop: "1px solid var(--bg-surface-2)", background: active ? "rgba(56,189,248,.08)" : undefined }}>
            <th scope="row" style={{ padding: 5, textAlign: "left" }}><button type="button" data-testid={`rrg4d-sector-${sector.code}`} aria-label={label} aria-pressed={onSelectSector ? active : undefined} onMouseEnter={() => setHoveredCode(sector.code)} onMouseLeave={() => setHoveredCode(null)} onClick={() => { setHoveredCode(sector.code); onSelectSector?.(sector.code); }} style={{ border: 0, padding: 0, background: "transparent", color: correlationColor(snapshot.marketCorrelation60!), cursor: onSelectSector ? "pointer" : "default", font: "inherit", textAlign: "left" }}>{sector.code} · {sector.name}</button></th>
            <td style={{ padding: 5, color: QUADRANTS[snapshot.quadrant].color }}>{QUADRANTS[snapshot.quadrant].label}{point.rawQuadrant !== snapshot.quadrant ? ` · raw ${QUADRANTS[point.rawQuadrant].label}` : ""}</td><td style={{ padding: 5 }}>{snapshot.week}</td><td style={{ padding: 5 }}>{nfmt(snapshot.ratio - 100)}</td><td style={{ padding: 5 }}>{nfmt(snapshot.momentum - 100)}</td><td style={{ padding: 5 }}>{nfmt(snapshot.flowShareZ)}</td>
            <td style={{ padding: 5, color: correlationColor(snapshot.marketCorrelation60!) }}>{nfmt(snapshot.marketCorrelation60)}</td><td style={{ padding: 5 }}>{snapshot.correlationObservations}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "7px 0 0" }}>Kéo/chạm-kéo để xoay; cuộn để zoom. Vùng RRG dựa trên X/Y; Z chỉ tạo chiều sâu, W chỉ là màu tương quan. “Sát biên” nghĩa là tọa độ thô đã sang vùng kế bên nhưng bộ lọc 0,15σ vẫn giữ trạng thái cũ. Quỹ đạo chỉ nối tuần có dữ liệu thật, không nội suy. Lịch sử ngành được tái dựng theo universe/phân loại hiện tại, chưa phải thành phần point-in-time.</p>
  </section>;
}
