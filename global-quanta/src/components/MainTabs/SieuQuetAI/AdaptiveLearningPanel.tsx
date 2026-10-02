import { useState } from "react";
import { REGIME_LABEL, useResearchOverview, type PerformanceRow } from "../../../hooks/useResearch";

// Xanh lá = tín hiệu có lợi thế, đỏ = tín hiệu ngược, xám = chưa đủ bằng chứng. Luôn kèm chữ/ký hiệu
// (không chỉ dựa vào màu).
const VERDICT: Record<PerformanceRow["verdict"], { color: string; text: string }> = {
  edge: { color: "#059669", text: "✓ có lợi thế" },
  negative: { color: "#e11d48", text: "✗ ngược kỳ vọng" },
  none: { color: "#64748b", text: "≈ không khác nền" },
  insufficient: { color: "#64748b", text: "… chưa đủ mẫu" },
};
const REGIME_COLOR: Record<string, string> = { UPTREND: "#059669", DOWNTREND: "#e11d48", SIDEWAY: "#d97706" };
const SIGNALS = ["STEALTH_5", "STEALTH_20", "IFE_INTENT", "IMPULSE", "ADAPTIVE_T5"];
const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);

/**
 * "AI học & thích ứng": vòng phản hồi chấm điểm tín hiệu sau T+3/T+5/T+10 và mô hình trọng số
 * đã kiểm định ngoài mẫu. Đặt ở cột trái Siêu Quét, dưới Market Impulse Gauge (không đổi bố cục bảng).
 */
