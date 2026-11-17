// PFA-v1 — thanh tiêu đề của Hồ sơ 360° (đầu trang hồ sơ; không "dính" khi cuộn vì thanh điều hướng của ứng dụng cố định ở trên): mã, phiên, vị thế trong danh mục Elite HL, cảnh báo, và công tắc 3 góc nhìn.
// "Tổng hợp" = trang Hồ sơ hiện có, giữ nguyên; "Doanh nghiệp" và "Sự kiện & thời điểm" là hai góc nhìn bổ sung.
import { useRef, type KeyboardEvent } from "react";
import { useEliteDecision } from "../../../hooks/elite10/useEliteCenter";
import { useProfileFa } from "../../../hooks/elite10/useProfileFa";
import { hlPicks } from "../../../lib/elite10/decisionTypes";
import { fmtDate, pct, WarningList } from "./pfaParts";

export type ProfileView = "summary" | "company" | "events";
export const PROFILE_VIEWS: { id: ProfileView; label: string }[] = [
  { id: "summary", label: "Tổng hợp" }, { id: "company", label: "Doanh nghiệp" }, { id: "events", label: "Sự kiện & thời điểm" },
];
const CLS_VI: Record<string, string> = { STRONG: "Hợp lưu mạnh", CONFLUENCE: "Hợp lưu", T1_SECTOR_AGAINST: "Ngành phản đối", T1_SECTOR_NA: "Chưa có RRG", NOT_T1: "Ngoài tầng 1" };

export default function ProfileHeader({ ticker, view, onView }: { ticker: string; view: ProfileView; onView: (v: ProfileView) => void }) {
  const { data: d } = useEliteDecision();
  const { data: fa } = useProfileFa(ticker);
  const pos = hlPicks(d).find((p) => p.ticker === ticker) ?? null;
  const refs = useRef<Record<ProfileView, HTMLButtonElement | null>>({ summary: null, company: null, events: null });
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = PROFILE_VIEWS.findIndex((x) => x.id === view);
    const n = e.key === "ArrowRight" ? (i + 1) % PROFILE_VIEWS.length : e.key === "ArrowLeft" ? (i - 1 + PROFILE_VIEWS.length) % PROFILE_VIEWS.length : -1;
    if (n < 0) return;
    e.preventDefault(); onView(PROFILE_VIEWS[n].id); refs.current[PROFILE_VIEWS[n].id]?.focus();
  };
  const warns = fa?.warnings ?? [];
  const nWarn = warns.filter((w) => w.level === "warn").length;
  return (
    <div className="tw-scope rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-slate-200" data-testid="profile-header">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[15px] font-bold text-[#F5CE72]" data-testid="profile-header-ticker">{ticker}</p>
        <p className="text-[10.5px] text-slate-400">Phiên {fmtDate(d?.date ?? fa?.asOf)}</p>
        {pos ? (
          <p className="text-[11px]" data-testid="profile-header-position">
            <b className="text-emerald-300">Trong danh mục Elite HL</b> · hạng hợp lưu {pos.hl.rank} · {CLS_VI[pos.hl.cls] ?? pos.hl.cls} · tỷ trọng {pct(pos.weight)}
            {pos.hl.exitBufferLs != null && <span className="text-slate-400"> · cách ngưỡng ra {Math.round(pos.hl.exitBufferLs)} điểm</span>}
          </p>
        ) : d?.hl ? <p className="text-[11px] text-slate-400" data-testid="profile-header-position">Ngoài danh mục Elite HL phiên này</p> : null}
        <span className="ml-auto" />
        {fa && !fa.missing && (
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${nWarn ? "border-amber-400/50 text-amber-300" : "border-emerald-400/40 text-emerald-300"}`} data-testid="profile-header-warn-count">
            {nWarn ? `⚠ ${nWarn} cảnh báo` : "● Không cảnh báo nặng"}{warns.length - nWarn ? ` · ${warns.length - nWarn} lưu ý` : ""}
          </span>
        )}
      </div>
      {warns.length > 0 && <div className="mt-1"><WarningList items={warns} compact testId="profile-header-warnings" /></div>}
      <div role="tablist" aria-label="Góc nhìn hồ sơ" className="mt-2 flex flex-wrap gap-1">
        {PROFILE_VIEWS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={view === x.id} tabIndex={view === x.id ? 0 : -1} ref={(el) => { refs.current[x.id] = el; }}
            onKeyDown={onKey} onClick={() => onView(x.id)} data-testid={`profile-view-${x.id}`}
            className={`min-h-[28px] rounded border px-3 text-[11px] font-bold ${view === x.id ? "border-[#E8B84B]/60 bg-[#E8B84B]/15 text-[#F5CE72]" : "border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200"}`}>{x.label}</button>
        ))}
      </div>
    </div>
  );
}
