import ProvenanceBadge from "./ProvenanceBadge";
import type { Analysis } from "../../../lib/quant-core";
import type { ForeignDay } from "../../../hooks/useTaFlow";

// Thẻ Order Flow (TA_VNINDEX_UPGRADE_SPEC §2.2.3). Dòng lệnh chủ động là SUY LUẬN (sàn không công bố bên chủ động);
// khối ngoại là dữ liệu sàn theo ngày.
const fmtVol = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(2)}tr` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}k` : a.toFixed(0);
  return `${v < 0 ? "−" : v > 0 ? "+" : ""}${s}`;
};
const fmtBn = (v: number) => `${v < 0 ? "−" : v > 0 ? "+" : ""}${(Math.abs(v) / 1e9).toFixed(1)} tỷ`;
const CARD = { background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" } as const;

export function foreignStats(days: ForeignDay[]) {
  if (!days.length) return null;
  const last = days[days.length - 1];
  const window = days.slice(-21, -1).map((d) => d.netVal);
  const mean = window.reduce((s, x) => s + x, 0) / Math.max(1, window.length);
  const sd = Math.sqrt(window.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, window.length));
  let streak = 0;
  for (let i = days.length - 1; i >= 0 && Math.sign(days[i].netVal) === Math.sign(last.netVal) && last.netVal !== 0; i--) streak++;
  const sum5 = days.slice(-5).reduce((s, d) => s + d.netVal, 0);
  return { last, z20: sd > 0 ? Math.round(((last.netVal - mean) / sd) * 100) / 100 : null, streak, sum5 };
}

interface Props {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  orderFlow: Analysis["orderFlow"];
  largePrintThreshold: number | null;
  foreign: ForeignDay[];
  coverage: { requestedSessions: number; tickSessions: number } | null;
}

export default function OrderFlowPanel({ enabled, loading, error, orderFlow, largePrintThreshold, foreign, coverage }: Props) {
  const fs = foreignStats(foreign);
  return (
    <div style={CARD} className="rounded-xl p-3" data-testid="orderflow-panel">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
        Order Flow · Tape Reading <ProvenanceBadge kind="INFERRED" />
      </p>
      {!enabled ? (
        <p className="text-[10px] text-slate-500">Bật lớp <b>Order Flow</b> hoặc <b>Khối ngoại</b> để tải dòng lệnh theo phút và khối ngoại theo ngày.</p>
      ) : loading ? (
        <p className="text-[10px] text-slate-500">Đang tải dòng lệnh…</p>
      ) : error ? (
        <p className="text-[10px] text-amber-400">⚠ {error}</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
          {orderFlow && (() => {
            const bars = orderFlow.bars;
            const last = bars[bars.length - 1];
            const lastDay = last?.date.slice(0, 10);
            const dayBars = bars.filter((b) => b.date.slice(0, 10) === lastDay);
            const dayDelta = dayBars.reduce((s, b) => s + b.delta, 0);
            const dayLarge = dayBars.reduce((s, b) => s + b.large, 0);
            const dayVol = dayBars.reduce((s, b) => s + b.buy + b.sell, 0);
            const recentAbs = orderFlow.absorption.slice(-3);
            const lastDiv = orderFlow.divergences[orderFlow.divergences.length - 1];
            return (
              <>
                <div>
                  <p className="text-slate-500">Delta nến cuối phiên {lastDay}</p>
                  <p className="font-mono font-bold" style={{ color: dayDelta >= 0 ? "#00F5A0" : "#FF0055" }} data-testid="of-delta">{fmtVol(dayDelta)}</p>
                  <p className="text-slate-600">CVD {fmtVol(last?.cvd ?? 0)}</p>
                </div>
                <div>
                  <p className="text-slate-500">VPIN (độc tính dòng lệnh)</p>
                  <p className="font-mono font-bold" style={{ color: (orderFlow.vpin.percentile ?? 0) >= 90 ? "#FF0055" : "#e2e8f0" }} data-testid="of-vpin">
                    {orderFlow.vpin.latest ?? "—"}{orderFlow.vpin.percentile !== null && <span className="text-slate-500 font-normal"> · p{orderFlow.vpin.percentile}</span>}
                  </p>
                  <p className="text-slate-600">{(orderFlow.vpin.percentile ?? 0) >= 90 ? "⚠ ≥ p90: biến động cao" : "rổ = KL TB phiên / 50"}</p>
                </div>
                <div>
                  <p className="text-slate-500">Absorption · CVD divergence</p>
                  <p className="font-mono text-violet-300" data-testid="of-abs">{orderFlow.absorption.length} ◆ · {orderFlow.divergences.length} Div</p>
                  <p className="text-slate-600">{recentAbs.length ? `gần nhất ${recentAbs[recentAbs.length - 1].dir === "bullish" ? "▲ bán bị hấp thụ" : "▼ mua bị hấp thụ"}` : lastDiv ? `Div ${lastDiv.dir === "bullish" ? "▲" : "▼"} ${lastDiv.date.slice(5, 16)}` : "chưa có"}</p>
                </div>
                <div>
                  <p className="text-slate-500">Lệnh lớn (≥ p99{largePrintThreshold ? ` = ${largePrintThreshold.toLocaleString("vi-VN")} cp` : ""})</p>
                  <p className="font-mono text-slate-200">{dayVol > 0 ? `${Math.round((dayLarge / dayVol) * 100)}% KL phiên` : "—"}</p>
                  <p className="text-slate-600">Nguồn: tick {orderFlow.coverage.tickPct}% nến · BVC {100 - orderFlow.coverage.tickPct}%</p>
                </div>
              </>
            );
          })()}
          {fs && (
            <div className="col-span-2 md:col-span-4 border-t border-white/5 pt-2 flex flex-wrap gap-x-4 gap-y-1 items-center" data-testid="of-foreign">
              <span className="flex items-center gap-1 text-slate-400">Khối ngoại <ProvenanceBadge kind="HARD" className="" /></span>
              <span className="font-mono" style={{ color: fs.last.netVal >= 0 ? "#00F5A0" : "#FF0055" }}>{fs.last.date}: ròng {fmtBn(fs.last.netVal)}</span>
              {fs.z20 !== null && <span className="font-mono text-slate-300">z20 {fs.z20}</span>}
              <span className="text-slate-400">{fs.streak} phiên {fs.last.netVal >= 0 ? "mua" : "bán"} ròng liên tiếp</span>
              <span className="font-mono text-slate-400">5 phiên {fmtBn(fs.sum5)}</span>
              {fs.last.room !== null && <span className="text-slate-500">room còn {(fs.last.room / 1e6).toFixed(1)}tr cp</span>}
            </div>
          )}
          <p className="col-span-2 md:col-span-4 text-[8.5px] text-slate-600">
            Sàn không công bố bên chủ động: Mua/Bán chủ động là ước lượng Lee–Ready (tick, {coverage?.tickSessions ?? 0}/{coverage?.requestedSessions ?? 0} phiên có dữ liệu) hoặc BVC (phiên chưa có tick). Khớp ATO/ATC không có bên chủ động, đã tách riêng.
          </p>
        </div>
      )}
    </div>
  );
}
