// Elite 10 E4 — Hồ sơ 360°: mọi tín hiệu của một mã từ 7 tab (sổ E1), bậc bằng chứng hiện hành (E2), phân vị trong vũ trụ và
// Điểm Elite (E3). Tín hiệu bậc C hiển thị làm bối cảnh, có nhãn rõ, không cộng vào điểm.
// 30/10/2026: số tín hiệu đếm theo sổ (24); tín hiệu bậc / cờ hiện NHÃN thay vì thanh phân vị; thanh phân vị theo CHIỀU TỐT của
// từng tín hiệu (xám = trung tính); bậc kèm IC / t / n ở kỳ hạn chính; thác đóng góp vào Z.
// G3 (18/11/2026): "khoảng cách tới danh mục dòng tiền (Z)" thay bằng "khoảng cách tới danh mục Elite HL" — điều kiện quy tắc Hợp lưu.
import { useMemo } from "react";
import { useEliteDecision, useEliteEvidence, useElitePanel, useEliteTicker } from "../../../hooks/elite10/useEliteCenter";
import { hlPicks, type Tier } from "../../../lib/elite10/decisionTypes";
import { labelOf, metaOf } from "../../../lib/elite10/signalSemantics";
import { TierChip } from "./DecisionBoard";
import LiquidityBadge from "./LiquidityBadge";
import { LQ_DEFAULT } from "../../../lib/elite10/liquidity";
import LeadershipCard from "./LeadershipCard";
import ConfluenceCard from "./ConfluenceCard";
import { hlScores } from "../../../lib/elite10/confluence";
import { hlGap } from "../../../lib/elite10/hlGap";
import { splitQueue } from "../../../lib/elite10/liquidity";
import StockImpactCard from "./StockImpactCard";
import SignalTableView from "./SignalTableView";
import ThesisCard from "../profile/ThesisCard";
import LayerMatrix from "../profile/LayerMatrix";
import PriceActionConfirmation from "../profile/PriceActionConfirmation";
import { useEliteProfile } from "../../../hooks/elite10/useEliteProfile";
import { useEvidenceEvolution } from "../../../hooks/elite10/useEvidenceEvolution";

const num = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d }));

/** Phân vị (0–100) của giá trị trong danh sách (hạng trung bình cho giá trị trùng). */
export function percentile(values: number[], v: number): number | null {
  if (!values.length) return null;
  let below = 0, equal = 0;
  for (const x of values) { if (x < v) below++; else if (x === v) equal++; }
  return ((below + equal / 2) / values.length) * 100;
}

