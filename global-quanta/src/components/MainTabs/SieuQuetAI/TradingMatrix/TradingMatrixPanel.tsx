"use client";
// Trading Matrix (M1, spec §6.1 / §10) — dải tóm tắt trạng thái thị trường ngay dưới VnIndexBand, phía trên bảng Siêu Quét:
//   Mức 0: 6 ô (trạng thái · độ rộng · dòng tiền · biến động · pha phiên · sức khoẻ dữ liệu), mỗi ô có nguồn + thời điểm + mẫu số.
//   Mức 1 ("Chi tiết"): xu hướng độ rộng 20 phiên, định nghĩa, xác suất, từng nguồn dữ liệu và trạng thái của nó.
// Lỗi một nguồn -> ô đó ghi "không khả dụng", các ô khác vẫn hiển thị; không chặn bảng cổ phiếu.
import { useState } from "react";
import { Grid3x3 } from "lucide-react";
import { useMatrixMovers, useMatrixSectors, useMatrixSignals, useTradingMatrix, type MatrixOverview, type MatrixScope } from "../../../../hooks/useTradingMatrix";
import { RiskChecklist, ScenarioBoard, SignalJournal } from "./ScenarioBoard";
import { ForecastBlock, OpsPanel } from "./MatrixOps";
import SectorHeatmap from "./SectorHeatmap";
import NotableMovers from "./NotableMovers";
import { BreadthCard, FlowCard, HEALTH_VI, HealthCard, RegimeCard, SessionCard, SkeletonCard, TONE, VolatilityCard, bn, vn, when } from "./MatrixCards";

const SCOPES: { id: MatrixScope; label: string }[] = [{ id: "VNINDEX", label: "Toàn HOSE" }, { id: "VN30", label: "VN30" }, { id: "UNIVERSE", label: "Universe" }];
const KEY_OPEN = "gq.matrixOpen", KEY_SCOPE = "gq.matrixScope";
const box = { background: "rgba(13,17,26,0.75)", border: "1px solid rgba(255,255,255,0.06)" };

/** Xu hướng % trên MA20 (20 phiên) — cột nhỏ, kèm bảng tương đương cho trình đọc màn hình. */
function BreadthTrend({ rows }: { rows: { date: string; aboveMa20Pct: number | null }[] }) {
  const W = 220, H = 48, n = rows.length, bw = n ? W / n : W;
  return (
    <figure className="min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" role="img" aria-label="Xu hướng phần trăm mã trên MA20, 20 phiên">
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(148,163,184,0.25)" strokeDasharray="2 3" />
        {rows.map((r, i) => {
          const v = r.aboveMa20Pct ?? 0, h = Math.max(1, (v / 100) * H);
          return <rect key={r.date} x={i * bw + 1} y={H - h} width={Math.max(1, bw - 2)} height={h} rx={1.5}
            fill={v >= 60 ? "#34d399" : v <= 40 ? "#fb7185" : "#94a3b8"} opacity={i === n - 1 ? 1 : 0.6}><title>{`${when(r.date)}: ${vn(r.aboveMa20Pct)}%`}</title></rect>;
        })}
      </svg>
      <figcaption className="text-[9px] text-slate-500 flex justify-between"><span>{when(rows[0]?.date)}</span><span>vạch giữa = 50%</span><span>{when(rows[rows.length - 1]?.date)}</span></figcaption>
      <table className="sr-only"><caption>Phần trăm mã trên MA20</caption><tbody>{rows.map((r) => <tr key={r.date}><td>{r.date}</td><td>{r.aboveMa20Pct}</td></tr>)}</tbody></table>
    </figure>
  );
}

