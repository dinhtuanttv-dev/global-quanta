// N4 (29/10/2026) — hàng nút chọn đợt lịch sử hiển thị: bộ chọn nhanh + nút từng đợt (bấm để bật / tắt riêng).
import { HIST_PRESETS, type HistPreset } from "../../../lib/elite10/historyPreset";

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

export default function HistoryToggles({ dates, visible, preset, custom, onPreset, onToggle, total }: {
  dates: string[]; visible: Set<string>; preset: HistPreset; custom: boolean;
  onPreset: (p: HistPreset) => void; onToggle: (date: string) => void; total: number;
}) {
  const chip = (on: boolean) => `min-h-[24px] rounded border px-1.5 text-[10px] ${on ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-100" : "border-white/10 text-slate-500 hover:text-slate-300"}`;
  return (
    <div className="mt-2 flex flex-col gap-1" data-testid="history-toggles">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Chọn nhanh đợt lịch sử hiển thị">
        <span className="mr-1 text-[10px] text-slate-400">Đường lịch sử:</span>
        {HIST_PRESETS.map((p) => (
          <button key={p.id} type="button" title={p.title} aria-pressed={!custom && preset === p.id} data-testid={`hist-preset-${p.id}`}
            onClick={() => onPreset(p.id)} className={chip(!custom && preset === p.id)}>{p.label}</button>
        ))}
        {custom && <span className="text-[10px] text-amber-300">· tự chọn</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Bật / tắt từng đợt">
        {dates.map((d) => (
          <button key={d} type="button" aria-pressed={visible.has(d)} data-testid={`hist-event-${d}`} onClick={() => onToggle(d)} className={chip(visible.has(d))}>{dmy(d)}</button>
        ))}
        <span className="text-[9.5px] text-slate-500">· đang hiện {visible.size}/{total} đợt — trung vị, quạt và xác suất vẫn tính trên đủ {total} đợt</span>
      </div>
    </div>
  );
}
