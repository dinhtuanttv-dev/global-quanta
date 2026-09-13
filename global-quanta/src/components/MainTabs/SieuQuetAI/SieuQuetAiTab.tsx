import { useState, useMemo } from "react";
import { useSieuQuetScanner } from "../../../hooks/useSieuQuetScanner";
import type { SieuQuetStockItem } from "../../../hooks/useSieuQuetScanner";
import { EventPanel } from "./EventPanel";

// Mau sac theo statusCode Confluence - dung DUNG bang mau da duyet trong
// prototype HTML goc (frontend/index.html, bien CONF_COLOR).
const CONF_COLOR: Record<string, string> = {
  THUAN_XU_HUONG_MANH: "bg-emerald-950 text-emerald-400 border-emerald-700",
  THUAN_XU_HUONG: "bg-emerald-950/60 text-emerald-400 border-emerald-800",
  DONG_THUAN_TICH_LUY: "bg-cyan-950 text-cyan-400 border-cyan-700",
  PHONG_THU_CHUAN: "bg-blue-950 text-blue-400 border-blue-700",
  THUAN_PHONG_THU: "bg-blue-950/60 text-blue-400 border-blue-800",
  DAN_DAT_NGUOC_DONG: "bg-purple-950 text-purple-400 border-purple-700",
  TRUNG_LAP: "bg-slate-800 text-slate-400 border-slate-600",
  NGHICH_XU_HUONG: "bg-rose-950 text-rose-400 border-rose-700",
};

const BIAS_COLOR: Record<string, string> = {
  uptrend: "text-emerald-400", accumulation: "text-amber-400", defensive: "text-blue-400",
  distribution: "text-rose-400", downtrend: "text-rose-400",
};

function fmt(n: number | null | undefined, d = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(d);
}

function IndexTechnicalCard({ state }: { state: ReturnType<typeof useSieuQuetScanner>["indexState"] }) {
  if (!state) return <div className="text-[10px] text-slate-500">Đang tải dữ liệu VN-Index...</div>;
  const biasColor = BIAS_COLOR[state.trendBias] ?? "text-slate-300";

  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-between"><span className="text-slate-500">Xu hướng</span><span className={`font-semibold ${biasColor}`}>{state.trendLabel}</span></div>
      <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-slate-400">
        <div>MA20<br /><span className="text-slate-200">{fmt(state.ma20)}</span></div>
        <div>MA50<br /><span className="text-slate-200">{fmt(state.ma50)}</span></div>
        <div>MA200<br /><span className="text-slate-200">{fmt(state.ma200)}</span></div>
      </div>
      <div className="flex justify-between"><span className="text-slate-500">RSI(14)</span><span className="font-mono text-slate-200">{fmt(state.rsi14)}</span></div>
      <div className="flex justify-between"><span className="text-slate-500">MACD Hist.</span><span className="font-mono text-slate-200">{fmt(state.macdHistogram, 2)}</span></div>
      <div className="flex justify-between"><span className="text-slate-500">Breadth</span><span className="font-mono text-slate-200">{fmt(state.marketBreadthPct, 1)}%</span></div>
      <div className="flex justify-between"><span className="text-slate-500">Phân kỳ</span><span className="font-mono text-slate-200">{state.divergence}</span></div>
      <div className="flex justify-between"><span className="text-slate-500">ATR Percentile</span><span className="font-mono text-slate-200">{fmt(state.atrPercentile, 1)}</span></div>
      <div className="flex justify-between"><span className="text-slate-500">Breakout Prob.</span><span className="font-mono text-slate-200">{fmt(state.breakoutProbability, 1)}%</span></div>
      <p className="text-slate-400 text-[10px] pt-2 border-t border-white/10">{state.narrative}</p>
    </div>
  );
}

