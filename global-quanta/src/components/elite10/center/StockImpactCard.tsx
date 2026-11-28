// D4 (19/11/2026) — khối "Tác động lên cổ phiếu" trong Hồ sơ 360° › Tổng hợp (thay khối "Truyền dẫn thế giới").
// Một dòng cho mỗi lớp tác động; mỗi dòng mang DẤU BẰNG CHỨNG lấy nguyên từ Gateway (sổ bằng chứng impact[]), giao diện không tự suy ra.
// Màu theo bằng chứng, không theo hướng: chỉ lớp ĐẠT mới tô màu hướng; lớp chưa kiểm định / không đạt hiển thị mờ hơn.
// Không lớp nào cộng vào Điểm Elite; tổng hợp có trọng số luôn trống (aggregate null) cho tới D5. Thiết kế: Tac-dong-co-phieu/05.
import useSWR from "swr";
import { fetchMarketJson } from "../../../services/marketDataClient";
import { MEDIUM_STANCE_VI, QUADRANT_VI, SHORT_STANCE_VI, type MediumStance, type ShortStance } from "../../../lib/worldSectors/strategyTypes";

export type ImpactSeal = "ĐẠT" | "MỘT PHẦN" | "THĂM DÒ" | "KHÔNG ĐẠT" | "ĐANG TÍCH LUỸ" | "CHƯA KIỂM ĐỊNH" | "MÔ TẢ";
export interface ImpactLayer {
  id: string; labelVi: string; evidenceId: string; seal: ImpactSeal; evidenceVi: string | null; evidenceSrc: string | null;
  available: boolean; reasonVi?: string; none?: boolean; value: Record<string, any> | null; direction: -1 | 0 | 1 | null;
  detailVi: string | null; source: string | null; at: string | null;
  /** N1: ghi chú phụ có dấu bằng chứng riêng (VD liên kết toàn cầu của dệt may, GL-1 MÔ TẢ). */
  extra?: { evidenceId: string; seal: ImpactSeal; textVi: string } | null;
  progress?: { n?: number; need?: number; signals?: number | null; clusters?: number | null; estimatedReadyOn?: string | null; earliestVerdict?: string };
}
export interface ImpactDoc { version: string; ticker: string; asOf: string; layers: ImpactLayer[]; aggregate: null; aggregateVi: string; elite: string }

