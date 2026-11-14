// PZ-v2 (14/11/2026) — giao diện lớp VỊ TRÍ GIÁ của Elite HL: nhãn trạng thái, thước vùng mua, thanh phân bổ ba phần
// (Danh mục chính · Chạy lãi · Tiền mặt) và bảng THEO DÕI CHỜ NỀN. Mọi ngưỡng đọc từ hl.pz.rules; thiếu số hiện "—".
// Trạng thái phân biệt bằng CHỮ + KÝ HIỆU + KIỂU VIỀN (không chỉ màu). "Tăng nóng" không tô màu tích cực; "Vùng mua" không kèm chữ "nên mua".
import { useState } from "react";
import type { HlPick, PzExit, PzMeta, PzPosition, PzRules, PzState, PzWatchRow } from "../../../lib/elite10/decisionTypes";
import { fmtDate, num, price, signed } from "./boardParts";

export const PZ_VI: Record<PzState, string> = {
  BUY_ZONE: "Vùng mua", IN_BASE: "Trong nền", NO_SETUP: "Chưa có nền", UNKNOWN: "Chưa xác định",
  EXTENDED: "Tăng nóng", COOLING: "Hạ nhiệt", REBASING: "Dựng nền mới", FAILED: "Hỏng nền",
};
const PZ_GLYPH: Record<PzState, string> = { BUY_ZONE: "◎", IN_BASE: "▭", NO_SETUP: "·", UNKNOWN: "?", EXTENDED: "↗", COOLING: "↘", REBASING: "◇", FAILED: "✕" };
const PZ_TONE: Record<PzState, string> = {
  BUY_ZONE: "border-emerald-400/70 bg-emerald-500/10 text-emerald-200",
  IN_BASE: "border-sky-400/60 text-sky-200",
  NO_SETUP: "border-dashed border-slate-400/60 text-slate-300",
  UNKNOWN: "border-dotted border-slate-400/60 text-slate-300",
  EXTENDED: "border-amber-400/70 bg-amber-500/10 text-amber-200",
  COOLING: "border-violet-400/60 text-violet-200",
  REBASING: "border-cyan-400/60 bg-cyan-500/[0.07] text-cyan-200",
  FAILED: "border-dashed border-rose-400/70 text-rose-200",
};
const BASE_VI: Record<string, string> = { SEPA: "SEPA", BASE_BREAKOUT: "Base Breakout", BOX: "Hộp giá" };
const pctf = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${num(v * 100, d)}%`);
const spct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${signed(v * 100, d)}%`);
const dec = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : num(v, d));
export const DEFAULT_PZ_RULES: PzRules = {
  zoneLow: -0.03, zoneHigh: 0.05, maxRisk: 0.1, x2Hot: 3, x2Cool: 1.5, x2CoolSessions: 3, x3Min: 0.15, x3Pct: 0.9, x4Ret5: 0.15, x4LimitDays: 2,
  coolPullMin: 0.05, rebaseMaxDepth: 0.25, rebaseAtrRatio: 0.7, rebaseVolDry: 0.7, rebaseMinSessions: 15, expireSessions: 60, heldHotSessions: 2, climaxX2: 4.5,
};

