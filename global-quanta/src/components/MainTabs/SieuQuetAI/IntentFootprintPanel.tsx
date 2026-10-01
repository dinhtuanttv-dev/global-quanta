import type { ReactNode } from "react";
import { useIntentFootprint, type IntentFootprint, type StealthWindow } from "../../../hooks/useIntentFootprint";

// Quy ước màu giữ như phần còn lại của dòng phụ: xanh lá = phía mua, đỏ = phía bán. Cặp này
// chỉ đạt ΔE 5,8 với người mù màu đỏ–lục nên LUÔN có mã hoá phụ: vị trí trên/dưới trục 0,
// đặc/rỗng (chủ động/thụ động), ký hiệu và nhãn chữ.
const BUY = "#059669";
const SELL = "#e11d48";
const NEUTRAL = "#64748b";
const ACCENT = "#0284c7";
const GRID = "rgba(148,163,184,0.18)";

const STATE_STYLE: Record<string, { color: string; solid: boolean; glyph: string }> = {
  ACC_ACTIVE: { color: BUY, solid: true, glyph: "▲" },
  ACC_PASSIVE: { color: BUY, solid: false, glyph: "◇" },
  DIST_ACTIVE: { color: SELL, solid: true, glyph: "▼" },
  DIST_PASSIVE: { color: SELL, solid: false, glyph: "◆" },
  NEUTRAL: { color: NEUTRAL, solid: true, glyph: "●" },
};
const FLAG_GLYPH: Record<string, string> = {
  absorbSelling: "◇", absorbBuying: "◆", initiativeBuy: "▲", initiativeSell: "▼", dryUp: "○", liquidityHole: "⚠",
};

const pct = (p: number | null | undefined, d = 0) => (p === null || p === undefined || !Number.isFinite(p) ? "—" : `${(p * 100).toFixed(d)}%`);
const fmtVol = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v), sign = v < 0 ? "−" : "";
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)} tr`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(0)} k`;
  return `${sign}${Math.round(a)}`;
};
const num = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "—" : v.toFixed(d));

function Box({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg p-2.5 ${className}`} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] text-slate-200 font-semibold">{title}</div>
        {right && <div className="text-[8.5px] text-slate-400">{right}</div>}
      </div>
      {children}
    </div>
  );
}

function Swatch({ id }: { id: string }) {
  const st = STATE_STYLE[id] ?? STATE_STYLE.NEUTRAL;
  return <span className="inline-block w-2.5 h-2.5 rounded-sm align-middle" style={st.solid ? { background: st.color } : { border: `1.5px solid ${st.color}` }} />;
}

/**
 * Xác suất 5 trạng thái ý đồ (HMM lọc tiến) của KHUNG GẦN NHẤT; phía trên là trạng thái CẢ
 * PHIÊN. Hai mức này khác nhau và không được trình bày lẫn (VD phiên bán ròng kết thúc bằng
 * một cú mua: khung cuối có thể "gom chủ động" nhưng cả phiên thì không).
 */
function IntentBars({ data }: { data: IntentFootprint }) {
  const intent = data.intent!;
  const session = data.sessionIntent;
  const validated = new Map((data.validation?.states ?? []).map((s) => [s.id, s]));
  return (
    <div className="space-y-1">
      {session && (
        <div className="rounded px-2 py-1 mb-1" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div className="text-[8.5px] text-slate-500">Cả phiên {session.date}</div>
          <div className="text-[10.5px] text-slate-100 font-semibold inline-flex items-center gap-1">
            <Swatch id={session.top.id} />{STATE_STYLE[session.top.id]?.glyph} {session.top.label} · {pct(session.top.p)}
          </div>
        </div>
      )}
      <div className="text-[8.5px] text-slate-500">Khung gần nhất{data.intentBucket ? ` (${data.intentBucket})` : ""}:</div>
      {[...intent.probs].sort((a, b) => b.p - a.p).map((p) => {
        const st = STATE_STYLE[p.id] ?? STATE_STYLE.NEUTRAL;
        const v = validated.get(p.id);
        return (
          <div key={p.id} className="text-[9.5px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 inline-flex items-center gap-1"><Swatch id={p.id} />{st.glyph} {p.label}</span>
              <span className={p.id === intent.top.id ? "text-slate-100 font-semibold" : "text-slate-400"}>{pct(p.p)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${p.p * 100}%`, background: st.solid ? st.color : "transparent", border: st.solid ? undefined : `1px solid ${st.color}` }} />
            </div>
            {v && p.id !== "NEUTRAL" && (
              <div className={`text-[8px] ${v.validated ? "text-emerald-400" : "text-slate-500"}`}>
                {v.validated ? `✓ ${v.verdict}` : "Chưa đủ bằng chứng kiểm chứng"}
              </div>
            )}
          </div>
        );
      })}
      <div className="text-[8.5px] text-slate-500 pt-1">
        {intent.confident ? "Trạng thái nổi trội ≥ 50%." : "Chưa có trạng thái nào vượt 50% — tín hiệu lẫn lộn."}
      </div>
    </div>
  );
}