const SEAL_TONE: Record<ImpactSeal, string> = {
  "ĐẠT": "border-emerald-400/60 bg-emerald-500/15 text-emerald-200",
  "MỘT PHẦN": "border-white/15 bg-white/5 text-q-text",
  "THĂM DÒ": "border-amber-400/50 bg-amber-500/10 text-amber-200",
  "ĐANG TÍCH LUỸ": "border-violet-400/50 bg-violet-500/10 text-violet-200",
  "KHÔNG ĐẠT": "border-rose-400/40 bg-rose-500/[0.06] text-rose-200/90",
  "CHƯA KIỂM ĐỊNH": "border-slate-500/50 bg-slate-500/10 text-slate-300",
  "MÔ TẢ": "border-slate-500/50 bg-slate-500/10 text-slate-300",
};
/** Lớp có bằng chứng yếu (hoặc chưa có) -> hiển thị mờ, dù hướng tốt hay xấu. */
export const WEAK_SEALS = new Set<ImpactSeal>(["KHÔNG ĐẠT", "CHƯA KIỂM ĐỊNH", "MÔ TẢ"]);
const SPEED_SHORT: Record<string, string> = { immediate: "phản ánh ngay", slow: "phản ánh chậm (~1 tháng)", none: "không đo được tác động", unmeasured: "chưa đo được" };
const PHASE_VI: Record<string, string> = { NONE: "Không có đợt pha loãng ≥ 10% trong cửa sổ theo dõi.", PRE_EX: "Sắp GDKHQ", POST_EX: "Sau GDKHQ" };

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const num = (v: unknown, d = 1) => (fin(v) ? v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const sgn = (v: unknown, d = 1) => (fin(v) ? `${v > 0 ? "+" : ""}${num(v, d)}` : "—");
const pct = (v: unknown, d = 1) => (fin(v) ? `${sgn(v * 100, d)}%` : "—");
const ty = (v: unknown) => (fin(v) ? `${Math.round(v / 1e9).toLocaleString("vi-VN")} tỷ` : "—");
const dmy = (s: string | null | undefined) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");
const hhmm = (iso: string) => { const d = new Date(Date.parse(iso) + 7 * 3600_000).toISOString(); return `${d.slice(11, 16)} ${dmy(d)}`; };

export function SealChip({ seal, testId }: { seal: ImpactSeal; testId?: string }) {
  return <span data-testid={testId} data-seal={seal} className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold ${SEAL_TONE[seal] ?? SEAL_TONE["CHƯA KIỂM ĐỊNH"]}`}>{seal}</span>;
}

function Direction({ l }: { l: ImpactLayer }) {
  if (l.direction == null) return null;
  const txt = l.direction > 0 ? "▲ có lợi" : l.direction < 0 ? "▼ bất lợi" : "— trung tính";
  // Chỉ lớp ĐẠT mới được tô màu hướng.
  const cls = l.seal === "ĐẠT" ? (l.direction > 0 ? "text-emerald-300" : l.direction < 0 ? "text-rose-300" : "text-slate-400") : "text-slate-400";
  return <span className={`ml-1 whitespace-nowrap text-[10px] ${cls}`} data-testid={`impact-dir-${l.id}`}>{txt}</span>;
}

/** Nội dung "Hôm nay với mã" của từng lớp — chỉ trình bày số Gateway trả về. */
export function layerText(l: ImpactLayer): React.ReactNode {
  const v = l.value ?? {};
  switch (l.id) {
    case "earnings":
      return <>Ước tính LNST cả năm <b>{ty(v.est)}</b> ({pct(v.nowcastYoY)} so với năm trước) · khoảng {ty(v.lo)}–{ty(v.hi)} · đã có {pct(v.cumShare, 0).replace("+", "")} luỹ kế · BCTC {v.quarter ?? "—"}</>;
    case "commodity":
      return <ul className="space-y-0.5">{(v.items ?? []).map((i: any) => (
        <li key={i.id} data-testid={`impact-commodity-${i.id}`}>{i.nameVi}{i.proxy && !/đại diện/i.test(i.nameVi) ? " (đại diện)" : ""}: {i.available ? <>{num(i.value, 2)} {i.unit ?? ""} · {sgn(i.changePct, 2)}% {i.basisVi ?? ""}</> : "chưa có giá"} · <span className="text-slate-400">{SPEED_SHORT[i.speed] ?? i.speed}</span></li>
      ))}</ul>;
    case "world_short":
      return <>{SHORT_STANCE_VI[v.stance as ShortStance] ?? v.stance} · α {sgn(v.alphaBps)} đcb · P vượt VN-Index {fin(v.pOutperform) ? `${num(v.pOutperform * 100)}%` : "—"} · {v.sector}</>;
    case "world_medium": {
      const e = v.exposure;
      return <>{MEDIUM_STANCE_VI[v.stance as MediumStance] ?? v.stance} · thế giới 3T {sgn(v.ws3m, 2)}{v.rrg ? ` · RRG ${QUADRANT_VI[String(v.rrg).toUpperCase()] ?? v.rrg}` : ""}{e ? ` · β với ngành thế giới ${num(e.betaPct, 2)}, tỷ trọng trong ngành ${num(e.weightPct)}%` : ""}</>;
    }
    case "catalyst":
      return <>
        <b>{v.benefit ?? 0}</b> xúc tác có lợi · <b>{v.harm ?? 0}</b> bất lợi{fin(v.compositeScore) ? ` · điểm engine ${sgn(v.compositeScore, 2)}` : ""}{v.stale ? " · snapshot cũ" : ""}
        {(v.top ?? []).length > 0 && <span className="block truncate text-slate-400" title={(v.top ?? []).map((c: any) => c.title).join(" · ")}>{(v.top ?? []).map((c: any) => c.title).filter(Boolean).join(" · ")}</span>}
      </>;
    case "events":
      return <>
        <b>{v.count ?? 0}</b> tin gắn mã trong {v.days ?? 30} ngày ({v.positive ?? 0} tích cực · {v.negative ?? 0} tiêu cực)
        {(v.latest ?? []).length > 0 && <span className="block truncate text-slate-400" title={(v.latest ?? []).map((e: any) => e.title).join(" · ")}>
          Gần nhất: {v.latest[0].eventLabel ?? "—"}{v.latest[0].official ? " · nguồn chính thức" : ""}{fin(v.latest[0].corroboration) && v.latest[0].corroboration > 1 ? ` · ${v.latest[0].corroboration} nguồn` : ""} · {dmy(v.latest[0].publishedAt)}
        </span>}
      </>;
    case "dilution":
      if (v.phase === "PRE_EX") return <>{PHASE_VI.PRE_EX}: còn {v.sessionsTo} phiên tới GDKHQ {dmy(v.ex)}{fin(v.ratio) ? ` (tỷ lệ ${num(v.ratio, 0)}%)` : ""}</>;
      if (v.phase === "POST_EX") return <>{PHASE_VI.POST_EX} {dmy(v.ex)}, phiên thứ {v.day}{v.listed ? " · cổ phiếu mới đã niêm yết" : ` · cổ phiếu mới dự kiến niêm yết ${dmy(v.listing)}`}</>;
      return <>{PHASE_VI.NONE}</>;
    default:
      return null;
  }
}

function progressText(l: ImpactLayer): string | null {
  const p = l.progress;
  if (!p) return null;
  if (fin(p.need)) return `${p.n ?? 0}/${p.need} tín hiệu đủ 20 phiên${p.estimatedReadyOn ? ` · dự kiến đủ ${dmy(p.estimatedReadyOn)}` : ""}`;
  if (p.earliestVerdict) return `chấm sớm nhất ${dmy(p.earliestVerdict)}`;
  return null;
}

export default function StockImpactCard({ ticker }: { ticker: string }) {
  const { data, error, isLoading } = useSWR<ImpactDoc>(ticker ? ["elite-impact", ticker] : null,
    () => fetchMarketJson<ImpactDoc>(`/api/elite/impact/${encodeURIComponent(ticker)}`), { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 });
  if (isLoading) return <p className="text-[10.5px] italic text-slate-500">Đang tải tác động lên cổ phiếu {ticker}…</p>;
  if (error || !data?.layers) return error ? <p className="text-[10.5px] text-slate-500" data-testid="elite-impact-error">Chưa tải được khối Tác động lên cổ phiếu: {String((error as Error).message ?? error)}</p> : null;
  return (
    <div className="rounded-md border border-white/15 bg-white/5 p-2 text-[10.5px]" data-testid="elite-impact">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase text-q-text-2">Tác động lên cổ phiếu · {data.ticker}</p>
        <span className="text-[10px] text-slate-500">cập nhật {hhmm(data.asOf)} · nguồn Gateway</span>
      </div>
      <div className="mt-1.5 hidden grid-cols-[minmax(130px,1fr)_2.4fr_minmax(170px,1.2fr)] gap-2 border-b border-white/10 pb-1 text-[10px] font-bold uppercase text-slate-500 md:grid">
        <span>Lớp</span><span>Hôm nay với {data.ticker}</span><span>Bằng chứng</span>
      </div>
      <ul className="divide-y divide-white/5">
        {data.layers.map((l) => {
          const weak = WEAK_SEALS.has(l.seal);
          const prog = progressText(l);
          return (
            <li key={l.id} data-testid={`impact-layer-${l.id}`} data-seal={l.seal} data-weak={String(weak)}
              className="grid grid-cols-1 gap-1 py-1.5 md:grid-cols-[minmax(130px,1fr)_2.4fr_minmax(170px,1.2fr)] md:gap-2">
              <div className="font-bold text-slate-200 md:font-normal">{l.labelVi}</div>
              <div className={`min-w-0 ${weak ? "text-slate-400 opacity-80" : "text-slate-200"}`}>
                {l.available ? <>{layerText(l)}<Direction l={l} /></> : <span className="text-slate-500">{l.reasonVi ?? "Chưa có dữ liệu."}</span>}
                {l.available && l.detailVi && <span className="block text-[10px] text-slate-500">{l.detailVi}</span>}
                {l.extra && (
                  <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-400" data-testid={`impact-extra-${l.id}`}>
                    <SealChip seal={l.extra.seal} /><span className="font-mono">{l.extra.evidenceId}</span><span>{l.extra.textVi}</span>
                  </span>
                )}
              </div>
              <div className="order-first flex flex-wrap items-center gap-1 md:order-none" title={l.evidenceVi ?? undefined}>
                <SealChip seal={l.seal} testId={`impact-seal-${l.id}`} />
                <span className="font-mono text-[10px] text-slate-400">{l.evidenceId}</span>
                {prog && <span className="text-[10px] text-slate-400" data-testid={`impact-progress-${l.id}`}>{prog}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <details className="mt-1 text-[10px] text-slate-500">
        <summary className="cursor-pointer text-slate-400">Chi tiết bằng chứng của {data.layers.length} lớp</summary>
        <ul className="mt-1 space-y-0.5">
          {data.layers.map((l) => <li key={l.id}><b className="text-slate-300">{l.evidenceId}</b> · {l.evidenceVi ?? "—"}{l.evidenceSrc ? ` (${l.evidenceSrc})` : ""}</li>)}
        </ul>
      </details>
      <p className="mt-1 text-[10px] text-slate-400" data-testid="elite-impact-aggregate">{data.aggregateVi}</p>
      <p className="text-[10px] text-slate-500">{data.elite} Tham khảo định lượng, không phải khuyến nghị đầu tư.</p>
    </div>
  );
}