function Details({ d }: { d: MatrixOverview }) {
  const b = d.breadth.daily;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 pt-3" data-testid="mx-details">
      <div className="space-y-1.5 min-w-0">
        <h3 className="text-[10px] font-bold text-slate-300">Độ rộng · {d.scope.label}</h3>
        {d.breadth.trend?.length ? <BreadthTrend rows={d.breadth.trend} /> : <p className="text-[10px] text-slate-500">Chưa có chuỗi độ rộng.</p>}
        {b && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            <dt className="text-slate-500">% trên MA50</dt><dd className="text-right font-mono">{vn(b.aboveMa50Pct)}%</dd>
            <dt className="text-slate-500">Trung vị lợi suất phiên</dt><dd className="text-right font-mono">{vn(b.medianReturn, 2)}%</dd>
            <dt className="text-slate-500">Tăng / giảm / đứng (cuối phiên)</dt><dd className="text-right font-mono">{b.advancers} / {b.decliners} / {b.unchanged}</dd>
            <dt className="text-slate-500">Đỉnh / đáy 52 tuần mới</dt><dd className="text-right font-mono">{b.newHighs} / {b.newLows}</dd>
            <dt className="text-slate-500">Mẫu số</dt><dd className="text-right font-mono">{b.eligibleCount}/{b.scopeSize} mã</dd>
            <dt className="text-slate-500">Loại khỏi mẫu</dt><dd className="text-right font-mono">{b.excluded.suspended} không GD · {b.excluded.shortHistory} &lt; 50 phiên</dd>
          </dl>
        )}
        {d.breadth.intraday?.note && <p className="text-[9px] text-amber-300/80">{d.breadth.intraday.note}</p>}
      </div>
      <div className="space-y-1.5 min-w-0 text-[10px]">
        <h3 className="text-[10px] font-bold text-slate-300">Trạng thái & dòng tiền</h3>
        {d.regime.definition && <p className="text-slate-400 leading-snug">{d.regime.definition}</p>}
        {d.regime.probabilities && <p>Xác suất HMM (mô tả, {when(d.regime.hmmAsOf)}): giảm {vn(d.regime.probabilities.bear * 100, 0)}% · ngang {vn(d.regime.probabilities.neutral * 100, 0)}% · tăng {vn(d.regime.probabilities.bull * 100, 0)}% (chênh {vn(d.regime.probabilityGap, 2)})</p>}
        {d.regime.stageOdds && (
          <p>
            Cấu trúc ngày VN-Index: {d.regime.stageOdds.stage} ({d.regime.stageOdds.age} phiên)
            {d.regime.stageOdds.up != null && <> · P(sang tăng ≤10 phiên) <b>{vn(d.regime.stageOdds.up * 100, 0)}%</b> · P(sang giảm) <b>{vn((d.regime.stageOdds.down ?? 0) * 100, 0)}%</b></>}
            <span className={`ml-1 px-1 rounded text-[8px] ${d.regime.stageOdds.label === "ĐÃ KIỂM ĐỊNH" ? "text-emerald-300 bg-emerald-500/10" : "text-amber-300 bg-amber-500/10"}`}>{d.regime.stageOdds.label}</span>
          </p>
        )}
        {d.flow.foreign && <p>Khối ngoại (đã chốt phiên {when(d.flow.foreign.asOf)}): phiên cuối {bn(d.flow.foreign.net)} · 5 phiên {bn(d.flow.foreign.net5)}</p>}
        {d.flow.ife ? <p>Dấu chân lệnh lớn: z5 {vn(d.flow.ife.zLd5, 2)}{d.flow.ife.zFr5 != null ? ` · z khối ngoại ${vn(d.flow.ife.zFr5, 2)}` : ""} · phương pháp {d.flow.ife.method}{d.flow.ife.coverageDays ? ` · ${d.flow.ife.coverageDays} phiên có dữ liệu` : ""}</p>
          : <p className="text-slate-500">Dấu chân lệnh lớn: chưa có (job nghiên cứu 16:00).</p>}
        <p className="text-slate-500">Tự doanh: không có nguồn dữ liệu — không hiển thị.</p>
        <p className="text-[9px] text-slate-500">{d.flow.note}</p>
      </div>
      <div className="space-y-1 min-w-0">
        <h3 className="text-[10px] font-bold text-slate-300">Nguồn dữ liệu</h3>
        <ul className="space-y-1" data-testid="mx-sources">
          {d.dataHealth.sources.map((s) => {
            const h = HEALTH_VI[s.status], t = TONE[h.tone];
            return (
              <li key={s.id} className="flex items-start gap-2 text-[10px]">
                <span className={`shrink-0 ${t.fg}`} aria-hidden>{h.glyph}</span>
                <span className="flex-1 min-w-0"><span className="text-slate-200">{s.label}</span><span className="block text-[9px] text-slate-500 truncate">{s.detail ?? ""}</span></span>
                <span className={`shrink-0 text-right ${t.fg}`}>{h.text}<span className="block text-[9px] text-slate-500">{when(s.asOf)}</span></span>
              </li>
            );
          })}
        </ul>
        <p className="text-[9px] text-slate-500 pt-1">Ngày và trong phiên hiển thị tách riêng · {d.version}</p>
      </div>
    </div>
  );
}

/** M2 — hàng "Ngành & mã" (spec §10.1 hàng 3): heatmap ngành / mã biến động đáng chú ý, chỉ tải khi mở Chi tiết. */
function SectorRow({ scope, active, onIndustry, onSelectTicker }: { scope: MatrixScope; active: Set<string>; onIndustry: (n: string | null) => void; onSelectTicker: (t: string) => void }) {
  const [view, setView] = useState<"sectors" | "movers">("sectors");
  const sectors = useMatrixSectors(scope, view === "sectors");
  const movers = useMatrixMovers(scope, view === "movers");
  const cur = view === "sectors" ? sectors : movers;
  return (
    <div className="pt-3 border-t border-white/5 mt-3 space-y-2" data-testid="mx-sector-row">
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Ngành và mã" className="inline-flex rounded border border-white/10 overflow-hidden bg-black/40">
          {([["sectors", "Heatmap ngành"], ["movers", "Mã biến động đáng chú ý"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} data-mx-view={k}
              className={`px-2 py-0.5 text-[10.5px] font-semibold ${view === k ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400"}`}>{l}</button>
          ))}
        </div>
        {cur.isLoading && !cur.data && <span className="text-[10px] text-slate-500">Đang tải…</span>}
      </div>
      {cur.error && !cur.data && <p className="text-[10px] text-rose-300" role="alert">Không khả dụng: {cur.error.message}</p>}
      {view === "sectors" && sectors.data && <SectorHeatmap data={sectors.data} active={active} onIndustry={onIndustry} />}
      {view === "movers" && movers.data && <NotableMovers data={movers.data} onSelect={onSelectTicker} />}
    </div>
  );
}

