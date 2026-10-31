// Trading Matrix M5 / M6 — khối dự báo (luôn kèm kỳ hạn, tỷ lệ nền, cỡ mẫu, kết quả holdout, phiên bản, nhãn kiểm định — spec §2.4)
// và mục Vận hành (dữ liệu thiếu, sức khoẻ nguồn, khối lượng cảnh báo, độ trôi mô hình, kho cục bộ, nhật ký quy tắc, diễn tập sự cố).
import { useState } from "react";
import { useMatrixOps, type Forecast } from "../../../../hooks/useTradingMatrix";
import { vn, when } from "./MatrixCards";

export function ForecastBlock({ f }: { f: Forecast | null | undefined }) {
  if (!f) return <p className="text-[10px] text-slate-500">Dự báo: chưa đủ dữ liệu trạng thái.</p>;
  const ok = f.label === "ĐÃ KIỂM ĐỊNH";
  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-2 space-y-1 text-[10px]" data-testid="mx-forecast">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-slate-200">Xác suất {f.target.toLowerCase()}</span>
        <span className={`text-[8px] px-1 rounded ${ok ? "text-emerald-300 bg-emerald-500/10" : "text-amber-300 bg-amber-500/10"}`}>{f.label}</span>
      </div>
      <div className="text-[15px] font-semibold text-violet-200">{vn(f.p * 100, 0)}% <span className="text-[10px] text-slate-400 font-normal">· tỷ lệ nền {vn(f.baseRate * 100, 0)}% · kỳ hạn {f.horizon} phiên</span></div>
      <p className="text-slate-400">Mô hình {f.modelId} · huấn luyện {f.trainN} phiên · holdout {f.holdout.n} phiên (Brier {vn(f.holdout.brier ?? null, 3)}, nền {vn(f.holdout.baseRate * 100, 0)}%) · cổng: {f.gate === "PROMOTE" ? "thăng hạng" : "giữ champion"} · {when(f.date)}</p>
      <p className="text-[11px] text-slate-400">{f.note}</p>
    </div>
  );
}

export function OpsPanel() {
  const [open, setOpen] = useState(false);
  const { data, error } = useMatrixOps(open);
  return (
    <div className="pt-3 border-t border-white/5 mt-3" data-testid="mx-ops">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-[10px] font-bold text-slate-300 hover:text-cyan-200">
        {open ? "▾" : "▸"} Vận hành (dữ liệu thiếu · sức khoẻ nguồn · độ trôi mô hình · kho · diễn tập sự cố)
      </button>
      {open && error && <p className="text-[10px] text-rose-300" role="alert">Không tải được báo cáo vận hành: {error.message}</p>}
      {open && data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 pt-2 text-[10px]">
          <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            <dt className="text-slate-500">Phiên thiếu (260 phiên)</dt><dd className={`text-right font-mono ${data.dataGaps.missing ? "text-amber-300" : "text-emerald-300"}`}>{data.dataGaps.missing}</dd>
            <dt className="text-slate-500">Phiên mới nhất trong kho</dt><dd className="text-right font-mono">{when(data.dataGaps.latestLocal)}</dd>
            <dt className="text-slate-500">Snapshot gần đây</dt><dd className="text-right font-mono">{Object.entries(data.sourceHealth.byStatus).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}</dd>
            <dt className="text-slate-500">Chuyển kịch bản / cờ bật (20 phiên)</dt><dd className="text-right font-mono">{data.alertVolume.scenarioTransitions} / {data.alertVolume.riskFlagsOn}</dd>
            <dt className="text-slate-500">Kho cục bộ</dt><dd className="text-right font-mono">{data.store?.local ? `${vn(data.store.local.diskMb ?? null, 1)} MB · ${data.store.local.marketDailyDates} phiên` : "—"}</dd>
            <dt className="text-slate-500">Bản sao Supabase</dt><dd className="text-right">{data.store?.replica ? (data.store.replica.healthy ? "khoẻ" : "cầu dao mở") : "—"}</dd>
            <dt className="text-slate-500">Tự dựng dữ liệu</dt><dd className="text-right">{data.bootstrap?.status ?? "—"}</dd>
          </dl>
          <div className="space-y-1">
            <p><b>Mô hình đang chạy:</b> {data.model.active} · Brier holdout {vn(data.model.holdoutBrier, 3)} · ngưỡng trôi {vn(data.model.threshold, 3)}</p>
            <p>Thực tế: {data.model.liveScored} dự báo đã chấm{data.model.rollingBrier != null ? ` · Brier 60 phiên ${vn(data.model.rollingBrier, 3)}` : ""} · <span className={data.model.drift ? "text-rose-300" : "text-emerald-300"}>{data.model.drift ? "TRÔI HIỆU CHỈNH" : "ổn định"}</span></p>
            <p className="text-slate-400">Sổ đăng ký: {data.modelRegistry.map((m) => `${m.id} (${m.status})`).join(" · ")}</p>
            <p className="text-slate-400">Quy tắc: {data.ruleChangelog.map((c) => `${c.version} ${when(c.date)} — ${c.change}`).join(" | ")}</p>
          </div>
          <div className="space-y-0.5">
            <p className="font-bold text-slate-300">Diễn tập sự cố</p>
            <ul className="space-y-0.5">{data.drills.map((d) => <li key={d.id} className="text-slate-400"><span className="text-slate-200">{d.scenario}:</span> {d.expect}</li>)}</ul>
            <p className="text-[9px] text-slate-500 pt-1">Lưu giữ: {Object.values(data.retention).join(" · ")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
