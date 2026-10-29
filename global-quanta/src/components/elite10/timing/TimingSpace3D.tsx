// CH3D (29/10/2026) — "Không gian thời điểm 4D" (Hồ sơ 360° Elite 10). Cùng cách dựng 3D của RRG 4D (Lọc ngành › Xoay vòng ngành):
// chiếu phối cảnh yaw/pitch trên Canvas 2D, kéo để xoay, cuộn để zoom, điểm vẽ sau-ra-trước, chữ luôn quay về màn hình, có bảng số liệu.
//   X = phiên so với sự kiện · Y = lợi suất vượt VN-Index tích luỹ · Z = từng đợt (cũ ở sau -> mới ở trước; trung vị; KỲ TỚI ở trước cùng)
//   W = thảm "ESA ngày" dưới mỗi đợt (độ bất thường giá trị giao dịch, chuẩn hoá ESA R0) + cột đứng tại phiên bất thường.
// Khối xanh = vùng mua của Timeline điểm mua (ngày thật của kỳ tới), mặt hồng = phiên thoát; điểm ESA LIVE ở phiên hôm nay của kỳ tới.
import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { TimelineRow } from "../../../lib/cotuc/buy-timeline";
import type { EventStudy, EventStudyWindow } from "../../../lib/elite10/timingSim";
import { ESA_DAILY, buildTimingSpace, type DailyBar, type SpaceCell, type SpaceRibbon } from "../../../lib/elite10/timingSpace";
import type { EsaLive } from "../../../hooks/elite10/useEsaSnapshot";
import type { AnalogFan, FanPoint } from "../../../lib/elite10/analogFan";

const W = 1000, H = 560, CENTER = { x: 520, y: 292 };
type Rotation = { yaw: number; pitch: number; zoom: number };
type P3 = { x: number; y: number; z: number };
type Hit = { x: number; y: number; ribbon: SpaceRibbon; offset: number; ret: number | null; cell: SpaceCell | null };
const DEFAULT_ROT: Rotation = { yaw: -0.55, pitch: -0.32, zoom: 1 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);
const num = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : x.toLocaleString("vi-VN", { maximumFractionDigits: d }));
const dm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

function project(p: P3, r: Rotation) {
  const cy = Math.cos(r.yaw), sy = Math.sin(r.yaw), cp = Math.cos(r.pitch), sp = Math.sin(r.pitch);
  const x1 = p.x * cy - p.z * sy, z1 = p.x * sy + p.z * cy;
  const y2 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp;
  const k = 4 / (4 + z2);
  return { x: CENTER.x + x1 * 330 * r.zoom * k, y: CENTER.y - y2 * 165 * r.zoom * k, depth: z2 };
}
/** Màu thảm W theo z của ESA ngày (thang một sắc: dưới 1 gần như trong suốt; ≥ 3 cam; ≥ 5 hồng). */
function esaColor(c: SpaceCell): string | null {
  const z = c.esa.z;
  if (z == null) return null;
  if (c.esa.level === "high") return "rgba(244,63,94,.85)";
  if (c.esa.level === "unusual") return "rgba(249,115,22,.75)";
  if (z < 1) return "rgba(100,116,139,.10)";
  return `rgba(251,191,36,${clamp(0.12 + (z - 1) * 0.16, 0.12, 0.5).toFixed(2)})`;
}
/** Lợi suất của dải tại phiên bất kỳ (nội suy tuyến tính giữa hai mốc v3 — chỉ để đặt cột ESA, không vẽ thành dữ liệu). */
function retAt(r: SpaceRibbon, o: number): number | null {
  const ps = r.points;
  if (!ps.length || o < ps[0].offset || o > ps[ps.length - 1].offset) return null;
  for (let i = 1; i < ps.length; i++) if (o <= ps[i].offset) {
    const a = ps[i - 1], b = ps[i], t = (o - a.offset) / (b.offset - a.offset || 1);
    return a.ret + (b.ret - a.ret) * t;
  }
  return ps[ps.length - 1].ret;
}

type Props = {
  es: EventStudy; bars: DailyBar[]; indexBars?: DailyBar[]; barsLoading?: boolean; window: EventStudyWindow | null; todayOff: number | null; today: string;
  timeline: TimelineRow | null; esa: EsaLive | null; fan?: AnalogFan | null;
};

