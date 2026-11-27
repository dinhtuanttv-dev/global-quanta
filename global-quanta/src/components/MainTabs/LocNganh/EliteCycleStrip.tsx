// EC-1 (27/11/2026) — dải chip "Danh mục Elite HL" phía trên tab con Cycle Fingerprint (tab Phân tích › Ngành).
// Mục đích: chọn nhanh từng mã của danh mục chính thức để xem diễn biến giá tương lai theo các giai đoạn tương tự (Cycle Fingerprint).
// Dữ liệu: /api/elite/decision (dùng chung bộ đệm với tab Quyết định) + /api/market/cycles-summary (một lần gọi cho cả dải).
// CHỈ HIỂN THỊ: không đổi quy tắc Elite HL, không đổi bộ máy / thư viện / sổ theo dõi Cycle Fingerprint. Thứ tự = hạng Elite HL.
import { useMemo, useState } from "react";
import { useEliteDecision } from "../../../hooks/elite10/useEliteCenter";
import { useCycleSummary } from "../../../hooks/useCycleSummary";
import { useAppStore } from "../../../store/useAppStore";
import { sortedPicks } from "../../elite10/center/evidenceRoom/PortfolioRail";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";
import type { CycleSummaryRow } from "../../../types/cycleFingerprintV2";

const LANE: Record<string, string> = { CORE: "Lõi", RUNNER: "Chạy lãi", WAIT: "Chờ nền" };
/** Thang dải 10–90% trên chip: ±30% vượt VN-Index (giá trị ngoài thang được chặn ở mép). */
const SCALE = 30;

export interface StripItem { ticker: string; rank: number | null; lane: string | null; queue: boolean }

/** Mã của danh mục (theo hạng HL) và — khi bật — hàng chờ (theo hạng hàng chờ). */
export function cycleStripItems(decision: EliteDecision | null | undefined, withQueue: boolean): StripItem[] {
  const picks: StripItem[] = sortedPicks(decision).map((p) => ({ ticker: p.ticker, rank: p.hl.rank ?? null, lane: p.hl.pz?.lane ?? (p.hl.status === "NEW" ? "NEW" : null), queue: false }));
  if (!withQueue) return picks;
  const held = new Set(picks.map((p) => p.ticker));
  const queue: StripItem[] = (decision?.hl?.queue ?? []).filter((q) => !held.has(q.ticker)).map((q) => ({ ticker: q.ticker, rank: q.hlRank ?? null, lane: null, queue: true }));
  return [...picks, ...queue];
}

/** Hơn nửa số giai đoạn tương tự lệch hẳn biên độ -> độ tin thấp (cùng tiêu chí cảnh báo của bảng chi tiết). */
export const lowConfidence = (r: CycleSummaryRow | undefined) => Boolean(r && r.n > 0 && r.mismatched > r.n / 2);

