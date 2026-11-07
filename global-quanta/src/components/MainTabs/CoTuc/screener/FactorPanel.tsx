// BL3 (07/11/2026) — FM-v1: 6 nhóm nhân tố (z trung bình theo nhóm ngành), thứ hạng trong danh mục. Nhãn theo kiểm định đặt trước BL-r1.
import type { FmView } from "../../../../lib/cotuc/dsStocks";

const NAMES: Record<keyof FmView["groups"], string> = { Y: "Lợi suất", D: "Độ bền", G: "Tăng trưởng", Q: "Chất lượng", V: "Định giá", R: "Rủi ro thấp" };

export function FmBadge({ fm }: { fm: FmView | null | undefined }) {
  if (!fm) return <span className="rounded-lg border border-cf-border-strong px-2 py-0.5 text-[10px] font-black text-cf-tertiary" title="Chưa đủ 4/6 nhóm nhân tố có dữ liệu">Hạng —</span>;
  const cls = fm.quintile >= 5 ? "bg-emerald-950 text-cf-positive border-emerald-700" : fm.quintile >= 4 ? "bg-amber-950 text-cf-gold-bright border-amber-700" : "bg-cf-base text-cf-secondary border-cf-border-strong";
  return <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-black ${cls}`} data-testid="fm-badge" title={`Mô hình nhân tố FM-v1 · hạng ${fm.rank}/${fm.of} · ${fm.label}`}>Hạng {Math.round(fm.pct * 100)} · Q{fm.quintile}</span>;
}

export default function FactorPanel({ fm }: { fm: FmView | null | undefined }) {
  if (!fm) return null;
  const tested = fm.label === "THĂM DÒ";
  return (
    <div className="tw-scope rounded-lg border border-white/10 p-2" data-testid="fm-panel">
      <p className="mb-1 text-[11px] font-bold text-slate-200">🧮 Mô hình nhân tố · hạng {fm.rank}/{fm.of} (Q{fm.quintile})
        <span className={`ml-1 rounded border px-1 text-[10px] font-normal ${tested ? "border-emerald-400/40 text-emerald-300" : "border-sky-400/40 text-sky-300"}`}>{tested ? "THĂM DÒ" : "MÔ TẢ"}</span></p>
      <div className="space-y-0.5">
        {(Object.keys(NAMES) as (keyof FmView["groups"])[]).map((g) => {
          const v = fm.groups[g];
          const w = v == null ? 0 : Math.min(50, Math.abs(v) / 3 * 50);
          return (
            <div key={g} className="flex items-center gap-2 text-[10.5px]" data-testid={`fm-g-${g}`}>
              <span className="w-24 shrink-0 text-slate-400">{NAMES[g]}</span>
              <span className="relative h-2 flex-1 rounded bg-white/[0.04]">
                <span className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                {v != null && <span className={`absolute inset-y-0 rounded ${v >= 0 ? "bg-emerald-400/70" : "bg-rose-400/70"}`} style={v >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />}
              </span>
              <span className="w-12 text-right font-mono text-slate-300">{v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-[10px] text-slate-500">Mỗi nhóm = trung bình điểm z so với các mã cùng ngành (−3…+3); hạng = điểm tổng hợp trung bình đều 6 nhóm trong toàn danh mục. {tested ? "Đã qua kiểm định đặt trước BL-r1." : "Kiểm định đặt trước BL-r1 chưa đạt — dùng để sắp xếp mô tả, không phải tín hiệu."}</p>
    </div>
  );
}
