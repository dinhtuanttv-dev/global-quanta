// 26/11/2026 — Danh mục Elite HL trong khối trái của Phòng họp AI: chọn mã để phân tích ngay tại chỗ.
// Dữ liệu từ /api/elite/decision (cùng nguồn snapshot đang dùng): hạng HL, tỷ trọng, lãi/lỗ từ phiên khoá, làn PZ, vị trí giá, cảnh báo;
// hàng chờ (top 5) với lý do. Chỉ chọn mã — không đổi danh mục, không gọi AI.
import { useState } from "react";
import type { EliteDecision, HlPick, HlQueueItem } from "../../../../lib/elite10/decisionTypes";
import { hlPicks } from "../../../../lib/elite10/decisionTypes";
import { PZ_VI } from "../../../../lib/elite10/cockpit";
import { dateVi } from "./roomView";

const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const w = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`);
const laneVi = { CORE: "Lõi", RUNNER: "Chạy lãi", WAIT: "Chờ nền" } as const;

export function sortedPicks(d: EliteDecision | null | undefined): HlPick[] {
  return hlPicks(d).slice().sort((a, b) => (a.hl.rank ?? 999) - (b.hl.rank ?? 999));
}

export default function PortfolioRail({ decision, current, onPick, busy = false, loading = false }: {
  decision: EliteDecision | null | undefined; current: string | null; onPick: (ticker: string) => void; busy?: boolean; loading?: boolean;
}) {
  const [showQueue, setShowQueue] = useState(false);
  const picks = sortedPicks(decision);
  const hl = decision?.hl;
  const queue: HlQueueItem[] = (hl?.queue ?? []).slice(0, 5);
  const frozen = Boolean(hl?.dataGuard?.frozen);
  const disabledWhy = busy ? "Đang tranh luận — chờ xong rồi đổi mã" : undefined;
  const pick = (t: string) => { if (!busy) onPick(t); };
  return (
    <section className="panel panel-pad eb-pf" aria-label="Danh mục Elite HL — chọn mã để phân tích" data-testid="eb-portfolio-rail">
      <div className="section-head">
        <div><div className="eyebrow">Danh mục chính thức</div><h2 style={{ marginTop: 4 }}>Danh mục Elite HL</h2></div>
        {hl && <span className={`mini-badge ${frozen ? "warn" : ""}`} title={frozen ? hl.dataGuard?.reasonsVi.join("; ") : undefined}>{frozen ? "ĐÓNG BĂNG" : `${picks.length} MÃ`}</span>}
      </div>
      {hl ? (
        <p className="eb-pf-meta" data-testid="eb-portfolio-meta">Phiên {dateVi(decision?.date)} · Cổ phiếu {w(hl.invested)} · Tiền mặt {w(hl.cash)} · Chọn mã để phân tích</p>
      ) : (
        <p className="eb-pf-meta">{loading ? "Đang tải danh mục…" : "Chưa có danh mục Elite HL của phiên."}</p>
      )}
      {picks.length > 0 && (
        <ul className="eb-pf-list" role="list">
          {picks.map((p) => {
            const active = p.ticker === current;
            const lane = p.hl.pz?.lane ?? null;
            const warn = p.hl.warnings?.length ?? 0;
            return (
              <li key={p.ticker}>
                <button type="button" className={`eb-pf-row ${active ? "active" : ""}`} aria-current={active ? "true" : undefined} aria-disabled={busy || undefined}
                  title={disabledWhy ?? (warn ? p.hl.warnings.join(" · ") : `Phân tích ${p.ticker}`)} onClick={() => pick(p.ticker)} data-testid={`eb-pf-${p.ticker}`}>
                  <span className="num">{p.hl.rank ?? "—"}</span>
                  <span className="eb-pf-main">
                    <span className="eb-pf-ticker">{p.ticker}{warn > 0 && <span className="eb-pf-warn" aria-label={`${warn} cảnh báo`}>!</span>}</span>
                    <span className="eb-pf-sub">{lane ? laneVi[lane] : p.hl.status === "NEW" ? "Vào mới" : "Giữ"}{p.hl.pz ? ` · ${PZ_VI[p.hl.pz.state]}` : ""}</span>
                  </span>
                  <span className="eb-pf-nums">
                    <span className="eb-pf-weight">{w(p.weight)}</span>
                    <span className={`eb-pf-ret ${p.hl.sinceRet == null ? "" : p.hl.sinceRet >= 0 ? "up" : "down"}`}>{pct(p.hl.sinceRet)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {queue.length > 0 && (
        <div className="eb-pf-queue">
          <button type="button" className="small-link" aria-expanded={showQueue} onClick={() => setShowQueue((v) => !v)} data-testid="eb-pf-queue-toggle">
            {showQueue ? "▾" : "▸"} Hàng chờ ({hl?.queue.length ?? 0}) — mã đạt chuẩn chưa vào danh mục
          </button>
          {showQueue && (
            <ul className="eb-pf-list" role="list">
              {queue.map((q) => (
                <li key={q.ticker}>
                  <button type="button" className={`eb-pf-row queue ${q.ticker === current ? "active" : ""}`} aria-current={q.ticker === current ? "true" : undefined}
                    aria-disabled={busy || undefined} title={disabledWhy ?? q.reasonVi} onClick={() => pick(q.ticker)} data-testid={`eb-pf-q-${q.ticker}`}>
                    <span className="num">{q.hlRank}</span>
                    <span className="eb-pf-main"><span className="eb-pf-ticker">{q.ticker}</span><span className="eb-pf-sub">{q.reasonVi}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
