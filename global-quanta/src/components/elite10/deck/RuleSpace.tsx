// Command Deck — Z4b "Không gian quy tắc Elite HL": 2D (LS-v1 × mô hình TA) và 3D (× góc RRG ngành). Điểm = hlScores của dự án trên
// bảng tín hiệu E1 (đã đối chiếu 279/279 mã với hàm Gateway — deckModel.test). Vùng / mặt / khối vẽ đúng hằng số quy tắc.
// 3D: phép chiếu phối cảnh tự viết trên canvas (không thư viện); vẽ lại chỉ khi kéo / phím / đổi kích thước; xoay mở màn 1 lần.
import { useEffect, useMemo, useRef } from "react";
import type { HlRowIn } from "../../../lib/elite10/confluence";
import { ruleSpace, type SpacePoint } from "../../../lib/elite10/deckModel";
import { num } from "../center/boardParts";
import { DeckPanel } from "./parts";

const RRG_C: Record<string, string> = { "2": "#10B981", "1": "#2DD4BF", "-1": "#F59E0B", "-2": "#F43F5E", null: "#475569" };
const RRG_VI: Record<string, string> = { "2": "Dẫn dắt", "1": "Cải thiện", "-1": "Suy yếu", "-2": "Tụt hậu" };
const CLS_VI: Record<string, string> = { STRONG: "Hợp lưu mạnh", CONFLUENCE: "Hợp lưu", T1_SECTOR_AGAINST: "Ngành phản đối", T1_SECTOR_NA: "Chưa có RRG", NOT_T1: "Chưa đạt tầng 1" };
const ORDER = { rest: 0, t1: 1, sel: 2, queue: 3, held: 4 } as const;
interface Rules { exitLsPct: number; exitTaMin: number; lsLeaderPct: number; taMin: number }

