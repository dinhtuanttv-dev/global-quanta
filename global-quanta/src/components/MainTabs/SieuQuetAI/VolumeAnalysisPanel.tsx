import type { ReactNode } from "react";
import { useVolumeAnalysis, type VolumeAnalysis } from "../../../hooks/useVolumeAnalysis";
import IntradayCyclePanel from "./IntradayCyclePanel";
import IntentFootprintPanel from "./IntentFootprintPanel";
import { useIntradayCycle } from "../../../hooks/useIntradayCycle";

// Màu: phiên tăng/giảm giữ quy ước xanh/đỏ của bảng. Cặp này chỉ đạt ΔE 5.8 với
// người mù màu đỏ–lục nên LUÔN kèm mã hoá phụ: cột tăng ĐẶC, cột giảm RỖNG (viền).
const UP = "#059669";
const DOWN = "#e11d48";
const ACCENT = "#0284c7";
const GRID = "rgba(148,163,184,0.18)";

const fmtInt = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("vi-VN"));
const fmtVol = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)} tr`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)} k`;
  return String(Math.round(v));
};
const fmtBn = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v >= 0 ? "" : "−"}${(Math.abs(v) / 1e9).toFixed(1)} tỷ`);
const signed = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}`);

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="text-[9px] text-slate-500 font-sans">{label}</div>
      <div className={`text-sm font-semibold ${tone === "up" ? "text-emerald-400" : tone === "down" ? "text-rose-400" : "text-slate-100"}`}>{value}</div>
      {sub && <div className="text-[9px] text-slate-500 font-sans">{sub}</div>}
    </div>
  );
}

function ChartBox({ title, legend, children }: { title: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] text-slate-300 font-sans font-semibold">{title}</div>
        {legend && <div className="flex items-center gap-2 text-[9px] text-slate-400 font-sans">{legend}</div>}
      </div>
      {children}
    </div>
  );
}

