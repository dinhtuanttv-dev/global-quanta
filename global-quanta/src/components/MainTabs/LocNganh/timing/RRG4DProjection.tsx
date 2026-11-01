import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { GatewaySectorRrg, Quadrant } from "../../../../lib/locnganh/types";
import { QUADRANT_COLORS } from "./quadrant";
import { FIT_3D, domainOf, flatPlot, isFreshImproving, niceStep, placeLabels, projectPoint, type Box, type LabelItem, type Point3, type Rotation, type ViewMode } from "./rrg4dGeometry";

type Props = {
  sectors: GatewaySectorRrg[];
  /** Ngành đang lọc Top 20. */
  selectedSector?: string | null;
  /** Ngành đang mở bảng phân tích sâu. */
  openSector?: string | null;
  onSelectSector?: (code: string) => void;
  /** P(outperform) theo mã ngành, chỉ hiện dạng số ở ô chi tiết. */
  probabilities?: ReadonlyMap<string, number | null>;
};
type ColorMode = "quadrant" | "correlation";

const W = 1000;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const KEY_VIEW = "gq.rrg4dView", KEY_COLOR = "gq.rrg4dColor";
const DEFAULT_ROTATION: Rotation = { yaw: 0.62, pitch: -0.38, zoom: 1 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const nfmt = (v: number | null | undefined, digits = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: digits }));
const correlationColor = (value: number) => {
  const t = clamp((value + 1) / 2, 0, 1), a = [245, 158, 11], b = [34, 211, 238];
  return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(",")})`;
};
const QUADRANTS: Record<Quadrant, { label: string; color: string; x: -1 | 1; y: -1 | 1 }> = {
  LEADING: { label: "Dẫn dắt", color: QUADRANT_COLORS.LEADING, x: 1, y: 1 },
  IMPROVING: { label: "Cải thiện", color: QUADRANT_COLORS.IMPROVING, x: -1, y: 1 },
  WEAKENING: { label: "Suy yếu", color: QUADRANT_COLORS.WEAKENING, x: 1, y: -1 },
  LAGGING: { label: "Tụt hậu", color: QUADRANT_COLORS.LAGGING, x: -1, y: -1 },
};
const rawQuadrant = (ratio: number, momentum: number): Quadrant => (ratio >= 100 ? (momentum >= 100 ? "LEADING" : "WEAKENING") : momentum >= 100 ? "IMPROVING" : "LAGGING");
const compactName = (name: string, max = 20) => (name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name);
const stored = <T extends string>(key: string, ok: readonly T[], fallback: T): T => { try { const v = window.localStorage.getItem(key) as T | null; return v && ok.includes(v) ? v : fallback; } catch { return fallback; } };

type TrailPoint = NonNullable<GatewaySectorRrg["rrg4dTrail"]>["points"][number];
type RRG4DPoint = Pick<TrailPoint, "week" | "date" | "ratio" | "momentum" | "quadrant" | "flowShareZ" | "marketCorrelation60" | "correlationObservations">;
type ProjectedPoint = { sector: GatewaySectorRrg; snapshot: RRG4DPoint; previousSnapshot: RRG4DPoint | null; rawQuadrant: Quadrant; x: number; y: number; depth: number; color: string; fresh: boolean };
type ProjectedTrack = { sector: GatewaySectorRrg; points: ProjectedPoint[] };
type DragState = { x: number; y: number; moved: boolean };

const btn = (on: boolean, color = "#38bdf8") => ({ border: `1px solid ${on ? color : "#334155"}`, borderRadius: 5, padding: "4px 8px", color: on ? "#e2e8f0" : "#94a3b8", background: on ? `${color}22` : "transparent", cursor: "pointer", fontSize: 11, fontWeight: on ? 700 : 500 });

/** RRG 4D: mặc định nhìn phẳng để đọc đúng góc phần tư; 3D thêm chiều sâu Z. X/Y là RS-Ratio và RS-Momentum, W là màu tương quan. */
export default function RRG4DProjection({ sectors, selectedSector = null, openSector = null, onSelectSector, probabilities }: Props) {
  const [view, setViewState] = useState<ViewMode>(() => stored<ViewMode>(KEY_VIEW, ["flat", "3d"], "flat"));
  const [colorMode, setColorState] = useState<ColorMode>(() => stored<ColorMode>(KEY_COLOR, ["quadrant", "correlation"], "quadrant"));
  const [rotation, setRotation] = useState<Rotation>(DEFAULT_ROTATION);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [trailWeeks, setTrailWeeks] = useState<8 | 13 | 26>(13);
  const [playbackIndex, setPlaybackIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [focusedQuadrant, setFocusedQuadrant] = useState<Quadrant | null>(null);
  const [cssWidth, setCssWidth] = useState(1000);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setView = (v: ViewMode) => { setViewState(v); try { window.localStorage.setItem(KEY_VIEW, v); } catch { /* bỏ qua */ } };
  const setColorMode = (v: ColorMode) => { setColorState(v); try { window.localStorage.setItem(KEY_COLOR, v); } catch { /* bỏ qua */ } };

  // Vẽ theo kích thước thật để chữ giữ nguyên cỡ trên mọi màn hình; điện thoại dùng khung cao hơn.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w > 0) setCssWidth(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = W / Math.max(240, cssWidth);
  // Màn hình rộng: khung không cao quá 720 px để thấy trọn trong một màn hình.
  const H = cssWidth < 560 ? 1150 : Math.min(600, Math.round(720 * k));
  const camera = useMemo<Rotation>(() => ({ ...rotation, zoom: rotation.zoom * FIT_3D * Math.min(1, H / 600) }), [rotation, H]);
  const center = useMemo(() => ({ x: W / 2, y: H / 2 - 2 }), [H]);
  const plot = useMemo(() => flatPlot(W, H, k), [H, k]);

  const eligible = useMemo(() => sectors.filter((s) => s.rrg4d?.correlationStatus === "ready" && s.rrg4d.flowShareZ != null && s.rrg4d.marketCorrelation60 != null && Number.isFinite(s.latestClosed.ratio) && Number.isFinite(s.latestClosed.momentum)), [sectors]);
  const missing = useMemo(() => sectors.filter((s) => !eligible.includes(s)), [sectors, eligible]);
  const allWeeks = useMemo(() => [...new Set(eligible.flatMap((sector) => (sector.rrg4dTrail?.points ?? []).filter((point) => point.quality === "complete").map((point) => point.week)))].sort(), [eligible]);
  const activeWeeks = useMemo(() => allWeeks.slice(-trailWeeks), [allWeeks, trailWeeks]);
  const latestIndex = Math.max(0, activeWeeks.length - 1);
  const frameIndex = playbackIndex == null ? latestIndex : clamp(playbackIndex, 0, latestIndex);
  const frameWeek = activeWeeks[frameIndex] ?? null;
  const frameDate = frameWeek ? eligible.flatMap((sector) => sector.rrg4dTrail?.points ?? []).find((point) => point.week === frameWeek)?.date ?? frameWeek : eligible[0]?.rrg4d?.asOf ?? null;

  // Thang theo các tuần đang xem để điểm không dồn lại; cố định trong lúc phát lại để so được giữa các tuần.
  const domain = useMemo(() => {
    const weeks = new Set(activeWeeks);
    const vals = eligible.flatMap((sector) => {
      const pts = (sector.rrg4dTrail?.points ?? []).filter((p) => weeks.has(p.week));
      return pts.length ? pts.flatMap((p) => [p.ratio - 100, p.momentum - 100]) : [sector.latestClosed.ratio - 100, sector.latestClosed.momentum - 100];
    });
    return domainOf(vals);
  }, [eligible, activeWeeks]);

  const tracks = useMemo<ProjectedTrack[]>(() => eligible.flatMap((sector) => {
    const history = sector.rrg4dTrail?.points ?? [];
    let snapshots: RRG4DPoint[], full: RRG4DPoint[];
    if (frameWeek) {
      if (!history.find((point) => point.week === frameWeek && point.quality === "complete")) return [];
      full = history.filter((point) => point.week <= frameWeek && point.quality === "complete");
      snapshots = full.slice(-trailWeeks);
    } else if (sector.rrg4d?.correlationStatus === "ready" && sector.rrg4d.flowShareZ != null && sector.rrg4d.marketCorrelation60 != null) {
      const latestWeek = sector.tail[sector.tail.length - 1]?.week ?? sector.rrg4d.asOf ?? "unknown";
      snapshots = [{ week: latestWeek, date: sector.rrg4d.asOf ?? latestWeek, ratio: sector.latestClosed.ratio, momentum: sector.latestClosed.momentum, quadrant: sector.quadrant, flowShareZ: sector.rrg4d.flowShareZ, marketCorrelation60: sector.rrg4d.marketCorrelation60, correlationObservations: sector.rrg4d.correlationObservations }];
      full = snapshots;
    } else return [];
    const fresh = isFreshImproving(full);
    const points = snapshots.map((snapshot, index) => {
      const projected = projectPoint({ x: (snapshot.ratio - 100) / domain, y: (snapshot.momentum - 100) / domain, z: clamp(snapshot.flowShareZ! / 3, -1, 1) }, camera, view, plot, center);
      const previous = snapshots[index - 1] ?? null;
      const adjacent = previous && (Date.parse(snapshot.week) - Date.parse(previous.week)) === 7 * 86_400_000;
      return { sector, snapshot, previousSnapshot: adjacent ? previous : null, rawQuadrant: rawQuadrant(snapshot.ratio, snapshot.momentum), ...projected, color: correlationColor(snapshot.marketCorrelation60!), fresh: fresh && index === snapshots.length - 1 };
    });
    return points.length ? [{ sector, points }] : [];
  }), [eligible, frameWeek, trailWeeks, domain, camera, view, plot, center]);
  const framePoints = useMemo(() => tracks.map((track) => track.points[track.points.length - 1]), [tracks]);
  const visibleTracks = useMemo(() => (focusedQuadrant ? tracks.filter((track) => track.points[track.points.length - 1].snapshot.quadrant === focusedQuadrant) : tracks), [tracks, focusedQuadrant]);
  const points = useMemo(() => visibleTracks.map((track) => track.points[track.points.length - 1]), [visibleTracks]);
  const quadrantCounts = useMemo(() => Object.fromEntries((Object.keys(QUADRANTS) as Quadrant[]).map((q) => [q, framePoints.filter((point) => point.snapshot.quadrant === q).length])) as Record<Quadrant, number>, [framePoints]);
  const freshPoints = useMemo(() => framePoints.filter((p) => p.fresh), [framePoints]);

  useEffect(() => {
    if (!playing || activeWeeks.length < 2) return;
    const timer = window.setTimeout(() => setPlaybackIndex((index) => Math.min((index ?? 0) + 1, activeWeeks.length - 1)), 850);
    return () => window.clearTimeout(timer);
  }, [playing, playbackIndex, activeWeeks.length]);
  useEffect(() => { if (playing && playbackIndex != null && playbackIndex >= activeWeeks.length - 1) setPlaying(false); }, [playing, playbackIndex, activeWeeks.length]);

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !eligible.length) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), scale = (cssWidth * dpr) / W;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round((H / W) * cssWidth * dpr);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#0b1424"); bg.addColorStop(1, "#080d18");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    const flat = view === "flat", px = (n: number) => n * k;
    const font = (size: number, weight = 600) => `${weight} ${px(size)}px ${FONT}`;
    const p = (v: Point3) => projectPoint(v, camera, view, plot, center);
    const path3 = (vertices: Point3[], close = false) => { const pr = vertices.map(p); ctx.beginPath(); pr.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y))); if (close) ctx.closePath(); };
    /** Chữ có viền tối mềm: đọc được trên mọi nền mà không cần ô nền. */
    const haloText = (text: string, x: number, y: number, color: string) => { ctx.lineJoin = "round"; ctx.lineWidth = px(3.5); ctx.strokeStyle = "rgba(6,11,22,0.92)"; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y); };
    const rounded = (x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
    const occupied: Box[] = [];
    const dotBoxes: Box[] = points.map((pt) => { const r = px(pt.fresh ? 13 : 8); return { left: pt.x - r, top: pt.y - r, right: pt.x + r, bottom: pt.y + r }; });
    /** Chữ trục và tên góc ở 3D: tìm chỗ gần neo mà không đè chấm hay chữ đã đặt. */
    const freeSpot = (x: number, y: number, w: number, h: number) => placeLabels([{ id: "a", x, y, w, h, priority: 0, r: px(2) }], [...dotBoxes, ...occupied], { W, H }, center, k).get("a") as Box;

    if (flat) {
      // Mặt phẳng RRG: bốn góc tô nhẹ, lưới theo đơn vị thật, trục cắt tại 100.
      for (const q of Object.keys(QUADRANTS) as Quadrant[]) {
        const m = QUADRANTS[q];
        path3([{ x: m.x > 0 ? 0 : -1, y: m.y > 0 ? 0 : -1, z: 0 }, { x: m.x > 0 ? 1 : 0, y: m.y > 0 ? 0 : -1, z: 0 }, { x: m.x > 0 ? 1 : 0, y: m.y > 0 ? 1 : 0, z: 0 }, { x: m.x > 0 ? 0 : -1, y: m.y > 0 ? 1 : 0, z: 0 }], true);
        ctx.globalAlpha = 0.07; ctx.fillStyle = m.color; ctx.fill(); ctx.globalAlpha = 1;
      }
      const step = niceStep(domain);
      ctx.font = font(11, 500); ctx.fillStyle = "#64748b"; ctx.lineWidth = px(1);
      for (let t = -Math.floor(domain / step) * step; t <= domain + 1e-9; t += step) {
        const f = t / domain;
        ctx.strokeStyle = Math.abs(t) < 1e-9 ? "rgba(203,213,225,0.45)" : "rgba(148,163,184,0.1)";
        path3([{ x: f, y: -1, z: 0 }, { x: f, y: 1, z: 0 }]); ctx.stroke();
        path3([{ x: -1, y: f, z: 0 }, { x: 1, y: f, z: 0 }]); ctx.stroke();
        const a = p({ x: f, y: -1, z: 0 }), b = p({ x: -1, y: f, z: 0 });
        ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "#64748b"; ctx.fillText(nfmt(100 + t, 1), a.x, a.y + px(4));
        ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(nfmt(100 + t, 1), b.x - px(5), b.y);
      }
      ctx.font = font(11); ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillText("RS-Ratio →", plot.cx, H - px(6));
      ctx.save(); ctx.translate(px(13), plot.cy); ctx.rotate(-Math.PI / 2); ctx.fillText("RS-Momentum →", 0, 0); ctx.restore();
      // Tên góc đặt sát bốn góc, nhỏ và giãn chữ để không tranh với tên ngành.
      for (const q of Object.keys(QUADRANTS) as Quadrant[]) {
        const m = QUADRANTS[q], c = p({ x: m.x, y: m.y, z: 0 }), text = `${m.label.toUpperCase()} · ${quadrantCounts[q]}`;
        ctx.font = font(11, 700); ctx.fillStyle = m.color; ctx.textBaseline = m.y > 0 ? "top" : "alphabetic"; ctx.textAlign = m.x > 0 ? "right" : "left";
        const x = c.x - m.x * px(8), y = c.y + (m.y > 0 ? px(7) : -px(7)), tw = ctx.measureText(text).width;
        ctx.fillText(text, x, y);
        occupied.push({ left: m.x > 0 ? x - tw : x, right: m.x > 0 ? x : x + tw, top: m.y > 0 ? y : y - px(13), bottom: m.y > 0 ? y + px(13) : y });
      }
    } else {
      for (const q of Object.keys(QUADRANTS) as Quadrant[]) {
        const m = QUADRANTS[q], x0 = m.x > 0 ? 0 : -1, x1 = m.x > 0 ? 1 : 0, y0 = m.y > 0 ? 0 : -1, y1 = m.y > 0 ? 1 : 0;
        path3([{ x: x0, y: y0, z: -0.96 }, { x: x1, y: y0, z: -0.96 }, { x: x1, y: y1, z: -0.96 }, { x: x0, y: y1, z: -0.96 }], true);
        ctx.globalAlpha = 0.14; ctx.fillStyle = m.color; ctx.fill(); ctx.globalAlpha = 0.4; ctx.strokeStyle = m.color; ctx.lineWidth = px(1); ctx.stroke(); ctx.globalAlpha = 1;
      }
      path3([{ x: 0, y: -1, z: -1 }, { x: 0, y: 1, z: -1 }, { x: 0, y: 1, z: 1 }, { x: 0, y: -1, z: 1 }], true);
      ctx.fillStyle = "rgba(148,163,184,.035)"; ctx.fill(); ctx.strokeStyle = "rgba(148,163,184,.25)"; ctx.stroke();
      path3([{ x: -1, y: 0, z: -1 }, { x: 1, y: 0, z: -1 }, { x: 1, y: 0, z: 1 }, { x: -1, y: 0, z: 1 }], true);
      ctx.fillStyle = "rgba(148,163,184,.035)"; ctx.fill(); ctx.stroke();
      const cube = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => ({ x, y, z }))));
      ctx.strokeStyle = "rgba(100,116,139,.24)"; ctx.lineWidth = px(1);
      for (const a of cube) for (const b of cube) {
        if (Number(a.x !== b.x) + Number(a.y !== b.y) + Number(a.z !== b.z) === 1 && (a.x < b.x || a.y < b.y || a.z < b.z)) { const pa = p(a), pb = p(b); ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); }
      }
      const axes: { end: Point3; color: string; label: string }[] = [
        { end: { x: 1.18, y: 0, z: 0 }, color: "#60a5fa", label: "X · RS-Ratio" },
        { end: { x: 0, y: 1.18, z: 0 }, color: "#4ade80", label: "Y · RS-Momentum" },
        { end: { x: 0, y: 0, z: 1.18 }, color: "#fbbf24", label: "Z · dòng tiền" },
      ];
      for (const axis of axes) {
        const start = p({ x: 0, y: 0, z: 0 }), end = p(axis.end), angle = Math.atan2(end.y - start.y, end.x - start.x);
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.strokeStyle = axis.color; ctx.lineWidth = px(1.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(end.x, end.y); ctx.lineTo(end.x - px(8) * Math.cos(angle - 0.4), end.y - px(8) * Math.sin(angle - 0.4)); ctx.lineTo(end.x - px(8) * Math.cos(angle + 0.4), end.y - px(8) * Math.sin(angle + 0.4)); ctx.closePath(); ctx.fillStyle = axis.color; ctx.fill();
        ctx.font = font(11); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        const spot = freeSpot(end.x, end.y, ctx.measureText(axis.label).width, px(15));
        ctx.textBaseline = "middle";
        haloText(axis.label, spot.left, (spot.top + spot.bottom) / 2, axis.color);
        occupied.push(spot);
      }
      for (const q of Object.keys(QUADRANTS) as Quadrant[]) {
        const m = QUADRANTS[q], a = p({ x: m.x * 0.8, y: m.y * 0.8, z: -0.96 }), text = `${m.label} · ${quadrantCounts[q]}`;
        ctx.font = font(12, 700); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const spot = freeSpot(a.x, a.y, ctx.measureText(text).width, px(17));
        haloText(text, (spot.left + spot.right) / 2, (spot.top + spot.bottom) / 2, m.color);
        occupied.push(spot);
      }
    }

    const focusCode = hoveredCode ?? openSector ?? selectedSector;
    const dimOthers = focusCode != null && points.some((pt) => pt.sector.code === focusCode);
    const tone = (pt: ProjectedPoint) => (colorMode === "quadrant" ? QUADRANTS[pt.snapshot.quadrant].color : pt.color);

    // Quỹ đạo chỉ nối tuần liền kề có quan sát thật, không nội suy qua tuần thiếu.
    for (const track of visibleTracks) {
      const focus = focusCode === track.sector.code, count = track.points.length;
      for (let i = 1; i < count; i++) {
        const previous = track.points[i - 1], current = track.points[i];
        if ((Date.parse(current.snapshot.week) - Date.parse(previous.snapshot.week)) / (7 * 86_400_000) !== 1) continue;
        const age = i / Math.max(1, count - 1);
        ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(current.x, current.y);
        ctx.strokeStyle = colorMode === "quadrant" ? QUADRANTS[current.snapshot.quadrant].color : correlationColor((previous.snapshot.marketCorrelation60! + current.snapshot.marketCorrelation60!) / 2);
        ctx.globalAlpha = focus ? 0.35 + age * 0.65 : dimOthers ? 0.04 + age * 0.08 : 0.08 + age * 0.3;
        ctx.lineCap = "round"; ctx.lineWidth = px(focus ? 2.6 : 1.2); ctx.stroke(); ctx.globalAlpha = 1;
        if (focus) { ctx.beginPath(); ctx.arc(current.x, current.y, px(2.6), 0, Math.PI * 2); ctx.fillStyle = tone(current); ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1; }
        if (focus && i === count - 1) {
          const angle = Math.atan2(current.y - previous.y, current.x - previous.x);
          ctx.beginPath(); ctx.moveTo(current.x, current.y); ctx.lineTo(current.x - px(10) * Math.cos(angle - 0.48), current.y - px(10) * Math.sin(angle - 0.48)); ctx.lineTo(current.x - px(10) * Math.cos(angle + 0.48), current.y - px(10) * Math.sin(angle + 0.48)); ctx.closePath(); ctx.fillStyle = tone(current); ctx.fill();
        }
      }
    }

    // Điểm vẽ từ xa đến gần. Vòng vàng đánh dấu ngành vừa vào Cải thiện.
    for (const point of [...points].sort((a, b) => b.depth - a.depth)) {
      const active = focusCode === point.sector.code, r = px(active ? 7.5 : 5.5);
      ctx.globalAlpha = dimOthers && !active ? 0.35 : 1;
      if (point.fresh) { ctx.beginPath(); ctx.arc(point.x, point.y, r + px(5), 0, Math.PI * 2); ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = px(1.8); ctx.stroke(); }
      if (active) { ctx.beginPath(); ctx.arc(point.x, point.y, r + px(4.5), 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = px(1.2); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(point.x, point.y, r, 0, Math.PI * 2); ctx.fillStyle = tone(point); ctx.fill();
      ctx.lineWidth = px(1.5); ctx.strokeStyle = colorMode === "quadrant" ? "rgba(6,11,22,.9)" : QUADRANTS[point.snapshot.quadrant].color; ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Nhãn tên ngành: chữ có viền tối, đường dẫn mảnh; ngành đang chọn có thẻ bo tròn. Không ẩn tên ngành nào.
    const h = px(16), texts = new Map<string, string>();
    const items: LabelItem[] = points.map((pt) => {
      const active = focusCode === pt.sector.code, text = `${pt.fresh ? "✦ " : ""}${compactName(pt.sector.name, active || cssWidth >= 700 ? 36 : 20)}`;
      texts.set(pt.sector.code, text);
      ctx.font = font(active ? 12.5 : 11.5, active ? 700 : 600);
      return { id: pt.sector.code, x: pt.x, y: pt.y, w: ctx.measureText(text).width + px(active ? 18 : 4), h: active ? px(22) : h, priority: active ? 3 : pt.fresh ? 1 : 0, r: px(pt.fresh || active ? 14 : 8) };
    });
    const boxes = placeLabels(items, occupied, { W, H }, flat ? { x: plot.cx, y: plot.cy } : center, k);
    for (const pt of [...points].sort((a, b) => Number(a.sector.code === focusCode) - Number(b.sector.code === focusCode))) {
      const box = boxes.get(pt.sector.code);
      if (!box) continue;
      const active = focusCode === pt.sector.code, q = QUADRANTS[pt.snapshot.quadrant].color, text = texts.get(pt.sector.code)!;
      ctx.globalAlpha = dimOthers && !active ? 0.3 : 1;
      const ex = clamp(pt.x, box.left, box.right), ey = clamp(pt.y, box.top, box.bottom);
      if (Math.hypot(pt.x - ex, pt.y - ey) > px(9)) {
        ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(ex, ey); ctx.strokeStyle = q; ctx.globalAlpha *= active ? 0.9 : 0.75; ctx.lineWidth = px(active ? 1.2 : 1); ctx.stroke(); ctx.globalAlpha = dimOthers && !active ? 0.3 : 1;
      }
      ctx.textBaseline = "middle"; ctx.textAlign = "center";
      const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2;
      if (active) {
        rounded(box.left, box.top, box.right - box.left, box.bottom - box.top, px(11));
        ctx.fillStyle = "rgba(15,23,42,.94)"; ctx.fill(); ctx.strokeStyle = q; ctx.lineWidth = px(1.2); ctx.stroke();
        ctx.font = font(12.5, 700); ctx.fillStyle = "#f8fafc"; ctx.fillText(text, cx, cy);
      } else { ctx.font = font(11.5, 600); haloText(text, cx, cy, pt.fresh ? "#fde68a" : "#e2e8f0"); }
      ctx.globalAlpha = 1;
    }
  }, [eligible.length, visibleTracks, points, camera, selectedSector, openSector, hoveredCode, quadrantCounts, view, colorMode, domain, cssWidth, H, k, plot, center]);

  const canvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) * W) / rect.width, y: ((event.clientY - rect.top) * H) / rect.height };
  };
  const nearestTo = (pos: { x: number; y: number }) => points.reduce<ProjectedPoint | null>((best, point) => {
    const d = Math.hypot(point.x - pos.x, point.y - pos.y);
    return d < 18 * k && (!best || d < Math.hypot(best.x - pos.x, best.y - pos.y)) ? point : best;
  }, null);
  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const pos = canvasPoint(event);
    dragRef.current = { ...pos, moved: false };
    if (view === "3d") event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const pos = canvasPoint(event), drag = dragRef.current;
    if (view === "3d" && drag && (event.buttons & 1) === 1) {
      const dx = pos.x - drag.x, dy = pos.y - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      if (drag.moved) setRotation((r) => ({ ...r, yaw: r.yaw + dx * 0.008, pitch: clamp(r.pitch + dy * 0.008, -1.25, 1.25) }));
      drag.x = pos.x; drag.y = pos.y;
      return;
    }
    setHoveredCode(nearestTo(pos)?.sector.code ?? null);
  };
  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.moved) { const nearest = nearestTo(canvasPoint(event)); if (nearest) { setHoveredCode(nearest.sector.code); onSelectSector?.(nearest.sector.code); } }
  };
  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    if (view !== "3d") return;
    event.preventDefault();
    setRotation((r) => ({ ...r, zoom: clamp(r.zoom * (event.deltaY < 0 ? 1.08 : 0.93), 0.65, 1.8) }));
  };

  if (!eligible.length) {
    return <div data-testid="rrg4d-insufficient" role="status" style={{ padding: 12, color: "var(--text-tertiary)", fontSize: 11 }}>
      Chưa đủ lịch sử đồng bộ để dựng bản đồ 4D. Cần tối thiểu 30 phiên ghép cặp cho tương quan; không tạo dữ liệu thay thế.
    </div>;
  }

  const detail = points.find((point) => point.sector.code === (hoveredCode ?? openSector ?? selectedSector)) ?? null;
  const detailQuadrant = detail ? QUADRANTS[detail.snapshot.quadrant] : null;
  const detailRawQuadrant = detail ? QUADRANTS[detail.rawQuadrant] : null;
  const detailTransition = detail?.previousSnapshot && detail.previousSnapshot.quadrant !== detail.snapshot.quadrant ? `${QUADRANTS[detail.previousSnapshot.quadrant].label} → ${detailQuadrant?.label}` : null;
  const detailDx = detail?.previousSnapshot ? detail.snapshot.ratio - detail.previousSnapshot.ratio : null;
  const detailDy = detail?.previousSnapshot ? detail.snapshot.momentum - detail.previousSnapshot.momentum : null;
  const detailDz = detail?.previousSnapshot && detail.snapshot.flowShareZ != null && detail.previousSnapshot.flowShareZ != null ? detail.snapshot.flowShareZ - detail.previousSnapshot.flowShareZ : null;
  const detailProb = detail ? probabilities?.get(detail.sector.code) ?? null : null;
  const reset = () => { setRotation(DEFAULT_ROTATION); setHoveredCode(null); };
  const setWindow = (weeks: 8 | 13 | 26) => { setTrailWeeks(weeks); setPlaybackIndex(null); setPlaying(false); };
  const step = (delta: number) => { setPlaying(false); setPlaybackIndex(clamp(frameIndex + delta, 0, latestIndex)); };
  const startPlayback = () => { if (activeWeeks.length < 2) return; if (frameIndex >= latestIndex) setPlaybackIndex(0); setPlaying(true); };
  const signed = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${nfmt(v)}`);

  return <section data-testid="rrg4d-projection" aria-label="Bản đồ RRG 4D nghiên cứu" style={{ width: "100%" }}>
    <div data-testid="rrg4d-controls" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "7px 14px", padding: "9px 11px", border: "1px solid var(--bg-surface-2)", borderRadius: 8, marginBottom: 8, fontSize: 11, color: "var(--text-secondary)" }}>
      <span role="group" aria-label="Chế độ xem" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><b>Xem</b>
        <button type="button" aria-pressed={view === "flat"} data-testid="rrg4d-view-flat" onClick={() => setView("flat")} style={btn(view === "flat")}>Nhìn phẳng</button>
        <button type="button" aria-pressed={view === "3d"} data-testid="rrg4d-view-3d" onClick={() => setView("3d")} style={btn(view === "3d")}>3D</button>
      </span>
      <span role="group" aria-label="Tô màu" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><b>Màu</b>
        <button type="button" aria-pressed={colorMode === "quadrant"} data-testid="rrg4d-color-quadrant" onClick={() => setColorMode("quadrant")} style={btn(colorMode === "quadrant")}>Góc phần tư</button>
        <button type="button" aria-pressed={colorMode === "correlation"} data-testid="rrg4d-color-correlation" onClick={() => setColorMode("correlation")} style={btn(colorMode === "correlation")}>Tương quan W</button>
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><b>W</b><i aria-hidden="true" style={{ display: "inline-block", width: 82, height: 7, borderRadius: 8, background: `linear-gradient(90deg, ${correlationColor(-1)}, ${correlationColor(0)}, ${correlationColor(1)})` }} />−1 nghịch chiều · 0 ít tương quan tuyến tính · +1 đồng biến mạnh</span>
      <span style={{ marginLeft: "auto", color: "var(--text-tertiary)" }}>{eligible.length}/{sectors.length} ngành đủ mẫu</span>
    </div>

    <div data-testid="rrg4d-playback" style={{ display: "grid", gridTemplateColumns: "auto minmax(150px, 1fr)", alignItems: "center", gap: "8px 12px", padding: "9px 11px", border: "1px solid var(--bg-surface-2)", borderRadius: 8, marginBottom: 8, background: "rgba(15,23,42,.55)", fontSize: 11 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <b style={{ color: "#cbd5e1", marginRight: 3 }}>Độ dài quỹ đạo</b>
        {([8, 13, 26] as const).map((weeks) => <button key={weeks} type="button" aria-pressed={trailWeeks === weeks} onClick={() => setWindow(weeks)} style={btn(trailWeeks === weeks)}>{weeks} tuần</button>)}
        <button type="button" aria-label="Lùi một tuần" disabled={activeWeeks.length < 2 || frameIndex <= 0} onClick={() => step(-1)} style={btn(false)}>◀</button>
        <button type="button" aria-label={playing ? "Tạm dừng phát lại" : "Phát lại lịch sử"} disabled={activeWeeks.length < 2} onClick={() => (playing ? setPlaying(false) : startPlayback())} style={btn(true, "#0e7490")}>{playing ? "Ⅱ Tạm dừng" : "▶ Phát"}</button>
        <button type="button" aria-label="Tiến một tuần" disabled={activeWeeks.length < 2 || frameIndex >= latestIndex} onClick={() => step(1)} style={btn(false)}>▶</button>
        <button type="button" onClick={() => { setPlaybackIndex(null); setPlaying(false); }} style={btn(false)}>Hiện mới nhất</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <input aria-label="Chọn tuần lịch sử RRG" data-testid="rrg4d-week-slider" type="range" min={0} max={latestIndex} step={1} value={frameIndex} disabled={activeWeeks.length < 2} onChange={(event) => { setPlaying(false); setPlaybackIndex(Number(event.currentTarget.value)); }} style={{ width: "100%", accentColor: "#22d3ee" }} />
        <b data-testid="rrg4d-frame-date" style={{ minWidth: 78, textAlign: "right", color: "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>{frameDate ?? "Chưa có tuần"}</b>
      </div>
      <span role="status" style={{ gridColumn: "1 / -1", color: "var(--text-tertiary)" }}>
        {activeWeeks.length > 1 ? `${playing ? "Đang phát" : playbackIndex == null ? "Tuần mới nhất" : "Phát lại lịch sử"} · ${frameIndex + 1}/${activeWeeks.length} tuần đã đóng · ${points.length}/${eligible.length} ngành có quan sát đầy đủ` : "Gateway chưa có đủ hai tuần 4D đồng bộ để phát lại; không nội suy hoặc tạo quỹ đạo giả."}
      </span>
    </div>

    <div data-testid="rrg4d-quadrant-summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 7, marginBottom: 8 }}>
      {(Object.keys(QUADRANTS) as Quadrant[]).map((quadrant) => {
        const meta = QUADRANTS[quadrant], members = framePoints.filter((point) => point.snapshot.quadrant === quadrant), active = focusedQuadrant === quadrant;
        return <button key={quadrant} type="button" data-testid={`rrg4d-quadrant-${quadrant.toLowerCase()}`} aria-pressed={active} onClick={() => setFocusedQuadrant(active ? null : quadrant)} title={members.map((point) => point.sector.name).join(" · ") || "Không có ngành trong vùng ở tuần này"} style={{ minWidth: 0, textAlign: "left", padding: "8px 9px", borderTop: `1px solid ${active ? meta.color : "var(--bg-surface-2)"}`, borderRight: `1px solid ${active ? meta.color : "var(--bg-surface-2)"}`, borderBottom: `1px solid ${active ? meta.color : "var(--bg-surface-2)"}`, borderLeft: `3px solid ${meta.color}`, borderRadius: 7, color: "var(--text-secondary)", background: active ? `${meta.color}18` : "rgba(15,23,42,.45)", cursor: "pointer" }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><b style={{ color: meta.color, fontSize: 11 }}>{meta.label}</b><b style={{ color: "#e2e8f0", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{members.length}</b></span>
          <span style={{ display: "block", marginTop: 4, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{members.length ? members.slice(0, 3).map((point) => point.sector.name).join(" · ") : "Không có ngành trong vùng"}{members.length > 3 ? ` · +${members.length - 3}` : ""}</span>
        </button>;
      })}
      {focusedQuadrant && <button type="button" onClick={() => setFocusedQuadrant(null)} style={{ border: "1px solid var(--bg-surface-2)", borderRadius: 7, background: "transparent", color: "var(--text-tertiary)", fontSize: 11, cursor: "pointer" }}>Hiện mọi vùng</button>}
    </div>
    {freshPoints.length > 0 && <div data-testid="rrg4d-fresh" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, color: "#fde68a" }}>
      <b>✦ Vừa vào Cải thiện, tối đa 2 tuần:</b>
      {freshPoints.map((pt) => <button key={pt.sector.code} type="button" data-testid={`rrg4d-fresh-${pt.sector.code}`} onClick={() => onSelectSector?.(pt.sector.code)} style={{ border: "1px solid rgba(251,191,36,.45)", borderRadius: 999, padding: "1px 8px", background: "rgba(251,191,36,.08)", color: "#fde68a", fontSize: 11, cursor: "pointer" }}>{pt.sector.name}</button>)}
    </div>}

    <div ref={boxRef} style={{ position: "relative", width: "100%", overflow: "hidden", border: "1px solid var(--bg-surface-2)", borderRadius: 10, background: "#080d18" }}>
      <canvas ref={canvasRef} data-testid="rrg4d-canvas" data-view={view} width={W} height={H}
        role="img" aria-label={`Bản đồ RRG ${view === "flat" ? "nhìn phẳng" : "3D"}, bốn vùng Dẫn dắt, Cải thiện, Suy yếu, Tụt hậu theo RS-Ratio và RS-Momentum. Bảng bên dưới có đủ số liệu.`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragRef.current = null; }} onPointerLeave={() => { if (!dragRef.current) setHoveredCode(null); }} onWheel={onWheel}
        style={{ display: "block", width: "100%", height: "auto", aspectRatio: `${W} / ${H}`, cursor: view === "3d" ? "grab" : "default", touchAction: view === "3d" ? "none" : "pan-y" }} />
      {view === "3d" && <>
        <div style={{ position: "absolute", top: 9, left: 10, pointerEvents: "none", fontSize: 11, color: "#cbd5e1", background: "rgba(5,10,20,.76)", padding: "4px 8px", borderRadius: 6 }}>Kéo để xoay · cuộn để phóng to · {Math.round(rotation.zoom * 100)}%</div>
        <button type="button" onClick={reset} style={{ position: "absolute", right: 10, top: 8, border: "1px solid #334155", borderRadius: 6, color: "#cbd5e1", background: "rgba(5,10,20,.84)", fontSize: 11, padding: "4px 8px", cursor: "pointer" }}>Đặt lại góc nhìn</button>
      </>}
    </div>
    <div data-testid="rrg4d-detail" aria-live="polite" style={{ minHeight: 44, marginTop: 6, padding: "7px 10px", border: "1px solid var(--bg-surface-2)", borderRadius: 8, color: "#e2e8f0", fontSize: 11 }}>
      {detail ? <>
        <b style={{ color: detailQuadrant?.color }}>{detail.sector.name}</b> · {detail.snapshot.date} · {detailTransition ? `Chuyển ${detailTransition}` : detailQuadrant?.label}
        {detail.fresh && <span style={{ color: "#fde68a" }}> · ✦ vừa vào Cải thiện</span>}
        {detailRawQuadrant?.label !== detailQuadrant?.label && <span style={{ color: "#fbbf24" }}> · vị trí hình học {detailRawQuadrant?.label}; trạng thái lọc đang giữ góc trước</span>}
        <br />X {nfmt(detail.snapshot.ratio - 100)} ({signed(detailDx)}) · Y {nfmt(detail.snapshot.momentum - 100)} ({signed(detailDy)}) · Z {nfmt(detail.snapshot.flowShareZ)} ({signed(detailDz)}) · W ρ {nfmt(detail.snapshot.marketCorrelation60)} (n={detail.snapshot.correlationObservations})
        {detailProb != null && <span data-testid="rrg4d-prob"> · P(outperform) {nfmt(detailProb * 100, 0)}%, thử nghiệm</span>}
      </> : <span style={{ color: "var(--text-tertiary)" }}>Di chuột hoặc chạm vào một ngành để xem chi tiết.</span>}
    </div>
    {missing.length > 0 && <p data-testid="rrg4d-missing" style={{ fontSize: 11, color: "var(--warning)", margin: "6px 0 0" }}>Chưa đủ dữ liệu 4D nên chưa vẽ: {missing.map((s) => s.name).join(", ")}. Các ngành này vẫn có trong bảng dưới.</p>}

    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0", fontSize: 11, color: "var(--text-tertiary)" }}>
      <span style={{ color: QUADRANTS.LEADING.color }}>● Dẫn dắt: X≥100, Y≥100</span><span style={{ color: QUADRANTS.IMPROVING.color }}>● Cải thiện: X&lt;100, Y≥100</span><span style={{ color: QUADRANTS.WEAKENING.color }}>● Suy yếu: X≥100, Y&lt;100</span><span style={{ color: QUADRANTS.LAGGING.color }}>● Tụt hậu: X&lt;100, Y&lt;100</span>
      <span style={{ marginLeft: "auto" }}>Tuần đã đóng, khung {frameDate ?? "hiện tại"}</span>
    </div>
    <div style={{ overflowX: "auto", maxHeight: 260, overflowY: "auto", border: "1px solid var(--bg-surface-2)", borderRadius: 8 }}>
      <table data-testid="rrg4d-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 780 }}>
        <caption style={{ textAlign: "left", padding: "7px 9px", color: "var(--text-secondary)", fontWeight: 700 }}>Ngành và tọa độ 4D · chọn dòng để mở phân tích ngành</caption>
        <thead><tr style={{ color: "var(--text-tertiary)", textAlign: "left", position: "sticky", top: 0, background: "var(--bg-surface-1, #0b1220)" }}>
          <th scope="col" style={{ padding: 6 }}>Mã / ngành</th><th scope="col" style={{ padding: 6 }}>Vùng RRG</th><th scope="col" style={{ padding: 6 }}>Tuần</th><th scope="col" style={{ padding: 6 }}>X · RS-Ratio</th><th scope="col" style={{ padding: 6 }}>Y · RS-Momentum</th><th scope="col" style={{ padding: 6 }}>Z · thị phần GTGD</th><th scope="col" style={{ padding: 6 }}>W · ρ VNINDEX</th><th scope="col" style={{ padding: 6 }}>n phiên</th>
        </tr></thead>
        <tbody>{points.map((point) => {
          const { sector, snapshot } = point;
          const active = selectedSector === sector.code || openSector === sector.code;
          const label = `${sector.name}; ${QUADRANTS[snapshot.quadrant].label}; tuần ${snapshot.week}; X RS-Ratio ${nfmt(snapshot.ratio - 100)}; Y RS-Momentum ${nfmt(snapshot.momentum - 100)}; Z thị phần GTGD ${nfmt(snapshot.flowShareZ)}; W tương quan ${nfmt(snapshot.marketCorrelation60)}; n=${snapshot.correlationObservations}`;
          return <tr key={sector.code} data-testid={`rrg4d-row-${sector.code}`} style={{ borderTop: "1px solid var(--bg-surface-2)", background: active ? "rgba(56,189,248,.08)" : undefined }}>
            <th scope="row" style={{ padding: 5, textAlign: "left" }}><button type="button" data-testid={`rrg4d-sector-${sector.code}`} aria-label={label} aria-pressed={onSelectSector ? active : undefined} onMouseEnter={() => setHoveredCode(sector.code)} onMouseLeave={() => setHoveredCode(null)} onClick={() => { setHoveredCode(sector.code); onSelectSector?.(sector.code); }} style={{ border: 0, padding: 0, background: "transparent", color: colorMode === "quadrant" ? "#e2e8f0" : correlationColor(snapshot.marketCorrelation60!), cursor: onSelectSector ? "pointer" : "default", font: "inherit", textAlign: "left" }}>{sector.code} · {sector.name}{point.fresh ? " ✦" : ""}</button></th>
            <td style={{ padding: 5, color: QUADRANTS[snapshot.quadrant].color }}>{QUADRANTS[snapshot.quadrant].label}{point.rawQuadrant !== snapshot.quadrant ? ` · sát biên ${QUADRANTS[point.rawQuadrant].label}` : ""}</td><td style={{ padding: 5 }}>{snapshot.week}</td><td style={{ padding: 5 }}>{nfmt(snapshot.ratio - 100)}</td><td style={{ padding: 5 }}>{nfmt(snapshot.momentum - 100)}</td><td style={{ padding: 5 }}>{nfmt(snapshot.flowShareZ)}</td>
            <td style={{ padding: 5, color: correlationColor(snapshot.marketCorrelation60!) }}>{nfmt(snapshot.marketCorrelation60)}</td><td style={{ padding: 5 }}>{snapshot.correlationObservations}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "7px 0 0" }}>Nhìn phẳng đặt điểm đúng theo X/Y. Ở 3D, phép chiếu có thể làm điểm trông lệch khỏi vùng; vùng RRG luôn tính theo X/Y. “Sát biên”: tọa độ đã sang vùng kế bên nhưng bộ lọc 0,15σ vẫn giữ trạng thái cũ. Quỹ đạo chỉ nối tuần có dữ liệu thật. Lịch sử ngành tái dựng theo phân loại hiện tại, chưa phải thành phần point-in-time.</p>
  </section>;
}
