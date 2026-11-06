// S2/S4/S6: chế độ "Bản đồ toàn thị trường" + "Sổ theo dõi" (SeasonBoards.tsx), bằng chứng gộp theo ngành dưới phân tích theo mã.
// S1/S3/S5/S7 (06/11/2026) — khung mục 📊 Mùa vụ KQKD. Bọc EarningsSeasonalityTab (GIỮ NGUYÊN công thức, ngưỡng, hiển thị):
//   S1 mở sẵn một mã (xem gần nhất -> mã ghim -> mã sắp công bố gần nhất), ô tìm có gợi ý, mã trước / sau.
//   S7 một lần gọi Gateway thay 9 lần gọi Project A (kiểm schema bằng chính hàm cũ, lib/cotuc/seasonality-bundle.ts).
//   S5 bối cảnh kỳ tới: ngày dự kiến (Lịch LC4, dải P10–P90, khả năng 5 phiên), ước tính cả năm (THĂM DÒ), tiến độ kế hoạch ĐHCĐ,
//      KL/giá bất thường 10 phiên gần nhất; kỳ vừa công bố: kết quả + phản ứng giá.
//   S3 kiểm ngày làm mốc: ngày Project A dùng cho từng kỳ so với ngày tin BCTC chính thức — chú thích độ tin cậy, không đổi số.
import { useEffect, useMemo, useState } from "react";
import { useKqkdCalendar, useSeasonalityBundle } from "../../../../hooks/useKqkd";
import { usePinnedStocks } from "../../../../hooks/usePinnedStocks";
import { defaultBaseUrl } from "../../../../lib/cotuc/cycle-paths.api";
import { primeSeasonality } from "../../../../lib/cotuc/seasonality-bundle";
import { dmy, fin, growthText, num, pct, pctPlain } from "../../../../lib/kqkd/format";
import type { SeasonalityBundle } from "../../../../lib/kqkd/types";
import { EarningsSeasonalityTab } from "./EarningsSeasonalityTab";
import { PooledEvidence, SeasonLedgerView, SeasonMapBoard } from "./SeasonBoards";

export const SEASON_TICKER_KEY = "gq.kqkd.season.ticker.v1";
export const SEASON_MODE_KEY = "gq.kqkd.season.mode.v1";
type Mode = "ticker" | "map" | "ledger";
const readMode = (): Mode => { try { const m = localStorage.getItem(SEASON_MODE_KEY); return m === "map" || m === "ledger" ? m : "ticker"; } catch { return "ticker"; } };
const readLast = () => { try { return localStorage.getItem(SEASON_TICKER_KEY); } catch { return null; } };
const writeLast = (t: string) => { try { localStorage.setItem(SEASON_TICKER_KEY, t); } catch { /* không có storage */ } };
const QC = ["#22d3ee", "#34d399", "#fbbf24", "#a78bfa"];

/** S1: mã mở sẵn khi chưa chọn. */
export function pickDefaultTicker(list: string[], { last, pinned, upcoming }: { last: string | null; pinned: string[]; upcoming: string[] }): string | null {
  const has = new Set(list);
  if (last && has.has(last)) return last;
  const p = pinned.find((t) => has.has(t)); if (p) return p;
  const u = upcoming.find((t) => has.has(t)); if (u) return u;
  return has.has("FPT") ? "FPT" : list[0] ?? null;
}