/** M3 — hàng 4: cờ rủi ro + sổ tín hiệu (spec §10.1). */
function RiskRow({ d, scope }: { d: MatrixOverview; scope: MatrixScope }) {
  const sig = useMatrixSignals(scope, true);
  return (
    <div className="pt-3 border-t border-white/5 mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
      <RiskChecklist flags={d.riskFlags ?? []} />
      <SignalJournal data={sig.data} />
    </div>
  );
}

const NO_SET = new Set<string>();
const NOOP = () => {};

export default function TradingMatrixPanel({ activeIndustries = NO_SET, onIndustry = NOOP, onSelectTicker = NOOP }: {
  /** Bộ lọc ngành hiện tại của bảng (cùng state với ScannerToolbar). */
  activeIndustries?: Set<string>; onIndustry?: (name: string | null) => void; onSelectTicker?: (ticker: string) => void;
} = {}) {
  const [open, setOpenState] = useState(() => { try { return window.localStorage.getItem(KEY_OPEN) === "1"; } catch { return false; } });
  const [scope, setScopeState] = useState<MatrixScope>(() => { try { const v = window.localStorage.getItem(KEY_SCOPE); return v === "VN30" || v === "UNIVERSE" ? v : "VNINDEX"; } catch { return "VNINDEX"; } });
  const setOpen = (v: boolean) => { setOpenState(v); try { window.localStorage.setItem(KEY_OPEN, v ? "1" : "0"); } catch { /* bỏ qua */ } };
  const setScope = (v: MatrixScope) => { setScopeState(v); try { window.localStorage.setItem(KEY_SCOPE, v); } catch { /* bỏ qua */ } };
  const { data, error, isLoading } = useTradingMatrix(scope);

  return (
    <section className="rounded-xl px-3 py-2.5" style={box} aria-label="Trading Matrix" data-testid="trading-matrix">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold text-cyan-400 flex items-center gap-1.5"><Grid3x3 className="w-3.5 h-3.5" /> Trading Matrix</h2>
        <div role="tablist" aria-label="Phạm vi" className="inline-flex rounded border border-white/10 overflow-hidden bg-black/40">
          {SCOPES.map((s) => (
            <button key={s.id} role="tab" aria-selected={scope === s.id} onClick={() => setScope(s.id)} data-mx-scope={s.id}
              className={`px-2 py-0.5 text-[10.5px] font-semibold ${scope === s.id ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400 hover:text-slate-200"}`}>{s.label}</button>
          ))}
        </div>
        {data && <span className="text-[9px] text-slate-500">cập nhật {when(data.asOf)}</span>}
        {data?.scenarios?.some((x) => x.state === "CONFIRMED" || x.state === "WATCH") && (
          <span className="text-[9.5px] px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-200" data-testid="mx-scenario-chip"
            title="Kịch bản THỰC NGHIỆM — xem Chi tiết để biết bằng chứng và kết quả kiểm định">
            {data.scenarios.filter((x) => x.state === "CONFIRMED" || x.state === "WATCH").map((x) => `${x.title}: ${x.displayState}`).join(" · ")} · THỰC NGHIỆM
          </span>
        )}
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mx-detail"
          className="ml-auto text-[10.5px] px-2 py-0.5 rounded border border-white/10 text-slate-300 hover:text-cyan-200 hover:border-cyan-500/40">
          {open ? "Thu gọn ▴" : "Chi tiết ▾"}
        </button>
      </div>
      {error && !data ? (
        <p className="text-[10px] text-rose-300" role="alert">Trading Matrix không khả dụng: {error.message}. Bảng Siêu Quét bên dưới vẫn hoạt động.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
          {!data || (isLoading && !data) ? Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />) : (
            <>
              <RegimeCard r={data.regime} />
              <BreadthCard b={data.breadth} scopeLabel={SCOPES.find((s) => s.id === data.scope.id)?.label ?? data.scope.label} />
              <FlowCard f={data.flow} />
              <VolatilityCard v={data.volatility} />
              <SessionCard s={data.session} />
              <HealthCard h={data.dataHealth} />
            </>
          )}
        </div>
      )}
      {open && data && (
        <div id="mx-detail">
          <div className="pt-3 grid grid-cols-1 xl:grid-cols-4 gap-3">
            <div className="xl:col-span-3"><ScenarioBoard d={data} /></div>
            <ForecastBlock f={data.forecast} />
          </div>
          <Details d={data} />
          <SectorRow scope={scope} active={activeIndustries} onIndustry={onIndustry} onSelectTicker={onSelectTicker} />
          <RiskRow d={data} scope={scope} />
          <OpsPanel />
        </div>
      )}
    </section>
  );
}
