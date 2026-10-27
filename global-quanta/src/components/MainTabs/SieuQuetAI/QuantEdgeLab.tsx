import { useEffect, useState, type FormEvent } from "react";
import { fetchMarketJson } from "../../../services/marketDataClient";
import EliteSignalAmplifierPanel from "./EliteSignalAmplifierPanel";

type EventReaction = {
  kind: string; symbol: string; eventDate: string; eventLabel: string; status: string;
  event: {
    stockReturn: number | null; benchmarkReturn: number | null; excessReturn: number | null;
    abnormalVolumeRatio: number | null; intradayRangePct: number | null; closeLocation: number | null;
    tickFlow: { minutes: number; classifiedShare: number | null; signedImbalance: number | null; method: string } | null;
    absorptionInterpretation: string;
  };
  drift: { horizon: number; status: string; stockReturn: number | null; benchmarkReturn: number | null; excessReturn: number | null }[];
  meta: { asOf: string | null; source: string | null; priceBasis: string | null; methodVersion: string; warnings: string[] };
};

type Leadership = {
  status: string; asOf?: string; currentRegime?: string; horizonSessions?: number; observationSessions?: number;
  reason?: string;
  sectors?: { sector: string; rank: number; sectorCount: number; excessReturn20: number | null; sampleStocks: number;
    topQuartileRate: number | null; persistenceSessions: number; byRegime: Record<string, { topQuartileRate: number | null; sessions: number }>;
    leaders: { symbol: string; excessReturn20: number | null }[] }[];
  meta?: { universe?: string; sectorMap?: string; methodVersion?: string; warnings?: string[]; dataCoverage?: { dates: number } };
};

