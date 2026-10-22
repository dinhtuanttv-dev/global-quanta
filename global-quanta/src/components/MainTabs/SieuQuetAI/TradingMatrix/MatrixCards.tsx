// Trading Matrix (M1) — các ô của dải tóm tắt. Màu luôn đi kèm chữ + ký hiệu (không truyền nghĩa bằng màu đơn thuần);
// mọi tỷ lệ ghi mẫu số; mỗi ô ghi nguồn + thời điểm; ngày và trong phiên hiển thị TÁCH riêng.
import type { ReactNode } from "react";
import type { FlowLabel, HealthStatus, MatrixOverview, RegimeLabel } from "../../../../hooks/useTradingMatrix";

export const TONE = {
  bull: { fg: "text-emerald-300", bd: "border-emerald-500/30", bg: "bg-emerald-500/5" },
  bear: { fg: "text-rose-300", bd: "border-rose-500/30", bg: "bg-rose-500/5" },
  neutral: { fg: "text-slate-200", bd: "border-slate-600/40", bg: "bg-slate-500/5" },
  warn: { fg: "text-amber-300", bd: "border-amber-500/30", bg: "bg-amber-500/5" },
  research: { fg: "text-violet-300", bd: "border-violet-500/30", bg: "bg-violet-500/5" },
  missing: { fg: "text-slate-400", bd: "border-dashed border-slate-600/50", bg: "" },
} as const;
type Tone = keyof typeof TONE;

export const REGIME_VI: Record<RegimeLabel, { text: string; glyph: string; tone: Tone }> = {
  UPTREND: { text: "Xu hướng tăng", glyph: "▲", tone: "bull" },
  DOWNTREND: { text: "Xu hướng giảm", glyph: "▼", tone: "bear" },
  SIDEWAY: { text: "Đi ngang", glyph: "■", tone: "neutral" },
  TRANSITION: { text: "Chuyển pha", glyph: "◆", tone: "warn" },
  UNKNOWN: { text: "Chưa đủ dữ liệu", glyph: "?", tone: "missing" },
};
export const FLOW_VI: Record<FlowLabel, { text: string; glyph: string; tone: Tone }> = {
  ACCUMULATION: { text: "Dòng tiền vào", glyph: "▲", tone: "bull" },
  DISTRIBUTION: { text: "Dòng tiền ra", glyph: "▼", tone: "bear" },
  MIXED: { text: "Trái chiều", glyph: "◆", tone: "warn" },
  NEUTRAL: { text: "Trung tính", glyph: "■", tone: "neutral" },
  UNKNOWN: { text: "Chưa có dữ liệu", glyph: "?", tone: "missing" },
};
export const HEALTH_VI: Record<HealthStatus, { text: string; glyph: string; tone: Tone }> = {
  LIVE: { text: "Trực tiếp", glyph: "●", tone: "bull" },
  DELAYED: { text: "Trễ", glyph: "◐", tone: "neutral" },
  STALE: { text: "Cũ", glyph: "◌", tone: "warn" },
  PARTIAL: { text: "Thiếu một phần", glyph: "◑", tone: "warn" },
  UNAVAILABLE: { text: "Không khả dụng", glyph: "✕", tone: "bear" },
};

