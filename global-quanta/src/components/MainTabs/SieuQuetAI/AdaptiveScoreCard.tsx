import { REGIME_LABEL, useResearchSymbol, type ResearchSymbol } from "../../../hooks/useResearch";

const BUY = "#059669";
const SELL = "#e11d48";
const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);

function ProbPill({ h, prob }: { h: number; prob?: number }) {
  if (prob === undefined) return <div className="text-[9px] text-slate-500">T+{h}: —</div>;
  const color = prob >= 0.55 ? BUY : prob <= 0.45 ? SELL : "#64748b";
  const glyph = prob >= 0.55 ? "▲" : prob <= 0.45 ? "▼" : "●";
  return (
    <div className="rounded px-1.5 py-1 text-center" style={{ border: `1px solid ${color}` }}>
      <div className="text-[8.5px] text-slate-400">T+{h}</div>
      <div className="text-[11px] font-semibold" style={{ color }}>{glyph} {pct(prob)}</div>
    </div>
  );
}

/** Nội dung dùng chung cho dòng phụ Siêu Quét và Action Center. */
export function AdaptiveScoreBody({ data, compact = false }: { data: ResearchSymbol; compact?: boolean }) {
  const ready = data.adaptive.filter((a) => a.ready);
  const t5 = data.adaptive.find((a) => a.horizon === 5 && a.ready);
  return (
    <>
      {ready.length ? (
        <>
          <div className="text-[8.5px] text-slate-500 mb-0.5">Xác suất mạnh hơn trung vị thị trường (cùng ngày) sau T+h phiên</div>
          <div className="grid grid-cols-3 gap-1 mb-1.5">
            {[3, 5, 10].map((h) => <ProbPill key={h} h={h} prob={data.adaptive.find((a) => a.horizon === h)?.prob} />)}
          </div>
        </>
      ) : (
        <div className="text-[9px] text-slate-400 mb-1">Chưa có mô hình đạt kiểm định ngoài mẫu — chỉ hiển thị tín hiệu và lịch sử chấm điểm.</div>
      )}
      {t5?.contributions && !compact && (
        <div className="mb-1.5">
          <div className="text-[8.5px] text-slate-500 mb-0.5">Đóng góp vào điểm T+5 (log-odds)</div>
          {t5.contributions.slice(0, 4).map((c) => (
            <div key={c.name} className="flex justify-between text-[9px]">
              <span className="text-slate-400">{c.label}</span>
              <span style={{ color: c.contribution >= 0 ? BUY : SELL }}>{c.contribution >= 0 ? "+" : "−"}{Math.abs(c.contribution).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-[8.5px] text-slate-500 mb-0.5">Tín hiệu đang bật ({data.asOf ?? "—"})</div>
      {data.todaySignals.length ? data.todaySignals.map((s) => {
        const rec = s.trackRecord?.find((r) => r.horizon === 5 && r.regime === (data.regime ?? "ALL")) ?? s.trackRecord?.find((r) => r.horizon === 5 && r.regime === "ALL");
        return (
          <div key={s.signal} className="flex justify-between text-[9px]" title={rec ? `T+5: ${rec.n} lần, KTC95% ${pct(rec.hitLow, 1)}–${pct(rec.hitHigh, 1)}, nền ${pct(rec.baseline, 1)}` : undefined}>
            <span style={{ color: s.direction > 0 ? BUY : SELL }}>{s.direction > 0 ? "▲" : "▼"} {s.label}</span>
            <span className="text-slate-400">{rec ? `lịch sử T+5 trúng ${pct(rec.hitRate)} (n=${rec.n})` : "chưa có lịch sử"}</span>
          </div>
        );
      }) : <div className="text-[9px] text-slate-500">Không có tín hiệu bật.</div>}
    </>
  );
}

/** Thẻ "Điểm thích ứng" trong dòng phụ phân tích khối lượng. */
export default function AdaptiveScoreCard({ symbol }: { symbol: string }) {
  const { data, error, isLoading, enabled } = useResearchSymbol(symbol);
  if (!enabled) return null;
  const shell = (children: React.ReactNode, right?: string) => (
    <div className="rounded-lg p-2.5 mb-2" style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.2)" }}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] text-violet-200 font-semibold">Điểm dòng tiền thích ứng (AI tự học)</div>
        {right && <div className="text-[8.5px] text-slate-400">{right}</div>}
      </div>
      {children}
    </div>
  );
  if (isLoading) return shell(<div className="text-[9px] text-slate-500">Đang tải…</div>);
  if (error || !data || !data.asOf) return shell(<div className="text-[9px] text-slate-500">Chưa có dữ liệu nghiên cứu cho {symbol}.</div>);
  return shell(
    <>
      <AdaptiveScoreBody data={data} />
      {data.profile && (
        <div className="text-[8.5px] text-slate-500 mt-1">
          Volume Profile phiên {data.profile.date}: POC {data.profile.poc.toLocaleString("vi-VN")} · VA {data.profile.vaLow.toLocaleString("vi-VN")}–{data.profile.vaHigh.toLocaleString("vi-VN")} · VWAP {data.profile.vwap.toLocaleString("vi-VN")}
        </div>
      )}
      <div className="text-[8.5px] text-slate-500 mt-1">{data.disclaimer}</div>
    </>,
    data.regime ? `${REGIME_LABEL[data.regime]} · ${data.method === "LEE_READY" ? "Lee–Ready" : "BVC"}` : undefined,
  );
}
