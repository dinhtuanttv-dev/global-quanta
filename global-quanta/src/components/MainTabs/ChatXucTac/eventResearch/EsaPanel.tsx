import { useCallback, useEffect, useState } from "react";
import { fetchMarketJson } from "../../../../services/marketDataClient";

type EsaSnapshot = {
  symbol: string;
  status: "research_only" | "insufficient_data" | "market_closed" | "stale";
  mode: string;
  sessionLive: boolean;
  asOf: string | null;
  ageMs: number | null;
  reason: string | null;
  observation: null | {
    sessionDate: string;
    observedMinute: string;
    currentCumulativeVolume: number;
    historicalMedianAtSameTime: number;
    relativeVolume: number;
    robustZ: number | null;
    priceChangePct: number | null;
    direction: "up" | "down" | "flat" | "unknown";
    sampleSize: number;
    source: string;
  };
  alert: null | {
    type: string;
    severity: "high_anomaly" | "unusual_activity";
    triggeredBy: string[];
    interpretation: string;
  };
  eventContext: { eventId: string; title: string; eventType: string; source: string; publishedAt: string | null; verificationStatus: string; severity: string; url: string | null }[];
  method: { version: string; baseline: string; normalization: string; minimumHistorySessions: number; probabilityAvailable: false };
  disclaimer: string;
};

const number = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("vi-VN", { maximumFractionDigits: digits });
const volume = (value: number) => new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 2 }).format(value);
const safeExternalHref = (value: string | null) => {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
};

export default function EliteSignalAmplifierPanel({ symbol }: { symbol: string | null }) {
  const [snapshot, setSnapshot] = useState<EsaSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (active: () => boolean = () => true) => {
    if (!symbol) { setSnapshot(null); setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const data = await fetchMarketJson<EsaSnapshot>(`/api/market/research/esa/${encodeURIComponent(symbol.trim().toUpperCase())}`);
      if (active()) setSnapshot(data);
    } catch (cause) {
      if (active()) setError(cause instanceof Error ? cause.message : "Không tải được snapshot ESA.");
    } finally {
      if (active()) setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    let alive = true;
    setSnapshot(null);
    setError("");
    void refresh(() => alive);
    const timer = window.setInterval(() => { void refresh(() => alive); }, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [refresh]);

  const panel = "rounded-xl border border-cyan-900/60 bg-slate-950/80 p-4";
  const muted = "text-[10px] text-slate-400";
  const obs = snapshot?.observation;

  return (
    <section className={panel} aria-labelledby="esa-panel-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="esa-panel-title" className="text-xs font-semibold tracking-wide text-cyan-200">ESA · Cảnh báo bất thường intraday</h3>
          <p className={`${muted} mt-1`}>Đối chiếu volume lũy kế với cùng thời điểm ở các phiên trước; đây chưa phải dự báo giá.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-amber-700/60 px-2 py-1 text-[9px] font-semibold text-amber-300">RESEARCH ONLY</span>
          <button type="button" onClick={() => void refresh()} disabled={loading || !symbol} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300 disabled:opacity-50">
            {loading ? "Đang cập nhật…" : "Cập nhật"}
          </button>
        </div>
      </div>

      {!symbol && <p className={`${muted} mt-3`}>Chọn một mã để xem hoạt động trong phiên.</p>}
      {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
      {loading && !snapshot && <p className={`${muted} mt-3`}>Đang tải dữ liệu Gateway…</p>}
      {snapshot && (
        <div className="mt-3 space-y-3">
          {snapshot.status === "market_closed" && <p className="rounded bg-slate-900 px-3 py-2 text-[11px] text-slate-300">Ngoài phiên · {snapshot.reason}</p>}
          {snapshot.status === "insufficient_data" && <p className="rounded bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200">Chưa đủ dữ liệu · {snapshot.reason}</p>}
          {snapshot.status === "stale" && <p className="rounded bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200">Snapshot cũ · {snapshot.reason}</p>}

          {obs && <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Metric label="Volume lũy kế" value={volume(obs.currentCumulativeVolume)} sub={`trung vị cùng giờ ${volume(obs.historicalMedianAtSameTime)}`} />
              <Metric label="Tương đối cùng giờ" value={`${number(obs.relativeVolume)}×`} sub={`mẫu ${obs.sampleSize} phiên`} />
              <Metric label="Z robust" value={number(obs.robustZ)} sub="(giá trị − median) / (1.4826 × MAD)" />
              <Metric label="Giá từ tham chiếu phiên" value={obs.priceChangePct == null ? "—" : `${obs.priceChangePct >= 0 ? "+" : ""}${number(obs.priceChangePct)}%`} sub={`hướng quan sát: ${obs.direction}`} />
            </div>
            {snapshot.alert
              ? <div className={`rounded border px-3 py-2 ${snapshot.alert.severity === "high_anomaly" ? "border-rose-800/70 bg-rose-950/20" : "border-amber-800/70 bg-amber-950/20"}`}>
                  <p className="text-[11px] font-semibold text-slate-100">Hoạt động bất thường · {snapshot.alert.severity === "high_anomaly" ? "mức cao" : "đáng chú ý"}</p>
                  <p className="mt-1 text-[10px] text-slate-300">{snapshot.alert.interpretation}</p>
                </div>
              : snapshot.status === "research_only"
                ? <p className="rounded bg-slate-900 px-3 py-2 text-[10px] text-slate-400">Chưa đạt cổng bất thường của bản nghiên cứu này.</p>
                : null}
          </>}

          {snapshot.eventContext.length > 0 && <div>
            <p className={`${muted} mb-1`}>Sự kiện liên quan trong Event Radar · tham khảo ngữ cảnh, không được dùng để nâng mức cảnh báo</p>
            <ul className="space-y-1">{snapshot.eventContext.map((event) => <li key={event.eventId} className="text-[10px] text-slate-300">
              {safeExternalHref(event.url) ? <a className="text-cyan-300 hover:underline" href={safeExternalHref(event.url) ?? undefined} target="_blank" rel="noreferrer">{event.title}</a> : event.title}
              <span className="text-slate-500"> · {event.source} · {event.verificationStatus}</span>
            </li>)}</ul>
          </div>}

          <p className="border-t border-white/5 pt-2 text-[9px] text-slate-500">
            {snapshot.method.version} · {snapshot.observation?.source ?? "SSI FC Data qua Market Gateway"} · as-of {snapshot.asOf ?? "—"} · tuổi dữ liệu {snapshot.ageMs == null ? "—" : `${Math.round(snapshot.ageMs / 1000)} giây`} · {snapshot.disclaimer}
          </p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-lg bg-white/[0.035] p-2.5">
    <p className="text-[9px] text-slate-400">{label}</p>
    <p className="mt-1 text-sm font-semibold tabular-nums text-slate-100">{value}</p>
    <p className="mt-1 text-[9px] text-slate-500">{sub}</p>
  </div>;
}
