// PX0 + PX-L (18/11/2026) — Hồ sơ 360° · Sự kiện & thời điểm: "Vòng đời đợt pha loãng" — GDKHQ → ĐKCC → cổ phiếu mới giao dịch được,
// lịch sử các đợt của mã (vượt VN-Index, giá điều chỉnh), độ trễ niêm yết, bằng chứng PX-r1 và sổ theo dõi tiến PX-L. Chỉ hiển thị.
import { useEliteDilution, usePxLedger } from "../../../hooks/elite10/useEliteDilution";
import type { DilutionPhase } from "../../../lib/elite10/decisionTypes";
import DilutionBadge, { dilutionText } from "../center/DilutionBadge";
import { Block, Evidence, fmtDate, num, spct, tone } from "./pfaParts";

const CAT: Record<string, string> = { STOCK: "Cổ tức CP", BONUS: "CP thưởng", RIGHTS: "Quyền mua" };
const TITLE = "Vòng đời đợt pha loãng (cổ tức CP · thưởng · quyền mua ≥ 10%)";

/** Trục thời gian của đợt đang chạy: GDKHQ · ĐKCC · cổ phiếu mới giao dịch · hết theo dõi, kèm vị trí hôm nay. */
function Lifecycle({ p, asOf }: { p: DilutionPhase; asOf: string }) {
  const pts = [
    { k: "ex", d: p.ex, label: "GDKHQ" },
    ...(p.record ? [{ k: "rec", d: p.record, label: "ĐKCC" }] : []),
    { k: "list", d: p.listing, label: p.listingBasis === "ANNOUNCED" ? "CP mới GD" : "CP mới GD ≈" },
    { k: "end", d: p.until, label: "Hết theo dõi" },
  ];
  const t0 = Date.parse(pts[0].d) - 5 * 864e5, t1 = Date.parse(p.until) + 2 * 864e5;
  const x = (d: string) => Math.min(100, Math.max(0, ((Date.parse(d) - t0) / (t1 - t0)) * 100));
  // Vạch trên trục không mang chữ (các mốc có thể cách nhau 1 phiên — chữ sẽ chồng); ngày ghi ở dòng chú giải bên dưới, đánh số theo vạch.
  const dashed = (k: string) => k === "list" && p.listingBasis !== "ANNOUNCED";
  return (
    <div className="mb-1 mt-3" data-testid="px-lifecycle" role="img" aria-label={pts.map((q) => `${q.label} ${fmtDate(q.d)}`).join(", ")}>
      <div className="relative mx-2 h-2 rounded-full bg-white/10">
        <div className="absolute inset-y-0 left-0 rounded-full bg-orange-400/40" style={{ width: `${x(asOf)}%` }} />
        {pts.map((q, i) => (
          <div key={q.k} className="absolute -top-1.5 -translate-x-1/2" style={{ left: `${x(q.d)}%` }} title={`${q.label} ${fmtDate(q.d)}`}>
            <div className={`mx-auto h-5 w-1 rounded ${dashed(q.k) ? "border border-dashed border-orange-300" : "bg-orange-300"}`} />
            <span className="block text-center text-[9px] font-bold leading-none text-orange-200" style={{ marginLeft: i % 2 ? 6 : -6 }}>{i + 1}</span>
          </div>
        ))}
        <div className="absolute -top-4 -translate-x-1/2 text-[10px] font-bold text-q-accent-strong" style={{ left: `${x(asOf)}%` }} title={`Hôm nay ${fmtDate(asOf)}`}>▼</div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400" data-testid="px-lifecycle-legend">
        {pts.map((q, i) => <li key={q.k}><b className="text-orange-200">{i + 1}</b> {q.label} <span className="font-mono text-slate-200">{fmtDate(q.d).slice(0, 5)}</span></li>)}
        <li><b className="text-q-accent-strong">▼</b> Hôm nay <span className="font-mono text-slate-200">{fmtDate(asOf).slice(0, 5)}</span></li>
      </ul>
    </div>
  );
}

