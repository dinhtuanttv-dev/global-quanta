// LS-r1 (11/11/2026) — khối "Sức mạnh dẫn dắt" trong Hồ sơ 360°: điểm dẫn dắt LS-v1 (5 thành phần), nhãn Siêu quét (Leader / Up-Trend /
// Breakout), trạng thái thị trường + chốt chặn sụp động lượng, bậc bằng chứng + trọng số E3-v5, trạng thái cổng H4.
// Không phải bảng thứ hai: cùng Hồ sơ, cùng Điểm Elite — LS-v1 chỉ có trọng số khi đạt bậc A/B VÀ cổng H4 (LS-r1-prereg.md).
import { useEliteLeadership } from "../../../hooks/elite10/useEliteCenter";
import type { LeadershipTicker } from "../../../lib/elite10/decisionTypes";
import { TierChip } from "./DecisionBoard";

const num = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d }));
const CONS_TONE: Record<string, string> = {
  DAN_DAT_NGUOC_DONG: "border-purple-500/50 bg-purple-500/10 text-purple-300",
  THUAN_XU_HUONG_MANH: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
  THUAN_XU_HUONG: "border-emerald-500/30 text-emerald-300",
  DANG_TANG_CHUA_DAN_DAT: "border-amber-500/40 text-amber-300",
  NGHICH_XU_HUONG: "border-rose-500/40 text-rose-300",
};
const COMP_FMT: Record<string, (v: number) => string> = {
  rs64: (v) => `${v >= 0 ? "+" : ""}${num(v * 100, 1)}%`,
  resMom: (v) => num(v, 2),
  hi52: (v) => `${num(v * 100, 1)}% đỉnh`,
  resil: (v) => `${v >= 0 ? "+" : ""}${num(v * 100, 2)}%/ngày`,
  stage: (v) => `${v}/3`,
};

/** Nhãn trạng thái tích hợp: trọng số LS-v1 trong Điểm Elite hôm nay và lý do. */
export function integrationState(d: LeadershipTicker): { tone: "on" | "off"; text: string } {
  const e = d.evidence;
  if (!d.gate) return { tone: "off", text: "Chưa chạy cổng H4 — LS-v1 chỉ hiển thị, chưa vào Điểm Elite." };
  if (!d.gate.pass) return { tone: "off", text: "Cổng H4 KHÔNG ĐẠT — LS-v1 chỉ hiển thị, trọng số trong Điểm Elite = 0." };
  if (!e || (e.tier !== "A" && e.tier !== "B")) return { tone: "off", text: `Cổng H4 đạt nhưng LS-v1 đang bậc ${e?.tier ?? "C"} — trọng số 0.` };
  if (d.market?.guard) return { tone: "off", text: "Chốt chặn sụp động lượng đang bật (VN-Index dưới MA200 và tăng ≥ 5% / 20 phiên) — trọng số hôm nay = 0." };
  if (e.icPost == null || e.icPost <= 0) return { tone: "off", text: "IC hậu nghiệm theo trạng thái thị trường hiện tại ≤ 0 — trọng số hôm nay = 0." };
  return { tone: "on", text: `Đang góp vào Điểm Elite (E3-v5) với IC hậu nghiệm ${num(e.icPost, 4)}.` };
}

