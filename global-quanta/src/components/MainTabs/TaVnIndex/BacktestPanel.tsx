import type { EventStudyResult } from "../../../lib/quant-core";
import type { ChochBacktest } from "../../../lib/ta-command-center/AnalysisController";

// Event study CHoCH trên chính mã đang xem (quant-core, không look-ahead). Nhãn EXPERIMENTAL cho tới khung kiểm định P6
// (Purged CV, Deflated Sharpe, PBO, FDR) — §3.1 của đặc tả.
const signed = (v: number) => `${v > 0 ? "+" : ""}${v}`;

function Card({ r, tone }: { r: EventStudyResult; tone: "bull" | "bear" }) {
  const color = tone === "bull" ? "#34d399" : "#f43f5e";
  const bearish = r.dir === "bearish";
  return (
    <div className="rounded-lg p-2" style={{ background: `${color}0f`, border: `1px solid ${color}33` }} data-testid={`event-study-${tone}`}>
      <p className="text-slate-400 flex items-center gap-1">
        {r.label} · {r.n} lần
        {r.lowSample && <span className="text-amber-400">(mẫu nhỏ &lt; 30)</span>}
      </p>
      {r.hitRate === null ? (
        <p className="text-slate-600 italic">Chưa đủ dữ liệu sau tín hiệu.</p>
      ) : (
        <>
          <p className="text-sm font-bold font-mono" style={{ color }}>
            {r.hitRate}% <span className="text-[10px] text-slate-500 font-normal">vs nền {r.baseRate}%</span>{" "}
            <span className={r.edgePp! > 0 ? "text-emerald-400" : "text-slate-500"}>({signed(r.edgePp!)} pp)</span>
          </p>
          <p className="text-slate-500 font-mono">
            {bearish ? "Mức giảm tránh được" : "LN ròng"} TB {signed(r.meanRetPct!)}% · nền {signed(r.baseMeanRetPct!)}%
            {r.tStat !== null && ` · t ${r.tStat}`}
          </p>
        </>
      )}
    </div>
  );
}

export default function BacktestPanel({ data }: { data: ChochBacktest }) {
  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3 mt-2" data-testid="backtest-panel">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
        Event study · CHoCH (Structural Shift) trên chính mã đang xem
        <span className="ml-auto font-mono text-[8.5px] text-amber-400" title="Chưa qua khung kiểm định P6 (Purged CV · Deflated Sharpe · PBO · FDR)">
          EXPERIMENTAL · engine {data.engineVersion}
        </span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
        <Card r={data.bullish} tone="bull" />
        <Card r={data.bearish} tone="bear" />
      </div>
      <p className="text-[8.5px] text-slate-600 mt-2 leading-relaxed">
        Không look-ahead (pivot xác nhận sau 5 nến). Vào lệnh giá mở cửa T+1, giữ {data.bullish.horizon} phiên, long trừ phí 0,15%×2 + thuế bán 0,1%.
        "Nền" = mọi phiên với cùng cách vào/ra trong cùng giai đoạn. CHoCH ▼ đo mức giảm tránh được (không bán khống).
      </p>
    </div>
  );
}
