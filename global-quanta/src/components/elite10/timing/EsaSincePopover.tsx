// N2 (29/10/2026) — bảng "Khối lượng đột biến sau tin" mở khi bấm vòng sáng (dải nến ngày / chart 3D): KL cộng dồn từ phút ra tin
// tới hiện tại so với CÙNG KHUNG PHÚT của các phiên trước (trung vị, p90), bội số, z bền, giá từ lúc ra tin. Chỉ số liệu.
import type { EsaSince } from "../../../hooks/elite10/useEsaSnapshot";
import type { SmartNewsItem } from "../../../hooks/useSmartNews";

const vol = (v: number | null | undefined) => (v == null ? "—" : v >= 1e6 ? `${(v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tr cp` : `${Math.round(v / 1e3).toLocaleString("vi-VN")} nghìn cp`);
const sgn = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}`);

export default function EsaSincePopover({ since, item, onClose }: { since: EsaSince; item: SmartNewsItem | null; onClose: () => void }) {
  const alert = since.alert;
  const cur = since.currentVolume ?? 0, med = since.medianSameWindow ?? 0, p90 = since.p90SameWindow ?? 0;
  const max = Math.max(cur, p90, med, 1);
  const tone = alert?.severity === "high_anomaly" ? "text-rose-300 border-rose-400/50" : alert ? "text-orange-300 border-orange-400/50" : "text-slate-300 border-white/15";
  return (
    <div role="dialog" aria-label="Khối lượng sau tin" data-testid="esa-since-popover" className={`mt-2 rounded-lg border bg-slate-950/95 px-3 py-2 text-[10.5px] ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <b>{alert ? `⚡ KHỐI LƯỢNG ĐỘT BIẾN SAU TIN${alert.severity === "high_anomaly" ? " · MỨC CAO" : ""}` : "Khối lượng sau tin — chưa bất thường"}</b>
        <button type="button" onClick={onClose} aria-label="Đóng" className="min-h-[24px] rounded px-1.5 text-slate-400 hover:text-slate-100">✕</button>
      </div>
      {item && <p className="mt-0.5 text-slate-200">{item.title} <span className="text-slate-500">· {item.sourceLabel}</span></p>}
      <p className="mt-1 text-slate-300">Từ {since.sinceMinute} (ra tin) → {since.observedMinute}: <b className="text-slate-100">{vol(cur)}</b></p>
      <div className="mt-1 grid gap-1" aria-hidden="true">
        {[["Hôm nay", cur, alert ? "#f97316" : "#94a3b8"], ["Trung vị cùng khung", med, "#64748b"], ["p90 cùng khung", p90, "#475569"]].map(([l, v, c]) => (
          <div key={l as string} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-slate-500">{l}</span>
            <span className="h-2 rounded" style={{ width: `${Math.max(2, ((v as number) / max) * 100)}%`, background: c as string }} />
            <span className="shrink-0 text-slate-400">{vol(v as number)}</span>
          </div>
        ))}
      </div>
      <p className="mt-1">Gấp <b className="text-slate-100">{since.relativeVolume?.toFixed(2) ?? "—"}×</b> trung vị · z bền <b className="text-slate-100">{sgn(since.robustZ)}</b> · giá từ lúc ra tin <b className="text-slate-100">{sgn(since.priceChangeSincePct)}%</b> · {since.sampleSize} phiên so sánh</p>
      <p className="mt-1 text-[9.5px] text-slate-500">Bất thường khi z ≥ 3 VÀ gấp ≥ 2 lần trung vị cùng khung phút (trung vị + 1,4826 × MAD, như ESA R0). Mô tả hoạt động sau tin — không phải dự báo giá.</p>
    </div>
  );
}
