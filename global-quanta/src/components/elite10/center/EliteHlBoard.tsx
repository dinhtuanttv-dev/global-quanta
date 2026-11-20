// E4-HL (12/11/2026) — BẢNG QUYẾT ĐỊNH ELITE HL: danh mục chính thức dựng trên quy tắc Hợp lưu đa yếu tố HL-v1 (cấu trúc G2r).
// Command Deck (18/11/2026, A1–A6): thanh lệnh + 4 đồng hồ + dải Hôm nay + radar ngưỡng bán + phễu + Không gian quy tắc 2D/3D +
// hàng chờ dạng thẻ + tường bằng chứng; bảng danh mục nâng cấp tại chỗ (thanh LS, chấm TA, dải biến động, rủi ro Euler). Chỉ giao diện.
// Bố cục: dải chỉ số -> phễu chọn lọc -> thay đổi hôm nay -> danh mục (ba tầng, ngưỡng ra) -> hàng chờ -> phân bổ ngành + thẻ tóm tắt
// bằng chứng (nút sang tab 4) -> khung Mã đang chọn. Quy tắc, K0, sổ theo dõi tiến ở tab 4 (QĐ-R 20/11/2026). Số từ /api/elite/decision.
import { Fragment, useMemo, useState } from "react";
import { HL_TA_LABELS, HL_VOTE_LABELS } from "../../../lib/elite10/confluence";
import { useWorldStrategy } from "../../../hooks/useWorldStrategy";
import { hlPicks, type EliteDecision, type HlClassCode, type HlPick } from "../../../lib/elite10/decisionTypes";
import { fmtDate, num, price, signed } from "./boardParts";
import HlCalendarStrip from "./HlCalendarStrip";
import LiquidityBadge, { PortfolioLiquidityLine } from "./LiquidityBadge";
import DilutionBadge from "./DilutionBadge";
import { LQ_DEFAULT } from "../../../lib/elite10/liquidity";
import { useProfileFaWarnings } from "../../../hooks/elite10/useProfileFa";
import { WarningList } from "../profile/pfaParts";
import { coreOf, DEFAULT_PZ_RULES, HlWatchPanel, PzCardLine, PzCells } from "./HlPricePosition";
// QĐ-R (20/11/2026): "Quy tắc vào · giữ · ra", "Sổ theo dõi tiến" và thẻ Cổng tiền mặt chuyển sang tab 4 (HlRulesLedger);
// bảng này giữ thẻ tóm tắt + nút sang tab 4, và nhận khung "Mã đang chọn" (cổ tức · mô phỏng thời điểm · tin tức) từ Hồ sơ 360°.
import { HlEvidenceLink, Panel } from "./HlRulesLedger";
import HlFocusFrame from "./HlFocusFrame";
// HL-RADAR P1 (20/11/2026, tài liệu 20): lớp hiển thị lấy từ ELITE COMMAND RADAR — chỉ THÊM phần tử (data-hl-layer), không đổi số / logic.
import { HlLayerToggles, HlLivePrice, HlTickerBadge, rimStyle } from "./HlRadarLayers";
import { useHlLayers, useHlRowSignals } from "../../../hooks/elite10/useHlRowSignals";
// HL-RADAR P2: cột "Tin & tác động 14 ngày", chip lọc hiển thị (mặc định tắt), thông báo tin nóng tuỳ chọn (mặc định tắt).
import { HlNewsHeader, HlNewsStrip, HlRowFilters, matchFilters, NEWS_COL_WIDTH, useHlNewsNotify, type HlFilter } from "./HlNewsLayers";
// HL-RADAR P3: lớp tác động mở rộng dưới dòng (khối Tác động lên cổ phiếu của Hồ sơ 360°, tải khi mở).
import { HlImpactBlock, HlImpactRow, HlImpactToggle } from "./HlImpactLayer";
// HL-RADAR P4: xu hướng LS-v1 theo phiên + tua lại các phiên trước (Gateway /api/elite/hl-history, bản gọn của tài liệu đã lưu).
import { HlLsTrend, HlReplay, useHlHistory } from "./HlHistoryLayers";
// BUỒNG LÁI C1–C5 (20/11/2026, docs/elite-hl-cockpit): thanh trạng thái, đọc phễu, bản đồ trạng thái (D1), breadcrumb, ma trận hàng chờ.
import { funnelModel, resolveBoardState, sessionSeal, type HistSessionLite } from "../../../lib/elite10/cockpit";
import { CockpitStatusBar, FunnelNotes, HlBreadcrumb, pickedTickers, QueueMatrix, StateMap, todayTransitions, useHlWatchLog } from "./CockpitLayers";
import { CommandBar, MissionMeters, TodayRibbon } from "../deck/DeckTop";
// NHỊP QUYẾT ĐỊNH (20/11/2026, docs/elite-hl-pulse): lớp "pulse" bật -> một panel thay TodayRibbon + "Thay đổi hôm nay"; tắt -> như cũ.
import DecisionPulse from "./DecisionPulse";
// RÀ SOÁT NGƯỢC (20/11/2026): radar đủ 4 điều kiện bán + thành phần nhóm lõi theo vị trí giá (lớp Buồng lái, chỉ thêm).
import ExitTriggers from "./ExitTriggers";
import { PZ_VI } from "./HlPricePosition";
import type { PulseHistSession } from "../../../lib/elite10/decisionPulse";
import { ExitRadar, FunnelBars } from "../deck/DeckSide";
import QueueDeck from "../deck/QueueDeck";
import RuleSpace from "../deck/RuleSpace";
import { LsGauge, TaDots, VolCorridor } from "../deck/parts";
import { corridorPos, deckInvariants, eulerBy } from "../../../lib/elite10/deckModel";
import { useDeckPanel, useDeckRisk } from "../../../hooks/elite10/useDeckData";