const VI = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtSigned = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${VI.format(Math.abs(v))}%`);
const pos = (v: number) => `${((Math.max(-SCALE, Math.min(SCALE, v)) + SCALE) / (2 * SCALE)) * 100}%`;
const dm = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");

function Band({ r }: { r: CycleSummaryRow }) {
  if (r.p10 == null || r.p90 == null) return null;
  const lo = pos(r.p10), hi = pos(r.p90);
  return (
    <span className="cf-es-band" aria-hidden title={`Dải 10–90%: ${fmtSigned(r.p10)} → ${fmtSigned(r.p90)}`}>
      <span className="cf-es-zero" />
      <span className="cf-es-range" style={{ left: lo, width: `calc(${hi} - ${lo})` }} />
      {r.median != null && <span className="cf-es-med" style={{ left: pos(r.median) }} />}
    </span>
  );
}

export default function EliteCycleStrip() {
  const { data: decision, isLoading } = useEliteDecision();
  const [withQueue, setWithQueue] = useState(false);
  const selected = useAppStore((s) => s.selectedTicker);
  const selectTicker = useAppStore((s) => s.selectTicker);
  const items = useMemo(() => cycleStripItems(decision, withQueue), [decision, withQueue]);
  const queueCount = useMemo(() => cycleStripItems(decision, true).filter((i) => i.queue).length, [decision]);
  const symbols = useMemo(() => items.map((i) => i.ticker), [items]);
  const summary = useCycleSummary(symbols);
  const rowOf = useMemo(() => new Map((summary.data?.rows ?? []).map((r) => [r.symbol, r])), [summary.data]);
  const horizon = summary.data?.horizon ?? 20;

  if (!decision && !isLoading) return null;
  return (
    <section className="cf-es" aria-label="Danh mục Elite HL — chọn mã để xem Cycle Fingerprint" data-testid="cf-elite-strip">
      <div className="cf-es-head">
        <span className="cf-es-title">Danh mục Elite HL</span>
        <span className="cf-es-meta">{decision ? `phiên ${dm(decision.date)} · ${items.filter((i) => !i.queue).length} mã · theo hạng HL` : "Đang tải danh mục…"}</span>
        <span className="cf-es-badge" title="Kiểm định đặt trước CF3 không đạt: số dưới đây mô tả diễn biến của các giai đoạn tương tự, không phải tín hiệu mua / bán.">EXPERIMENTAL · CF3 không đạt — mô tả, không phải tín hiệu</span>
        {queueCount > 0 && (
          <button type="button" className="cf-es-toggle" aria-pressed={withQueue} onClick={() => setWithQueue((v) => !v)} data-testid="cf-es-queue">
            Hàng chờ ({queueCount})
          </button>
        )}
      </div>
      <div className="cf-es-row" role="list">
        {items.map((it) => {
          const r = rowOf.get(it.ticker);
          const on = selected === it.ticker;
          const low = lowConfidence(r);
          return (
            <button key={`${it.queue ? "q" : "p"}-${it.ticker}`} type="button" role="listitem" aria-pressed={on} className={`cf-es-chip${on ? " on" : ""}${it.queue ? " queue" : ""}`}
              onClick={() => selectTicker(it.ticker)} data-testid={`cf-es-${it.ticker}`}
              title={r ? `${it.ticker}: trung vị vượt VN-Index ${horizon} phiên ${fmtSigned(r.median)} · dải 10–90% ${fmtSigned(r.p10)} → ${fmtSigned(r.p90)} · P(vượt) ${r.shareUp == null ? "—" : Math.round(r.shareUp * 100) + "%"} · ${r.mismatched}/${r.n} giai đoạn lệch biên độ` : `${it.ticker}: chưa có tóm tắt chu kỳ`}>
              <span className="cf-es-top">
                <span className="cf-es-rank">{it.queue ? "chờ" : it.rank ?? "—"}</span>
                <b className="cf-es-ticker">{it.ticker}</b>
                {it.lane && <span className="cf-es-lane">{it.lane === "NEW" ? "Vào mới" : LANE[it.lane] ?? it.lane}</span>}
                {low && <span className="cf-es-low" data-testid={`cf-es-low-${it.ticker}`}>độ tin thấp</span>}
              </span>
              <span className="cf-es-bottom">
                {r ? <>
                  <span className="cf-es-med-txt">{fmtSigned(r.median)}</span>
                  <Band r={r} />
                  <span className="cf-es-p">P {r.shareUp == null ? "—" : `${Math.round(r.shareUp * 100)}%`}</span>
                </> : <span className="cf-es-wait">{summary.isLoading ? "đang tải…" : "chưa có"}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="cf-es-note">Số trên chip: trung vị và dải 10–90% của lợi suất vượt VN-Index {horizon} phiên sau 30 giai đoạn tương tự; P = tỷ lệ giai đoạn vượt. Bấm mã để xem chi tiết bên dưới.</p>
    </section>
  );
}
