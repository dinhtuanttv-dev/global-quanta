import { useEffect, useState, type FormEvent } from "react";
import { fetchMarketJson } from "../../../../services/marketDataClient";
import { plainPct, ratio, signedPct, vnDateTime, vnToday, type EventReactionStudy, type EventSeed, type EventTimeSource } from "./researchFormat";

const muted = "text-[11px] text-slate-400";
const ShowPct = ({ v }: { v: number | null | undefined }) =>
  <span className={v == null ? "text-slate-500" : v >= 0 ? "text-emerald-300" : "text-rose-300"}>{signedPct(v)}</span>;

/**
 * H1 · Sự kiện → phản ứng/hấp thụ proxy → drift (bản đầy đủ). Chuyển từ Quant Edge (Siêu quét AI) 30/10/2026.
 * `seed` = sự kiện chọn từ Radar: điền sẵn mã, ngày, nhãn và THỜI ĐIỂM công bố (Gateway ánh xạ đúng phiên đo).
 */
export default function EventReactionStudyPanel({ symbol, onSymbolChange, seed }: {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  seed: EventSeed | null;
}) {
  const [eventDate, setEventDate] = useState("");
  const [eventLabel, setEventLabel] = useState("");
  const [eventTimestamp, setEventTimestamp] = useState<string | null>(null);
  const [eventTimeSource, setEventTimeSource] = useState<EventTimeSource | null>(null);
  const [data, setData] = useState<EventReactionStudy | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!seed) return;
    setEventDate(seed.eventDate);
    setEventLabel(seed.eventLabel);
    setEventTimestamp(seed.eventTimestamp);
    setEventTimeSource(seed.eventTimeSource);
    setData(null); setError("");
  }, [seed]);
  useEffect(() => { setData(null); }, [symbol]);

  async function run(e: FormEvent) {
    e.preventDefault();
    setError(""); setData(null); setLoading(true);
    try {
      setData(await fetchMarketJson<EventReactionStudy>("/api/market/research/event-reaction", {
        symbol: symbol.trim().toUpperCase(), eventDate, eventLabel: eventLabel.trim(),
        ...(eventTimestamp && eventTimeSource ? { eventTimestamp, eventTimeSource } : {}),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tải được nghiên cứu phản ứng sự kiện.");
    } finally { setLoading(false); }
  }

  const input = "mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-2 text-xs text-white";
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4" data-testid="h1-panel">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-100">H1 · Sự kiện → phản ứng/hấp thụ proxy → drift</h3>
          <p className={muted}>So sánh phản ứng của mã với VN-Index quanh một sự kiện; một sự kiện chỉ là quan sát n=1.</p>
        </div>
        <span className="text-[10px] text-amber-300">Nghiên cứu mô tả · chưa có consensus point-in-time</span>
      </div>
      <form onSubmit={run} className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <label className={muted}>Mã
          <input aria-label="Mã chứng khoán" value={symbol} onChange={(e) => onSymbolChange(e.target.value.toUpperCase())} maxLength={12} required className={input} />
        </label>
        <label className={muted}>Ngày sự kiện
          <input aria-label="Ngày sự kiện" type="date" value={eventDate} max={vnToday()} required className={input}
            onChange={(e) => { setEventDate(e.target.value); setEventTimestamp(null); setEventTimeSource(null); }} />
        </label>
        <label className={muted}>Loại/tên sự kiện
          <input aria-label="Loại hoặc tên sự kiện" value={eventLabel} onChange={(e) => setEventLabel(e.target.value)} maxLength={100} placeholder="KQKD, ĐHĐCĐ, công bố…" required className={input} />
        </label>
        <div className="flex items-end"><button disabled={loading} className="w-full rounded bg-cyan-800 px-3 py-2 text-xs font-semibold text-cyan-50 disabled:opacity-50">{loading ? "Đang tính…" : "Phân tích sự kiện"}</button></div>
      </form>
      {eventTimestamp && <p className="mt-2 text-[10px] text-cyan-300/80" data-testid="h1-seed-note">
        Từ Event Radar · thời điểm {vnDateTime(eventTimestamp)} ({eventTimeSource === "publisher_timestamp" ? "giờ đăng của nguồn" : "giờ Gateway phát hiện lần đầu"}). Nhấn "Phân tích sự kiện" để chạy H1.
      </p>}
      {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
      {data && <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {([
            ["Lợi suất phiên đo", <ShowPct key="a" v={data.event.stockReturn} />],
            ["Vượt VN-Index", <ShowPct key="b" v={data.event.excessReturn} />],
            ["Khối lượng / median 20 phiên", ratio(data.event.abnormalVolumeRatio)],
            ["Imbalance mua/bán đã phân loại", data.event.tickFlow ? signedPct(data.event.tickFlow.signedImbalance) : "Không có tick-flow"],
            ["Tỷ lệ tick được phân loại", plainPct(data.event.tickFlow?.classifiedShare)],
            ["Vị trí giá đóng cửa trong biên ngày", plainPct(data.event.closeLocation)],
          ] as const).map(([label, value]) => <div key={label} className="rounded bg-white/[0.03] p-2"><div className={muted}>{label}</div><div className="text-sm text-slate-100">{value}</div></div>)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-[11px]"><thead className="text-slate-500"><tr><th className="py-1">Sau sự kiện</th><th>Mã</th><th>VN-Index</th><th>Vượt chỉ số</th><th>Trạng thái</th></tr></thead>
            <tbody>{data.drift.map((d) => <tr key={d.horizon} className="border-t border-white/5"><td className="py-1.5">T+{d.horizon}</td><td><ShowPct v={d.stockReturn} /></td><td><ShowPct v={d.benchmarkReturn} /></td><td><ShowPct v={d.excessReturn} /></td><td className={muted}>{d.status === "descriptive" ? "Mô tả" : "Thiếu dữ liệu"}</td></tr>)}</tbody>
          </table>
        </div>
        <p className={muted}>{data.event.absorptionInterpretation}</p>
        <p className="text-[10px] text-slate-500">Phiên đo {data.meta.eventSessionDate ?? data.meta.sourceEventDate ?? eventDate} · nguồn {data.meta.source ?? "—"} · cơ sở giá {data.meta.priceBasis ?? "chưa xác định"} · as-of {data.meta.asOf ?? "—"} · {data.meta.methodVersion}</p>
        {data.meta.warnings.map((w) => <p key={w} className="text-[10px] text-amber-300">• {w}</p>)}
      </div>}
    </div>
  );
}