export default function AdaptiveLearningPanel() {
  const { data, error, isLoading, enabled } = useResearchOverview();
  const [horizon, setHorizon] = useState(5);
  const [regime, setRegime] = useState("ALL");
  if (!enabled) return null;

  const box = { background: "rgba(13,17,26,0.75)", border: "1px solid rgba(255,255,255,0.06)" };
  if (isLoading) return <div style={box} className="rounded-xl p-4 text-[10px] text-slate-500">Đang tải kết quả tự học…</div>;
  if (error || !data) return <div style={box} className="rounded-xl p-4 text-[10px] text-slate-500">Chưa có kết quả tự học (Gateway chưa chạy job nghiên cứu).</div>;

  const rows = data.performance.filter((r) => r.horizon === horizon && r.regime === regime);
  const model = data.models.find((m) => m.horizon === horizon)?.active ?? null;
  const training = data.lastTraining?.horizons?.[String(horizon)];
  const cur = data.currentRegime;
  const topWeights = model ? [...model.weights].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 5) : [];
  const maxW = Math.max(0.01, ...topWeights.map((w) => Math.abs(w.weight)));

  return (
    <div style={box} className="rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-violet-300">AI học & thích ứng</h2>
        {cur && (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ color: REGIME_COLOR[cur.regime], border: `1px solid ${REGIME_COLOR[cur.regime]}` }}
            title={`Trạng thái thị trường phiên ${cur.date}: VN-Index so với MA20/MA50 và độ dốc MA50`}>
            {REGIME_LABEL[cur.regime]} · Impulse {cur.impulseScore ?? "—"}
          </span>
        )}
      </div>

      <div className="flex gap-1 mb-2" role="tablist" aria-label="Kỳ hạn chấm điểm">
        {[3, 5, 10].map((h) => (
          <button key={h} role="tab" aria-selected={horizon === h} onClick={() => setHorizon(h)}
            className={`text-[9.5px] px-2 py-0.5 rounded ${horizon === h ? "bg-violet-500/30 text-violet-100" : "bg-white/5 text-slate-400"}`}>T+{h}</button>
        ))}
        <select value={regime} onChange={(e) => setRegime(e.target.value)} aria-label="Lọc theo trạng thái thị trường"
          className="ml-auto text-[9.5px] bg-black/40 border border-white/10 rounded px-1 text-slate-300">
          {["ALL", "UPTREND", "SIDEWAY", "DOWNTREND"].map((r) => <option key={r} value={r}>{REGIME_LABEL[r]}</option>)}
        </select>
      </div>

      {/* Vòng phản hồi: tỷ lệ trúng của từng tín hiệu so với tỷ lệ nền */}
      <div className="text-[8.5px] text-slate-500 mb-1">
        Tỷ lệ trúng (vượt VN-Index theo chiều tín hiệu) sau {horizon} phiên · nền {pct(data.baseline[String(horizon)], 1)}
      </div>
      <div className="space-y-1 mb-3">
        {SIGNALS.map((sig) => {
          const r = rows.find((x) => x.signal === sig);
          const label = data.signalLabels[sig]?.replace(` T+${horizon}`, "") ?? sig;
          if (!r) return (
            <div key={sig} className="flex justify-between text-[9.5px] text-slate-500"><span>{label}</span><span>chưa có dữ liệu</span></div>
          );
          const v = VERDICT[r.verdict];
          return (
            <div key={sig} title={`n=${r.n} (mua ${r.long} / bán ${r.short}) · KTC95% ${pct(r.hitLow, 1)}–${pct(r.hitHigh, 1)} · lợi suất vượt TB theo chiều ${pct(r.avgSignedExcess, 2)} · t=${r.tStat ?? "—"}`}>
              <div className="flex justify-between text-[9.5px]">
                <span className="text-slate-300">{label}</span>
                <span style={{ color: v.color }}>{pct(r.hitRate, 1)} <span className="text-[8.5px]">{v.text}</span></span>
              </div>
              {/* Thanh KTC 95% so với vạch tỷ lệ nền */}
              <div className="relative h-1.5 rounded bg-white/5 mt-0.5">
                <div className="absolute h-full rounded" style={{ left: `${r.hitLow * 100}%`, width: `${Math.max(1, (r.hitHigh - r.hitLow) * 100)}%`, background: v.color, opacity: 0.55 }} />
                <div className="absolute h-full w-px bg-slate-200" style={{ left: `${r.baseline * 100}%` }} title="Tỷ lệ nền" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Mô hình trọng số thích ứng */}
      <div className="rounded-lg p-2" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)" }}>
        <div className="flex justify-between text-[9.5px] mb-1">
          <span className="text-violet-200 font-semibold">Trọng số học được (T+{horizon})</span>
          <span className="text-slate-400">{model ? `phiên bản ${model.trainTo}` : "chưa thăng hạng"}</span>
        </div>
        {model?.holdout ? (
          <>
            <div className="grid grid-cols-3 gap-1 text-[9px] mb-1.5">
              <div title="Brier skill ngoài mẫu so với dự báo bằng tỷ lệ nền (>0 là tốt hơn)">
                <div className="text-slate-500">Brier skill</div><div className="text-slate-100">{(model.holdout.brierSkill * 100).toFixed(2)}%</div>
              </div>
              <div title="AUC ngoài mẫu; heuristic = trọng số ban đầu chưa học">
                <div className="text-slate-500">AUC (heuristic)</div>
                <div className="text-slate-100">{model.holdout.auc?.toFixed(3) ?? "—"} <span className="text-slate-500">({model.heuristic?.auc?.toFixed(3) ?? "—"})</span></div>
              </div>
              <div title="Tỷ lệ trúng khi điểm ≥ 55% hoặc ≤ 45%, trên fold kiểm định cuối">
                <div className="text-slate-500">Trúng khi bật</div><div className="text-slate-100">{pct(model.holdout.activeHitRate, 1)}</div>
              </div>
            </div>
            {topWeights.map((w) => (
              <div key={w.name} className="flex items-center gap-1 text-[9px]">
                <span className="w-28 truncate text-slate-400" title={data.featureLabels[w.name]}>{data.featureLabels[w.name] ?? w.name}</span>
                <div className="flex-1 h-1.5 relative bg-white/5 rounded">
                  <div className="absolute top-0 h-full w-px bg-slate-500" style={{ left: "50%" }} />
                  <div className="absolute top-0 h-full rounded" style={{
                    left: w.weight >= 0 ? "50%" : `${50 - (Math.abs(w.weight) / maxW) * 50}%`,
                    width: `${(Math.abs(w.weight) / maxW) * 50}%`, background: w.weight >= 0 ? "#059669" : "#e11d48",
                  }} />
                </div>
                <span className="w-10 text-right text-slate-300">{w.weight >= 0 ? "+" : "−"}{Math.abs(w.weight).toFixed(2)}</span>
              </div>
            ))}
            <div className="text-[8.5px] text-slate-500 mt-1">
              Kiểm định {model.holdout.from}→{model.holdout.to} · n={model.holdout.n.toLocaleString("vi-VN")}
              {model.regimeModels.length ? ` · riêng theo: ${model.regimeModels.map((r) => REGIME_LABEL[r]).join(", ")}` : ""}
            </div>
          </>
        ) : (
          <div className="text-[9px] text-slate-400">{training?.reason ?? "Mô hình chỉ được dùng khi có kỹ năng ngoài mẫu dương; đang tích luỹ dữ liệu."}</div>
        )}
      </div>
      <div className="text-[8.5px] text-slate-500 mt-2">
        {data.counts ? `${data.counts.signals.toLocaleString("vi-VN")} tín hiệu · ${data.counts.outcomes.toLocaleString("vi-VN")} lần chấm điểm · ` : ""}{data.disclaimer}
      </div>
    </div>
  );
}