export function PzBadge({ pz, compact = false, testId }: { pz: PzPosition | null | undefined; compact?: boolean; testId?: string }) {
  if (!pz) return <span className="text-slate-500">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid={testId}>
      <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-px text-[10px] font-bold ${PZ_TONE[pz.state]}`} title={pz.reasonVi ?? undefined}>
        <span aria-hidden="true">{PZ_GLYPH[pz.state]}</span>{PZ_VI[pz.state]}{!compact && pz.sessions ? <span className="font-normal opacity-80">· {pz.sessions} phiên</span> : null}
      </span>
      {pz.climax && <span className="rounded border border-rose-400/60 px-1 py-px text-[10px] font-bold text-rose-200" title="Cảnh báo cao trào — chỉ hiển thị, không tự bán">Cao trào</span>}
      {pz.boughtOutsideZone && <span className="rounded border border-dashed border-amber-400/60 px-1 py-px text-[10px] text-amber-200" title="Lệnh mua theo quy tắc G2r khi cổng vị trí giá chưa bật">mua ngoài vùng mua</span>}
    </span>
  );
}

/**
 * Thước vị trí so với pivot: dải [zoneLow, zoneHigh] tô nhạt, vạch pivot ở 0, chấm = giá hiện tại. Thang hiển thị −10% … +15%;
 * giá ngoài thang -> chấm nằm ở mép kèm mũi tên (số thật vẫn ghi bên cạnh).
 */
export function ZoneMeter({ x1, rules, width = 96 }: { x1: number | null | undefined; rules: PzRules; width?: number }) {
  const lo = -0.1, hi = 0.15, X = (v: number) => ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * width;
  const inZone = x1 != null && x1 >= rules.zoneLow && x1 <= rules.zoneHigh, out = x1 != null && (x1 < lo || x1 > hi);
  return (
    <svg width={width} height="12" viewBox={`0 0 ${width} 12`} aria-hidden="true" className="inline-block align-middle">
      <rect x="0" y="5" width={width} height="2" rx="1" fill="rgba(255,255,255,0.12)" />
      <rect x={X(rules.zoneLow)} y="2.5" width={X(rules.zoneHigh) - X(rules.zoneLow)} height="7" rx="2" fill="rgba(52,211,153,0.22)" stroke="rgba(52,211,153,0.55)" strokeWidth="0.75" />
      <line x1={X(0)} x2={X(0)} y1="1" y2="11" stroke="rgba(226,232,240,0.7)" strokeWidth="1" />
      {x1 != null && Number.isFinite(x1) && (out
        ? <path d={x1 > hi ? `M${width - 6} 2L${width} 6L${width - 6} 10z` : "M6 2L0 6L6 10z"} fill="#fbbf24" />
        : <circle cx={X(x1)} cy="6" r="3.2" fill={inZone ? "#34d399" : x1 > rules.zoneHigh ? "#fbbf24" : "#7dd3fc"} stroke="#0E131F" strokeWidth="1" />)}
    </svg>
  );
}

/** Thanh phân bổ ba phần: Danh mục chính · Chạy lãi · Tiền mặt = 100%. */
export function AllocationBar({ core, runner, cash, testId }: { core: number; runner: number; cash: number; testId?: string }) {
  const seg = (v: number, cls: string, label: string) => (v > 0.0005 ? <span className={`h-full ${cls}`} style={{ width: `${Math.min(1, v) * 100}%` }} title={`${label} ${pctf(v)}`} /> : null);
  return (
    <span className="mt-1 flex h-2 w-full overflow-hidden rounded bg-white/10" aria-hidden="true" data-testid={testId}>
      {seg(core, "bg-[#E8B84B]/85", "Danh mục chính")}{seg(runner, "bg-violet-400/75", "Chạy lãi")}{seg(cash, "bg-slate-400/40", "Tiền mặt")}
    </span>
  );
}

/** Ba cột mới của bảng danh mục chính (desktop). */
export function PzCells({ pz, rules }: { pz: PzPosition | undefined; rules: PzRules }) {
  if (!pz) return <><td className="pr-2 text-slate-500">—</td><td className="pr-2 text-slate-500">—</td><td className="pr-2 text-slate-500">—</td></>;
  const riskHot = pz.risk != null && pz.risk > rules.maxRisk;
  return (
    <>
      <td className="pr-2"><PzBadge pz={pz} compact />{pz.missingVi[0] && pz.state !== "BUY_ZONE" && <span className="block max-w-[180px] text-[10px] leading-snug text-slate-400">{pz.missingVi[0]}</span>}</td>
      <td className="whitespace-nowrap pr-2"><b className={pz.x1 != null && pz.x1 > rules.zoneHigh ? "text-amber-300" : "text-slate-100"}>{spct(pz.x1)}</b> <ZoneMeter x1={pz.x1} rules={rules} />
        <span className="block text-[10px] text-slate-500">{pz.pivot ? <>pivot {price(pz.pivot)} · {BASE_VI[pz.baseSource ?? ""] ?? "—"}</> : "chưa có pivot"}</span></td>
      <td className="whitespace-nowrap pr-2"><b className={riskHot ? "text-amber-300" : "text-slate-100"}>{pctf(pz.risk)}</b>{riskHot && <span className="ml-1 text-[10px] text-amber-300">&gt; {pctf(rules.maxRisk, 0)}</span>}
        <span className="block text-[10px] text-slate-500">đáy nền {price(pz.stopRef)}</span></td>
    </>
  );
}

/** Dòng vị trí giá trên thẻ điện thoại của danh mục chính. */
export function PzCardLine({ pz, rules }: { pz: PzPosition | undefined; rules: PzRules }) {
  if (!pz) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-300">
      <PzBadge pz={pz} compact /> <span>So pivot <b className="text-slate-100">{spct(pz.x1)}</b> <ZoneMeter x1={pz.x1} rules={rules} width={72} /></span>
      <span>Rủi ro tới đáy nền <b className={pz.risk != null && pz.risk > rules.maxRisk ? "text-amber-300" : "text-slate-100"}>{pctf(pz.risk)}</b></span>
    </p>
  );
}

const HOT_LABEL: { key: string; vi: (r: PzRules) => string; val: (p: PzPosition) => string; on: (p: PzPosition, r: PzRules) => boolean | null }[] = [
  { key: "x1", vi: (r) => `So pivot (> ${pctf(r.zoneHigh, 0)})`, val: (p) => spct(p.x1), on: (p, r) => (p.x1 == null ? null : p.x1 > r.zoneHigh) },
  { key: "risk", vi: (r) => `Rủi ro tới đáy nền (> ${pctf(r.maxRisk, 0)})`, val: (p) => pctf(p.risk), on: (p, r) => (p.risk == null ? null : p.risk > r.maxRisk) },
  { key: "x2", vi: (r) => `Số ATR trên EMA21 (≥ ${dec(r.x2Hot, 1)})`, val: (p) => dec(p.x2), on: (p, r) => (p.x2 == null ? null : p.x2 >= r.x2Hot) },
  { key: "x3", vi: (r) => `So SMA50 (≥ ${pctf(r.x3Min, 0)}, phân vị ${num(r.x3Pct * 100, 0)})`, val: (p) => spct(p.x3), on: (p) => (p.x3 == null ? null : (p.hotReasons as string[]).includes("x3")) },
  { key: "x4", vi: (r) => `Tốc độ (5 phiên ≥ ${pctf(r.x4Ret5, 0)} / ${r.x4LimitDays} phiên trần)`, val: (p) => (p.x4 == null ? "—" : p.x4 ? "đạt" : "không"), on: (p) => p.x4 ?? null },
];
const REBASE_VI: Record<string, string> = { depth: "Độ sâu", tight: "Biên độ co", dry: "Khối lượng cạn", rs: "Sức mạnh giữ" };

function HotChips({ pz, rules }: { pz: PzPosition; rules: PzRules }) {
  return (
    <span className="flex flex-wrap gap-1">
      {HOT_LABEL.map((h) => {
        const on = h.on(pz, rules);
        return (
          <span key={h.key} title={h.vi(rules)} className={`whitespace-nowrap rounded border px-1 py-px text-[10px] ${on ? "border-amber-400/60 text-amber-200" : on === false ? "border-white/10 text-slate-400" : "border-dotted border-white/15 text-slate-500"}`} data-testid={`pz-hot-${h.key}`} data-on={on ? "1" : "0"}>
            <span aria-hidden="true">{on ? "●" : "○"}</span> {h.vi(rules).split(" (")[0]} {h.val(pz)}
          </span>
        );
      })}
    </span>
  );
}
function RebaseChecks({ pz }: { pz: PzPosition }) {
  if (!pz.rebase?.length) return <span className="text-[10px] text-slate-500">{pz.state === "EXTENDED" ? "Chờ hạ nhiệt" : "—"}</span>;
  const ok = pz.rebase.filter((x) => x.ok).length;
  return (
    <span className="block">
      <span className="flex items-center gap-1" aria-label={`Đạt ${ok}/4 điều kiện dựng nền`}>
        {pz.rebase.map((x) => <span key={x.key} className={`h-1.5 w-5 rounded ${x.ok ? "bg-cyan-300/80" : "bg-white/15"}`} title={x.vi} />)}
        <span className="ml-1 text-[10px] text-slate-400">{ok}/4</span>
      </span>
      <span className="mt-0.5 flex flex-wrap gap-x-2 text-[10px]">
        {pz.rebase.map((x) => <span key={x.key} className={x.ok ? "text-cyan-200" : "text-slate-500"}>{x.ok ? "✓" : "✗"} {REBASE_VI[x.key]}</span>)}
      </span>
    </span>
  );
}

/** Bảng 2 — THEO DÕI CHỜ NỀN: nhóm Đang giữ · Chạy lãi, rồi Chưa giữ · Chờ nền; dải mã vừa rời bảng. */
export function HlWatchPanel({ rows, exits, meta, onOpenTicker, secName }: { rows: PzWatchRow[]; exits: PzExit[]; meta: PzMeta; onOpenTicker: (t: string) => void; secName: (k: string | null | undefined) => string }) {
  const rules = { ...DEFAULT_PZ_RULES, ...(meta.rules ?? {}) };
  const runners = rows.filter((x) => x.held), waiting = rows.filter((x) => !x.held);
  const [open, setOpen] = useState<string | null>(null);
  const group = (title: string, sub: string, list: PzWatchRow[], testId: string) => (
    <div data-testid={testId}>
      <p className="mb-1 mt-2 flex flex-wrap items-baseline gap-2 text-[11px]"><b className="text-slate-100">{title}</b><span className="text-[10px] text-slate-400">{sub}</span></p>
      {list.length === 0 ? <p className="text-[11px] text-slate-500">Không có mã.</p> : (
        <>
          <ul className="space-y-1.5 md:hidden">
            {list.map((x) => (
              <li key={x.ticker} className="rounded-md border border-white/10 bg-white/[0.02] p-2 text-[11px]" data-testid={`pz-card-${x.ticker}`}>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span><button type="button" onClick={() => onOpenTicker(x.ticker)} className="text-[13px] font-bold text-[#F5CE72]">{x.ticker}</button> {x.held && <span className="ml-1 rounded border border-violet-400/50 px-1 text-[10px] text-violet-200">đang giữ {pctf(x.weight)}</span>}</span>
                  <PzBadge pz={x.pz} />
                </div>
                <div className="mt-1"><RebaseChecks pz={x.pz} /></div>
                {x.pz.missingVi.length > 0 && <p className="mt-1 text-[10.5px] text-slate-300">Còn thiếu: {x.pz.missingVi.slice(0, 2).join(" · ")}</p>}
              </li>
            ))}
          </ul>
          <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="hidden overflow-x-auto md:block">
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 940 }}>
              <thead>
                <tr className="text-left text-[10px] text-slate-500">
                  <th className="py-1 font-normal">Mã · ngành</th><th className="font-normal">Hạng HL</th><th className="font-normal">Trạng thái</th>
                  <th className="font-normal">Vì sao nóng</th><th className="font-normal">Tiến độ dựng nền</th><th className="font-normal">Vùng mua dự kiến</th><th className="font-normal">Còn thiếu</th>
                </tr>
              </thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.ticker} className="border-t border-white/5 align-top" data-testid={`pz-row-${x.ticker}`}>
                    <td className="py-1.5 pr-2">
                      <button type="button" onClick={() => onOpenTicker(x.ticker)} className="font-bold text-[#F5CE72] hover:underline">{x.ticker}</button>
                      <span className="block text-[10px] text-slate-500">{x.sectorKey ? secName(x.sectorKey) : "—"}</span>
                      {x.held && <span className="block text-[10px] text-violet-200">đang giữ {pctf(x.weight)}{x.sinceRet ? <> · từ phiên khoá <b className={x.sinceRet >= 0 ? "text-emerald-300" : "text-rose-300"}>{spct(x.sinceRet)}</b></> : null}</span>}
                    </td>
                    <td className="pr-2 font-mono text-slate-300">{x.hlRank ?? "—"}</td>
                    <td className="pr-2"><PzBadge pz={x.pz} testId={`pz-state-${x.ticker}`} />
                      {x.pz.hStar ? <span className="block text-[10px] text-slate-500">đỉnh {price(x.pz.hStar)}{x.pz.depth ? ` · lùi ${pctf(x.pz.depth)}` : " · đang ở đỉnh"}</span> : null}</td>
                    <td className="max-w-[260px] pr-2">
                      {(x.pz.hotReasons as string[]).length === 0 ? <span className="text-[10px] text-slate-500">Không còn độ đo nào vượt ngưỡng</span> : <>
                      <button type="button" aria-expanded={open === x.ticker} onClick={() => setOpen(open === x.ticker ? null : x.ticker)} data-touch className="text-left text-[10px] text-slate-300 hover:text-[#F5CE72]" data-testid={`pz-why-btn-${x.ticker}`}>
                        {(x.pz.hotReasons as string[]).length} độ đo vượt ngưỡng {open === x.ticker ? "▾" : "▸"}
                      </button>
                      {open === x.ticker && <div className="mt-1"><HotChips pz={x.pz} rules={rules} /></div>}
                      </>}
                    </td>
                    <td className="pr-2"><RebaseChecks pz={x.pz} /></td>
                    <td className="whitespace-nowrap pr-2 font-mono">{x.pz.zoneLow && x.pz.zoneHigh ? <>{price(x.pz.zoneLow)} – {price(x.pz.zoneHigh)}<span className="block font-sans text-[10px] text-slate-500">mức sai {price(x.pz.stopRef)}</span></> : "—"}</td>
                    <td className="max-w-[240px] pr-2 text-[10.5px] text-slate-300">{x.pz.missingVi.length ? x.pz.missingVi.slice(0, 3).map((m) => <span key={m} className="block">{m}</span>) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
  return (
    <section data-testid="hl-watch" id="hl-watch" className="rounded-lg border border-violet-400/25 bg-[#0E131F] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#F5CE72]">Theo dõi chờ nền — mã đạt chuẩn đã rời vùng mua</h4>
        <span className="text-[10px] text-slate-400">Không mua mới · quay lại danh mục chính khi dựng xong nền mới và về vùng mua</span>
      </div>
      {group(`Đang giữ · Chạy lãi (${runners.length})`, "Giữ nguyên tỷ trọng, không mua thêm, vẫn chiếm ô và trần ngành; quy tắc bán G2r không đổi.", runners, "hl-watch-runners")}
      {group(`Chưa giữ · Chờ nền (${waiting.length})`, `Gần vùng mua nhất ở trên. Rời bảng nếu hỏng nền hoặc quá ${rules.expireSessions} phiên.`, waiting, "hl-watch-waiting")}
      {exits.length > 0 && (
        <div className="mt-2 rounded border border-white/10 bg-white/[0.02] px-2 py-1.5 text-[10.5px]" data-testid="hl-watch-exits">
          <b className="text-slate-300">Vừa rời bảng:</b>{" "}
          {exits.map((e, i) => <span key={`${e.ticker}-${e.date}`}>{i ? " · " : ""}<b className={e.to === "BUY_ZONE" ? "text-emerald-300" : "text-rose-300"}>{e.ticker}</b> <span className="text-slate-400">{e.kindVi} {fmtDate(e.date).slice(0, 5)}</span></span>)}
        </div>
      )}
      <p className="mt-1.5 text-[10px] text-slate-500" data-testid="hl-watch-mode">{meta.modeVi} Ngưỡng ghi là khởi điểm, chưa kiểm định trên dữ liệu Việt Nam.</p>
    </section>
  );
}

/** Dòng quy tắc Vị trí giá (khối "Quy tắc vào · giữ · ra"). */
export function PzRulesItems({ meta }: { meta: PzMeta }) {
  const r = { ...DEFAULT_PZ_RULES, ...(meta.rules ?? {}) };
  return (
    <>
      <li data-testid="hl-rule-pz"><b>Vị trí giá ({meta.version}):</b> Vùng mua = giá trong [{spct(r.zoneLow, 0)} ; {spct(r.zoneHigh, 0)}] quanh pivot và rủi ro tới đáy nền ≤ {pctf(r.maxRisk, 0)}. Tăng nóng = vượt pivot quá {pctf(r.zoneHigh, 0)}, hoặc rủi ro &gt; {pctf(r.maxRisk, 0)} khi đã trên pivot, hoặc ≥ 2/3 độ đo: cách EMA21 ≥ {dec(r.x2Hot, 1)} ATR, cao hơn SMA50 ≥ {pctf(r.x3Min, 0)}, tăng ≥ {pctf(r.x4Ret5, 0)} trong 5 phiên.</li>
      <li><b>Chạy lãi:</b> mã đang giữ nóng {r.heldHotSessions} phiên liên tiếp rời bảng chính nhưng KHÔNG bị bán; quay lại khi nền mới ≥ {r.rebaseMinSessions} phiên và về vùng mua. {meta.gate ? "Cổng đang bật: chỉ mua mới mã ở Vùng mua." : "Cổng chưa bật: lệnh mua vẫn theo G2r."}</li>
    </>
  );
}

/** Lọc vị thế cho bảng chính khi có PZ: bỏ mã ở ngăn Chạy lãi (chúng hiện ở bảng Theo dõi chờ nền). */
export const coreOf = (picks: HlPick[], hasPz: boolean) => (hasPz ? picks.filter((p) => p.hl.pz?.lane !== "RUNNER") : picks);