function Map2D({ points, R, narrow }: { points: SpacePoint[]; R: Rules; narrow: boolean }) {
  const W = narrow ? 300 : 560, H = narrow ? 290 : 320, L = narrow ? 36 : 44, Rm = 10, T = 16, B = narrow ? 34 : 40, FS = narrow ? 10 : 12;
  const X = (ls: number) => L + ls / 100 * (W - L - Rm), Y = (ta: number) => H - B - (ta + 0.5) / 7.5 * (H - T - B);
  const sorted = [...points].sort((a, b) => ORDER[a.role] - ORDER[b.role]);
  const placed: [number, number, number][] = [];
  const label = (p: SpacePoint) => {
    const held = p.role === "held", x = X(p.ls), y = Y(p.ta + p.j * 0.55), w = p.t.length * (held ? 7.2 : 6.2) * (FS / 10) + 2, x0 = x > W - 70 ? x - 9 - w : x + 9;
    for (const dy of [0, -FS - 2, FS + 2, -2 * FS - 4, 2 * FS + 4]) {
      const y0 = y - 7 + dy;
      if (!placed.some((b) => x0 < b[0] + b[2] && b[0] < x0 + w && y0 - FS < b[1] && b[1] - FS < y0)) { placed.push([x0, y0, w]); return <text key={`l-${p.t}`} x={x0} y={y0} fill={held ? "#F5CE72" : "#94A3B8"} fontSize={held ? FS + 1 : FS} fontWeight={held ? 700 : 500} fontFamily="Space Grotesk">{p.t}</text>; }
    }
    return null;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full rounded-lg border border-white/10 bg-[#06090E]" role="img" aria-label={`Bản đồ quy tắc: ${points.length} mã theo LS-v1 và số mô hình TA`} data-testid="deck-space-2d">
      <rect x={X(R.lsLeaderPct)} y={Y(7)} width={X(100) - X(R.lsLeaderPct)} height={Y(R.taMin - 0.5) - Y(7)} fill="rgba(232,184,75,.08)" stroke="rgba(232,184,75,.45)" strokeDasharray="3 3" />
      <rect x={X(0)} y={Y(7)} width={X(R.exitLsPct) - X(0)} height={Y(-0.5) - Y(7)} fill="rgba(244,63,94,.06)" />
      <rect x={X(0)} y={Y(R.exitTaMin - 0.5)} width={X(100) - X(0)} height={Y(-0.5) - Y(R.exitTaMin - 0.5)} fill="rgba(244,63,94,.06)" />
      {[0, 20, 40, 60, 80, 100].map((v) => <g key={v}><line x1={X(v)} y1={T} x2={X(v)} y2={H - B} stroke="rgba(255,255,255,.05)" /><text x={X(v)} y={H - B + FS + 4} fill="#748299" fontSize={FS} textAnchor="middle" fontFamily="IBM Plex Mono">{v}</text></g>)}
      {Array.from({ length: 8 }, (_, i) => <text key={i} x={L - 8} y={Y(i) + 3} fill="#748299" fontSize={FS} textAnchor="end" fontFamily="IBM Plex Mono">{i}</text>)}
      <line x1={X(R.exitLsPct)} y1={T} x2={X(R.exitLsPct)} y2={H - B} stroke="#F43F5E" strokeDasharray="4 3" data-testid="deck-space-exit-line" data-ls={R.exitLsPct} />
      <text x={X(R.exitLsPct) - 4} y={T + FS} textAnchor="end" fill="#F43F5E" fontSize={FS} fontFamily="Space Grotesk">{narrow ? `bán ${R.exitLsPct}` : `ngưỡng bán LS ${R.exitLsPct}`}</text>
      <text x={X(R.lsLeaderPct) + 4} y={T + FS} fill="#F5CE72" fontSize={FS} fontFamily="Space Grotesk">tầng 1</text>
      <text x={(L + W) / 2} y={H - 6} fill="#94A3B8" fontSize={FS} textAnchor="middle" fontFamily="Space Grotesk">Sức mạnh dẫn dắt LS-v1 (phân vị trong bảng tín hiệu)</text>
      <text x={FS + 2} y={(T + H - B) / 2} fill="#94A3B8" fontSize={FS} textAnchor="middle" fontFamily="Space Grotesk" transform={`rotate(-90 ${FS + 2} ${(T + H - B) / 2})`}>Mô hình TA đạt (/7)</text>
      {sorted.map((p) => {
        const x = X(p.ls), y = Y(p.ta + p.j * 0.55), tip = `${p.t} · LS ${num(p.ls, 1)} · TA ${p.ta}/7 · ngành ${RRG_VI[String(p.rrg)] ?? "—"} · ${CLS_VI[p.cls] ?? p.cls}`;
        if (p.role === "held") return <circle key={p.t} cx={x} cy={y} r="7" fill="#E8B84B" stroke="#080B11" strokeWidth="2" data-role="held"><title>{tip} · đang giữ</title></circle>;
        if (p.role === "queue") return <circle key={p.t} cx={x} cy={y} r="5.5" fill="none" stroke="#F5CE72" strokeWidth="1.6" data-role="queue"><title>{tip} · hàng chờ</title></circle>;
        return <circle key={p.t} cx={x} cy={y} r={p.role === "rest" ? 2.1 : 3.4} fill={p.role === "rest" ? "#334155" : RRG_C[String(p.rrg)]} opacity={p.role === "rest" ? 0.75 : 0.95} data-role={p.role}><title>{tip}</title></circle>;
      })}
      {sorted.filter((p) => p.role === "held" || (p.role === "queue" && !narrow)).sort((a, b) => ORDER[b.role] - ORDER[a.role]).map(label)}
    </svg>
  );
}

function Space3D({ points, R, narrow }: { points: SpacePoint[]; R: Rules; narrow: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const g = cv.getContext("2d"); if (!g) return;
    const W = cv.width, H = cv.height, reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nx = (ls: number) => (ls - 50) / 50, ny = (ta: number) => (ta - 3.5) / 3.5, nz = (r: number | null) => (r == null ? 0 : r / 2);
    const P = points.map((p) => ({ p, x: nx(p.ls), y: ny(p.ta + p.j * 0.5), z: nz(p.rrg) + (p.rrg == null ? p.j * 0.3 : p.j * 0.12) }));
    let yaw = -0.62, pitch = 0.42, raf = 0;
    const proj = (x: number, y: number, z: number): [number, number, number, number] => {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy, y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp, k = 3.4 / (3.4 + z2) * H * 0.34;
      return [W / 2 + x1 * k * 1.12, H / 2 - y1 * k, z2, k];
    };
    const line = (a: number[], b: number[], c: string, w = 1) => { const [x1, y1] = proj(a[0], a[1], a[2]), [x2, y2] = proj(b[0], b[1], b[2]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokeStyle = c; g.lineWidth = w; g.stroke(); };
    const poly = (pts: number[][], fill: string, stroke?: string) => { g.beginPath(); pts.forEach((q, i) => { const [a, b] = proj(q[0], q[1], q[2]); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.closePath(); g.fillStyle = fill; g.fill(); if (stroke) { g.setLineDash([6, 5]); g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]); } };
    const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: string) => { const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]; [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => line(v[a], v[b], c, 1.6)); };
    const text = (s: string, at: number[], c: string, size: number, align: CanvasTextAlign = "center") => { const [x, y] = proj(at[0], at[1], at[2]); g.fillStyle = c; g.font = `600 ${size}px "Space Grotesk", sans-serif`; g.textAlign = align; g.fillText(s, x, y); };
    const draw = () => {
      g.clearRect(0, 0, W, H);
      for (let i = 0; i <= 5; i++) { const x = -1 + i * 0.4; line([x, -1, -1], [x, -1, 1], "rgba(255,255,255,.06)"); }
      for (let i = 0; i <= 4; i++) { const z = -1 + i * 0.5; line([-1, -1, z], [1, -1, z], "rgba(255,255,255,.06)"); }
      box(-1, 1, -1, 1, -1, 1, "rgba(255,255,255,.10)");
      const ex = nx(R.exitLsPct); poly([[ex, -1, -1], [ex, 1, -1], [ex, 1, 1], [ex, -1, 1]], "rgba(244,63,94,.07)", "rgba(244,63,94,.55)");
      const lx = nx(R.lsLeaderPct), ty = ny(R.taMin - 0.5), sz = nz(1) - 0.12;
      poly([[lx, ty, sz], [1, ty, sz], [1, 1, sz], [lx, 1, sz]], "rgba(232,184,75,.05)"); box(lx, 1, ty, 1, sz, 1, "rgba(232,184,75,.7)");
      text("LS-v1 →", [0, -1.18, -1.12], "#94A3B8", 19); text("TA ↑", [-1.13, 0, -1], "#94A3B8", 19, "right");
      text("RRG: Tụt hậu", [1.08, -1.14, -1], "#F43F5E", 16, "left"); text("RRG: Dẫn dắt", [-1.08, -1.14, 1], "#10B981", 16, "right");
      text(`ngưỡng bán ${R.exitLsPct}`, [ex, 1.1, -1], "#F43F5E", 17); text("vùng được chọn", [(lx + 1) / 2, 1.12, 1], "#F5CE72", 17);
      const pr = P.map((q) => { const [x, y, z, k] = proj(q.x, q.y, q.z); return { q, x, y, z, k }; }).sort((a, b) => b.z - a.z);
      const tags: { t: string; x: number; y: number; size: number }[] = [];
      for (const { q, x, y, k } of pr) {
        const s = k / 210, p = q.p;
        if (p.role === "held") { g.beginPath(); g.arc(x, y, 9 * s, 0, 7); g.fillStyle = "#E8B84B"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#080B11"; g.stroke(); tags.push({ t: p.t, x: x + 12 * s, y: y - 9 * s, size: Math.round(19 * s) }); }
        else if (p.role === "queue") { g.beginPath(); g.arc(x, y, 7 * s, 0, 7); g.lineWidth = 2.4; g.strokeStyle = "#F5CE72"; g.stroke(); }
        else { g.beginPath(); g.arc(x, y, (p.role === "rest" ? 3 : 4.6) * s, 0, 7); g.fillStyle = p.role === "rest" ? "rgba(71,85,105,.75)" : RRG_C[String(p.rrg)]; g.fill(); }
      }
      const lbl: number[][] = []; g.textAlign = "left";
      for (const tg of tags.sort((a, b) => a.y - b.y)) {
        g.font = `700 ${tg.size}px "Space Grotesk", sans-serif`; const w = g.measureText(tg.t).width; let y = tg.y;
        for (let i = 0; i < 8 && lbl.some((b) => tg.x < b[0] + b[2] && b[0] < tg.x + w && Math.abs(b[1] - y) < tg.size + 2); i++) y += tg.size + 2;
        if (y !== tg.y) { g.beginPath(); g.moveTo(tg.x - 4, tg.y); g.lineTo(tg.x - 2, y - tg.size * 0.3); g.strokeStyle = "rgba(245,206,114,.5)"; g.lineWidth = 1; g.stroke(); }
        g.fillStyle = "#F5CE72"; g.fillText(tg.t, tg.x, y); lbl.push([tg.x, y, w]);
      }
    };
    draw();
    void document.fonts?.ready?.then(draw);
    if (!reduce && typeof requestAnimationFrame === "function") {
      const t0 = performance.now(), from = -1.05; yaw = from;
      const step = (t: number) => { const u = Math.min(1, (t - t0) / 1400), e = 1 - Math.pow(1 - u, 3); yaw = from + (-0.62 - from) * e; draw(); if (u < 1) raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    }
    let drag: number[] | null = null;
    const down = (e: PointerEvent) => { cancelAnimationFrame(raf); drag = [e.clientX, e.clientY, yaw, pitch]; cv.setPointerCapture?.(e.pointerId); };
    const move = (e: PointerEvent) => { if (!drag) return; yaw = drag[2] + (e.clientX - drag[0]) * 0.008; pitch = Math.max(-0.2, Math.min(1.2, drag[3] + (e.clientY - drag[1]) * 0.006)); draw(); };
    const up = () => { drag = null; };
    const key = (e: KeyboardEvent) => { const m: Record<string, () => void> = { ArrowLeft: () => { yaw -= 0.1; }, ArrowRight: () => { yaw += 0.1; }, ArrowUp: () => { pitch = Math.min(1.2, pitch + 0.08); }, ArrowDown: () => { pitch = Math.max(-0.2, pitch - 0.08); } }; if (!m[e.key]) return; e.preventDefault(); cancelAnimationFrame(raf); m[e.key](); draw(); };
    cv.addEventListener("pointerdown", down); cv.addEventListener("pointermove", move); cv.addEventListener("pointerup", up); cv.addEventListener("keydown", key);
    return () => { cancelAnimationFrame(raf); cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointermove", move); cv.removeEventListener("pointerup", up); cv.removeEventListener("keydown", key); };
  }, [points, R, narrow]);
  return <canvas ref={ref} width={narrow ? 720 : 1120} height={narrow ? 620 : 640} tabIndex={0} className="block h-auto w-full cursor-grab touch-none rounded-lg border border-white/10 bg-[#06090E] active:cursor-grabbing" role="img"
    aria-label={`Không gian 3 chiều: LS-v1, mô hình TA, góc RRG ngành của ${points.length} mã; khối vàng = vùng được chọn (tầng 1 và ngành ủng hộ); mặt đỏ = ngưỡng bán LS ${R.exitLsPct}. Dùng phím mũi tên để xoay.`} data-testid="deck-space-3d" />;
}

export default function RuleSpace({ rows, panelDate, held, queued, rule, tier1, funnel }: {
  rows: HlRowIn[] | null | undefined; panelDate: string | null | undefined; held: Set<string>; queued: Set<string>;
  rule: { exitLsPct: number; exitTaMin: number }; tier1: { lsLeaderPct: number; taMin: number }; funnel: { tier1: number; selected: number; held: number };
}) {
  const sp = useMemo(() => (rows?.length ? ruleSpace(rows, held, queued) : null), [rows, held, queued]);
  const R = useMemo(() => ({ exitLsPct: rule.exitLsPct, exitTaMin: rule.exitTaMin, lsLeaderPct: tier1.lsLeaderPct, taMin: tier1.taMin }), [rule.exitLsPct, rule.exitTaMin, tier1.lsLeaderPct, tier1.taMin]);
  const narrow = typeof window !== "undefined" && window.innerWidth < 720;
  if (!sp) return null;
  const consistent = sp.tier1 === funnel.tier1 && sp.selected === funnel.selected;
  const heldPts = sp.points.filter((p) => p.role === "held" || p.role === "queue");
  return (
    <DeckPanel title={`Không gian quy tắc Elite HL · ${sp.points.length}/${sp.total} mã có LS-v1`} meta={`bảng tín hiệu phiên ${panelDate ?? "—"} · hàm Hợp lưu HL-v1`} testId="deck-space">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">2D · Tầng 1: LS-v1 × mô hình TA</p><Map2D points={sp.points} R={R} narrow={narrow} /></div>
        <div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">3D · Tầng 1 × tầng 2 (RRG ngành) — kéo hoặc dùng phím mũi tên để xoay</p><Space3D points={sp.points} R={R} narrow={narrow} /></div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-slate-400" data-testid="deck-space-legend">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#E8B84B] align-[-1px]" />Đang giữ</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-[1.6px] border-[#F5CE72] align-[-1px]" />Hàng chờ</span>
        {(["2", "1", "-1", "-2"] as const).map((k) => <span key={k}><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-[-1px]" style={{ background: RRG_C[k] }} />{RRG_VI[k]}</span>)}
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#334155] align-[-1px]" />Chưa đạt tầng 1</span>
        <span data-testid="deck-space-counts">· {sp.tier1} mã đạt tầng 1 · {sp.selected} đạt Hợp lưu · {funnel.held} đang giữ</span>
      </div>
      {!consistent && <p className="mt-1 text-[10.5px] text-amber-300" data-testid="deck-space-mismatch">Bảng tín hiệu đang tải khác phiên với quyết định (tầng 1 {sp.tier1} so với {funnel.tier1}) — số trên hình có thể lệch phễu.</p>}
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">Vị trí mỗi mã = đúng ba điều kiện của quy tắc chọn (tầng 1: LS-v1 ≥ {R.lsLeaderPct} và ≥ {R.taMin}/7 mô hình TA; tầng 2: ngành Cải thiện / Dẫn dắt). Số mô hình TA là số nguyên — điểm được rải nhẹ theo chiều dọc để không chồng nhau. Mô tả, không phải khuyến nghị.</p>
      <table className="sr-only"><caption>Mã đang giữ và hàng chờ trong không gian quy tắc</caption><thead><tr><th>Mã</th><th>Vai trò</th><th>LS-v1</th><th>TA</th><th>Ngành</th></tr></thead>
        <tbody>{heldPts.map((p) => <tr key={p.t}><td>{p.t}</td><td>{p.role === "held" ? "đang giữ" : "hàng chờ"}</td><td>{num(p.ls, 1)}</td><td>{p.ta}/7</td><td>{RRG_VI[String(p.rrg)] ?? "—"}</td></tr>)}</tbody></table>
    </DeckPanel>
  );
}
