import { useState } from "react";
import { REGIME_LABEL, useResearchOverview } from "../../../hooks/useResearch";

const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);

/**
 * Mô hình trọng số thích ứng (chuyển từ panel cột trái vào khối AI của từng mã): kỳ hạn T+3/T+5/T+10,
 * chỉ số ngoài mẫu (Brier skill + KTC bootstrap, AUC so với heuristic, tỷ lệ trúng khi bật), trọng số
 * lớn nhất; chưa thăng hạng thì nêu lý do của lần huấn luyện gần nhất.
 */
export default function AdaptiveModelStrip() {
  const { data } = useResearchOverview();
  const [horizon, setHorizon] = useState(5);
  if (!data) return null;
  const model = data.models.find((m) => m.horizon === horizon)?.active ?? null;
  const training = data.lastTraining?.horizons?.[String(horizon)];
  const topWeights = model ? [...model.weights].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 5) : [];
  const maxW = Math.max(0.01, ...topWeights.map((w) => Math.abs(w.weight)));

  return (
    <div className="rounded-lg p-2" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)" }}>
      <div className="flex items-center justify-between text-[9.5px] mb-1">
        <span className="text-violet-200 font-semibold">Trọng số học được</span>
        <div className="flex items-center gap-1" role="tablist" aria-label="Kỳ hạn mô hình">
          {[3, 5, 10].map((h) => {
            const on = data.models.find((m) => m.horizon === h)?.active;
            return (
              <button key={h} role="tab" aria-selected={horizon === h} onClick={() => setHorizon(h)}
                title={on ? `Mô hình T+${h} đang chạy` : `T+${h}: chưa có mô hình đạt kiểm định`}
                className={`text-[9px] px-1.5 py-px rounded ${horizon === h ? "bg-violet-500/30 text-violet-100" : "bg-white/5 text-slate-400"}`}>
                T+{h}{on ? " ●" : ""}
              </button>
            );
          })}
          <span className="text-slate-400 ml-1">{model ? `phiên bản ${model.trainTo}` : "chưa thăng hạng"}</span>
        </div>
      </div>
      {model?.holdout ? (
        <>
          <div className="grid grid-cols-3 gap-1 text-[9px] mb-1.5">
            <div title={`Brier skill ngoài mẫu so với dự báo bằng tỷ lệ nền (>0 là tốt hơn)${model.holdout.bootstrap ? ` · KTC90% (bootstrap theo ${model.holdout.bootstrap.days} ngày): ${(model.holdout.bootstrap.brierSkill90[0] * 100).toFixed(2)}% … ${(model.holdout.bootstrap.brierSkill90[1] * 100).toFixed(2)}%` : ""}`}>
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
              <span className="w-36 truncate text-slate-400" title={data.featureLabels[w.name]}>{data.featureLabels[w.name] ?? w.name}</span>
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
      <div className="text-[8.5px] text-slate-500 mt-1">
        {data.counts ? `${data.counts.signals.toLocaleString("vi-VN")} tín hiệu · ${data.counts.outcomes.toLocaleString("vi-VN")} lần chấm điểm · ` : ""}{data.disclaimer}
      </div>
    </div>
  );
}
