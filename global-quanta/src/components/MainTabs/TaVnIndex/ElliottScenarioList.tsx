// EP2 — kịch bản Elliott có vòng đời (engine v3) + tóm tắt sổ theo dõi thời gian thực trên Gateway.
// Kịch bản "đã xác nhận" (mọi điểm neo đã xác nhận) là thứ được ghi sổ; kịch bản "tạm" (chặng cuối đang chạy) chỉ để tham khảo.
import useSWR from "swr";
import { fetchMarketJson, isMarketGatewayEnabled } from "../../../services/marketDataClient";
import { STATE_LABEL, type EwScenario, type ScenarioLifecycle, type ScenarioState } from "../../../lib/quant-core/elliott/v3/scenarios";
import { EP5_BACKTEST } from "../../../lib/quant-core/elliott/v3/backtestResults";

/** Tần suất LỊCH SỬ (EP5 walk-forward) đạt MT1 trước vô hiệu của mẫu — mô tả quá khứ, không phải dự báo. */
function historyOf(template: string) {
  const b = EP5_BACKTEST.byTemplate.find((x) => x.template === template);
  return b && b.n >= 100 && b.hitRate != null ? `lịch sử ${(b.hitRate * 100).toFixed(0)}% đạt MT1 trước vô hiệu (n = ${b.n.toLocaleString("vi-VN")}; ngẫu nhiên ${((b.expectedRate ?? 0) * 100).toFixed(0)}%)` : null;
}

const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");
const STATE_CLS: Record<ScenarioState, string> = {
  waiting: "border-slate-600 text-slate-300", triggered: "border-cyan-500/50 text-cyan-300", target1: "border-emerald-500/50 text-emerald-300",
  target2: "border-emerald-400/70 text-emerald-200", invalidated: "border-rose-500/50 text-rose-300", expired: "border-slate-700 text-slate-500",
};
const ROLE: Record<EwScenario["role"], string> = { primary: "Chính", secondary: "Phụ", alternate: "Thay thế" };

export interface ScenarioView { sc: EwScenario; lc: ScenarioLifecycle }

export function ElliottScenarioList({ items }: { items: ScenarioView[] }) {
  if (!items.length) return <p className="text-[9px] text-slate-500" data-testid="elliott-scenarios-empty">Chưa có kịch bản khớp mẫu ở vị trí hiện tại.</p>;
  return (
    <ul className="space-y-1" data-testid="elliott-scenarios">
      {items.map(({ sc, lc }) => (
        <li key={sc.id} className="rounded-md p-1.5 space-y-0.5" style={{ background: "rgba(148,163,184,0.04)" }} data-testid="elliott-scenario">
          <div className="flex flex-wrap items-center gap-1 text-[9.5px]">
            <span className="text-[8px] px-1 rounded bg-slate-800 text-slate-300">{sc.provisional ? "Đang hình thành" : ROLE[sc.role]}</span>
            <b className={sc.dir > 0 ? "text-emerald-300" : "text-rose-300"}>{sc.title} {sc.dir > 0 ? "↑" : "↓"}</b>
            <span className="text-[8.5px] text-slate-500">bậc {sc.level}</span>
            {sc.provisional
              ? <span className="text-[8px] px-1 rounded border border-amber-500/40 text-amber-300" title="Chặng cuối đang chạy — chưa xác nhận, không ghi sổ">tạm</span>
              : <span className={`text-[8px] px-1 rounded border ${STATE_CLS[lc.state]}`} data-testid="elliott-scenario-state">{STATE_LABEL[lc.state]}</span>}
          </div>
          <p className="text-[9px] text-slate-400 leading-snug">
            Kích hoạt: <span className="text-slate-200">{sc.trigger.text}</span> · MT {sc.targets.map((t) => <span key={t.label} className="text-emerald-200" title={t.label}>{fmt(t.price)} </span>)}
            · Vô hiệu: <span className="text-rose-200">{sc.invalidation.text}</span>
          </p>
          {historyOf(sc.template) && <p className="text-[8.5px] text-slate-500" data-testid="elliott-scenario-history">{historyOf(sc.template)}</p>}
          {lc.events.length > 0 && <p className="text-[8.5px] text-slate-500">{lc.events.map((e) => `${STATE_LABEL[e.type === "triggered" ? "triggered" : e.type]} ${e.time.slice(5, 10)} (${fmt(e.price)})`).join(" → ")}</p>}
        </li>
      ))}
    </ul>
  );
}

interface LedgerSummary {
  total: number; byState: Record<string, number>; verdict: string; firstLogged: string | null;
  score: { n: number; hits: number; hitRate: number | null; expectedRate: number | null; z: number | null };
  prereg: { minN: number; zPass: number; hypothesis: string };
}

/** Tóm tắt sổ theo dõi kịch bản (Gateway, công khai, làm mới 10 phút). */
export function ElliottLedgerSummary() {
  const { data } = useSWR<LedgerSummary | null>(isMarketGatewayEnabled() ? "elliott-ledger-summary" : null,
    () => fetchMarketJson<LedgerSummary>("/api/market/elliott/ledger/summary").catch(() => null), { refreshInterval: 600_000, revalidateOnFocus: false });
  if (!data) return null;
  const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
  return (
    <div className="text-[8.5px] text-slate-400 leading-snug" data-testid="elliott-ledger-summary"
      title={`Đăng ký trước: ${data.prereg.hypothesis} ĐẠT khi ≥ ${data.prereg.minN} kịch bản kết thúc và z ≥ ${data.prereg.zPass}.`}>
      <span className="text-slate-300 font-semibold">Sổ theo dõi kịch bản</span>{data.firstLogged ? ` (từ ${data.firstLogged})` : ""}: {data.total} kịch bản ·
      {" "}{data.byState.waiting ?? 0} chờ · {data.byState.triggered ?? 0} đã kích hoạt · {(data.byState.target1 ?? 0) + (data.byState.target2 ?? 0)} đạt MT · {data.byState.invalidated ?? 0} vô hiệu ·
      {" "}đạt MT1 trước vô hiệu {pct(data.score.hitRate)} so với ngẫu nhiên {pct(data.score.expectedRate)} ({data.score.n} kết thúc{data.score.z != null ? `, z = ${data.score.z.toFixed(2).replace(".", ",")}` : ""}) —
      {" "}<b className={data.verdict === "ĐẠT" ? "text-emerald-300" : data.verdict === "KHÔNG ĐẠT" ? "text-rose-300" : "text-amber-300"}>{data.verdict}</b>
    </div>
  );
}