const CLS_VI: Record<HlClassCode, string> = { STRONG: "Hợp lưu mạnh", CONFLUENCE: "Hợp lưu", T1_SECTOR_AGAINST: "Ngành phản đối", T1_SECTOR_NA: "Chưa có RRG", NOT_T1: "Đã rời tầng 1" };
const CLS_TONE: Record<HlClassCode, string> = {
  STRONG: "border-emerald-400/60 bg-emerald-500/15 text-emerald-200", CONFLUENCE: "border-emerald-400/40 text-emerald-300",
  T1_SECTOR_AGAINST: "border-amber-400/50 text-amber-300", T1_SECTOR_NA: "border-amber-400/30 text-amber-200", NOT_T1: "border-slate-500/50 text-slate-300",
};
const RRG_VI: Record<string, string> = { "2": "Dẫn dắt", "1": "Cải thiện", "-1": "Suy yếu", "-2": "Tụt hậu" };
const RRG_TONE: Record<string, string> = { "2": "text-emerald-300", "1": "text-emerald-200", "-1": "text-amber-300", "-2": "text-rose-300" };
const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${num(v * 100, d)}%`);
const pts = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

function Tile({ label, children, sub, testId }: { label: string; children: React.ReactNode; sub?: React.ReactNode; testId: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0E131F] px-3 py-2" data-testid={testId}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-[17px] font-bold leading-tight text-slate-100">{children}</p>
      {sub && <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">{sub}</p>}
    </div>
  );
}
/** Thanh ngang: phần tô = value / max; `mark` = vạch ngưỡng (0–1). */
function Bar({ value, max, tone = "bg-emerald-400/70", mark, width = 64 }: { value: number; max: number; tone?: string; mark?: number; width?: number }) {
  return (
    <span aria-hidden="true" className="relative inline-block h-1.5 overflow-hidden rounded bg-white/10 align-middle" style={{ width }}>
      <span className={`absolute inset-y-0 left-0 rounded ${tone}`} style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%` }} />
      {mark != null && <span className="absolute inset-y-0 w-px bg-rose-300" style={{ left: `${mark * 100}%` }} />}
    </span>
  );
}
/** N2 — thẻ "Vì sao": điều kiện tầng 1, phiếu tầng 3, ba ngưỡng ra và lãi/lỗ từ phiên khoá của một vị thế. */
function HlWhy({ p, exitLsPct, mobile = false }: { p: HlPick; exitLsPct: number; mobile?: boolean }) {
  const h = p.hl;
  const ta = Object.entries(h.ta ?? {}), votes = Object.entries(h.votes ?? {});
  const voteTone = (v: number | null) => (v == null ? "border-white/10 text-slate-500" : v > 0 ? "border-emerald-400/40 text-emerald-300" : v < 0 ? "border-rose-400/40 text-rose-300" : "border-white/15 text-slate-400");
  return (
    <div className="grid grid-cols-1 gap-2 rounded-md border border-[#E8B84B]/25 bg-[#E8B84B]/[0.04] p-2 text-[11px] md:grid-cols-4" data-testid={`hl-why${mobile ? "-m" : ""}-${p.ticker}`}>
      <div>
        <p className="text-[10px] font-bold uppercase text-slate-500">Tầng 1 · dẫn dắt + mô hình TA</p>
        <p className="text-slate-300">LS-v1 phân vị <b className="text-slate-100">{num(h.lsPct, 0)}</b> <span className="text-slate-500">· {h.lsPts} điểm</span></p>
        {ta.length === 0 ? <p className="text-slate-500">Chưa có chi tiết mô hình TA cho phiên này.</p> : (
          <ul className="mt-0.5 space-y-0.5">
            {ta.map(([sig, ok]) => <li key={sig} className={ok === true ? "text-emerald-300" : ok === false ? "text-slate-500" : "text-slate-600"}>{ok === true ? "✓" : ok === false ? "✗" : "·"} {HL_TA_LABELS[sig] ?? sig}{ok === null ? " — chưa có dữ liệu" : ""}</li>)}
          </ul>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase text-slate-500">Tầng 3 · từng phiếu của các tab</p>
        {votes.length === 0 ? <p className="text-slate-500">Chưa có chi tiết phiếu cho phiên này.</p> : (
          <p className="flex flex-wrap gap-1">
            {votes.map(([id, v]) => <span key={id} title={HL_VOTE_LABELS[id]?.tab} className={`rounded border px-1 py-px text-[10px] ${voteTone(v)}`}>{v == null ? "·" : pts(v)} {HL_VOTE_LABELS[id]?.label ?? id}</span>)}
          </p>
        )}
        <p className="mt-1 text-[10px] text-slate-500">"·" = tab đó chưa có dữ liệu cho mã, không tính điểm.</p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase text-slate-500">Ba ngưỡng ra</p>
        <ul className="space-y-0.5 text-slate-300">
          <li>LS-v1: {h.exitBufferLs == null ? "—" : <>còn cách <b className="text-slate-100">{num(h.exitBufferLs, 0)}</b> điểm phân vị</>} <span className="text-slate-500">(ra khi &lt; {exitLsPct})</span></li>
          <li>Mô hình TA: đang đạt <b className="text-slate-100">{h.taCount}</b> <span className="text-slate-500">(ra khi còn 0)</span></li>
          <li>Ngành: <b className={RRG_TONE[String(h.rrg)] ?? "text-slate-300"}>{h.rrg == null ? "chưa có RRG" : RRG_VI[String(h.rrg)]}</b> <span className="text-slate-500">(ra khi Tụt hậu)</span></li>
        </ul>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase text-slate-500">Từ phiên khoá</p>
        <p className="text-slate-300">Vào danh mục: <b className="text-slate-100">{fmtDate(h.since)}</b></p>
        <p className="text-slate-300">Giá tham chiếu: <span className="font-mono">{price(h.ref)}</span> → <span className="font-mono">{price(p.close)}</span></p>
        <p className="text-slate-300">Thay đổi: {h.sinceRet == null ? "—" : <b className={h.sinceRet > 0 ? "text-emerald-300" : h.sinceRet < 0 ? "text-rose-300" : "text-slate-100"}>{signed(h.sinceRet * 100, 1)}%</b>} <span className="text-[10px] text-slate-500">(đóng cửa điều chỉnh; khớp thật ở phiên kế tiếp)</span></p>
      </div>
    </div>
  );
}
export default function EliteHlBoard({ d, onOpenTicker, switcher, refreshError = null, onNavigateToEvidence }: { d: EliteDecision; onOpenTicker: (ticker: string) => void; switcher?: React.ReactNode; refreshError?: string | null; onNavigateToEvidence?: () => void }) {
  const hl = d.hl!;
  const { data: ws } = useWorldStrategy();
  // PFA-v1 pha B: cảnh báo cơ bản & sự kiện của từng vị thế — mô tả, KHÔNG đổi danh mục.
  const { data: pfaW } = useProfileFaWarnings();
  const pfaOf = (t: string) => (pfaW && pfaW.asOf === d.date ? pfaW.tickers[t] ?? [] : []);
  const sectorName = useMemo(() => new Map((ws?.short.rows ?? []).map((r) => [r.icb, r.nameVi])), [ws]);
  const secName = (k: string | null | undefined) => (k ? sectorName.get(k) ?? k : "—");
  const f = hl.funnel, r = hl.rule, ch = hl.changes;
  // LQ1: số đo thanh khoản (mô tả) theo mã, ngưỡng công khai của Gateway; hàng chờ tách mã chưa giao dịch được.
  const lq = d.liquidity ?? LQ_DEFAULT;
  const scoreBy = new Map(d.scores.map((s) => [s.ticker, s]));
  const liqOf = (t: string) => scoreBy.get(t)?.liq ?? null;
  // Command Deck: rủi ro danh mục (Euler), bảng tín hiệu (Không gian quy tắc), sổ bằng chứng — nguồn thiếu thì khối tự ẩn / hiện "—".
  const { data: risk } = useDeckRisk();
  const { data: panel } = useDeckPanel();
  const euler = useMemo(() => eulerBy(risk), [risk]);
  const invariants = useMemo(() => deckInvariants(d, risk), [d, risk]);
  const heldSet = useMemo(() => new Set(hlPicks(d).map((p) => p.ticker)), [d]);
  const queuedSet = useMemo(() => new Set([...hl.queue, ...(hl.queueIlliquid ?? [])].map((q) => q.ticker)), [hl.queue, hl.queueIlliquid]);
  // PX0: pha đợt pha loãng ≥ 10% (chỉ hiển thị, PX-r1 KHÔNG ĐẠT).
  const pxOf = (t: string) => d.dilution?.byTicker?.[t] ?? null;
  const pxBadge = (t: string, id: string) => (pxOf(t) ? <> <DilutionBadge p={pxOf(t)} pxR1={d.dilution?.pxR1} testId={id} /></> : null);
  const picks = hlPicks(d);
  const [layers, toggleLayer] = useHlLayers();
  const heldTickers = useMemo(() => picks.map((p) => p.ticker), [picks.map((p) => p.ticker).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowSig = useHlRowSignals(heldTickers, layers);
  const [filters, setFilters] = useState<Set<HlFilter>>(() => new Set());
  const toggleFilter = (k: HlFilter) => setFilters((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const notify = useHlNewsNotify(rowSig.map, rowSig.now);
  const [impactOpen, setImpactOpen] = useState<string | null>(null);
  const { data: hist } = useHlHistory(layers.trend || layers.cockpit || layers.pulse);
  const { data: wlog } = useHlWatchLog(layers.cockpit);
  const cockpitStates = useMemo(() => resolveBoardState(d), [d]);
  const cockpitFunnel = useMemo(() => funnelModel(d), [d]);
  const cockpitSeal = useMemo(() => sessionSeal(d, [{ key: "panel", label: "Bảng tín hiệu", date: panel?.date }, { key: "risk", label: "Rủi ro", date: risk?.date }, { key: "hist", label: "Lịch sử theo phiên", date: hist?.dates?.[hist.dates.length - 1] }]), [d, panel?.date, risk?.date, hist]);
  const cockpitSessions = hist?.sessions as HistSessionLite[] | undefined, cockpitLog = wlog?.entries;
  const cockpitToday = useMemo(() => (layers.cockpit ? todayTransitions(cockpitStates, d, cockpitSessions, cockpitLog) : []), [layers.cockpit, cockpitStates, d, cockpitSessions, cockpitLog]);
  const [cockpitPick, setCockpitPick] = useState<string | null>(null);
  const impactBtn = (t: string, mobile = false) => (layers.impact ? <HlImpactToggle ticker={t} open={impactOpen === t} onToggle={() => setImpactOpen(impactOpen === t ? null : t)} mobile={mobile} /> : null);
  // PZ-v2: bảng chính chỉ còn mã trong nền / vùng mua; mã đang giữ đã tăng nóng chuyển sang bảng Theo dõi chờ nền (vẫn trong vốn).
  const pz = hl.pz ?? null, pzRules = { ...DEFAULT_PZ_RULES, ...(pz?.rules ?? {}) };
  const corePicks = coreOf(picks, Boolean(pz)), runnerCount = picks.length - corePicks.length;
  // Ngưỡng tầng 1 và chi phí sổ lấy từ Gateway; mặc định chỉ dùng khi Gateway bản cũ chưa gửi.
  const t1 = hl.tier1 ?? { lsLeaderPct: 80, taMin: 2, taModels: 7, maxScore: 10 };
  const lsTop = 100 - t1.lsLeaderPct;
  const dong = (v: number | undefined) => (v == null ? "5.000" : v.toLocaleString("vi-VN"));
  const [why, setWhy] = useState<string | null>(null);
  const whyBtn = (t: string, mobile = false) => <button type="button" aria-expanded={why === t} onClick={() => setWhy(why === t ? null : t)} data-touch data-testid={`hl-why-btn${mobile ? "-m" : ""}-${t}`} className="ml-1 min-h-[22px] rounded border border-white/15 px-1.5 text-[10px] text-slate-300 hover:border-[#E8B84B]/50 hover:text-[#F5CE72]">{why === t ? "▾ Vì sao" : "▸ Vì sao"}</button>;
  const steps: [string, number, string][] = [
    ["Bảng tín hiệu", f.panel, "mã có tín hiệu trong phiên"],
    ["Giao dịch được", f.tradable, `GTGD TB20 ≥ ${r.minAdvBn} tỷ, giá ≥ ${dong(r.minPrice)}đ, giá không bị neo`],
    ["Đạt tầng 1", f.tier1, `LS-v1 top ${lsTop}% và ≥ ${t1.taMin} mô hình TA`],
    ["Hợp lưu", f.selected, "tầng 1 + RRG ngành Cải thiện / Dẫn dắt"],
    ["Hợp lưu giao dịch được", f.selectedTradable, "đủ thanh khoản để vào danh mục"],
    ...(f.inZone != null ? [["Trong vùng mua", f.inZone, `giá trong [${num(pzRules.zoneLow * 100, 0)}% ; +${num(pzRules.zoneHigh * 100, 0)}%] quanh pivot, rủi ro ≤ ${num(pzRules.maxRisk * 100, 0)}%`] as [string, number, string]] : []),
    ["Danh mục", f.held, `tối đa ${r.slots} mã, ${r.maxPerSector} mã / ngành`],
  ];
  const openBtn = (t: string) => <button type="button" onClick={() => onOpenTicker(t)} data-testid={`hl-open-${t}`} className="font-bold text-[#F5CE72] hover:underline">{t}</button>;

  return (
    <div className="tw-scope space-y-3 text-slate-200" data-testid="elite-hl-board">
      <CommandBar d={d} />
      {layers.cockpit && <CockpitStatusBar seal={cockpitSeal} states={cockpitStates} today={cockpitToday} />}
      {layers.cockpit && layers.pulse && <p className="-mt-2 text-right text-[10px]" data-hl-layer="pulse"><a href="#decision-pulse" className="text-slate-400 underline hover:text-[#F5CE72]" data-testid="pulse-link">Lịch xét và thay đổi phiên này → Nhịp quyết định</a></p>}
      {switcher}

      {refreshError && (
        <div role="alert" className="rounded-lg border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-100" data-testid="hl-refresh-error">
          <b>Không làm mới được dữ liệu</b> ({refreshError}). Bảng đang hiện bản của phiên {fmtDate(d.date)}, dựng lúc {new Date(d.builtAt).toLocaleString("vi-VN", { hour12: false })} — có thể chưa phải phiên mới nhất.
        </div>
      )}
      {d.freshness?.sessionsBehind === 1 && d.freshness.overdue && (
        <div role="alert" className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-200" data-testid="hl-stale">
          <b>Bảng chưa có phiên {fmtDate(d.freshness.latestSession)}.</b> Phiên đó đã đóng cửa nhưng bảng quyết định chưa được dựng (thường dựng sau 17:00). Danh mục và các ngưỡng ra bên dưới là của phiên {fmtDate(d.date)}, KHÔNG phản ánh phiên mới nhất.
        </div>
      )}
      {d.freshness && d.freshness.sessionsBehind >= 2 && (
        <div role="alert" className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-200" data-testid="hl-stale">
          <b>Bảng đang chậm {d.freshness.sessionsBehind} phiên.</b> Phiên giao dịch mới nhất là {fmtDate(d.freshness.latestSession)}, nhưng bảng quyết định mới dựng tới phiên {fmtDate(d.date)}. Danh mục và các ngưỡng ra bên dưới KHÔNG phản ánh các phiên sau đó.
        </div>
      )}
      {d.freshness?.sessionsBehind === 1 && !d.freshness.overdue && (
        <p className="text-[10.5px] text-slate-400" data-testid="hl-pending">Phiên {fmtDate(d.freshness.latestSession)} đã đóng cửa; bảng của phiên đó được dựng sau 17:00. Đang hiện bảng phiên {fmtDate(d.date)}.</p>
      )}
      {hl.dataGuard?.frozen ? (
        <div role="alert" className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-200" data-testid="hl-data-guard">
          <b>Dữ liệu phiên không đủ — danh mục giữ nguyên, không vào và không ra.</b> {hl.dataGuard.reasonsVi.join(" · ")}. Quy tắc sẽ được áp lại ở phiên có đủ dữ liệu.
        </div>
      ) : (
        <p className="text-[10.5px] text-slate-400" data-testid="hl-data-ok"><span className="mr-1 text-emerald-300">●</span>Dữ liệu phiên đủ nguồn: LS-v1, mô hình TA, RRG ngành.</p>
      )}

      <MissionMeters d={d} ws={ws} risk={risk} />
      {layers.pulse ? <DecisionPulse d={d} history={hist?.sessions as PulseHistSession[] | undefined} onOpenTicker={onOpenTicker} /> : <TodayRibbon d={d} />}
      {invariants.length > 0 && <p role="status" className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[10.5px] text-amber-200" data-testid="deck-invariants">Kiểm tra nhất quán dữ liệu chưa đạt: {invariants.join(" · ")}.</p>}

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <ExitRadar picks={picks} rule={r} missSessions={r.missSessions ?? 2} onOpenTicker={onOpenTicker} />
        {layers.cockpit && <ExitTriggers d={d} picks={picks} onOpenTicker={onOpenTicker} />}
        <FunnelBars steps={steps} total={f.panel} />
      {!layers.pulse && (
      <Panel title={`Thay đổi hôm nay${hl.prevDate ? ` · so với phiên ${fmtDate(hl.prevDate)}` : " · phiên dựng đầu tiên"}`} testId="hl-changes">
        {!ch.added.length && !ch.exits.length ? <p className="text-[11px] text-slate-400">Danh mục giữ nguyên {ch.kept} mã. Tỷ trọng mã đang giữ không bị cân lại.</p> : (
          <ul className="space-y-1 text-[11px]">
            {ch.added.length > 0 && <li data-testid="hl-added"><b className="text-emerald-300">Vào mới ({ch.added.length}):</b> {ch.added.map((t, i) => <span key={t}>{i ? " · " : ""}{openBtn(t)}</span>)}</li>}
            {ch.exits.map((x) => <li key={x.ticker} data-testid={`hl-exit-${x.ticker}`}><b className="text-rose-300">Ra {x.ticker}</b> <span className="text-slate-400">({pct(x.weight)}{x.since ? `, giữ từ ${fmtDate(x.since)}` : ""}) — {x.reasonVi}</span></li>)}
            <li className="text-[10px] text-slate-500">Giữ {ch.kept} mã. Mã tăng sát trần ở phiên khớp thì không vào đuổi.</li>
          </ul>
        )}
        {pz && ((ch.toWatch?.length ?? 0) > 0 || (ch.backToZone?.length ?? 0) > 0) && (
          <p className="mt-1 text-[11px]" data-testid="hl-pz-changes"><b className="text-violet-200">Chuyển sang theo dõi: {ch.toWatch?.length ?? 0} mã</b>{ch.toWatch?.length ? <span className="text-slate-400"> ({ch.toWatch.join(", ")})</span> : null} · <b className="text-emerald-300">Về vùng mua: {ch.backToZone?.length ?? 0} mã</b>{ch.backToZone?.length ? <span className="text-slate-400"> ({ch.backToZone.join(", ")})</span> : null}</p>
        )}
      </Panel>
      )}
      </div>

      {layers.cockpit && cockpitFunnel && <FunnelNotes m={cockpitFunnel} picked={cockpitPick} onPick={setCockpitPick} />}
      <HlCalendarStrip d={d} onOpenTicker={onOpenTicker} />

      {pz && layers.cockpit && corePicks.some((p) => p.hl.pz && p.hl.pz.state !== "BUY_ZONE" && p.hl.pz.state !== "IN_BASE") && (
        <p className="-mb-1 px-1 text-[10.5px] text-slate-400" data-hl-layer="cockpit" data-testid="hl-core-mix">Nhóm lõi theo vị trí giá: {Object.entries(corePicks.reduce<Record<string, string[]>>((a, p) => { const k = p.hl.pz?.state ?? "UNKNOWN"; (a[k] ??= []).push(p.ticker); return a; }, {})).map(([k, ts]) => `${PZ_VI[k as keyof typeof PZ_VI] ?? k} ${ts.length}${k !== "BUY_ZONE" && k !== "IN_BASE" ? ` (${ts.join(", ")})` : ""}`).join(" · ")} — tiêu đề "trong nền và vùng mua" là nhóm lõi chưa chuyển sang Chạy lãi, gồm cả mã chưa có nền.</p>
      )}
      <Panel title={pz ? `Danh mục Elite HL · trong nền và vùng mua (${corePicks.length} mã)` : `Danh mục Elite HL (${f.held}/${r.slots})`} testId="elite-portfolio" right={<span className="text-[10px] text-slate-500">Bấm mã để mở Hồ sơ 360°</span>}>
        {pz && <p className="mb-1.5 text-[10.5px] text-slate-400" data-testid="hl-pz-mode"><span className={`mr-1 rounded border px-1 py-px text-[10px] font-bold ${pz.gate ? "border-emerald-400/60 text-emerald-200" : "border-slate-400/50 text-slate-300"}`}>{pz.gate ? "CỔNG BẬT" : "CHỈ HIỂN THỊ"}</span>{pz.modeVi}</p>}
        <HlLayerToggles layers={layers} onToggle={toggleLayer} note={layers.news && rowSig.newsError ? "Tin tức tạm không tải được." : null} />
        {(layers.news || layers.buy || layers.signals) && <HlRowFilters filters={filters} onToggle={toggleFilter} shown={corePicks.filter((p) => matchFilters(rowSig.map.get(p.ticker), filters)).length} total={corePicks.length} notifyOn={notify.on} onNotify={() => { void notify.toggle(); }} notifyState={notify.state} />}
        <PortfolioLiquidityLine rows={picks.map((p) => ({ ticker: p.ticker, weight: p.weight, liq: liqOf(p.ticker), sigma20: p.hl.sigma20 }))} rules={lq} />
        {picks.length === 0 ? <p className="text-[11px] text-slate-400" data-testid="hl-empty">Không có mã nào đạt Hợp lưu và giao dịch được — danh mục đang 100% tiền mặt.</p> : (
          <>
          <ul className="space-y-1.5 md:hidden" data-testid="hl-cards">
            {corePicks.filter((p) => matchFilters(rowSig.map.get(p.ticker), filters)).map((p) => {
              const h = p.hl;
              return (
                <li key={p.ticker} className="rounded-md border border-white/10 bg-white/[0.02] p-2 text-[11px]" data-testid={`hl-card-${p.ticker}`} style={rimStyle(rowSig.map.get(p.ticker), layers.news)}>
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span><span className="mr-1 font-mono text-slate-500">{h.rank}</span><button type="button" onClick={() => onOpenTicker(p.ticker)} className="text-[13px] font-bold text-[#F5CE72]">{p.ticker}</button><HlTickerBadge s={rowSig.map.get(p.ticker)} layers={layers} mobile /> <span className={`ml-1 rounded border px-1 py-px text-[10px] font-bold ${CLS_TONE[h.cls]}`}>{CLS_VI[h.cls]}</span></span>
                    <span><b className="text-[13px] text-slate-100">{pct(p.weight)}</b> <span className={h.status === "NEW" ? "font-bold text-emerald-300" : "text-slate-400"}>{h.status === "NEW" ? "Vào mới" : `Giữ${h.since ? ` từ ${fmtDate(h.since).slice(0, 5)}` : ""}`}</span></span>
                  </div>
                  <p className="text-[10px] text-slate-500">{secName(p.sectorKey)} · <LiquidityBadge liq={liqOf(p.ticker)} rules={lq} sigma20={h.sigma20} weight={p.weight} held fallbackAdvBn={h.advBn} testId={`hl-liq-m-${p.ticker}`} /> · giá {price(p.close)}<HlLivePrice s={rowSig.map.get(p.ticker)} on={layers.live} mobile />{pxBadge(p.ticker, `hl-px-m-${p.ticker}`)}</p>
                  {layers.news && <HlNewsStrip s={rowSig.map.get(p.ticker)} now={rowSig.now} mobile />}{pfaOf(p.ticker).length > 0 && <div className="mt-0.5"><WarningList items={pfaOf(p.ticker)} compact testId={`hl-pfa-m-${p.ticker}`} /></div>}
                  <p className="mt-1 text-slate-300">Tầng 1 <b className="text-slate-100">{h.t1}/{t1.maxScore}</b> <span className="text-slate-500">(LS {num(h.lsPct, 0)} · TA {h.taCount}/{t1.taModels})</span> · <span className={RRG_TONE[String(h.rrg)] ?? "text-slate-400"}>{h.rrg == null ? "chưa có RRG" : RRG_VI[String(h.rrg)]}</span> · Tầng 3 <b className={h.t3 > 0 ? "text-emerald-300" : h.t3 < 0 ? "text-rose-300" : "text-slate-400"}>{pts(h.t3)}</b></p>
                  <p className="text-slate-400">Cách ngưỡng ra {h.exitBufferLs == null ? "—" : <b className={h.exitBufferLs < r.warnLsPct - r.exitLsPct ? "text-amber-300" : "text-slate-100"}>{signed(h.exitBufferLs, 0)}</b>} <Bar value={h.lsPct ?? 0} max={100} mark={r.exitLsPct / 100} width={72} /></p>
                  <div className="flex flex-wrap items-center gap-3"><TaDots n={h.taCount} of={t1.taModels} />{layers.trend && <HlLsTrend h={hist} ticker={p.ticker} exit={r.exitLsPct} mobile />}{(() => { const c = corridorPos(p, r); return <VolCorridor ret={c.ret} band={c.band} testId={`hl-corridor-m-${p.ticker}`} />; })()}
                    {euler.get(p.ticker) && <span className="text-[10px] text-slate-500">rủi ro <b className="text-slate-300">{pct(euler.get(p.ticker)!.riskContribution, 0)}</b> Euler</span>}</div>
                  {pz && <PzCardLine pz={h.pz} rules={pzRules} />}
                  {h.warnings.map((w) => <p key={w} className="text-[10px] text-amber-300">⚠ {w}</p>)}
                  {layers.impact && impactOpen === p.ticker && <HlImpactBlock ticker={p.ticker} />}
                  <div className="mt-1">{whyBtn(p.ticker, true)}{impactBtn(p.ticker, true)}</div>
                  {why === p.ticker && <div className="mt-1"><HlWhy p={p} exitLsPct={r.exitLsPct} mobile /></div>}
                </li>
              );
            })}
          </ul>
          <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="hidden overflow-x-auto md:block">
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: (pz ? 1260 : 940) + (layers.news ? NEWS_COL_WIDTH : 0) }}>
              <thead>
                <tr className="text-left text-[10px] text-slate-500">
                  <th className="py-1 pr-2 font-normal">Hạng</th><th className="font-normal">Mã · ngành</th>{layers.news && <HlNewsHeader />}<th className="font-normal">Trạng thái</th><th className="font-normal">Tỷ trọng</th>
                  <th className="font-normal" title="Tầng 1 = điểm LS-v1 (0–5) + số mô hình TA đạt (tối đa 5)">Tầng 1 · dẫn dắt + TA</th>
                  <th className="font-normal" title="Góc phần tư RRG của ngành">Tầng 2 · RRG</th><th className="font-normal" title="Tổng điểm +1 / −1 từ các tab khác">Tầng 3</th>
                  <th className="font-normal" title={`Ra khi LS-v1 xuống dưới phân vị ${r.exitLsPct}, không còn mô hình TA, hoặc ngành Tụt hậu`}>Cách ngưỡng ra</th>
                  {pz && <><th className="font-normal" title="Vị trí giá so với nền (PZ-v2)">Vị trí giá</th><th className="font-normal" title={`Vùng mua: ${num(pzRules.zoneLow * 100, 0)}% tới +${num(pzRules.zoneHigh * 100, 0)}% quanh pivot`}>So với pivot</th><th className="font-normal" title={`Cảnh báo khi vượt ${num(pzRules.maxRisk * 100, 0)}%`}>Rủi ro tới đáy nền</th></>}
                  <th className="text-right font-normal" title={`Dải tham chiếu ${r.bandSessions} phiên theo biến động — không phải lệnh. Hình: vị trí giá hiện tại so với giá lúc vào, đo bằng dải max(σ20, 1%)·√${r.bandSessions}`}>Giá · dải tham chiếu · từ lúc vào</th>
                </tr>
              </thead>
              <tbody>
                {corePicks.filter((p) => matchFilters(rowSig.map.get(p.ticker), filters)).map((p) => {
                  const h = p.hl;
                  return (
                    <Fragment key={p.ticker}>
                    <tr className="border-t border-white/5 align-top" data-testid={`hl-row-${p.ticker}`} style={rimStyle(rowSig.map.get(p.ticker), layers.news)}>
                      <td className="py-1.5 pr-2 font-mono text-slate-400">{h.rank}</td>
                      <td className="pr-2">{openBtn(p.ticker)}<HlTickerBadge s={rowSig.map.get(p.ticker)} layers={layers} /> <span className={`ml-1 rounded border px-1 py-px text-[10px] font-bold ${CLS_TONE[h.cls]}`}>{CLS_VI[h.cls]}</span>
                        <span className="block text-[10px] text-slate-500">{secName(p.sectorKey)} · <LiquidityBadge liq={liqOf(p.ticker)} rules={lq} sigma20={h.sigma20} weight={p.weight} held fallbackAdvBn={h.advBn} testId={`hl-liq-${p.ticker}`} />{whyBtn(p.ticker)}{impactBtn(p.ticker)}</span>
                        {pxOf(p.ticker) && <span className="mt-0.5 block"><DilutionBadge p={pxOf(p.ticker)} pxR1={d.dilution?.pxR1} testId={`hl-px-${p.ticker}`} /></span>}
                        {pfaOf(p.ticker).length > 0 && <span className="mt-0.5 block"><WarningList items={pfaOf(p.ticker)} compact testId={`hl-pfa-${p.ticker}`} /></span>}{layers.cockpit && <HlBreadcrumb ticker={p.ticker} sessions={cockpitSessions} log={cockpitLog} />}</td>{layers.news && <HlNewsStrip s={rowSig.map.get(p.ticker)} now={rowSig.now} />}
                      <td className="pr-2">{h.status === "NEW" ? <b className="text-emerald-300">Vào mới</b> : <span className="text-slate-300">Giữ{h.since ? <span className="text-slate-500"> từ {fmtDate(h.since).slice(0, 5)}</span> : ""}</span>}</td>
                      <td className="whitespace-nowrap pr-2"><b className="text-slate-100">{pct(p.weight)}</b> <Bar value={p.weight} max={r.wMax} tone="bg-[#E8B84B]/80" width={48} />
                        <span className="block text-[10px] text-slate-500" data-testid={`hl-risk-${p.ticker}`} title={euler.get(p.ticker) ? "Đóng góp Euler vào biến động danh mục (hiệp phương sai Ledoit–Wolf), cộng lại = 100%" : "Ước lượng thô w·σ20 / Σ (bỏ qua tương quan) — chưa có số Euler"}>{euler.get(p.ticker) ? <>rủi ro <b className={euler.get(p.ticker)!.riskContribution > p.weight * 2 ? "text-amber-300" : "text-slate-300"}>{pct(euler.get(p.ticker)!.riskContribution, 0)}</b> Euler</> : <>rủi ro ~{pct(p.riskContribution, 0)} (thô)</>}</span></td>
                      <td className="whitespace-nowrap pr-2"><b className="text-slate-100">{h.t1}</b><span className="text-slate-500">/{t1.maxScore}</span> <Bar value={h.t1} max={t1.maxScore} width={56} />
                        <span className="block text-[10px] text-slate-500">LS phân vị {num(h.lsPct, 0)} · TA {h.taCount}/{t1.taModels}</span>
                        <LsGauge ls={h.lsPct} exit={r.exitLsPct} warn={r.warnLsPct} /><TaDots n={h.taCount} of={t1.taModels} />{layers.trend && <HlLsTrend h={hist} ticker={p.ticker} exit={r.exitLsPct} />}</td>
                      <td className="whitespace-nowrap pr-2"><span className={RRG_TONE[String(h.rrg)] ?? "text-slate-400"}>{h.rrg == null ? "—" : RRG_VI[String(h.rrg)]}</span>
                        <span className="block text-[10px] text-slate-500">{h.t2 > 0 ? "ủng hộ" : h.t2 < 0 ? "phản đối" : "trung tính"}</span></td>
                      <td className="pr-2"><b className={h.t3 > 0 ? "text-emerald-300" : h.t3 < 0 ? "text-rose-300" : "text-slate-400"}>{pts(h.t3)}</b></td>
                      <td className="pr-2">
                        <span className="whitespace-nowrap">{h.exitBufferLs == null ? "—" : <><b className={h.exitBufferLs < r.warnLsPct - r.exitLsPct ? "text-amber-300" : "text-slate-100"}>{signed(h.exitBufferLs, 0)}</b> <Bar value={h.lsPct ?? 0} max={100} mark={r.exitLsPct / 100} tone={h.exitBufferLs < r.warnLsPct - r.exitLsPct ? "bg-amber-400/70" : "bg-emerald-400/60"} width={56} /></>}</span>
                        {h.warnings.map((w) => <span key={w} className="block text-[10px] text-amber-300" data-testid={`hl-warn-${p.ticker}`}>⚠ {w}</span>)}
                      </td>
                      {pz && <PzCells pz={h.pz} rules={pzRules} />}
                      <td className="whitespace-nowrap text-right font-mono">{price(p.close)}<HlLivePrice s={rowSig.map.get(p.ticker)} on={layers.live} /><span className="block text-[10px] text-slate-500">{price(p.stop)} – {price(p.target)}</span>
                        {(() => { const c = corridorPos(p, r); return <span className="flex justify-end"><VolCorridor ret={c.ret} band={c.band} testId={`hl-corridor-${p.ticker}`} /></span>; })()}</td>
                    </tr>
                    {layers.impact && impactOpen === p.ticker && <HlImpactRow ticker={p.ticker} colSpan={(pz ? 12 : 9) + (layers.news ? 1 : 0)} />}
                    {why === p.ticker && <tr><td colSpan={(pz ? 12 : 9) + (layers.news ? 1 : 0)} className="pb-2"><HlWhy p={p} exitLsPct={r.exitLsPct} /></td></tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
        {pz && runnerCount > 0 && <p className="mt-1.5 text-[10.5px] text-violet-200" data-testid="hl-runner-note">{runnerCount} mã đang giữ đã tăng nóng nằm ở bảng <a href="#hl-watch" className="underline decoration-dotted hover:text-[#F5CE72]">Theo dõi chờ nền</a> — vẫn là vị thế, vẫn tính vào {pct(pz.runnerWeight)} vốn.</p>}
        {pz && picks.length > 0 && corePicks.length === 0 && <p className="text-[11px] text-slate-400" data-testid="hl-core-empty">Không có mã đang giữ nào ở trong nền hoặc vùng mua.</p>}
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500" data-testid="hl-sizing-note">
          Tỷ trọng đặt lúc vào = {pct(r.slotW, 0)} × biến động trung vị / biến động của mã, kẹp {pct(r.wMin, 0)}–{pct(r.wMax, 0)} (có thể nhỏ hơn khi tiền mặt hoặc trần ngành không còn đủ chỗ), và không cân lại khi đang giữ — tỷ trọng và tỷ lệ cổ phiếu trên bảng là số lúc vào, không trôi theo giá. "Cách ngưỡng ra" = phân vị LS-v1 trừ {r.exitLsPct}; vạch đỏ trên thanh là ngưỡng. Dải giá tham chiếu {r.bandSessions} phiên tính theo biến động — không phải lệnh cắt lỗ / chốt lời. Hình dải biến động: vạch xám = giá lúc vào, vạch đỏ đứt = −2 dải tính từ giá lúc vào, chấm = giá hiện tại (xanh / đỏ = trên / dưới giá lúc vào).
        </p>
        {layers.trend && <HlReplay h={hist} today={{ date: d.date, held: heldTickers }} onOpenTicker={onOpenTicker} />}
      </Panel>

      {layers.cockpit && <StateMap states={cockpitStates} sessions={cockpitSessions} log={cockpitLog} highlight={pickedTickers(d, cockpitPick)} today={new Set(cockpitToday.map((x) => x.ticker))} onOpenTicker={onOpenTicker} />}
      <RuleSpace rows={panel?.rows} panelDate={panel?.date ? fmtDate(panel.date) : null} held={heldSet} queued={queuedSet} rule={r} tier1={t1} funnel={f} />

      {pz && <HlWatchPanel rows={hl.watch ?? []} exits={hl.watchExits ?? []} meta={pz} onOpenTicker={onOpenTicker} secName={secName}
        liqBadge={(x, mobile) => <LiquidityBadge liq={liqOf(x.ticker)} rules={lq} sigma20={scoreBy.get(x.ticker)?.sigma20} weight={x.held ? x.weight ?? null : null} held={x.held} fallbackAdvBn={scoreBy.get(x.ticker)?.advBn ?? null} testId={`pz-liq-${mobile ? "m-" : ""}${x.ticker}`} />} pxBadge={(x, mobile) => pxBadge(x.ticker, `pz-px-${mobile ? "m-" : ""}${x.ticker}`)} />}

      <QueueDeck d={d} onOpenTicker={onOpenTicker} liqOf={liqOf} sigmaOf={(t) => scoreBy.get(t)?.sigma20} lq={lq} pxBadge={pxBadge} />
      {layers.cockpit && <QueueMatrix d={d} states={cockpitStates} secName={secName} />}

      {/* QĐ-R2 (20/11/2026): "Bằng chứng của từng lớp" (EvidenceWall) chuyển sang tab 4 — đầu khối Elite HL. */}

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <Panel title="Phân bổ ngành" testId="hl-sectors" right={<span className="text-[10px] text-slate-500">Trần {pct(r.sectorCap, 0)} mỗi ngành</span>}>
          {hl.sectors.length === 0 ? <p className="text-[11px] text-slate-500">Chưa có vị thế.</p> : (
            <ul className="space-y-1 text-[11px]">
              {hl.sectors.map((s) => (
                <li key={s.sectorKey} className="flex items-center gap-2" data-testid={`hl-sector-${s.sectorKey}`}>
                  <span className="w-28 shrink-0 truncate text-slate-300 sm:w-40" title={secName(s.sectorKey)}>{secName(s.sectorKey)}</span>
                  <Bar value={s.weight} max={r.sectorCap} tone={s.weight >= r.sectorCap - 0.005 ? "bg-amber-400/70" : "bg-emerald-400/60"} width={120} />
                  <b className="w-12 text-right text-slate-100">{pct(s.weight, 0)}</b><span className="whitespace-nowrap text-slate-500">{s.names} mã</span>
                </li>
              ))}
              <li className="flex items-center gap-2"><span className="w-28 shrink-0 text-slate-400 sm:w-40">Tiền mặt</span><Bar value={hl.cash} max={r.sectorCap} tone="bg-slate-400/60" width={120} /><b className="w-12 text-right text-slate-100">{pct(hl.cash, 0)}</b></li>
            </ul>
          )}
        </Panel>
        <HlEvidenceLink d={d} onNavigate={onNavigateToEvidence} />
      </div>

      <HlFocusFrame d={d} onOpenTicker={onOpenTicker} />
      <p className="text-[10px] text-slate-500">Tham khảo định lượng — không phải khuyến nghị đầu tư.</p>
    </div>
  );
}