function ImpulseGauge({ score }: { score: number }) {
  const zoneColor = score < 35 ? "#f43f5e" : score <= 65 ? "#f59e0b" : "#10b981";
  const zoneLabel = score < 35 ? "Rủi ro cao" : score <= 65 ? "Tích lũy an toàn" : "Hưng phấn / Mở rộng";
  return (
    <div className="flex items-center gap-3">
      <div className="text-3xl font-mono font-semibold" style={{ color: zoneColor }}>{fmt(score, 1)}</div>
      <div className="flex-1">
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, score))}%`, background: zoneColor }} />
        </div>
        <div className="text-[10px] mt-1" style={{ color: zoneColor }}>{zoneLabel}</div>
      </div>
    </div>
  );
}

function StockRow({ item }: { item: SieuQuetStockItem }) {
  const confClass = (item.confluenceStatusCode && CONF_COLOR[item.confluenceStatusCode]) ?? "bg-slate-800 text-slate-400 border-slate-600";
  const excluded = item.piotroskiFScore !== null && item.piotroskiFScore <= Math.floor(item.fScoreMax * 3 / 9);

  return (
    <tr className={`border-b border-white/5 hover:bg-white/5 ${excluded ? "opacity-40" : ""}`}>
      <td className="py-2 pr-3 text-slate-100 font-semibold">
        {item.ticker}
        <div className="text-[9px] text-slate-500 font-sans">{item.sector}</div>
      </td>
      <td className="text-right pr-3">
        {fmt(item.price, 0)}
        <div className={`text-[9px] ${(item.changePct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {(item.changePct ?? 0) >= 0 ? "+" : ""}{fmt(item.changePct, 2)}%
        </div>
      </td>
      <td className="text-right pr-3 font-semibold text-amber-400">{fmt(item.smartScore, 1)}</td>
      <td className="text-right pr-3">{fmt(item.rsRating, 1)}</td>
      <td className="pr-3">
        <span className={`px-1.5 py-0.5 rounded border text-[9px] ${confClass}`}>{item.confluenceStatusLabel ?? "—"}</span>
        {item.breakoutBoostBadge && <span className="ml-1 px-1 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-700 text-[9px]">⚡Breakout</span>}
        {item.foreignNetBuyFlag && <span className="ml-1 px-1 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-700 text-[9px]" title="Top 5 mã khối ngoại mua ròng mạnh nhất hôm nay (bản tin HOSE)">🌍NN mua ròng</span>}
      </td>
      <td className="pr-3 text-slate-300">{item.trendTag ?? "—"}</td>
      <td className="pr-3">
        <span className={`px-1.5 py-0.5 rounded border text-[9px] ${excluded ? "bg-rose-950 text-rose-400 border-rose-700" : "bg-emerald-950/40 text-emerald-400 border-emerald-800"}`}>
          F-Score {item.piotroskiFScore ?? "—"}/{item.fScoreMax}
        </span>
      </td>
      <td className="text-right pr-3">{item.riskRewardRatio !== null ? fmt(item.riskRewardRatio, 2) : "—"}</td>
      <td className="text-right pr-3">{fmt(item.riskAdjustedMomentum, 2)}</td>
    </tr>
  );
}

export default function SieuQuetAiTab() {
  const { indexState, items, isLoading, error } = useSieuQuetScanner();
  const [sectorFilter, setSectorFilter] = useState<string>("all");

  const sectors = useMemo(() => Array.from(new Set(items.map((i) => i.sector).filter(Boolean))) as string[], [items]);
  const filteredItems = useMemo(
    () => sectorFilter === "all" ? items : items.filter((i) => i.sector === sectorFilter),
    [items, sectorFilter]
  );

  if (isLoading) return <div className="p-6 text-center text-slate-500 text-sm">Đang tải dữ liệu Siêu Quét AI...</div>;
  if (error) return <div className="p-6 text-center text-rose-400 text-sm">Không tải được dữ liệu: {String(error)}</div>;

  return (
    <div className="grid grid-cols-12 gap-4 p-4">
      {/* CỘT TRÁI (4/12) */}
      <section className="col-span-12 lg:col-span-4 flex flex-col gap-4">
        <div style={{ background: "rgba(13,17,26,0.75)", border: "1px solid rgba(255,255,255,0.06)" }} className="rounded-xl p-4">
          <h2 className="text-sm font-semibold text-cyan-400 mb-3">Phân Tích Kỹ Thuật VN-Index Đa Tầng</h2>
          <IndexTechnicalCard state={indexState} />
        </div>
        <div style={{ background: "rgba(13,17,26,0.75)", border: "1px solid rgba(255,255,255,0.06)" }} className="rounded-xl p-4">
          <h2 className="text-sm font-semibold text-blue-400 mb-3">Market Impulse Gauge</h2>
          {indexState && <ImpulseGauge score={indexState.impulseScore} />}
        </div>
        <EventPanel />
        <div style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)" }} className="rounded-xl p-3">
          <p className="text-[9px] text-sky-300">
            Dữ liệu: VN-Index thật (VNDirect), TA/FA thật (Yahoo + VCI) cho {items.length} mã theo dõi.
            Sự kiện: AI Discovery (Gemini + Google Search, 3 lần/ngày) + nhập tay, chỉ sự kiện đã xác nhận mới ảnh hưởng Smart Score.
          </p>
        </div>
      </section>

      {/* CỘT PHẢI (8/12) */}
      <section className="col-span-12 lg:col-span-8 flex flex-col gap-4">
        <div style={{ background: "rgba(13,17,26,0.75)", border: "1px solid rgba(255,255,255,0.06)" }} className="rounded-xl p-4 flex-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-cyan-400">Bảng Siêu Quét AI ({filteredItems.length} mã)</h2>
            <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}
              className="text-[10px] bg-black/40 border border-white/10 rounded px-2 py-1 text-slate-300">
              <option value="all">Tất cả ngành</option>
              {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono">
              <thead className="text-slate-500 border-b border-white/10">
                <tr>
                  <th className="text-left py-2 pr-3">Mã</th>
                  <th className="text-right pr-3">Giá</th>
                  <th className="text-right pr-3">Smart Score</th>
                  <th className="text-right pr-3">RS</th>
                  <th className="text-left pr-3">Đồng Thuận</th>
                  <th className="text-left pr-3">Trend</th>
                  <th className="text-left pr-3">Chất lượng BCTC</th>
                  <th className="text-right pr-3">R/R</th>
                  <th className="text-right pr-3">Risk-Adj Mom.</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => <StockRow key={item.ticker} item={item} />)}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