/** Cột KL 30 phiên: đặc = phiên tăng, rỗng = phiên giảm; đường đứt = KL bình quân 20 phiên. */
function VolumeBars({ data }: { data: VolumeAnalysis["trend"] }) {
  const W = 300, H = 90, pad = 2;
  const max = Math.max(...data.bars30.map((b) => b.volume), data.ma20Volume ?? 0, 1);
  const bw = W / data.bars30.length;
  const y = (v: number) => H - (v / max) * (H - pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" role="img" aria-label="Khối lượng 30 phiên">
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke={GRID} />
      {data.bars30.map((b, i) => {
        const h = Math.max(1, H - y(b.volume));
        const color = b.up ? UP : DOWN;
        return (
          <g key={b.date}>
            <rect x={i * bw + 1} y={0} width={bw - 2} height={H} fill="transparent">
              <title>{`${b.date}: ${fmtInt(b.volume)} cp · ${fmtBn(b.value)} · ${b.up ? "phiên tăng" : "phiên giảm"}`}</title>
            </rect>
            <rect x={i * bw + 1.5} y={H - h} width={Math.max(1, bw - 3)} height={h} rx={1.5}
              fill={b.up ? color : "none"} stroke={color} strokeWidth={b.up ? 0 : 1.2} pointerEvents="none" />
          </g>
        );
      })}
      {data.ma20Volume ? <line x1={0} x2={W} y1={y(data.ma20Volume)} y2={y(data.ma20Volume)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" /> : null}
    </svg>
  );
}

/** KN ròng 20 phiên: trên trục 0 = mua ròng, dưới = bán ròng (vị trí mã hoá chiều, màu chỉ nhấn mạnh). */
function ForeignBars({ series }: { series: VolumeAnalysis["foreign"]["netSeries20"] }) {
  const W = 300, H = 70, mid = H / 2;
  const max = Math.max(...series.map((s) => Math.abs(s.netVal)), 1);
  const bw = W / Math.max(series.length, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" role="img" aria-label="Khối ngoại mua bán ròng 20 phiên">
      <line x1={0} x2={W} y1={mid} y2={mid} stroke={GRID} />
      {series.map((s, i) => {
        const h = Math.max(1, (Math.abs(s.netVal) / max) * (mid - 2));
        const up = s.netVal >= 0;
        return (
          <g key={s.date}>
            <rect x={i * bw + 1} y={0} width={bw - 2} height={H} fill="transparent"><title>{`${s.date}: ${up ? "mua" : "bán"} ròng ${fmtBn(Math.abs(s.netVal))}`}</title></rect>
            <rect x={i * bw + 1.5} y={up ? mid - h : mid} width={Math.max(1, bw - 3)} height={h} rx={1.5} fill={up ? UP : DOWN} pointerEvents="none" />
          </g>
        );
      })}
    </svg>
  );
}

/** Phân bổ KL theo giá: dải sáng = vùng giá trị 70%, cột đậm = POC, đường ngang = giá hiện tại. */
function Profile({ profile, price }: { profile: NonNullable<VolumeAnalysis["profile"]>; price: number }) {
  const W = 300, H = 120;
  const lo = profile.bins[0].priceLow, hi = profile.bins[profile.bins.length - 1].priceHigh;
  const max = Math.max(...profile.bins.map((b) => b.volume), 1);
  const yOf = (p: number) => H - ((p - lo) / (hi - lo || 1)) * H;
  const bh = H / profile.bins.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" role="img" aria-label="Phân bổ khối lượng theo giá">
      <rect x={0} y={yOf(profile.valueAreaHigh)} width={W} height={Math.max(1, yOf(profile.valueAreaLow) - yOf(profile.valueAreaHigh))} fill="rgba(2,132,199,0.10)" />
      {profile.bins.map((b, i) => {
        const isPoc = profile.poc >= b.priceLow && profile.poc <= b.priceHigh;
        const w = Math.max(1, (b.volume / max) * (W - 60));
        const yTop = H - (i + 1) * bh;
        return (
          <g key={i}>
            <rect x={0} y={yTop} width={W} height={bh} fill="transparent"><title>{`${fmtInt(b.priceLow)}–${fmtInt(b.priceHigh)}: ${fmtInt(b.volume)} cp${isPoc ? " (POC)" : ""}`}</title></rect>
            <rect x={0} y={yTop + 1} width={w} height={Math.max(1, bh - 2)} rx={1.5} fill={ACCENT} opacity={isPoc ? 1 : 0.45} pointerEvents="none" />
          </g>
        );
      })}
      <line x1={0} x2={W} y1={yOf(price)} y2={yOf(price)} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="2 2" />
      <text x={W - 2} y={Math.max(9, yOf(price) - 3)} textAnchor="end" fontSize={8} fill="#cbd5e1">giá {fmtInt(price)}</text>
    </svg>
  );
}

function IntradayBars({ buckets }: { buckets: { time: string; volume: number }[] }) {
  const W = 300, H = 60;
  const max = Math.max(...buckets.map((b) => b.volume), 1);
  const bw = W / Math.max(buckets.length, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H + 10}`} className="w-full h-20" role="img" aria-label="Khối lượng trong phiên theo khung 15 phút">
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke={GRID} />
      {buckets.map((b, i) => {
        const h = Math.max(1, (b.volume / max) * (H - 2));
        return (
          <g key={b.time}>
            <rect x={i * bw + 1} y={0} width={bw - 2} height={H} fill="transparent"><title>{`${b.time}: ${fmtInt(b.volume)} cp`}</title></rect>
            <rect x={i * bw + 1.5} y={H - h} width={Math.max(1, bw - 3)} height={h} rx={1.5} fill={ACCENT} pointerEvents="none" />
            {(i === 0 || i === buckets.length - 1) && <text x={i * bw + bw / 2} y={H + 9} textAnchor="middle" fontSize={7} fill="#94a3b8">{b.time}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export default function VolumeAnalysisPanel({ symbol }: { symbol: string }) {
  const { data, error, isLoading } = useVolumeAnalysis(symbol);
  // Cùng khoá SWR với phần Nhịp -> không gọi thêm; dùng làm nguồn DUY NHẤT cho RVOL theo thời điểm.
  const { data: cycle } = useIntradayCycle(symbol);

  if (isLoading && !data) return <div className="p-3 text-[10px] text-slate-500 font-sans">Đang phân tích khối lượng {symbol}…</div>;
  if (error || !data) return <div className="p-3 text-[10px] text-rose-400 font-sans">Không tải được phân tích khối lượng: {String(error?.message ?? "không có dữ liệu")}</div>;

  const { today, trend, foreign, profile, intraday } = data;
  const obvLabel = { up: "đi lên", down: "đi xuống", flat: "đi ngang" }[trend.obvDirection];

  return (
    <div className="p-3 font-sans" style={{ background: "rgba(2,132,199,0.04)" }}>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[11px] font-semibold text-cyan-300">Phân tích khối lượng · {symbol}</div>
        <div className="text-[9px] text-slate-500">
          Dữ liệu SSI tới phiên {data.asOf}{data.partialToday ? " (hôm nay đang giao dịch)" : ""} · nhấn đúp hoặc Esc để đóng
        </div>
      </div>

      <IntradayCyclePanel symbol={symbol} />
      <IntentFootprintPanel symbol={symbol} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-2">
        <Tile label="KL khớp hôm nay" value={fmtVol(today.volume)} sub={`TB20: ${fmtVol(today.avgVolume20)}`} />
        {today.rvolMode === "intraday"
          ? <Tile label="RVOL theo thời điểm" value={today.rvolTimeAdjusted !== null ? `${today.rvolTimeAdjusted}×` : "—"} sub="so KL cùng giờ các phiên trước" tone={today.rvolTimeAdjusted !== null && today.rvolTimeAdjusted >= 1.5 ? "up" : undefined} />
          : <Tile label="RVOL (so TB 20 phiên)" value={today.rvol20 !== null ? `${today.rvol20}×` : "—"} tone={today.rvol20 !== null && today.rvol20 >= 1.5 ? "up" : undefined} />}
        {cycle?.current?.timeAdjustedRvol != null
          ? <Tile label="So cùng thời điểm" value={`${cycle.current.timeAdjustedRvol.toFixed(2)}×`} sub="trung vị 20 phiên (như phần Nhịp)" />
          : <Tile label="So cùng thời điểm" value={intraday?.sameTime ? `${intraday.sameTime.ratio}×` : "—"} sub={intraday?.sameTime ? `tới ${intraday.sameTime.asOfTime}, trung vị ${intraday.sameTime.sessions} phiên` : undefined} />}
        <Tile label="GT khớp / thoả thuận" value={fmtBn(today.value)} sub={`TT: ${fmtBn(today.dealValue)}`} />
        {foreign.today
          ? <Tile label="Khối ngoại ròng hôm nay" value={fmtBn(foreign.today.netVal)} tone={foreign.today.netVal > 0 ? "up" : foreign.today.netVal < 0 ? "down" : undefined}
              sub={`mua ${foreign.buySharePct ?? "—"}% · bán ${foreign.sellSharePct ?? "—"}% GT`} />
          : <Tile label="Khối ngoại ròng hôm nay" value="Chưa có" sub={`trong phiên · số chốt tới ${foreign.lastSettledDate}`} />}
        <Tile label="KN ròng 5 / 20 phiên" value={fmtBn(foreign.net5Val)} sub={`20 phiên: ${fmtBn(foreign.net20Val)}`} tone={foreign.net5Val > 0 ? "up" : foreign.net5Val < 0 ? "down" : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-2">
        <ChartBox title="Khối lượng 30 phiên"
          legend={<>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: UP }} />Phiên tăng</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ border: `1.2px solid ${DOWN}` }} />Phiên giảm</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-slate-400" />TB20</span>
          </>}>
          <VolumeBars data={trend} />
          <div className="grid grid-cols-3 gap-1 text-[9px] text-slate-400 mt-1">
            <div>KL tăng/giảm (20p): <b className="text-slate-200">{trend.upDownVolumeRatio20 ?? "—"}</b></div>
            <div>OBV 20p: <b className="text-slate-200">{obvLabel}</b></div>
            <div>CMF20: <b className="text-slate-200">{signed(trend.cmf20, 3)}</b></div>
          </div>
        </ChartBox>
        <ChartBox title="Khối ngoại mua/bán ròng 20 phiên"
          legend={<>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: UP }} />Mua ròng (trên trục)</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: DOWN }} />Bán ròng (dưới trục)</span>
          </>}>
          <ForeignBars series={foreign.netSeries20} />
          <div className="text-[9px] text-slate-400 mt-1">
            {foreign.streak.sessions > 0
              ? <>Chuỗi {foreign.streak.direction === "buy" ? "mua" : "bán"} ròng: <b className="text-slate-200">{foreign.streak.sessions} phiên</b></>
              : "Không có chuỗi mua/bán ròng"} · Room còn lại: <b className="text-slate-200">{fmtVol(foreign.room)}</b>
          </div>
        </ChartBox>
        {profile && (
          <ChartBox title={`Phân bổ khối lượng theo giá (${profile.sessions} phiên)`}
            legend={<>
              <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: ACCENT }} />POC</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2" style={{ background: "rgba(2,132,199,0.25)" }} />Vùng giá trị 70%</span>
            </>}>
            <Profile profile={profile} price={today.price} />
            <div className="text-[9px] text-slate-400 mt-1">
              POC <b className="text-slate-200">{fmtInt(profile.poc)}</b> · Vùng giá trị <b className="text-slate-200">{fmtInt(profile.valueAreaLow)}–{fmtInt(profile.valueAreaHigh)}</b> · Giá đang ở{" "}
              <b className="text-slate-200">{{ above: "trên", below: "dưới", inside: "trong" }[profile.position]}</b> vùng giá trị
            </div>
          </ChartBox>
        )}
        {intraday && (
          <ChartBox title={`Khối lượng trong phiên ${today.date} (khung 15 phút)`}>
            <IntradayBars buckets={intraday.buckets15m} />
            <div className="text-[9px] text-slate-400 mt-1">
              ATO <b className="text-slate-200">{intraday.atoSharePct ?? "—"}%</b> · ATC <b className="text-slate-200">{intraday.atcSharePct ?? "—"}%</b>
              {intraday.peak && <> · Đột biến lớn nhất lúc <b className="text-slate-200">{intraday.peak.time}</b> ({fmtVol(intraday.peak.volume)}, {intraday.peak.multipleOfAvgBar}× nến TB)</>}
            </div>
          </ChartBox>
        )}
      </div>

      {data.insights.length > 0 && (
        <ul className="text-[10px] text-slate-300 list-disc pl-4 space-y-0.5 mb-1">
          {data.insights.map((s) => <li key={s}>{s}</li>)}
        </ul>
      )}
      {trend.divergence && <div className="text-[9px] text-amber-300 mb-1">⚠ {trend.divergence.label}</div>}

      <details className="text-[9px] text-slate-500">
        <summary className="cursor-pointer select-none">Bảng số liệu 30 phiên · ghi chú</summary>
        <table className="mt-1 w-full text-[9px] font-mono">
          <thead><tr className="text-slate-500"><th className="text-left">Phiên</th><th className="text-right">Đóng cửa</th><th className="text-right">KL khớp</th><th className="text-right">GT khớp</th><th className="text-left pl-2">Chiều</th></tr></thead>
          <tbody>
            {[...trend.bars30].reverse().map((b) => (
              <tr key={b.date} className="text-slate-300"><td>{b.date}</td><td className="text-right">{fmtInt(b.close)}</td><td className="text-right">{fmtInt(b.volume)}</td><td className="text-right">{fmtBn(b.value)}</td><td className="pl-2">{b.up ? "tăng" : "giảm"}</td></tr>
            ))}
          </tbody>
        </table>
        {data.notes.map((n) => <div key={n} className="mt-1">{n}</div>)}
      </details>
    </div>
  );
}