/** Dải delta 17 khung: trên trục = mua chủ động ròng, dưới = bán; ký hiệu = cờ hấp thụ/đẩy/cạn/thủng. */
function DeltaStrip({ data }: { data: IntentFootprint }) {
  const buckets = data.today?.buckets ?? [];
  const W = 340, H = 86, mid = 40;
  const max = Math.max(...buckets.map((b) => Math.abs(b.delta ?? 0)), 1);
  const bw = W / Math.max(1, buckets.length);
  return (
    <svg viewBox={`0 0 ${W} ${H + 12}`} className="w-full h-28" role="img" aria-label="Dòng lệnh có dấu theo 17 khung trong phiên">
      <line x1={0} x2={W} y1={mid} y2={mid} stroke={GRID} />
      {buckets.map((b, i) => {
        const x = i * bw;
        const d = b.delta ?? 0;
        const h = Math.max(1, (Math.abs(d) / max) * (mid - 4));
        const up = d >= 0;
        const auction = b.delta === null || b.delta === undefined;
        const glyphs = b.flags.map((f) => FLAG_GLYPH[f]).join("");
        return (
          <g key={b.label}>
            <rect x={x} y={0} width={bw} height={H + 12} fill="transparent">
              <title>{`${b.label}: ${auction ? "khớp định kỳ (không tính chiều)" : `delta ${fmtVol(d)} (${pct(b.deltaPct, 0)} KL)`}${b.zEffort !== null && b.zEffort !== undefined ? ` · nỗ lực z=${num(b.zEffort, 1)} · kết quả z=${num(b.zResult, 1)}` : ""}${b.flags.length ? ` · ${b.flags.map((f) => data.flagLabels?.[f] ?? f).join("; ")}` : ""}${b.intent ? ` · ý đồ: ${b.intent.label} ${pct(b.intent.p)}` : ""}`}</title>
            </rect>
            {!auction && b.volume > 0 && <rect x={x + bw * 0.22} y={up ? mid - h : mid} width={bw * 0.56} height={h} rx={1.5} fill={up ? BUY : SELL} pointerEvents="none" />}
            {auction && b.volume > 0 && <rect x={x + bw * 0.3} y={mid - 2} width={bw * 0.4} height={4} fill={NEUTRAL} pointerEvents="none" />}
            {glyphs && <text x={x + bw / 2} y={H - 2} textAnchor="middle" fontSize={8} fill="#e2e8f0" pointerEvents="none">{glyphs}</text>}
            {b.intent && b.volume > 0 && !auction && <circle cx={x + bw / 2} cy={H - 14} r={2.4} fill={STATE_STYLE[b.intent.id]?.solid ? STATE_STYLE[b.intent.id].color : "none"} stroke={STATE_STYLE[b.intent.id]?.color ?? NEUTRAL} strokeWidth={1} pointerEvents="none" />}
            {(i % 2 === 0 || i === buckets.length - 1) && <text x={x + bw / 2} y={H + 9} textAnchor="middle" fontSize={6.5} fill="#94a3b8">{b.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Thước Stealth: z theo thứ hạng từ −3 đến +3 (âm = xả âm thầm, dương = gom âm thầm). */
function StealthGauge({ label, w }: { label: string; w: StealthWindow | null }) {
  if (!w) return <div className="text-[9px] text-slate-500">{label}: chưa đủ lịch sử</div>;
  const z = Math.max(-3, Math.min(3, w.z));
  const pos = ((z + 3) / 6) * 100;
  const color = w.z >= 1.5 ? BUY : w.z <= -1.5 ? SELL : NEUTRAL;
  return (
    <div className="text-[9px]">
      <div className="flex justify-between"><span className="text-slate-400">{label}</span><span className="text-slate-100 font-semibold">{w.reading} · z {num(w.z, 1)} · P{w.percentile}</span></div>
      <div className="relative h-2 rounded-full mt-0.5" style={{ background: `linear-gradient(90deg, rgba(225,29,72,0.35), rgba(100,116,139,0.25) 35%, rgba(100,116,139,0.25) 65%, rgba(5,150,105,0.35))` }}>
        <div className="absolute top-[-2px] w-1 h-3 rounded-sm" style={{ left: `calc(${pos}% - 2px)`, background: color, outline: "1px solid #0f1420" }} />
        <div className="absolute inset-y-0 w-px bg-slate-400/60" style={{ left: "50%" }} />
      </div>
      <div className="text-[8px] text-slate-500 mt-0.5">cường độ tay to {num(w.intensity * 100, 1)}% ADV · độ êm {num(w.quietness, 2)} · bền bỉ {pct(w.persistence)} · giá {num(w.ret, 2)}%</div>
    </div>
  );
}

/** Lũy kế dòng lệnh tay to (đường liền) và tay nhỏ (đường đứt) 20 phiên, chuẩn hoá theo ADV. */
function BigSmallChart({ data }: { data: NonNullable<IntentFootprint["bigSmall"]> }) {
  const W = 300, H = 70, s = data.series;
  if (!s.length) return null;
  const vals = s.flatMap((p) => [p.large, p.small]);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const y = (v: number) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8);
  const x = (i: number) => (i / Math.max(1, s.length - 1)) * W;
  const path = (k: "large" | "small") => s.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" role="img" aria-label="Dòng lệnh tay to và tay nhỏ 20 phiên">
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke={GRID} />
      <path d={path("large")} fill="none" stroke={ACCENT} strokeWidth={2} />
      <path d={path("small")} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" />
      {s.map((p, i) => (
        <rect key={p.date} x={x(i) - W / s.length / 2} y={0} width={W / s.length} height={H} fill="transparent">
          <title>{`${p.date}: tay to ${num(p.large * 100, 1)}% ADV · tay nhỏ ${num(p.small * 100, 1)}% ADV (lũy kế)`}</title>
        </rect>
      ))}
    </svg>
  );
}

function DailyIntentStrip({ days }: { days: NonNullable<IntentFootprint["dailyIntent"]> }) {
  return (
    <div className="flex gap-0.5 flex-wrap">
      {days.map((d) => {
        const st = STATE_STYLE[d.id] ?? STATE_STYLE.NEUTRAL;
        return (
          <div key={d.date} className="w-4 h-5 rounded-sm flex items-center justify-center text-[8px]"
            style={st.solid ? { background: st.color, color: "#f8fafc" } : { border: `1.5px solid ${st.color}`, color: st.color }}
            title={`${d.date}: ${d.label} ${pct(d.p)} · delta ${num(d.deltaPctAdv, 1)}% ADV · giá ${num(d.ret, 2)}%`}>
            {st.glyph}
          </div>
        );
      })}
    </div>
  );
}

export default function IntentFootprintPanel({ symbol }: { symbol: string }) {
  const { data, error, isLoading } = useIntentFootprint(symbol);
  if (isLoading && !data) return <div className="text-[10px] text-slate-500 mb-2">Đang giải mã dòng lệnh (IFE)…</div>;
  if (error) return <div className="text-[10px] text-rose-400 mb-2">Không tải được bản đồ ý đồ dòng tiền: {String(error.message)}</div>;
  if (!data) return null;
  if (!data.ready) return <div className="text-[10px] text-slate-500 mb-2">Bản đồ ý đồ dòng tiền: {data.reason}</div>;

  const ex = data.execution!;
  const lam = data.lambda!;
  const v = data.validation;

  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] font-semibold text-slate-200">
          Bản đồ ý đồ dòng tiền (IFE) · {data.viewDate}{" "}
          <span className={`ml-1 px-1.5 py-0.5 rounded text-[8.5px] ${data.method === "LEE_READY" ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-300"}`}>
            {data.method === "LEE_READY" ? "Lee–Ready (tick SSI)" : "BVC (nến phút)"}
          </span>
        </div>
        <div className="text-[8.5px] text-slate-500">{data.sessions} phiên · ngưỡng "tay to" ≥ {fmtVol(data.largeMinuteThreshold)} cp/phút</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <Box title="Trạng thái ý đồ (HMM)" right={data.today ? `delta phiên ${fmtVol(data.today.delta)} (${num(data.today.deltaPct, 1)}%)` : undefined}>
          <IntentBars data={data} />
        </Box>
        <Box title="Dòng lệnh có dấu theo khung" className="lg:col-span-2"
          right={<span>▲ đẩy mua · ▼ đạp bán · ◇ hấp thụ bán · ◆ hấp thụ mua · ○ cạn · ⚠ thủng thanh khoản</span>}>
          <DeltaStrip data={data} />
          <div className="flex flex-wrap gap-x-3 text-[8.5px] text-slate-400">
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: BUY }} />Mua chủ động ròng (trên trục)</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: SELL }} />Bán chủ động ròng (dưới trục)</span>
            <span>Chấm = trạng thái ý đồ của khung</span>
            <span>λ (tác động/đơn vị dòng lệnh) 5 phiên so 60 phiên: <b className={lam.ratio && lam.ratio > 1.5 ? "text-amber-300" : "text-slate-200"}>{num(lam.ratio, 2)}×</b>{lam.ratio && lam.ratio > 1.5 ? " — thanh khoản mỏng đi" : ""}</span>
          </div>
        </Box>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mt-2">
        <Box title="Stealth Score — gom/xả âm thầm">
          <div className="space-y-2">
            <StealthGauge label="1 phiên" w={data.stealth?.s1 ?? null} />
            <StealthGauge label="5 phiên" w={data.stealth?.s5 ?? null} />
            <StealthGauge label="20 phiên" w={data.stealth?.s20 ?? null} />
          </div>
        </Box>
        <Box title="Tay to vs tay nhỏ (20 phiên)"
          right={<span className="inline-flex items-center gap-2"><span className="inline-flex items-center gap-1"><span className="inline-block w-3 border-t-2" style={{ borderColor: ACCENT }} />tay to</span><span className="inline-flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-slate-400" />tay nhỏ</span></span>}>
          <BigSmallChart data={data.bigSmall!} />
          <div className={`text-[9px] ${data.bigSmall!.divergent ? "text-amber-300" : "text-slate-400"}`}>
            {data.bigSmall!.reading} · tay to {num(data.bigSmall!.cumLarge * 100, 1)}% ADV · tay nhỏ {num(data.bigSmall!.cumSmall * 100, 1)}% ADV
          </div>
          <div className="text-[8px] text-slate-500">"Tay to" = phút có KL ≥ p95 — xấp xỉ, không có danh tính tài khoản.</div>
        </Box>
        <Box title="Chữ ký thực thi (thuật toán chia lệnh)">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px]">
            <div className="text-slate-400">Bền bỉ trong phiên</div><div className="text-slate-100">{num(ex.intraPersistence, 2)}</div>
            <div className="text-slate-400">Bền bỉ theo phiên</div><div className="text-slate-100">{num(ex.dailyPersistence, 2)}</div>
            <div className="text-slate-400">Hurst (dòng lệnh)</div><div className="text-slate-100">{num(ex.hurst, 2)}{ex.hurst !== null && ex.hurst > 0.6 ? " · bền bỉ" : ""}</div>
            <div className="text-slate-400">Ổn định tỷ lệ tham gia (CV)</div><div className="text-slate-100">{num(ex.participationCV, 2)}{ex.participationCV !== null && ex.participationCV < 0.35 && ex.alignedBuckets >= 6 ? " · đều như thuật toán" : ""}</div>
            <div className="text-slate-400">Lặp kích thước lệnh</div>
            <div className="text-slate-100">{ex.clipRegularity ? `${pct(ex.clipRegularity.share)} (${ex.clipRegularity.topSizes.map((t) => t.size.toLocaleString("vi-VN")).join(", ")})` : "cần tick (Lee–Ready)"}</div>
          </div>
          {ex.samePriceClusters.length > 0 && (
            <div className="text-[8.5px] text-slate-400 mt-1">
              Cụm khớp dồn tại một giá (gợi ý lệnh ẩn): {ex.samePriceClusters.map((c) => `${c.time} ${fmtVol(c.volume)} @${c.price.toLocaleString("vi-VN")} (${c.side})`).join(" · ")}
            </div>
          )}
        </Box>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mt-2">
        <Box title="Ý đồ theo phiên (20 phiên)" className="lg:col-span-1">
          <DailyIntentStrip days={data.dailyIntent ?? []} />
          <div className="text-[8px] text-slate-500 mt-1">▲ gom chủ động · ◇ gom thụ động · ▼ xả chủ động · ◆ xả thụ động · ● trung tính</div>
        </Box>
        <Box title="Kiểm chứng toàn thị trường" className="lg:col-span-2"
          right={v ? `${v.symbols} mã · ${v.samples.toLocaleString("vi-VN")} mẫu · ${v.from} → ${v.to} · ${v.horizonDays} phiên, ±${v.barrierAtr} ATR` : undefined}>
          {v ? (
            <table className="w-full text-[9px] font-mono">
              <thead><tr className="text-slate-500"><th className="text-left font-sans font-normal">Trạng thái</th><th className="text-right">n</th><th className="text-right">Chạm trên</th><th className="text-right">Chạm dưới</th><th className="text-left pl-2 font-sans font-normal">Kết luận</th></tr></thead>
              <tbody>
                <tr className="text-slate-500"><td className="font-sans">Mức nền</td><td /><td className="text-right">{pct(v.base.up)}</td><td className="text-right">{pct(v.base.down)}</td><td /></tr>
                {v.states.map((s) => (
                  <tr key={s.id} className="text-slate-300">
                    <td className="font-sans"><Swatch id={s.id} /> {s.label}</td>
                    <td className="text-right">{s.n.toLocaleString("vi-VN")}</td>
                    <td className="text-right">{pct(s.upRate)}</td>
                    <td className="text-right">{pct(s.downRate)}</td>
                    <td className={`pl-2 font-sans ${s.validated ? "text-emerald-400" : "text-slate-500"}`}>{s.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="text-[9px] text-slate-500">Chưa chạy kiểm chứng (job ifeValidate).</div>}
          <div className="text-[8px] text-slate-500 mt-1">{v?.method}</div>
        </Box>
      </div>
      <div className="text-[8.5px] text-slate-500 mt-1">{data.methodNote} {data.disclaimer}</div>
    </div>
  );
}