export const vn = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : x.toLocaleString("vi-VN", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const bn = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ`);
export const when = (iso: string | null | undefined) => {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
};

function Card({ title, tone, main, children, foot, testId }: { title: string; tone: Tone; main: ReactNode; children?: ReactNode; foot: ReactNode; testId: string }) {
  const t = TONE[tone];
  return (
    <div className={`rounded-lg border ${t.bd} ${t.bg} px-2.5 py-2 min-w-0 flex flex-col gap-0.5`} data-testid={testId}>
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{title}</div>
      <div className={`text-[13px] font-semibold leading-tight ${t.fg} truncate`}>{main}</div>
      <div className="text-[10px] text-slate-300 leading-snug min-h-[14px]">{children}</div>
      <div className="text-[9px] text-slate-500 mt-auto truncate">{foot}</div>
    </div>
  );
}

export function RegimeCard({ r }: { r: MatrixOverview["regime"] }) {
  const s = REGIME_VI[r.label] ?? REGIME_VI.UNKNOWN;
  return (
    <Card title="Trạng thái · Ngày" tone={s.tone} testId="mx-regime"
      main={<><span aria-hidden>{s.glyph}</span> {s.text}</>}
      foot={<>Quy tắc MA + HMM · {when(r.asOf)}</>}>
      {r.probabilities
        ? <span title="Xác suất trạng thái HMM (mô tả)">Giảm {vn(r.probabilities.bear * 100, 0)}% · Ngang {vn(r.probabilities.neutral * 100, 0)}% · Tăng {vn(r.probabilities.bull * 100, 0)}%</span>
        : r.label === "UNKNOWN" ? <span>{r.reason ?? "Thiếu dữ liệu VN-Index"}</span> : <span className="text-slate-500">Chưa có xác suất HMM (job nghiên cứu)</span>}
    </Card>
  );
}

export function BreadthCard({ b, scopeLabel }: { b: MatrixOverview["breadth"]; scopeLabel: string }) {
  const d = b.daily, i = b.intraday;
  const pct = d?.aboveMa20Pct;
  const tone: Tone = pct == null ? "missing" : pct >= 60 ? "bull" : pct <= 40 ? "bear" : "neutral";
  return (
    <Card title={`Độ rộng · ${scopeLabel}`} tone={tone} testId="mx-breadth"
      main={pct == null ? "Chưa có dữ liệu" : <>{vn(pct)}% trên MA20</>}
      foot={d ? <>Cuối phiên {when(d.asOf)} · n = {d.eligibleCount}/{d.scopeSize} mã{d.excludedCount ? ` · loại ${d.excludedCount}` : ""}</> : "Dữ liệu ngày chưa sẵn sàng"}>
      {i ? <span title={`Trong phiên (SSI ${i.index}) · ${when(i.asOf)}`}>Trong phiên: <b className="text-emerald-300">↑{i.advancers}</b> <b className="text-rose-300">↓{i.decliners}</b> <span className="text-slate-400">={i.unchanged}</span></span>
        : <span className="text-slate-500">Trong phiên: không khả dụng</span>}
    </Card>
  );
}

export function FlowCard({ f }: { f: MatrixOverview["flow"] }) {
  const s = FLOW_VI[f.state] ?? FLOW_VI.UNKNOWN;
  return (
    <Card title="Dòng tiền" tone={s.tone} testId="mx-flow"
      main={<><span aria-hidden>{s.glyph}</span> {s.text}{f.partial && f.state !== "UNKNOWN" ? <span className="ml-1 text-[9px] text-amber-300 font-normal">(thiếu nguồn)</span> : null}</>}
      foot={<>{f.sources.length ? f.sources.map((x) => (x === "IFE" ? "Dấu chân lệnh" : "Khối ngoại (chốt phiên)")).join(" + ") : "Chưa có nguồn"}</>}>
      {f.foreign ? <span>NN 5 phiên {bn(f.foreign.net5)}{f.foreign.streak ? ` · chuỗi ${f.foreign.streak > 0 ? "mua" : "bán"} ${Math.abs(f.foreign.streak)}` : ""}</span> : <span className="text-slate-500">Khối ngoại: chưa có</span>}
      {f.ife && <span className="block">Dấu chân z5 {f.ife.zLd5 >= 0 ? "+" : "−"}{vn(Math.abs(f.ife.zLd5), 2)}</span>}
    </Card>
  );
}

export function VolatilityCard({ v }: { v: MatrixOverview["volatility"] }) {
  const p = v?.atrPercentile;
  const tone: Tone = p == null ? "missing" : p >= 80 ? "warn" : "neutral";
  return (
    <Card title="Biến động · VN-Index" tone={tone} testId="mx-vol"
      main={p == null ? "Chưa có dữ liệu" : <>ATR phân vị {vn(p, 0)}</>}
      foot={v ? <>Ngày · {when(v.asOf)} · phân vị 250 phiên</> : "—"}>
      {v && <span>Biến động thực 20p {vn(v.realizedVol20)}%/năm{v.rangeZ != null ? ` · biên độ z ${vn(v.rangeZ, 2)}` : ""}</span>}
    </Card>
  );
}

export function SessionCard({ s }: { s: MatrixOverview["session"] }) {
  return (
    <Card title="Pha phiên" tone={s.live ? "bull" : "neutral"} testId="mx-session"
      main={<><span aria-hidden>{s.live ? "●" : "○"}</span> {s.label}</>}
      foot={<>Lịch giao dịch Gateway · phiên đã chốt {when(s.tradingDate)}</>}>
      <span className="text-slate-400">{s.live ? "Đang khớp lệnh — giá cập nhật trực tiếp" : "Ngoài giờ khớp lệnh"}</span>
    </Card>
  );
}

export function HealthCard({ h }: { h: MatrixOverview["dataHealth"] }) {
  const s = HEALTH_VI[h.status];
  const ok = h.sources.filter((x) => x.status === "LIVE" || x.status === "DELAYED").length;
  return (
    <Card title="Sức khoẻ dữ liệu" tone={s.tone} testId="mx-health"
      main={<><span aria-hidden>{s.glyph}</span> {s.text}</>}
      foot={<>{ok}/{h.sources.length} nguồn tốt</>}>
      <span className="text-slate-400 truncate block">{h.sources.filter((x) => x.status === "UNAVAILABLE" || x.status === "STALE").map((x) => x.label).join(", ") || "Mọi nguồn hoạt động"}</span>
    </Card>
  );
}

/** Thẻ khung trống khi đang tải — không chặn bảng cổ phiếu. */
export function SkeletonCard() {
  return <div className="rounded-lg border border-slate-700/40 px-2.5 py-2 h-[78px] animate-pulse bg-slate-800/20" aria-hidden />;
}