function NextContext({ b }: { b: SeasonalityBundle }) {
  const c = b.context;
  if (!c) return null;
  const n = c.next, l = c.last, live = c.live;
  const liveAlert = live && ((fin(live.av10) && live.av10 >= 2) || (fin(live.scar10) && Math.abs(live.scar10) >= 2));
  const g = growthText(l?.result?.npatYoY ?? null);
  return (
    <section className="tw-scope rounded-lg border border-white/10 bg-white/[0.02] p-3" data-testid="season-context">
      <p className="mb-2 text-[11px] font-bold text-slate-200">🧭 Bối cảnh kỳ tới <span className="font-normal text-slate-500">· tổng hợp từ Lịch công bố, KQKD theo quý, kế hoạch ĐHCĐ, phản ứng giá</span></p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <div className="rounded-md border border-white/[0.07] px-2 py-1.5" data-testid="season-ctx-date">
          <p className="text-[10px] font-bold uppercase text-slate-500">Kỳ tới {n?.quarter ?? "—"}</p>
          {n?.status === "REPORTED" || n?.status === "DISCLOSED" ? <p className="font-mono text-[14px] font-bold text-emerald-300">{dmy(n.date)}</p>
            : <p className={`font-mono text-[14px] font-bold ${n?.status === "OVERDUE" ? "text-rose-300" : "text-[#F5CE72]"}`}>{n?.expected ? dmy(n.expected) : "—"}</p>}
          <p className="text-[10px] text-slate-500">{n ? (n.status === "OVERDUE" ? "quá hạn hợp nhất" : n.band ? `dải ${dmy(n.band[0]).slice(0, 5)}–${dmy(n.band[1]).slice(0, 5)} · ${n.ownN} mùa` : "") : ""}{n?.lateShare && n.lateShare >= 1 / 3 ? " · hay nộp muộn" : ""}</p>
        </div>
        <div className="rounded-md border border-white/[0.07] px-2 py-1.5">
          <p className="text-[10px] font-bold uppercase text-slate-500">Khả năng công bố 5 phiên tới</p>
          <p className="font-mono text-[14px] font-bold text-slate-100">{fin(n?.pNext) ? pctPlain(n!.pNext, 0) : "—"}</p>
          <p className="text-[10px] text-slate-500">hạn hợp nhất {n ? dmy(n.deadlineConsolidated) : "—"}</p>
        </div>
        <div className="rounded-md border border-white/[0.07] px-2 py-1.5">
          <p className="text-[10px] font-bold uppercase text-slate-500">Ước LNST cả năm <span className="rounded border border-emerald-400/40 px-1 text-emerald-300">{c.nowcastLabel}</span></p>
          <p className={`font-mono text-[14px] font-bold ${fin(c.nowcast?.growth) ? ((c.nowcast!.growth as number) >= 0 ? "text-emerald-300" : "text-rose-300") : "text-slate-500"}`}>{fin(c.nowcast?.growth) ? pct(c.nowcast!.growth, 0) : "—"}</p>
          <p className="text-[10px] text-slate-500">so năm trước · dải hẹp hơn thực tế</p>
        </div>
        <div className="rounded-md border border-white/[0.07] px-2 py-1.5">
          <p className="text-[10px] font-bold uppercase text-slate-500">Kế hoạch ĐHCĐ</p>
          <p className={`font-mono text-[14px] font-bold ${fin(c.plan?.pace) ? ((c.plan!.pace as number) >= 1 ? "text-emerald-300" : "text-amber-300") : "text-slate-500"}`}>{fin(c.plan?.done) ? `đạt ${pctPlain(c.plan!.done, 0)}` : "—"}</p>
          <p className="text-[10px] text-slate-500">{fin(c.plan?.typical) ? `mọi năm ${pctPlain(c.plan!.typical, 0)} tới lúc này` : c.plan ? "chưa cùng phạm vi BCTC" : "chưa đọc được kế hoạch"}</p>
        </div>
        <div className="rounded-md border border-white/[0.07] px-2 py-1.5" data-testid="season-ctx-live">
          <p className="text-[10px] font-bold uppercase text-slate-500">10 phiên gần nhất</p>
          <p className={`font-mono text-[14px] font-bold ${liveAlert ? "text-[#F5CE72]" : "text-slate-100"}`}>{liveAlert ? "⚡ " : ""}{live ? pct(live.car10, 1) : "—"}</p>
          <p className="text-[10px] text-slate-500">{live ? `KL z ${num(live.av10, 1)} · tới ${dmy(live.asOf).slice(0, 5)}` : "chưa có dữ liệu giá"}</p>
        </div>
      </div>
      {l && (
        <p className="mt-2 text-[10.5px] text-slate-400" data-testid="season-ctx-last">
          Kỳ vừa công bố <b className="text-slate-200">{l.quarter}</b> ngày {dmy(l.date)} ({l.source === "DISCLOSURE" ? "tin BCTC" : "ngày dữ liệu"}): LNST so cùng kỳ <b className={g.cls}>{g.text}</b>
          {fin(l.result?.sueCore) && <> · SUE cốt lõi <b className="font-mono">{num(l.result!.sueCore, 1)}</b></>}
          {l.reaction?.kind === "EVENT" && <> · phản ứng 3 phiên <b className={(l.reaction.carAnn ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}>{pct(l.reaction.carAnn, 1)}</b>, KL z {num(l.reaction.avAnn, 1)}</>}
        </p>
      )}
    </section>
  );
}

function DateAudit({ b }: { b: SeasonalityBundle }) {
  const qs = [1, 2, 3, 4].map((q) => ({ q, a: b.audit[String(q)] })).filter((x) => x.a?.rows.length);
  if (!qs.length) return null;
  const checked = qs.reduce((s, x) => s + x.a.checked, 0), off = qs.reduce((s, x) => s + x.a.offBy2, 0);
  const lag = (r: SeasonalityBundle["audit"][string]["rows"][number]) => r.sessions ?? (r.days != null ? Math.round((r.days * 5) / 7) : null);
  return (
    <details className="tw-scope rounded-lg border border-white/10 bg-white/[0.02]" data-testid="season-audit">
      <summary className="cursor-pointer px-3 py-2 text-[11px] text-slate-300">
        <b className="text-slate-100">🔎 Kiểm ngày làm mốc</b> · {checked} kỳ có tin BCTC chính thức để đối chiếu ·{" "}
        <b className={off ? "text-amber-300" : "text-emerald-300"}>{off} kỳ lệch ≥ 2 phiên</b> so ngày công bố thật
        <span className="text-slate-500"> — chú thích độ tin cậy của thống kê mùa vụ, không đổi số</span>
      </summary>
      <div className="grid gap-3 px-3 pb-3 md:grid-cols-2">
        {qs.map(({ q, a }) => (
          <table key={q} className="w-full text-[11px]" data-testid={`season-audit-q${q}`}>
            <thead><tr className="text-right text-[10px] uppercase text-slate-500"><th className="px-1 py-1 text-left" style={{ color: QC[q - 1] }}>Q{q}</th><th className="px-1 py-1">Ngày Mùa vụ dùng</th><th className="px-1 py-1">Ngày công bố thật</th><th className="px-1 py-1">Lệch</th></tr></thead>
            <tbody>
              {a.rows.map((r) => {
                const d = lag(r), checkedRow = r.source === "DISCLOSURE";
                return (
                  <tr key={r.used} className="text-right font-mono tabular-nums" data-testid="season-audit-row">
                    <td className="px-1 py-0.5 text-left text-slate-400">{r.fiscal.slice(0, 4)}</td>
                    <td className="px-1 py-0.5 text-slate-200">{dmy(r.used)}</td>
                    <td className="px-1 py-0.5 text-slate-300">{r.precise ? dmy(r.precise) : "—"}<span className="ml-1 font-sans text-[10px] text-slate-500">{checkedRow ? "tin BCTC" : r.precise ? "ngày dữ liệu" : ""}</span></td>
                    <td className={`px-1 py-0.5 ${!checkedRow || d == null ? "text-slate-500" : Math.abs(d) >= 2 ? "text-amber-300" : "text-emerald-300"}`}>{!checkedRow || d == null ? "—" : d === 0 ? "khớp" : `${d > 0 ? "+" : "−"}${Math.abs(d)} phiên`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>
      <p className="px-3 pb-3 text-[10px] text-slate-500">"Lệch +n phiên" = Mùa vụ lấy mốc trễ hơn ngày công bố thật n phiên: phản ứng giá của kỳ đó có thể đã xảy ra trước "ngày 0" trên biểu đồ CAR, làm thống kê cửa sổ yếu đi. Tin BCTC chính thức VNDirect có từ 2024; kỳ cũ hơn chỉ có ngày dữ liệu nên không đối chiếu được.</p>
    </details>
  );
}

export default function SeasonalityView({ tickers, value, onChange }: { tickers: string[]; value: string | null; onChange: (t: string | null) => void }) {
  const { pinned } = usePinnedStocks();
  const { data: cal } = useKqkdCalendar(!value);
  const [q, setQ] = useState("");
  const [mode, setModeRaw] = useState<Mode>(readMode);
  const setMode = (m: Mode) => { setModeRaw(m); try { localStorage.setItem(SEASON_MODE_KEY, m); } catch { /* không có storage */ } };
  const openTicker = (t: string) => { onChange(t); setMode("ticker"); };
  const upcoming = useMemo(() => (cal ? [cal.current, cal.next].flatMap((s) => s.rows.filter((r) => r.status === "UPCOMING" && r.expected && r.expected >= cal.asOf).sort((a, b) => a.expected!.localeCompare(b.expected!)).map((r) => r.t)) : []), [cal]);
  // S1: mở sẵn một mã.
  useEffect(() => {
    if (value || !tickers.length) return;
    const last = readLast();
    if (last && tickers.includes(last)) { onChange(last); return; }
    if (!cal && !pinned.some((t) => tickers.includes(t))) return; // chờ lịch để chọn mã sắp công bố
    const t = pickDefaultTicker(tickers, { last, pinned, upcoming });
    if (t) onChange(t);
  }, [value, tickers, pinned, upcoming, cal, onChange]);
  useEffect(() => { if (value) writeLast(value); }, [value]);
  const { data: b, error, isLoading } = useSeasonalityBundle(value);
  const [primed, setPrimed] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    if (b && value && b.ticker === value) { void primeSeasonality(value, b.items, defaultBaseUrl()).then(() => { if (!off) setPrimed(value); }); }
    return () => { off = true; };
  }, [b, value]);
  const i = value ? tickers.indexOf(value) : -1;
  const go = (d: number) => { if (!tickers.length) return; const k = i < 0 ? 0 : (i + d + tickers.length) % tickers.length; onChange(tickers[k]); };
  const ready = !value ? false : error ? true : primed === value; // gói lỗi -> mở như cũ (gọi thẳng Project A)
  return (
    <div className="space-y-3" data-testid="season-view">
      <div className="tw-scope flex flex-wrap gap-1" role="tablist" aria-label="Chế độ Mùa vụ KQKD">
        {([["ticker", "Theo mã"], ["map", "🗺 Bản đồ toàn thị trường"], ["ledger", "📒 Sổ theo dõi"]] as [Mode, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} data-testid={`season-mode-${k}`}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${mode === k ? "border-[#E8B84B]/60 bg-[#E8B84B]/10 text-[#F5CE72]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>{l}</button>
        ))}
      </div>
      {mode === "map" && <SeasonMapBoard onOpen={openTicker} />}
      {mode === "ledger" && <SeasonLedgerView onOpen={openTicker} />}
      {mode === "ticker" && <>
      <div className="tw-scope flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase text-cf-tertiary">Mã</span>
        <button type="button" onClick={() => go(-1)} aria-label="Mã trước" className="rounded-md border border-white/10 px-2 py-1 text-[12px] text-slate-300 hover:text-slate-100" data-testid="season-prev">‹</button>
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} data-testid="cotuc-seasonality-ticker"
          className="w-28 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-sm text-cf-primary">
          <option value="">— Chọn mã —</option>
          {tickers.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="button" onClick={() => go(1)} aria-label="Mã sau" className="rounded-md border border-white/10 px-2 py-1 text-[12px] text-slate-300 hover:text-slate-100" data-testid="season-next">›</button>
        <form onSubmit={(e) => { e.preventDefault(); const t = q.trim().toUpperCase(); if (tickers.includes(t)) { onChange(t); setQ(""); } }} className="flex items-center gap-1">
          <input value={q} onChange={(e) => setQ(e.target.value)} list="season-tickers" placeholder="Tìm mã…" aria-label="Tìm mã" className="w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-slate-200" data-testid="season-search" />
          <datalist id="season-tickers">{tickers.map((t) => <option key={t} value={t} />)}</datalist>
        </form>
        {upcoming.length > 0 && <span className="text-[10.5px] text-slate-500">Sắp công bố: {upcoming.slice(0, 5).map((t) => <button key={t} type="button" onClick={() => onChange(t)} className="ml-1 rounded border border-[#E8B84B]/40 px-1 font-mono text-[10.5px] text-[#F5CE72]">{t}</button>)}</span>}
        {b && <span className="ml-auto text-[10px] text-slate-500" data-testid="season-fresh" title={`Nguồn ${b.source} qua Gateway (1 lần gọi thay 9)`}>dữ liệu {dmy(b.fetchedAt)} {b.fetchedAt.slice(11, 16)} UTC{b.cached ? " · đệm" : ""}{b.stale ? " · bản gần nhất (nguồn tạm lỗi)" : ""}</span>}
      </div>
      {!value && <p className="text-[11px] text-cf-tertiary">Mùa vụ giá quanh ngày công bố KQKD theo từng quý: chu kỳ năm, đường đi trung bình quanh ngày công bố và 4 cửa sổ giao dịch của quý đang xem.</p>}
      {value && b && <NextContext b={b} />}
      {value && !ready && isLoading && <p role="status" className="text-[10.5px] text-slate-500" data-testid="season-loading">Đang tải Mùa vụ KQKD của {value}…</p>}
      {value && ready && <EarningsSeasonalityTab ticker={value} />}
      {value && b && <PooledEvidence pooled={b.context?.pooled} ticker={value} nextQuarter={b.context?.next?.quarter ?? null} />}
      {value && b && <DateAudit b={b} />}
      {error && <p className="text-[10px] text-amber-300">Gói Gateway chưa sẵn sàng ({error}) — đang tải trực tiếp từ nguồn.</p>}
      </>}
    </div>
  );
}