const pct = (v: number | null | undefined, digits = 1) => v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(digits)}%`;
const plainPct = (v: number | null | undefined) => v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(0)}%`;
const ratio = (v: number | null | undefined) => v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(2)}×`;
const dateToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function QuantEdgeLab({ defaultTicker }: { defaultTicker: string | null }) {
  const [symbol, setSymbol] = useState(defaultTicker ?? "FPT");
  const [eventDate, setEventDate] = useState("");
  const [eventLabel, setEventLabel] = useState("");
  const [eventData, setEventData] = useState<EventReaction | null>(null);
  const [eventError, setEventError] = useState("");
  const [eventLoading, setEventLoading] = useState(false);
  const [leadership, setLeadership] = useState<Leadership | null>(null);
  const [leadershipError, setLeadershipError] = useState("");
  const [leadershipLoading, setLeadershipLoading] = useState(false);

  useEffect(() => {
    if (defaultTicker) { setSymbol(defaultTicker); setEventData(null); }
  }, [defaultTicker]);
  useEffect(() => {
    let alive = true;
    setLeadershipLoading(true);
    fetchMarketJson<Leadership>("/api/market/research/leadership", { lookback: 63, horizon: 20 })
      .then((data) => { if (alive) setLeadership(data); })
      .catch((error) => { if (alive) setLeadershipError(error instanceof Error ? error.message : "Không tải được nghiên cứu leadership."); })
      .finally(() => { if (alive) setLeadershipLoading(false); });
    return () => { alive = false; };
  }, []);

  async function runEventStudy(e: FormEvent) {
    e.preventDefault();
    setEventError(""); setEventData(null); setEventLoading(true);
    try {
      const data = await fetchMarketJson<EventReaction>("/api/market/research/event-reaction", {
        symbol: symbol.trim().toUpperCase(), eventDate, eventLabel: eventLabel.trim(),
      });
      setEventData(data);
    } catch (error) {
      setEventError(error instanceof Error ? error.message : "Không tải được event reaction study.");
    } finally { setEventLoading(false); }
  }

  async function refreshLeadership() {
    setLeadershipError(""); setLeadershipLoading(true);
    try {
      setLeadership(await fetchMarketJson<Leadership>("/api/market/research/leadership", { lookback: 63, horizon: 20 }));
    } catch (error) {
      setLeadershipError(error instanceof Error ? error.message : "Không tải được nghiên cứu leadership.");
    } finally { setLeadershipLoading(false); }
  }

  const panel = "rounded-xl border border-white/10 bg-slate-950/70 p-4";
  const muted = "text-[11px] text-slate-400";
  const showPct = (v: number | null) => <span className={v === null ? "text-slate-500" : v >= 0 ? "text-emerald-300" : "text-rose-300"}>{pct(v)}</span>;

  return (
    <section className="space-y-4" aria-labelledby="quant-edge-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="quant-edge-title" className="text-sm font-semibold text-cyan-200">Quant Edge · nghiên cứu H1/H2</h2>
          <p className={muted}>Phân tích lịch sử mô tả; chưa phải dự báo đã hiệu chuẩn hay khuyến nghị giao dịch.</p>
        </div>
        <span className="rounded border border-amber-700/60 px-2 py-1 text-[10px] text-amber-300">RESEARCH ONLY</span>
      </div>

      <EliteSignalAmplifierPanel symbol={symbol} />

      <div className={panel}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div><h3 className="text-xs font-semibold text-slate-100">H1 · Sự kiện → phản ứng/hấp thụ proxy → drift</h3><p className={muted}>Nhập ngày sự kiện để so sánh phản ứng mã với VN-Index; một sự kiện chỉ là quan sát n=1.</p></div>
          <span className="text-[10px] text-amber-300">Reaction study · chưa có consensus point-in-time</span>
        </div>
        <form onSubmit={runEventStudy} className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className={muted}>Mã
            <input aria-label="Mã chứng khoán" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} maxLength={12} required className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-2 text-xs text-white" />
          </label>
          <label className={muted}>Ngày sự kiện
            <input aria-label="Ngày sự kiện" type="date" value={eventDate} max={dateToday()} onChange={(e) => setEventDate(e.target.value)} required className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-2 text-xs text-white" />
          </label>
          <label className={muted}>Loại/tên sự kiện
            <input aria-label="Loại hoặc tên sự kiện" value={eventLabel} onChange={(e) => setEventLabel(e.target.value)} maxLength={100} placeholder="KQKD, ĐHCĐ, công bố…" required className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-2 text-xs text-white" />
          </label>
          <div className="flex items-end"><button disabled={eventLoading} className="w-full rounded bg-cyan-800 px-3 py-2 text-xs font-semibold text-cyan-50 disabled:opacity-50">{eventLoading ? "Đang tính…" : "Phân tích sự kiện"}</button></div>
        </form>
        {eventError && <p role="alert" className="mt-3 text-xs text-rose-300">{eventError}</p>}
        {eventData && <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <div className="rounded bg-white/[0.03] p-2"><div className={muted}>Lợi suất sự kiện</div><div className="text-sm">{showPct(eventData.event.stockReturn)}</div></div>
            <div className="rounded bg-white/[0.03] p-2"><div className={muted}>Vượt VN-Index</div><div className="text-sm">{showPct(eventData.event.excessReturn)}</div></div>
            <div className="rounded bg-white/[0.03] p-2"><div className={muted}>Khối lượng / median 20 phiên</div><div className="text-sm text-slate-100">{ratio(eventData.event.abnormalVolumeRatio)}</div></div>
            <div className="rounded bg-white/[0.03] p-2"><div className={muted}>Imbalance mua/bán đã phân loại</div><div className="text-sm text-slate-100">{eventData.event.tickFlow ? pct(eventData.event.tickFlow.signedImbalance) : "Không có tick-flow"}</div></div>
            <div className="rounded bg-white/[0.03] p-2"><div className={muted}>Tỷ lệ tick được phân loại</div><div className="text-sm text-slate-100">{plainPct(eventData.event.tickFlow?.classifiedShare)}</div></div>
            <div className="rounded bg-white/[0.03] p-2"><div className={muted}>Vị trí giá đóng cửa trong biên ngày</div><div className="text-sm text-slate-100">{plainPct(eventData.event.closeLocation)}</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] text-left text-[11px]"><thead className="text-slate-500"><tr><th className="py-1">Sau sự kiện</th><th>Mã</th><th>VN-Index</th><th>Vượt chỉ số</th><th>Trạng thái</th></tr></thead>
              <tbody>{eventData.drift.map((d) => <tr key={d.horizon} className="border-t border-white/5"><td className="py-1.5">T+{d.horizon}</td><td>{showPct(d.stockReturn)}</td><td>{showPct(d.benchmarkReturn)}</td><td>{showPct(d.excessReturn)}</td><td className={muted}>{d.status === "descriptive" ? "Mô tả" : "Thiếu dữ liệu"}</td></tr>)}</tbody>
            </table>
          </div>
          <p className={muted}>{eventData.event.absorptionInterpretation}</p>
          <p className="text-[10px] text-slate-500">Nguồn {eventData.meta.source ?? "—"} · cơ sở giá {eventData.meta.priceBasis ?? "chưa xác định"} · as-of {eventData.meta.asOf ?? "—"} · {eventData.meta.methodVersion}</p>
          {eventData.meta.warnings.map((w) => <p key={w} className="text-[10px] text-amber-300">• {w}</p>)}
        </div>}
      </div>

      <div className={panel}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="text-xs font-semibold text-slate-100">H2 · Độ bền leadership theo regime</h3><p className={muted}>Tỷ lệ số phiên một ngành thuộc nhóm top 25% excess return trong horizon 20 phiên.</p></div>
          <button onClick={refreshLeadership} disabled={leadershipLoading} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300 disabled:opacity-50">{leadershipLoading ? "Đang tải…" : "Làm mới"}</button>
        </div>
        {leadershipError && <p role="alert" className="text-xs text-rose-300">{leadershipError}</p>}
        {leadershipLoading && !leadership && <p className={muted}>Đang tải lịch sử ngành…</p>}
        {leadership?.status === "insufficient_data" && <p className={muted}>{leadership.reason}</p>}
        {leadership?.sectors && <>
          <p className="mb-2 text-[10px] text-slate-500">As-of {leadership.asOf} · regime {leadership.currentRegime} · {leadership.observationSessions} phiên quan sát · xếp theo excess return hiện tại</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-[10px]">
            <thead className="text-slate-500"><tr><th className="py-1">#</th><th>Ngành</th><th>Excess T+20</th><th>Tỷ lệ top 25%</th><th>Trong regime hiện tại</th><th>Mã dẫn đầu</th></tr></thead>
            <tbody>{leadership.sectors.slice(0, 12).map((s) => {
              const reg = s.byRegime[leadership.currentRegime ?? "UNKNOWN"];
              return <tr key={s.sector} className="border-t border-white/5"><td className="py-1.5">{s.rank}/{s.sectorCount}</td><td className="text-slate-200">{s.sector}</td><td>{showPct(s.excessReturn20)}</td><td>{s.topQuartileRate === null ? "—" : `${(s.topQuartileRate * 100).toFixed(0)}%`} <span className="text-slate-500">({s.persistenceSessions})</span></td><td>{reg?.topQuartileRate == null ? "—" : `${(reg.topQuartileRate * 100).toFixed(0)}%`} <span className="text-slate-500">({reg?.sessions ?? 0})</span></td><td className="text-slate-400">{s.leaders.map((x) => x.symbol).join(", ") || "—"}</td></tr>;
            })}</tbody>
          </table></div>
          {leadership.meta?.warnings?.map((w) => <p key={w} className="mt-2 text-[10px] text-amber-300">• {w}</p>)}
        </>}
      </div>
    </section>
  );
}