export default function DilutionProfileBlock({ ticker }: { ticker: string }) {
  const { data, error, isLoading } = useEliteDilution(ticker);
  const { data: led } = usePxLedger();
  const right = <Evidence label={data?.pxR1?.verdict ?? "KHÔNG ĐẠT"} title={data?.pxR1?.textVi ?? "PX-r1"} />;
  if (isLoading) return <Block title={TITLE} testId="px-profile" right={right}><p className="text-[11px] italic text-slate-500">Đang tải…</p></Block>;
  if (error || !data) {
    return <Block title={TITLE} testId="px-profile" right={right}><p className="text-[11px] text-slate-400" data-testid="px-missing">{error ? `Không tải được: ${String((error as Error).message ?? error)}` : "Chưa có dữ liệu sự kiện của phiên."}</p></Block>;
  }
  const p = data.phase.phase === "NONE" ? null : (data.phase as DilutionPhase);
  const own = data.ownLags, m = data.marketLag, s30 = led?.summary?.[30];
  return (
    <Block title={TITLE} testId="px-profile" right={right}>
      {p ? (
        <div data-testid="px-current">
          <p className="text-[11px]"><DilutionBadge p={p} pxR1={data.pxR1} testId="px-badge" /> <span className="ml-1 text-slate-300">{dilutionText(p).long}</span></p>
          <Lifecycle p={p} asOf={data.asOf} />
        </div>
      ) : <p className="text-[11px] text-slate-400" data-testid="px-none">{ticker} không có đợt pha loãng ≥ 10% đã công bố trong 10 phiên tới, cũng không đang trong cửa sổ hậu GDKHQ.</p>}
      <p className="mt-1 text-[10.5px] text-slate-400" data-testid="px-lags">
        Độ trễ GDKHQ → cổ phiếu mới giao dịch: {own.length ? <>của {ticker} <b className="text-slate-200">{own.map((x) => x.lag).join(" · ")}</b> phiên ({own.length} đợt gần nhất)</> : <>{ticker} chưa có đợt nào đã niêm yết</>}
        {m.lag != null ? <> · toàn thị trường trung vị <b className="text-slate-200">{m.lag}</b> phiên (25–75%: {m.p25}–{m.p75}, {m.n} đợt)</> : null}
      </p>
      {data.history.length > 0 ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 560 }} data-testid="px-history">
            <thead><tr className="text-left text-[10px] text-slate-500"><th className="py-1 font-normal">GDKHQ</th><th className="font-normal">Loại</th><th className="font-normal">CP mới giao dịch</th><th className="text-right font-normal">Phiên GDKHQ</th><th className="text-right font-normal">Mua ex+1 → +10</th><th className="text-right font-normal">→ +20</th><th className="text-right font-normal">→ +30</th></tr></thead>
            <tbody>
              {data.history.map((h) => (
                <tr key={h.ex} className="border-t border-white/5">
                  <td className="py-1 pr-2 font-mono">{fmtDate(h.ex)}</td>
                  <td className="pr-2">{CAT[h.cat] ?? h.cat} {num(h.ratio, h.ratio % 1 ? 1 : 0)}%</td>
                  <td className="pr-2 text-slate-400">{h.listing ? `${fmtDate(h.listing)}${h.lag != null ? ` (${h.lag} phiên)` : ""}` : "—"}</td>
                  {[h.exDay, h.x10, h.x20, h.x30].map((v, i) => <td key={i} className={`text-right tabular-nums ${tone(v)}`}>{spct(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-slate-500">Lợi suất vượt VN-Index, giá điều chỉnh (đã loại phần giảm cơ học ngày GDKHQ). "Phiên GDKHQ" = biến động so với giá tham chiếu đã hạ.</p>
        </div>
      ) : data.historyNote ? <p className="mt-1 text-[10px] text-slate-500">{data.historyNote}</p> : null}
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500" data-testid="px-evidence">
        {data.pxR1.textVi} Trung vị {spct(data.pxR1.median30)}; nửa 2020–05/2023 {spct(data.pxR1.half1)}, nửa 06/2023–2026 {spct(data.pxR1.half2)}; {num(data.pxR1.superShare * 100, 1)}% đợt vượt thị trường hơn 20% trong 30 phiên.
      </p>
      {led && (
        <p className="mt-1 text-[10px] text-slate-500" data-testid="px-ledger">
          Sổ theo dõi tiến PX-L (từ {fmtDate(led.start)}): {led.summary.registered} đợt đã ghi trước khi có kết quả{s30 && s30.n ? ` · chấm 30 phiên: ${s30.n} đợt, trung bình ${spct(s30.mean)}, ${num((s30.pos ?? 0) * 100, 0)}% dương` : " · chưa có đợt nào đủ 30 phiên"}{data.ledger.length ? ` · ${ticker}: ${data.ledger.length} đợt trong sổ` : ""}.
        </p>
      )}
    </Block>
  );
}
