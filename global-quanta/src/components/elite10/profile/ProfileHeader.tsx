// PFA-v1 — thanh tiêu đề của Hồ sơ 360° (đầu trang hồ sơ; không "dính" khi cuộn vì thanh điều hướng của ứng dụng cố định ở trên): mã, phiên, vị thế trong danh mục Elite HL, cảnh báo, và công tắc 3 góc nhìn.
// "Tổng hợp" = trang Hồ sơ hiện có, giữ nguyên; "Doanh nghiệp" và "Sự kiện & thời điểm" là hai góc nhìn bổ sung.
// HS360-v3 H1 (27/11/2026, docs/ho-so-360-v3/02 §1): THANH ĐẦU HỢP NHẤT — nguồn DUY NHẤT của vị thế Elite HL trong hồ sơ (trước đây lặp ở dải điểm
// và khối "Vị trí so với danh mục Elite HL"): đang giữ (hạng, lớp, làn, tỷ trọng, cách ngưỡng ra) / hàng chờ (hạng + lý do Gateway) / ngành phản
// đối / ngoài danh mục. Thêm ngành, giá, nguồn thiếu của bảng tín hiệu và ba nút: chart, Phòng họp AI, Chu kỳ. Chỉ hiển thị.
import { useMemo, useRef, type KeyboardEvent } from "react";
import { useEliteDecision, useEliteTicker } from "../../../hooks/elite10/useEliteCenter";
import { useProfileFa } from "../../../hooks/elite10/useProfileFa";
import { useAppStore } from "../../../store/useAppStore";
import { hlPicks } from "../../../lib/elite10/decisionTypes";
import { splitQueue } from "../../../lib/elite10/liquidity";
import { fmtDate, pct, WarningList } from "./pfaParts";

// HS360-v3 H2 (Q2): bốn góc nhìn — "Tổng hợp" đổi tên "Tổng quan" (id giữ "summary"), thêm "Tín hiệu".
export type ProfileView = "summary" | "signals" | "company" | "events";
export const PROFILE_VIEWS: { id: ProfileView; label: string }[] = [
  { id: "summary", label: "Tổng quan" }, { id: "signals", label: "Tín hiệu" }, { id: "company", label: "Doanh nghiệp" }, { id: "events", label: "Sự kiện & thời điểm" },
];
const CLS_VI: Record<string, string> = { STRONG: "Hợp lưu mạnh", CONFLUENCE: "Hợp lưu", T1_SECTOR_AGAINST: "Ngành phản đối", T1_SECTOR_NA: "Chưa có RRG", NOT_T1: "Ngoài tầng 1" };
const LANE_VI: Record<string, string> = { CORE: "Lõi", RUNNER: "Chạy lãi", WAIT: "Chờ nền" };
/** Tên nguồn của bảng tín hiệu E1 -> chữ cho người đọc (thiếu nguồn ở phiên). */
const SOURCE_VI: Record<string, string> = {
  researchFeatures: "dòng tiền (Stealth, IFE)", scanner: "Siêu quét", top20: "Top 20", worldStrategy: "ngành thế giới", rrg: "RRG ngành", taxonomy: "phân ngành",
  catalyst: "chất xúc tác", cotuc: "cổ tức", leadership: "LS-v1", structure: "cấu trúc MTF", kqkd: "KQKD",
};
const sourceVi = (s: string) => SOURCE_VI[s] ?? (s.startsWith("strategies:") ? `bộ lọc ${s.slice(11)}` : s);
const vnd = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: 0 }));
const chg = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

export interface ProfileActions { onOpenChart?: () => void; onOpenAi?: () => void; onOpenCycle?: () => void }