export default function TimingSpace3D({ es, bars, indexBars = [], barsLoading, window: win, todayOff, today, timeline, esa, fan = null }: Props) {
  const [rot, setRot] = useState<Rotation>(DEFAULT_ROT);
  const [showEsa, setShowEsa] = useState(true);
  const [showOutcome, setShowOutcome] = useState(true);
  const [hover, setHover] = useState<Hit | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const hits = useRef<Hit[]>([]);
  const [fontK, setFontK] = useState(1);

  const fanRets = useMemo(() => (fan ? fan.points.flatMap((p) => [p.loAdj ?? p.lo, p.hiAdj ?? p.hi]) : []), [fan]);
  const space = useMemo(() => buildTimingSpace(es, bars, todayOff, win, today, indexBars, fanRets), [es, bars, todayOff, win, today, indexBars, fanRets]);
  const eventWord = es.kind === "DIVIDEND" ? "GDKHQ" : "công bố KQKD";
  // Vùng mua hiển thị: Timeline (nếu cùng cửa sổ) quyết định nhãn ngày thật; hình học lấy từ cửa sổ đang xem.
  const tlMatch = timeline && win && timeline.windowId === win.id ? timeline : null;

  // Chữ trên canvas co theo bề rộng thật: màn 390 px phóng chữ lên để vẫn đọc được.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setFontK(clamp(W / Math.max(1, e.contentRect.width) * 0.55, 1, 2.1)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#0b1424"); bg.addColorStop(1, "#080d18");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const font = (px: number, w = 600) => `${w} ${Math.round(px * fontK)}px system-ui, sans-serif`;

    const X = (o: number) => -1 + 2 * (o - space.x0) / (space.x1 - space.x0 || 1);
    const Y = (r: number) => -1 + 2 * (r - space.yMin) / (space.yMax - space.yMin || 1);
    // Lịch sử trải từ sau (−1) tới 0,35; trung vị 0,68; kỳ tới ở trước cùng (1) — có khoảng hở để không chồng nhau.
    const nEv = space.ribbons.filter((r) => r.kind === "event").length;
    const Z = (i: number) => { const r = space.ribbons[i]; return r.kind === "median" ? 0.68 : r.kind === "current" ? 1 : nEv <= 1 ? 0 : -1 + 1.35 * i / (nEv - 1); };
    const P = (p: P3) => project(p, rot);
    const poly = (vs: P3[], close = false) => { const q = vs.map(P); ctx.beginPath(); q.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y))); if (close) ctx.closePath(); return q; };
    const dz = nEv > 1 ? 0.675 / (nEv - 1) : 0.3;
    const hitList: Hit[] = [];

    // Sàn (y = −1) + mặt lợi suất 0 + khung hộp: tạo chiều sâu thật như RRG 4D.
    poly([{ x: -1, y: -1, z: -1 - dz }, { x: 1, y: -1, z: -1 - dz }, { x: 1, y: -1, z: 1 + dz }, { x: -1, y: -1, z: 1 + dz }], true);
    ctx.fillStyle = "rgba(14,165,233,.05)"; ctx.fill(); ctx.strokeStyle = "rgba(56,189,248,.25)"; ctx.lineWidth = 1; ctx.stroke();
    const y0 = Y(0);
    poly([{ x: -1, y: y0, z: -1 - dz }, { x: 1, y: y0, z: -1 - dz }, { x: 1, y: y0, z: 1 + dz }, { x: -1, y: y0, z: 1 + dz }], true);
    ctx.fillStyle = "rgba(148,163,184,.05)"; ctx.fill(); ctx.setLineDash([4, 5]); ctx.strokeStyle = "rgba(148,163,184,.35)"; ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(100,116,139,.18)";
    for (const o of es.offsets) { poly([{ x: X(o), y: -1, z: -1 - dz }, { x: X(o), y: -1, z: 1 + dz }]); ctx.stroke(); }

    // Vùng mua (khối) + mặt thoát — đặc = ĐẠT KIỂM ĐỊNH v3, chấm = chưa đạt.
    if (win) {
      const a = X(win.entryFrom), b = X(Math.max(win.entryTo, win.entryFrom + 0.6)), ok = win.selected || tlMatch?.tier === "VALIDATED";
      const zA = -1 - dz, zB = 1 + dz;
      // Hành lang vùng mua chạy dọc trục Z (áp cho mọi đợt): nền sàn + hai vách đứng tại mốc vào đầu / cuối.
      poly([{ x: a, y: -1, z: zA }, { x: b, y: -1, z: zA }, { x: b, y: -1, z: zB }, { x: a, y: -1, z: zB }], true);
      ctx.fillStyle = ok ? "rgba(16,185,129,.16)" : "rgba(56,189,248,.12)"; ctx.fill();
      for (const xw of [a, b]) {
        poly([{ x: xw, y: -1, z: zA }, { x: xw, y: -1, z: zB }, { x: xw, y: 1, z: zB }, { x: xw, y: 1, z: zA }], true);
        ctx.fillStyle = ok ? "rgba(16,185,129,.06)" : "rgba(56,189,248,.04)"; ctx.fill();
        ctx.setLineDash(ok ? [] : [5, 4]); ctx.strokeStyle = ok ? "rgba(52,211,153,.6)" : "rgba(125,211,252,.5)"; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
      }
      const xe = X(win.exitOffset);
      poly([{ x: xe, y: -1, z: zA }, { x: xe, y: -1, z: zB }, { x: xe, y: 1, z: zB }, { x: xe, y: 1, z: zA }], true);
      ctx.fillStyle = "rgba(244,63,94,.05)"; ctx.fill(); ctx.setLineDash([3, 4]); ctx.strokeStyle = "rgba(251,113,133,.55)"; ctx.stroke(); ctx.setLineDash([]);
      const top = P({ x: a, y: 1, z: zB }), topE = P({ x: xe, y: 1, z: zB });
      ctx.font = font(11, 700); ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      ctx.fillStyle = ok ? "#6ee7b7" : "#7dd3fc";
      ctx.fillText(`VÙNG MUA${tlMatch ? ` ${dm(tlMatch.entryFromDate)}–${dm(tlMatch.entryToDate)}` : ""} · ${ok ? "ĐẠT KIỂM ĐỊNH" : "chưa đạt"}`, clamp(top.x, 4, W - 260 * fontK), clamp(top.y - 4, 16, H));
      ctx.fillStyle = "#fda4af"; ctx.textAlign = topE.x > W - 140 * fontK ? "right" : "left";
      ctx.fillText(`THOÁT${tlMatch ? ` ${dm(tlMatch.exitDate)}` : ` ${win.exitOffset > 0 ? "+" : ""}${win.exitOffset}`}`, clamp(topE.x + (topE.x > W - 140 * fontK ? -4 : 4), 4, W - 4), clamp(topE.y + 14 * fontK, 16, H));
    }

    // Vẽ từng đợt từ sau ra trước (độ sâu của tâm dải).
    const order = space.ribbons.map((r, i) => ({ r, i, d: P({ x: 0, y: -1, z: Z(i) }).depth })).sort((a, b) => b.d - a.d);
    for (const { r, i } of order) {
      const z = Z(i);
      // W — thảm ESA ngày trên sàn.
      if (showEsa) for (const c of r.cells) {
        const col = esaColor(c); if (!col) continue;
        poly([{ x: X(c.offset - 0.5), y: -1, z: z - dz * 0.42 }, { x: X(c.offset + 0.5), y: -1, z: z - dz * 0.42 }, { x: X(c.offset + 0.5), y: -1, z: z + dz * 0.42 }, { x: X(c.offset - 0.5), y: -1, z: z + dz * 0.42 }], true);
        ctx.fillStyle = col; ctx.fill();
      }
      // Đường lợi suất của đợt.
      if (r.points.length > 1) {
        const q = poly(r.points.map((p) => ({ x: X(p.offset), y: Y(p.ret), z })));
        const win2 = r.windowNet;
        ctx.strokeStyle = r.kind === "median" ? "#67e8f9" : r.kind === "current" ? "#fbbf24"
          : showOutcome && win2 != null ? (win2 > 0 ? "rgba(52,211,153,.85)" : "rgba(251,113,133,.85)") : "rgba(203,213,225,.6)";
        ctx.lineWidth = r.kind === "event" ? 1.6 : 2.6; ctx.setLineDash(r.kind === "current" ? [6, 4] : []); ctx.stroke(); ctx.setLineDash([]);
        q.forEach((v, k) => { hitList.push({ x: v.x, y: v.y, ribbon: r, offset: r.points[k].offset, ret: r.points[k].ret, cell: r.cells.find((c) => c.offset === r.points[k].offset) ?? null }); });
      } else if (r.kind === "current" && r.points.length === 1) {
        const v = P({ x: X(r.points[0].offset), y: Y(r.points[0].ret), z }); ctx.beginPath(); ctx.arc(v.x, v.y, 3, 0, Math.PI * 2); ctx.fillStyle = "#fbbf24"; ctx.fill();
      }
      // Phiên ESA bất thường: chấm ngay trên đường lợi suất của chính đợt đó (vị trí theo nội suy giữa hai mốc v3).
      if (showEsa) for (const c of r.cells) {
        if (c.esa.level === "none") continue;
        const rr = retAt(r, c.offset); if (rr == null) continue;
        const t = P({ x: X(c.offset), y: Y(rr), z });
        ctx.beginPath(); ctx.arc(t.x, t.y, c.esa.level === "high" ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = c.esa.level === "high" ? "#f43f5e" : "#f97316"; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(5,10,20,.9)"; ctx.stroke();
        hitList.push({ x: t.x, y: t.y, ribbon: r, offset: c.offset, ret: rr, cell: c });
      }
      // Nhãn dải (đầu trái, quay về màn hình).
      // lịch sử ghi ở đầu trái; trung vị / kỳ tới ghi ở đầu phải (hai dải trước cùng không chồng nhãn với lịch sử)
      const lp = P({ x: r.kind === "event" ? -1 : 1, y: -1, z });
      ctx.font = font(r.kind === "event" ? 9 : 10, r.kind === "event" ? 600 : 700); ctx.textAlign = r.kind === "event" ? "right" : "left"; ctx.textBaseline = "middle";
      ctx.fillStyle = r.kind === "median" ? "#67e8f9" : r.kind === "current" ? "#fbbf24" : "#94a3b8";
      if (r.kind === "event") ctx.fillText(r.label, clamp(lp.x - 6, 60 * fontK, W), lp.y);
      else ctx.fillText(r.label, clamp(lp.x + 6, 4, W - 90 * fontK), lp.y + (r.kind === "median" ? -7 : 7) * fontK);
    }

    // Quạt dự phóng có điều kiện trên dải KỲ TỚI (mặt z của kỳ tới): dải ngoài CQR, dải trong HD có trọng số, đường giữa chấm.
    const curIdx = space.ribbons.findIndex((r) => r.kind === "current");
    if (fan && fan.points.length && curIdx >= 0) {
      const zc = Z(curIdx), s0 = { x: X(fan.todayOff), y: Y(Math.expm1(fan.anchorCar)), z: zc };
      const sheet = (lo: (p: FanPoint) => number, hi: (p: FanPoint) => number, fill: string) => {
        poly([s0, ...fan.points.map((p) => ({ x: X(p.offset), y: Y(hi(p)), z: zc })), ...[...fan.points].reverse().map((p) => ({ x: X(p.offset), y: Y(lo(p)), z: zc }))], true);
        ctx.fillStyle = fill; ctx.fill();
      };
      if (fan.points[0].loAdj != null) sheet((p) => p.loAdj!, (p) => p.hiAdj!, "rgba(252,211,77,.10)");
      sheet((p) => p.lo, (p) => p.hi, "rgba(252,211,77,.22)");
      poly([s0, ...fan.points.map((p) => ({ x: X(p.offset), y: Y(p.mid), z: zc }))]);
      ctx.setLineDash([5, 3]); ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 1.8; ctx.stroke(); ctx.setLineDash([]);
      const fr = { ...space.ribbons[curIdx], label: "Dự phóng (trung vị)", windowNet: null };
      for (const p of fan.points) { const v = P({ x: X(p.offset), y: Y(p.mid), z: zc }); hitList.push({ x: v.x, y: v.y, ribbon: fr, offset: p.offset, ret: p.mid, cell: null }); }
    }
    // Sự kiện (mặt x = 0) và HÔM NAY (trên dải kỳ tới) + điểm ESA LIVE.
    const xs0 = X(0);
    poly([{ x: xs0, y: -1, z: -1 - dz }, { x: xs0, y: -1, z: 1 + dz }, { x: xs0, y: 1, z: 1 + dz }, { x: xs0, y: 1, z: -1 - dz }], true);
    ctx.strokeStyle = "rgba(226,232,240,.45)"; ctx.lineWidth = 1.1; ctx.stroke();
    const ev = P({ x: xs0, y: -1, z: 1 + dz });
    ctx.font = font(10, 700); ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "#e2e8f0"; ctx.fillText(eventWord.toUpperCase(), ev.x, ev.y + 4);
    const cur = space.ribbons.find((r) => r.kind === "current");
    if (cur && todayOff != null && todayOff >= space.x0 && todayOff <= space.x1) {
      const zi = Z(space.ribbons.indexOf(cur)), xt = X(todayOff);
      const rr = retAt(cur, todayOff) ?? cur.points[cur.points.length - 1]?.ret ?? 0;
      const b = P({ x: xt, y: -1, z: zi }), t = P({ x: xt, y: Y(rr), z: zi });
      ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t.x, t.y); ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
      const live = esa?.status === "research_only" && esa.observation;
      const sev = esa?.alert?.severity;
      const ring = sev === "high_anomaly" ? "#f43f5e" : sev === "unusual_activity" ? "#f97316" : live ? "#fbbf24" : "#64748b";
      ctx.beginPath(); ctx.arc(t.x, t.y, 7, 0, Math.PI * 2); ctx.fillStyle = "rgba(5,10,20,.9)"; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = ring; ctx.stroke();
      if (sev) { ctx.beginPath(); ctx.arc(t.x, t.y, 12, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = ring; ctx.stroke(); }
      const txt = `HÔM NAY (${todayOff > 0 ? "+" : ""}${todayOff})${live ? ` · ESA ${num(esa!.observation!.relativeVolume, 2)}×${sev ? " BẤT THƯỜNG" : ""}` : ""}`;
      ctx.font = font(10, 700); const tw = ctx.measureText(txt).width + 10;
      const lx = clamp(t.x - tw / 2, 4, W - tw - 4), ly = clamp(t.y - 30 * fontK, 4, H - 20);
      ctx.fillStyle = "rgba(5,10,20,.88)"; ctx.fillRect(lx, ly, tw, 18 * fontK); ctx.strokeStyle = ring; ctx.lineWidth = 1; ctx.strokeRect(lx, ly, tw, 18 * fontK);
      ctx.fillStyle = "#fde68a"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(txt, lx + 5, ly + 9 * fontK);
    }

    // Trục + nhãn mốc phiên ở cạnh trước.
    ctx.font = font(9); ctx.fillStyle = "#64748b"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    let lastX = -1e9;
    for (const o of es.offsets) { const v = P({ x: X(o), y: -1, z: 1 + dz }); if (Math.abs(v.x - lastX) < 22 * fontK) continue; lastX = v.x; ctx.fillText(o > 0 ? `+${o}` : String(o), v.x, v.y + 18 * fontK); }
    const ax = [
      { a: { x: -1, y: -1, z: 1 + dz }, b: { x: 1.12, y: -1, z: 1 + dz }, c: "#60a5fa", t: `X · phiên so với ${eventWord}` },
      { a: { x: -1, y: -1, z: 1 + dz }, b: { x: -1, y: 1.15, z: 1 + dz }, c: "#4ade80", t: "Y · lợi suất vượt VN-Index" },
      { a: { x: 1, y: -1, z: 1 + dz }, b: { x: 1, y: -1, z: -1 - dz * 2.2 }, c: "#fbbf24", t: "Z · đợt (mới ở trước)" },
    ];
    for (const a of ax) {
      const s = P(a.a), e = P(a.b);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.strokeStyle = a.c; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.font = font(10, 700); ctx.fillStyle = a.c; ctx.textAlign = e.x > W - 200 ? "right" : "left"; ctx.textBaseline = "bottom";
      ctx.fillText(a.t, clamp(e.x + (e.x > W - 200 ? -4 : 6), 4, W - 4), clamp(e.y - 4, 14 * fontK, H - 4));
    }
    // Nhãn mức lợi suất trên trục Y.
    ctx.font = font(9); ctx.fillStyle = "#64748b"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (const r of [space.yMin, 0, space.yMax]) { const v = P({ x: -1, y: Y(r), z: 1 + dz }); ctx.fillText(`${(r * 100).toFixed(0)}%`, v.x - 6, v.y); }
    hits.current = hitList;
  }, [space, rot, showEsa, showOutcome, win, tlMatch, todayOff, esa, eventWord, es.offsets, fontK, fan]);

  const at = (e: PointerEvent<HTMLCanvasElement>) => { const b = e.currentTarget.getBoundingClientRect(); return { x: (e.clientX - b.left) * W / b.width, y: (e.clientY - b.top) * H / b.height }; };
  const nearest = (p: { x: number; y: number }) => hits.current.reduce<Hit | null>((best, h) => { const d = Math.hypot(h.x - p.x, h.y - p.y); return d < 22 && (!best || d < Math.hypot(best.x - p.x, best.y - p.y)) ? h : best; }, null);
  const onDown = (e: PointerEvent<HTMLCanvasElement>) => { drag.current = { ...at(e), moved: false }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = at(e), d = drag.current;
    if (d && (e.buttons & 1) === 1) {
      const dx = p.x - d.x, dy = p.y - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      if (d.moved) setRot((r) => ({ ...r, yaw: r.yaw + dx * 0.008, pitch: clamp(r.pitch + dy * 0.008, -1.25, 1.25) }));
      d.x = p.x; d.y = p.y; return;
    }
    setHover(nearest(p));
  };
  const onUp = (e: PointerEvent<HTMLCanvasElement>) => { const d = drag.current; drag.current = null; if (!d?.moved) setHover(nearest(at(e))); };
  const onWheel = (e: WheelEvent<HTMLCanvasElement>) => { e.preventDefault(); setRot((r) => ({ ...r, zoom: clamp(r.zoom * (e.deltaY < 0 ? 1.08 : 0.93), 0.6, 1.9) })); };

  const evRibbons = space.ribbons.filter((r) => r.kind === "event");
  const inWin = (c: SpaceCell) => win != null && c.offset >= win.entryFrom && c.offset <= win.exitOffset;
  const btn = (on: boolean) => `min-h-[26px] rounded border px-2 text-[10px] ${on ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200" : "border-white/10 text-slate-400"}`;

  return (
    <div data-testid="timing-space-3d">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
        <button type="button" className={btn(showEsa)} aria-pressed={showEsa} onClick={() => setShowEsa((v) => !v)} data-testid="space-toggle-esa">W · Thảm ESA ngày</button>
        <button type="button" className={btn(showOutcome)} aria-pressed={showOutcome} onClick={() => setShowOutcome((v) => !v)} data-testid="space-toggle-outcome">Tô thắng / thua cửa sổ</button>
        <button type="button" className={btn(false)} onClick={() => { setRot(DEFAULT_ROT); setHover(null); }}>Đặt lại góc nhìn</button>
        <span className="ml-auto" data-testid="space-esa-summary">
          {barsLoading && !bars.length ? "Đang tải nến ngày cho ESA…" : `ESA ngày: ${space.anomalies} phiên bất thường / ${space.cellsWithEsa} phiên chấm được`}
        </span>
      </div>
      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-[#080d18]">
        <canvas ref={canvasRef} width={W} height={H} data-testid="timing-space-canvas" role="img"
          aria-label={`Không gian thời điểm 3D ${es.ticker}: X phiên so với ${eventWord}, Y lợi suất vượt VN-Index tích luỹ, Z ${evRibbons.length} đợt lịch sử, trung vị và kỳ tới; màu thảm W là độ bất thường giá trị giao dịch (ESA ngày). Kéo để xoay, cuộn để zoom; bảng số liệu bên dưới.`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => { if (!drag.current) setHover(null); }} onWheel={onWheel}
          style={{ display: "block", width: "100%", height: "auto", aspectRatio: `${W} / ${H}`, cursor: "grab", touchAction: "none" }} />
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-slate-950/80 px-2 py-1 text-[10px] text-slate-300">3D · kéo để xoay · cuộn để zoom · {Math.round(rot.zoom * 100)}%</div>
        {hover && (
          <div aria-live="polite" data-testid="space-hover" className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-16px)] rounded-md border border-slate-700 bg-slate-950/90 px-2.5 py-1.5 text-[10px] text-slate-200 sm:max-w-[400px]">
            <b className={hover.ribbon.kind === "current" ? "text-amber-300" : hover.ribbon.kind === "median" ? "text-cyan-300" : "text-slate-100"}>{hover.ribbon.kind === "event" ? `${eventWord} ${hover.ribbon.label}` : hover.ribbon.label}</b>
            {" "}· phiên {hover.offset > 0 ? "+" : ""}{hover.offset}{hover.cell ? ` (${dm(hover.cell.date)}/${hover.cell.date.slice(2, 4)})` : ""} · lợi suất vượt {pct(hover.ret)}
            {hover.cell?.esa.z != null && <> · ESA ngày z {num(hover.cell.esa.z)} · {num(hover.cell.esa.rv, 2)}× trung vị 20 phiên{hover.cell.esa.level !== "none" ? (hover.cell.esa.level === "high" ? " · BẤT THƯỜNG CAO" : " · bất thường") : ""}</>}
            {hover.ribbon.windowNet != null && <> · cửa sổ đang xem: ròng {pct(hover.ribbon.windowNet)}</>}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
        <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-emerald-400/80 align-middle" />đợt thắng cửa sổ</span>
        <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-rose-400/80 align-middle" />đợt thua</span>
        <span><i className="mr-1 inline-block h-0.5 w-4 bg-cyan-300 align-middle" />trung vị</span>
        <span><i className="mr-1 inline-block h-0.5 w-4 border-t-2 border-dashed border-amber-300 align-middle" />kỳ tới (tới hôm nay)</span>
        <span><i className="mr-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ background: "linear-gradient(90deg, rgba(251,191,36,.15), rgba(251,191,36,.5), #f97316, #f43f5e)" }} />W · ESA ngày: z 1 → 3 → ≥ {ESA_DAILY.zHigh}</span>
      </div>
      <details className="mt-1.5 text-[10px] text-slate-400">
        <summary className="cursor-pointer text-slate-300">Bảng số liệu từng đợt</summary>
        <div className="mt-1 max-h-56 overflow-auto">
          <table className="w-full min-w-[520px] border-collapse" data-testid="space-table">
            <thead><tr className="text-left text-slate-500"><th className="p-1">Đợt</th><th className="p-1">Vào ({win ? win.entryTo : "—"})</th><th className="p-1">Thoát ({win ? win.exitOffset : "—"})</th><th className="p-1">Ròng cửa sổ</th><th className="p-1">ESA bất thường trong vào→thoát</th><th className="p-1">z lớn nhất</th></tr></thead>
            <tbody>{space.ribbons.filter((r) => r.kind !== "median").map((r) => {
              const cs = r.cells.filter(inWin), mx = cs.reduce<number | null>((m, c) => (c.esa.z == null ? m : m == null ? c.esa.z : Math.max(m, c.esa.z)), null);
              return <tr key={r.key} className="border-t border-white/5"><td className="p-1 text-slate-200">{r.kind === "current" ? r.label : `${eventWord} ${r.label}`}</td>
                <td className="p-1">{win ? pct(retAt(r, win.entryTo)) : "—"}</td><td className="p-1">{win ? pct(retAt(r, win.exitOffset)) : "—"}</td>
                <td className={`p-1 ${r.windowNet == null ? "" : r.windowNet > 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(r.windowNet)}</td>
                <td className="p-1">{cs.filter((c) => c.esa.level !== "none").length}/{cs.length}</td><td className="p-1">{num(mx)}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </details>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
        W = <b>ESA ngày</b>: giá trị giao dịch phiên so với 20 phiên liền trước (trung vị + 1,4826 × MAD như ESA R0; bất thường khi z ≥ {ESA_DAILY.z} và ≥ {ESA_DAILY.rv}× trung vị) — mô tả hoạt động quanh sự kiện, <b>chưa kiểm định</b> khả năng dự báo lợi suất.
        Điểm tròn HÔM NAY = <b>ESA intraday R0</b> trực tiếp ({esa ? esa.status === "research_only" ? `${esa.method.version}, ${esa.observation?.observedMinute ?? ""}` : esa.reason ?? esa.status : "chưa tải"}).
        Đường giữa hai mốc v3 là nối thẳng; chấm ESA đặt theo nội suy chỉ để định vị.
        {space.ribbons.some((r) => r.derived) && <> Đường KỲ TỚI tự tính từ giá đóng cửa so VN-Index (neo 0 tại phiên {es.offsets[0]}, chưa qua {eventWord} nên chưa có cổ tức xen giữa).</>}
      </p>
    </div>
  );
}