/** HS360-v3 H2: view = "summary" (góc Tổng quan) | "signals" (góc Tín hiệu: bảng 25 tín hiệu + Điểm Elite đối chứng). */
/** HS360-v3 H4: onView — chuyển góc nhìn từ ma trận lớp (Tín hiệu / Doanh nghiệp / Sự kiện). */
export default function SignalProfileCard({ ticker, view = "summary", onView }: { ticker: string; view?: "summary" | "signals"; onView?: (v: "signals" | "company" | "events") => void }) {
  const { decision, panel, isLoading, error } = useEliteTicker(ticker);
  const { data: full } = useElitePanel();
  const { data: ev } = useEliteEvidence();
  const { data: dec } = useEliteDecision();
  const evOf = useMemo(() => new Map((ev?.signals ?? []).map((s) => [s.id, s])), [ev]);
  const { data: evo } = useEvidenceEvolution(view === "signals");
  // HS360-v3 H4: ảnh chụp hồ sơ (Luận điểm + ma trận lớp) — chỉ góc Tổng quan dùng.
  const { data: snap, error: snapError } = useEliteProfile(view === "summary" ? ticker : null);
  const evoOf = useMemo(() => new Map((evo?.signals ?? []).map((s) => [s.id, s])), [evo]);
  const groups = useMemo(() => {
    if (!panel) return [];
    const m = new Map<string, typeof panel.signals>();
    for (const s of panel.signals) { if (!m.has(s.tab)) m.set(s.tab, []); m.get(s.tab)!.push(s); }
    return [...m];
  }, [panel]);
  // E4-HL: danh mục chính thức là Elite HL (không chọn theo Z) -> vị trí của mã lấy từ hàng chờ / danh sách ngành phản đối của Gateway.
  const hl = dec?.hl ?? null;
  const hlPos = useMemo(() => {
    if (!hl) return null;
    const qs = splitQueue(hl.queue, hl.queueIlliquid);
    const q = [...qs.tradable, ...qs.illiquid].find((x) => x.ticker === ticker);
    const ag = hl.against.find((x) => x.ticker === ticker);
    return { held: hlPicks(dec).some((p) => p.ticker === ticker), queue: q ?? null, against: ag ?? null };
  }, [hl, dec, ticker]);
  // G3: điều kiện Hợp lưu của mã tính lại từ bảng E1 cùng phiên (cùng hàm với khối "Hợp lưu đa yếu tố").
  const gap = useMemo(() => {
    if (!full || !hl) return null;
    const r = hlScores(full.rows).get(ticker);
    return hlGap(r, decision ?? null, hl.rule, hl.tier1);
  }, [full, hl, ticker, decision]);

  if (isLoading) return <p className="py-3 text-xs italic text-slate-500">Đang tải hồ sơ tín hiệu {ticker}…</p>;
  // Lỗi máy chủ / mạng KHÁC với "mã ngoài vũ trụ" (404): không được báo nhầm là mã không có trong danh sách.
  if (error && !panel) {
    return (
      <div role="alert" className="tw-scope rounded-lg border border-rose-400/40 bg-rose-500/[0.06] p-3 text-[11px] text-rose-200" data-testid="elite-profile-error">
        Không tải được hồ sơ tín hiệu {ticker}: {String((error as Error).message ?? error)}. Đây là lỗi tải dữ liệu, chưa kết luận được mã có trong bảng tín hiệu hay không.
      </div>
    );
  }
  if (!panel) {
    return (
      <div className="tw-scope rounded-lg border border-white/10 bg-slate-950/60 p-3 text-[11px] text-slate-400" data-testid="elite-profile-missing">
        {ticker} không nằm trong vũ trụ Siêu quét của bảng tín hiệu (chỉ số hoặc mã ngoài danh sách), nên chưa có Điểm Elite. Phần phân tích kỹ thuật bên dưới vẫn dùng dữ liệu thật.
      </div>
    );
  }
  const tabs = groups.length;
  const contribs = (decision?.contributions ?? []).filter((c) => c.contribution !== 0).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const maxAbs = Math.max(1e-9, ...contribs.map((c) => Math.abs(c.contribution)));
  const labelFor = (id: string) => panel.signals.find((s) => s.id === id)?.labelVi ?? id;
  const flowMissing = panel.missingSources.includes("researchFeatures");
  const showGap = Boolean(gap && !hlPos?.held);

  // ── Góc TỔNG QUAN: khoảng cách tới Elite HL (khi ngoài danh mục) + Hợp lưu + Dẫn dắt + Tác động. Bảng tín hiệu và Điểm Elite ở góc "Tín hiệu".
  if (view === "summary") {
    return (
      <section className="tw-scope rounded-lg border border-white/10 bg-[#0E131F] p-3 space-y-3 text-slate-200" data-testid="elite-profile" data-view="summary">
        <div className={`rounded-md border border-white/10 bg-white/[0.02] p-2 text-[10.5px] ${showGap ? "" : "hidden"}`} data-testid="elite-profile-gap">
          {/* HS360-v3 H1 (27/11/2026): khối "Vị trí so với danh mục Elite HL" đã gộp vào thanh đầu hồ sơ (profile-header-position). */}
          {showGap && gap && (
            <div data-testid="elite-profile-hl-gap">
              <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Khoảng cách tới danh mục Elite HL</p>
              <ul className="space-y-0.5">
                {gap.conds.map((c) => (
                  <li key={c.id} data-testid={`hl-gap-${c.id}`} data-ok={String(c.ok)} className={c.ok === false ? "text-amber-200" : c.ok ? "text-slate-300" : "text-slate-500"}>
                    <span aria-hidden="true" className={c.ok === false ? "text-amber-300" : c.ok ? "text-emerald-300" : "text-slate-500"}>{c.ok === false ? "✗" : c.ok ? "✓" : "?"}</span> {c.text}
                  </li>
                ))}
              </ul>
              <p className="mt-0.5 text-[10px] text-slate-400" data-testid="hl-gap-verdict">{gap.verdictVi} Mô tả theo quy tắc — không phải khuyến nghị mua.</p>
            </div>
          )}
        </div>
        {snap ? (
          <>
            <ThesisCard snap={snap} />
            <LayerMatrix layers={snap.layers} actions={{
              LEADERSHIP: { detail: <LeadershipCard ticker={ticker} /> },
              TECHNICAL: { detail: <div className="space-y-2"><ConfluenceCard ticker={ticker} /><PriceActionConfirmation ticker={ticker} /></div> },
              SECTOR: { detail: <ConfluenceCard ticker={ticker} /> },
              WORLD_CATALYST: { detail: <StockImpactCard ticker={ticker} /> },
              ...(onView ? {
                FLOW: { goto: { label: "Góc Tín hiệu", onClick: () => onView("signals") } },
                FUNDAMENTAL: { goto: { label: "Góc Doanh nghiệp", onClick: () => onView("company") } },
                LIQUIDITY: { goto: { label: "Góc Doanh nghiệp", onClick: () => onView("company") } },
                TIMING: { goto: { label: "Góc Sự kiện", onClick: () => onView("events") } },
              } : {}),
            }} />
          </>
        ) : snapError ? (
          // Ảnh chụp lỗi / chưa có (VD Gateway bản cũ) -> giữ nguyên các khối cũ, không mất thông tin.
          <>
            <p className="text-[10.5px] text-slate-500" data-testid="profile-snapshot-fallback">Chưa tải được luận điểm và ma trận lớp — hiện các khối chi tiết.</p>
            <ConfluenceCard ticker={ticker} />
            <LeadershipCard ticker={ticker} />
            <StockImpactCard ticker={ticker} />
          </>
        ) : <p className="py-2 text-[11px] italic text-slate-500" data-testid="profile-snapshot-loading">Đang dựng luận điểm và ma trận lớp của {ticker}…</p>}
        <p className="text-[10px] text-slate-400">Tham khảo định lượng — không phải khuyến nghị đầu tư. {panel.signals.length} tín hiệu của mã xem ở góc "Tín hiệu".</p>
      </section>
    );
  }

  // ── Góc TÍN HIỆU (HS360-v3 H2): bảng 25 tín hiệu E2 + bối cảnh ngoài E2 + Điểm Elite (đối chứng, thu gọn).
  const outsideStage = panel.values.structure_stage ?? null, outsideRvol = panel.values.log_rvol ?? null;
  return (
    <section className="tw-scope rounded-lg border border-white/10 bg-[#0E131F] p-3 space-y-3 text-slate-200" data-testid="elite-profile" data-view="signals">
      <div>
        <p className="text-[12px] font-bold text-q-accent-strong">Hồ sơ tín hiệu {ticker} — phiên {panel.date.split("-").reverse().join("/")}</p>
        <p className="text-[10.5px] text-slate-400">{panel.signals.length} tín hiệu từ {tabs} tab, chuẩn hoá theo sổ đăng ký E1; bậc theo bằng chứng E2, SQS / xu hướng / IC theo chế độ từ tab 4 (mô tả). Phân vị trong ~{full?.rows.length ?? "—"} mã cùng phiên và trong ngành, xoay theo chiều tốt.</p>
      </div>
      <SignalTableView panel={panel} rows={full?.rows ?? []} evOf={evOf} evoOf={evoOf} contributions={decision?.contributions ?? []} regime={evo?.currentRegime ?? null} />

      <details className="rounded-md border border-white/10 bg-white/[0.02] p-2" data-testid="elite-sig-outside">
        <summary className="cursor-pointer text-[11px] font-semibold text-slate-200">Bối cảnh ngoài bảng E2 <span className="font-normal text-slate-500">— Giai đoạn Minervini · RVOL (log)</span></summary>
        <ul className="mt-1.5 space-y-1 text-[10.5px] text-slate-300">
          <li data-testid="elite-sig-outside-stage">Giai đoạn Minervini khung Ngày: <b>{labelOf("structure_stage", outsideStage) ?? "—"}</b> <span className="text-slate-500">— 1 trong 7 mô hình TA của quy tắc Elite HL (khối Hợp lưu ở góc Tổng quan); rời bảng E2 từ 27/11/2026.</span></li>
          <li data-testid="elite-sig-outside-rvol">RVOL (log): <b className="font-mono">{outsideRvol == null ? "—" : num(outsideRvol)}</b> <span className="text-slate-500">— ở kỳ hạn 1 phiên dự báo NGƯỢC chiều (IC âm, t ≈ −4,8 theo E2); chuỗi IC vẫn được đo, rời bảng E2 từ 27/11/2026.</span></li>
        </ul>
      </details>

      <details className="rounded-md border border-white/10 bg-white/[0.02] p-2" data-testid="elite-score-details">
        <summary className="cursor-pointer text-[11px] font-semibold text-slate-200">Điểm Elite — danh mục dòng tiền (đối chứng){decision ? <span className="font-normal text-slate-500"> — hạng {decision.rank}/{decision.universe.panel}, Z {num(decision.Z)}</span> : null}</summary>
        <div className="mt-2 space-y-2">
          {hl && <p className="text-[10.5px] text-slate-400">Elite HL (chính thức) chọn mã theo quy tắc Hợp lưu, không theo Z. Z dùng cho danh mục đối chứng và nghiên cứu.</p>}
          {flowMissing && <p role="status" className="rounded border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[10.5px] text-rose-200" data-testid="elite-score-flow-missing">Z phiên này thiếu Stealth 20 / Stealth 5 (bảng tín hiệu thiếu dòng tiền) — không so sánh được với phiên đủ dữ liệu.</p>}
          {decision ? (
            <>
              <div className="flex flex-wrap gap-1.5 text-[10.5px]" data-testid="elite-profile-score">
                <span className="rounded border border-white/15 px-2 py-0.5">Hạng <b>{decision.rank}</b>/{decision.universe.panel}</span>
                <span className="rounded border border-white/15 px-2 py-0.5">Z <b>{num(decision.Z)}</b></span>
                <span className="rounded border border-white/15 px-2 py-0.5">α 5 phiên <b>{num(decision.alpha5Pct)}%</b></span>
                <span className="rounded border border-white/15 px-2 py-0.5">P vượt <b>{num(decision.pOutperform * 100, 1)}%</b></span>
                {decision.liq && <span className="rounded border border-white/15 px-2 py-0.5"><LiquidityBadge liq={decision.liq} rules={dec?.liquidity ?? LQ_DEFAULT} sigma20={decision.sigma20} testId="elite-profile-liq" /></span>}
                {/* HS360-v3 H1: khi có Elite HL, vị thế chỉ hiện ở thanh đầu hồ sơ (một nguồn) — không lặp chip ở đây. */}
                {decision.inPortfolio && !hl
                  ? <span className="rounded border border-emerald-400/50 bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-300">Trong Elite 10</span>
                  : !decision.inPortfolio && !decision.eligible && <span className="rounded border border-amber-400/40 px-2 py-0.5 text-amber-300">Không đủ điều kiện: {decision.reason}</span>}
              </div>
              <div className="md:w-1/2" data-testid="elite-profile-waterfall">
                <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Đóng góp vào Điểm Elite (Z = {num(decision.Z)}){hl ? " — danh mục dòng tiền (đối chứng); Elite HL không chọn theo Z" : ""}</p>
                {contribs.length === 0 ? <p className="text-[10.5px] text-slate-500">Không tín hiệu bậc A/B nào có giá trị khác 0 ở mã này.</p> : contribs.map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5 text-[10.5px]" data-testid={`elite-contrib-${c.id}`}>
                    <span className="w-28 shrink-0 truncate text-slate-300" title={labelFor(c.id)}>{labelFor(c.id)}</span>
                    <span className="relative h-2 flex-1 rounded bg-white/5">
                      <span className="absolute top-0 h-2 rounded" style={{ left: c.contribution >= 0 ? "50%" : `${50 - (Math.abs(c.contribution) / maxAbs) * 50}%`, width: `${(Math.abs(c.contribution) / maxAbs) * 50}%`, background: c.contribution >= 0 ? "rgba(52,211,153,.75)" : "rgba(251,113,133,.75)" }} />
                      <span className="absolute left-1/2 top-[-2px] h-3 w-px bg-white/25" />
                    </span>
                    <span className="w-12 shrink-0 text-right font-mono">{c.contribution > 0 ? "+" : ""}{num(c.contribution)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-[10.5px] text-slate-500">Chưa có Điểm Elite cho mã này phiên này.</p>}
        </div>
      </details>
      <p className="text-[10px] text-slate-400">Tham khảo định lượng — không phải khuyến nghị đầu tư.</p>
      <p className="text-[10px] text-slate-500">Chỉ tín hiệu bậc A/B có số đóng góp vào Điểm Elite. Giá trị trống = nguồn không có dữ liệu cho mã này (không điền số giả). Rê chuột lên bậc để xem IC / t / n của kiểm định.</p>
    </section>
  );
}
