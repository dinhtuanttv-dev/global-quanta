// Trading Matrix — bảng chữ/màu dùng chung (REGIME_VI, FLOW_VI, HEALTH_VI, TONE), hàm định dạng (vn, bn, when) và FlowCard
// (PHÂN TÍCH NGÀNH › SectorDeepPanel). Màu luôn đi kèm chữ + ký hiệu. Các thẻ M1 cũ (Regime/Breadth/Volatility/Session/
// Health/Skeleton) đã bỏ ở PR-F vì giao diện Trạng thái thị trường hiện dùng dòng kết luận + 4 ô (TradingMatrixPanel).
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
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{title}</div>
      <div className={`text-[13px] font-semibold leading-tight ${t.fg} truncate`}>{main}</div>
      <div className="text-[10px] text-slate-300 leading-snug min-h-[14px]">{children}</div>
      <div className="text-[10px] text-slate-500 mt-auto truncate">{foot}</div>
    </div>
  );
}

export function FlowCard({ f }: { f: MatrixOverview["flow"] }) {
  const s = FLOW_VI[f.state] ?? FLOW_VI.UNKNOWN;
  return (
    <Card title="Dòng tiền" tone={s.tone} testId="mx-flow"
      main={<><span aria-hidden>{s.glyph}</span> {s.text}{f.partial && f.state !== "UNKNOWN" ? <span className="ml-1 text-[10px] text-amber-300 font-normal">(thiếu nguồn)</span> : null}</>}
      foot={<>{f.sources.length ? f.sources.map((x) => (x === "IFE" ? "Dấu chân lệnh" : "Khối ngoại (chốt phiên)")).join(" + ") : "Chưa có nguồn"}</>}>
      {f.foreign ? <span>NN 5 phiên {bn(f.foreign.net5)}{f.foreign.streak ? ` · chuỗi ${f.foreign.streak > 0 ? "mua" : "bán"} ${Math.abs(f.foreign.streak)}` : ""}</span> : <span className="text-slate-500">Khối ngoại: chưa có</span>}
      {f.ife && <span className="block">Dấu chân z5 {f.ife.zLd5 >= 0 ? "+" : "−"}{vn(Math.abs(f.ife.zLd5), 2)}</span>}
    </Card>
  );
}

