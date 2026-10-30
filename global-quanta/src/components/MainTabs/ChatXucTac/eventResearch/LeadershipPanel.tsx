import { useCallback, useEffect, useState } from "react";
import { fetchMarketJson } from "../../../../services/marketDataClient";
import { signedPct } from "./researchFormat";

type Leadership = {
  status: string; asOf?: string; currentRegime?: string; horizonSessions?: number; observationSessions?: number;
  reason?: string;
  sectors?: { sector: string; rank: number; sectorCount: number; excessReturn20: number | null; sampleStocks: number;
    topQuartileRate: number | null; persistenceSessions: number; byRegime: Record<string, { topQuartileRate: number | null; sessions: number }>;
    leaders: { symbol: string; excessReturn20: number | null }[] }[];
  meta?: { universe?: string; sectorMap?: string; methodVersion?: string; warnings?: string[]; dataCoverage?: { dates: number } };
};

const muted = "text-[11px] text-slate-400";
const rate = (v: number | null | undefined) => v == null ? "—" : `${(v * 100).toFixed(0)}%`;

/** H2 · Độ bền leadership theo regime (chuyển từ Quant Edge, Siêu quét AI — 30/10/2026). Chỉ tải khi phần chuyên sâu được mở. */
export default function LeadershipPanel() {
  const [data, setData] = useState<Leadership | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (alive: () => boolean = () => true) => {
    setError(""); setLoading(true);
    try {
      const d = await fetchMarketJson<Leadership>("/api/market/research/leadership", { lookback: 63, horizon: 20 });
      if (alive()) setData(d);
    } catch (cause) {
      if (alive()) setError(cause instanceof Error ? cause.message : "Không tải được nghiên cứu leadership.");
    } finally { if (alive()) setLoading(false); }
  }, []);
  useEffect(() => { let alive = true; void load(() => alive); return () => { alive = false; }; }, [load]);

  const color = (v: number | null) => <span className={v == null ? "text-slate-500" : v >= 0 ? "text-emerald-300" : "text-rose-300"}>{signedPct(v)}</span>;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4" data-testid="h2-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-xs font-semibold text-slate-100">H2 · Độ bền leadership theo regime</h3>
          <p className={muted}>Tỷ lệ số phiên một ngành thuộc nhóm top 25% excess return trong horizon 20 phiên.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300 disabled:opacity-50">{loading ? "Đang tải…" : "Làm mới"}</button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      {loading && !data && <p className={muted}>Đang tải lịch sử ngành…</p>}
      {data?.status === "insufficient_data" && <p className={muted}>{data.reason}</p>}
      {data?.sectors && <>
        <p className="mb-2 text-[10px] text-slate-500">As-of {data.asOf} · regime {data.currentRegime} · {data.observationSessions} phiên quan sát · xếp theo excess return hiện tại</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-[10px]">
          <thead className="text-slate-500"><tr><th className="py-1">#</th><th>Ngành</th><th>Excess T+20</th><th>Tỷ lệ top 25%</th><th>Trong regime hiện tại</th><th>Mã dẫn đầu</th></tr></thead>
          <tbody>{data.sectors.slice(0, 12).map((s) => {
            const reg = s.byRegime[data.currentRegime ?? "UNKNOWN"];
            return <tr key={s.sector} className="border-t border-white/5"><td className="py-1.5">{s.rank}/{s.sectorCount}</td><td className="text-slate-200">{s.sector}</td><td>{color(s.excessReturn20)}</td>
              <td>{rate(s.topQuartileRate)} <span className="text-slate-500">({s.persistenceSessions})</span></td>
              <td>{rate(reg?.topQuartileRate)} <span className="text-slate-500">({reg?.sessions ?? 0})</span></td>
              <td className="text-slate-400">{s.leaders.map((x) => x.symbol).join(", ") || "—"}</td></tr>;
          })}</tbody>
        </table></div>
        {data.meta?.warnings?.map((w) => <p key={w} className="mt-2 text-[10px] text-amber-300">• {w}</p>)}
      </>}
    </div>
  );
}