export default function ProfileHeader({ ticker, view, onView, actions = {} }: { ticker: string; view: ProfileView; onView: (v: ProfileView) => void; actions?: ProfileActions }) {
  const { data: d } = useEliteDecision();
  const { data: fa } = useProfileFa(ticker);
  const { panel, decision: score } = useEliteTicker(ticker);
  const live = useAppStore((s) => s.livePrices?.[ticker]);
  const pos = hlPicks(d).find((p) => p.ticker === ticker) ?? null;
  // Ngoài danh mục: hàng chờ (kể cả nhóm chưa giao dịch được) hoặc ngành phản đối — cùng nguồn Gateway như Bảng quyết định.
  const outside = useMemo(() => {
    if (!d?.hl || pos) return null;
    const qs = splitQueue(d.hl.queue, d.hl.queueIlliquid);
    return { queue: [...qs.tradable, ...qs.illiquid].find((x) => x.ticker === ticker) ?? null, against: d.hl.against.find((x) => x.ticker === ticker) ?? null };
  }, [d, pos, ticker]);
  const refs = useRef<Record<ProfileView, HTMLButtonElement | null>>({ summary: null, signals: null, company: null, events: null });
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = PROFILE_VIEWS.findIndex((x) => x.id === view);
    const n = e.key === "ArrowRight" ? (i + 1) % PROFILE_VIEWS.length : e.key === "ArrowLeft" ? (i - 1 + PROFILE_VIEWS.length) % PROFILE_VIEWS.length : -1;
    if (n < 0) return;
    e.preventDefault(); onView(PROFILE_VIEWS[n].id); refs.current[PROFILE_VIEWS[n].id]?.focus();
  };
  const warns = fa?.warnings ?? [];
  const nWarn = warns.filter((w) => w.level === "warn").length;
  const price = live?.price ?? score?.close ?? null;
  const change = live ? chg(live.changePct) : null;
  const missing = panel?.missingSources ?? [];
  const btn = "min-h-[28px] rounded border border-white/10 px-2.5 text-[11px] font-semibold text-slate-300 hover:border-q-accent/50 hover:text-q-accent-strong";
  return (
    <div className="tw-scope rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-slate-200" data-testid="profile-header">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[15px] font-bold text-q-accent-strong" data-testid="profile-header-ticker">{ticker}</p>
        {panel?.sector && <p className="text-[11px] text-slate-400" data-testid="profile-header-sector">{panel.sector}</p>}
        {price != null && (
          <p className="font-mono text-[12px] text-slate-100" data-testid="profile-header-price" title={live ? "Giá khớp gần nhất" : "Giá đóng cửa của phiên bảng tín hiệu"}>
            {vnd(price)}{change && <span className={`ml-1.5 ${(live?.changePct ?? 0) > 0 ? "text-emerald-300" : (live?.changePct ?? 0) < 0 ? "text-rose-300" : "text-slate-400"}`}>{change}</span>}
          </p>
        )}
        <p className="text-[10.5px] text-slate-400">Phiên {fmtDate(d?.date ?? fa?.asOf)}</p>
        <span className="ml-auto" />
        {fa && !fa.missing && (
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${nWarn ? "border-amber-400/50 text-amber-300" : "border-emerald-400/40 text-emerald-300"}`} data-testid="profile-header-warn-count">
            {nWarn ? `⚠ ${nWarn} cảnh báo` : "● Không cảnh báo nặng"}{warns.length - nWarn ? ` · ${warns.length - nWarn} lưu ý` : ""}
          </span>
        )}
      </div>
      {pos ? (
        <p className="mt-1 text-[11px]" data-testid="profile-header-position" title="Elite HL chọn mã theo quy tắc Hợp lưu, không theo Điểm Elite Z.">
          <b className="text-emerald-300">Trong danh mục Elite HL</b> · hạng hợp lưu {pos.hl.rank} · {CLS_VI[pos.hl.cls] ?? pos.hl.cls}
          {pos.hl.pz?.lane && <> · {LANE_VI[pos.hl.pz.lane] ?? pos.hl.pz.lane}</>} · tỷ trọng {pct(pos.weight)}
          {pos.hl.exitBufferLs != null && <span className="text-slate-400"> · cách ngưỡng ra {Math.round(pos.hl.exitBufferLs)} điểm</span>}
        </p>
      ) : d?.hl ? (
        <p className="mt-1 text-[11px] text-slate-300" data-testid="profile-header-position" title="Elite HL chọn mã theo quy tắc Hợp lưu, không theo Điểm Elite Z.">
          {outside?.queue ? <>Ngoài danh mục Elite HL · <b>hàng chờ, hạng hợp lưu {outside.queue.hlRank}</b> — <span className={outside.queue.code === "illiquid" ? "text-amber-300" : "text-slate-400"}>{outside.queue.reasonVi}</span></>
            : outside?.against ? <span className="text-amber-300">Ngoài danh mục Elite HL · đạt tầng 1 nhưng ngành ở góc {outside.against.rrgVi ?? "phản đối"} trên RRG — quy tắc không nhận</span>
            : <span className="text-slate-400">Ngoài danh mục và hàng chờ Elite HL phiên này</span>}
        </p>
      ) : null}
      {missing.length > 0 && (
        <p className="mt-0.5 text-[10.5px] text-amber-300/90" data-testid="profile-header-missing">
          Bảng tín hiệu phiên {fmtDate(panel?.date)} thiếu nguồn: {missing.map(sourceVi).join(", ")} — các ô tương ứng để trống.
        </p>
      )}
      {warns.length > 0 && <div className="mt-1"><WarningList items={warns} compact testId="profile-header-warnings" /></div>}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <div role="tablist" aria-label="Góc nhìn hồ sơ" className="flex flex-wrap gap-1">
          {PROFILE_VIEWS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={view === x.id} tabIndex={view === x.id ? 0 : -1} ref={(el) => { refs.current[x.id] = el; }}
              onKeyDown={onKey} onClick={() => onView(x.id)} data-testid={`profile-view-${x.id}`}
              className={`min-h-[28px] rounded border px-3 text-[11px] font-bold ${view === x.id ? "border-q-accent/60 bg-q-accent/15 text-q-accent-strong" : "border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200"}`}>{x.label}</button>
          ))}
        </div>
        <span className="ml-auto" />
        {actions.onOpenChart && <button type="button" onClick={actions.onOpenChart} data-touch data-testid="elite-open-chart" className={btn} title={`Mở chart ${ticker} trong Phân tích kỹ thuật`}>Chart →</button>}
        {actions.onOpenAi && ticker !== "VNINDEX" && <button type="button" onClick={actions.onOpenAi} data-touch data-testid="profile-open-ai" className={btn} title={`Mở Phòng họp AI cho ${ticker}`}>Phòng họp AI →</button>}
        {actions.onOpenCycle && ticker !== "VNINDEX" && <button type="button" onClick={actions.onOpenCycle} data-touch data-testid="profile-open-cycle" className={btn} title={`Xem ${ticker} ở Cycle Fingerprint (tab Ngành)`}>Chu kỳ →</button>}
      </div>
    </div>
  );
}