export default function LeadershipCard({ ticker }: { ticker: string }) {
  const { data: d, error, isLoading } = useEliteLeadership(ticker);
  if (isLoading) return <p className="text-[10.5px] italic text-slate-500">Đang tải sức mạnh dẫn dắt {ticker}…</p>;
  if (error || !d) return null;
  const st = integrationState(d);
  const sc = d.scanner;
  const w = d.evidence?.weighting;
  return (
    <div className="rounded-md border border-[#E8B84B]/25 bg-[#E8B84B]/[0.03] p-2 text-[10.5px]" data-testid="elite-leadership">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase text-[#F5CE72]">Sức mạnh dẫn dắt (LS-v1) {d.date ? `— phiên ${d.date.split("-").reverse().join("/")}` : ""}</p>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${st.tone === "on" ? "border-emerald-400/50 text-emerald-300" : "border-slate-500/50 text-slate-400"}`} data-testid="elite-leadership-state">{st.text}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-1 gap-2 md:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[15px] font-bold text-slate-100" data-testid="elite-leadership-ls">{d.ls == null ? "—" : `${d.ls >= 0 ? "+" : ""}${num(d.ls)}`}</span>
            <span className="text-slate-400">z · phân vị {num(d.pct, 0)}</span>
            {d.band && <span className="rounded border border-white/15 px-1.5 py-0.5 text-slate-200">{d.band}</span>}
          </div>
          <table className="mt-1 w-full" style={{ borderCollapse: "collapse" }}>
            <tbody>
              {d.components.map((c) => (
                <tr key={c.id} className="border-t border-white/5" data-testid={`elite-leadership-${c.id}`}>
                  <td className="py-0.5 pr-1 text-slate-300">{c.labelVi}</td>
                  <td className="whitespace-nowrap px-1 text-right font-mono text-slate-200">{c.value == null ? "—" : COMP_FMT[c.id]?.(c.value) ?? num(c.value)}</td>
                  <td className="w-20 pl-1">
                    {c.pct != null && <span title={`Phân vị ${num(c.pct, 0)} trong vũ trụ cùng phiên`} className="relative inline-block h-1.5 w-16 rounded bg-white/10 align-middle">
                      <span className="absolute top-0 h-1.5 rounded" style={{ width: `${c.pct}%`, background: c.pct >= 50 ? "rgba(52,211,153,0.7)" : "rgba(248,113,113,0.7)" }} />
                    </span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1">
          {sc && (
            <div className="flex flex-wrap gap-1" data-testid="elite-leadership-scanner">
              {sc.consensus && <span className={`rounded border px-1.5 py-0.5 ${CONS_TONE[sc.consensusCode ?? ""] ?? "border-white/15 text-slate-300"}`}>{sc.consensus}</span>}
              {sc.trendTag && <span className="rounded border border-white/15 px-1.5 py-0.5 text-slate-300">{sc.trendTag}</span>}
              {sc.rsRating != null && <span className="rounded border border-white/15 px-1.5 py-0.5 text-slate-300">RS {num(sc.rsRating, 1)}</span>}
              {sc.breakout && <span className="rounded border border-amber-400/50 px-1.5 py-0.5 text-amber-300">⚡ Breakout</span>}
              <span className="rounded border border-white/15 px-1.5 py-0.5 text-slate-300">F-Score {sc.fScoreApplicable === false ? "không áp dụng" : sc.fScore != null ? `${sc.fScore}/${sc.fScoreMax ?? 9}` : "—"}</span>
            </div>
          )}
          {d.market && <p className="text-slate-400">{d.market.regimeVi ?? "—"} · độ rộng {num(d.market.breadth, 1)}% mã trên MA20{d.market.guard ? <b className="ml-1 text-amber-300">· chốt chặn đang bật</b> : null}</p>}
          {d.evidence && (
            <p className="text-slate-400" data-testid="elite-leadership-evidence">
              Bằng chứng (hồi cứu từ giá): <TierChip tier={d.evidence.tier} />{" "}
              {d.evidence.main ? <>IC 5 phiên {num(d.evidence.main.mean, 4)} · t {num(d.evidence.main.t, 1)} · {d.evidence.main.n} ngày{d.evidence.main.stable ? " · ổn định hai nửa" : " · CHƯA ổn định hai nửa"}</> : null}
              {w && <> · IC gần đây (bán rã 250 phiên) {num(w.icDec, 4)} · theo trạng thái hiện tại {num(w.icRegPost, 4)}</>}
            </p>
          )}
          {d.gate && <p className={d.gate.pass ? "text-emerald-300" : "text-slate-400"}>Cổng H4 ({d.gate.ranAt.slice(0, 10).split("-").reverse().join("/")}): {d.gate.verdictVi}</p>}
        </div>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">LS-v1 = trung bình điểm chuẩn của RS 64 phiên, động lượng riêng (đã trừ VN-Index), khoảng cách tới đỉnh 52 tuần, mức chống chịu ngày VN-Index giảm và giai đoạn xu hướng — trọng số đều, cố định trước khi kiểm định (LS-r1). Mô tả, không phải khuyến nghị.</p>
    </div>
  );
}
