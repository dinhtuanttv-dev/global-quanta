// WS-r2 T1 (11/11/2026) — khối "Truyền dẫn thế giới" trong Hồ sơ 360°: tác động ngành & cổ phiếu của tab PHÂN TÍCH VĨ MÔ cho đúng mã
// đang xem (công cụ ws_stock của Gateway + hàng hoá + bối cảnh vĩ mô). MÔ TẢ — không cộng vào Điểm Elite:
//   • α ngành WS-v1 chỉ dự báo phiên VN kế tiếp lúc ATO (IC 0,020) — đã phản ánh khi Elite vào lệnh (đóng cửa d+1);
//   • WS-r2 (đăng ký trước, 11/11/2026): sóng 5 phiên (H5), độ nhạy × sóng (H6), thời điểm ATO (H7) đều KHÔNG ĐẠT.
import useSWR from "swr";
import { fetchMarketJson } from "../../../services/marketDataClient";
import { useCommoditySnapshot } from "../../../hooks/useCommoditySnapshot";
import { useWorldStrategy } from "../../../hooks/useWorldStrategy";
import { MEDIUM_STANCE_VI, QUADRANT_VI, SHORT_STANCE_VI, type MediumStance, type ShortStance } from "../../../lib/worldSectors/strategyTypes";

export interface WsStock {
  ticker: string; icb: { l1: string; l2: string; l3: string } | null; sector: { icb: string; nameVi: string } | null;
  sectorShort: { stance: ShortStance; alphaBps: number | null; pOutperform: number | null; z: number | null } | null;
  sectorMedium: { stance: MediumStance; ws3m: number | null; rrg: string | null } | null;
  stockExposure: { weightPct: number | null; betaPct: number | null; corr: number | null; d1Pct: number | null; m1Pct: number | null; m3Pct: number | null } | null;
  drivers: { id: string; nameVi: string; sign: 1 | -1 }[]; note: string | null;
}

/** Bằng chứng (cố định theo kết quả đã công bố): WS-v1 H3 và WS-r2 (backend/src/market/worldSectors/WS-r2-result.json). */
export const WORLD_EVIDENCE_VI = "WS-v1: α ngành dự báo phiên VN kế tiếp lúc ATO (IC 0,020, t 2,53) — từ đóng cửa phiên đó trở đi ≈ 0. WS-r2 (đăng ký trước, kiểm trên 2019–2022): sóng thế giới 5 phiên → 10 phiên KHÔNG ĐẠT (IC 0,032, t 1,15), độ nhạy cổ phiếu × sóng KHÔNG ĐẠT (IC 0,016, t 1,37), vào lệnh ATO theo ngành thuận gió KHÔNG ĐẠT (p 0,027; chênh 0,026%/phiên). Khối này chỉ mô tả, không cộng vào Điểm Elite.";

const num = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const sgn = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${num(v, d)}`);
const TONE: Record<string, string> = { overweight: "border-emerald-400/50 text-emerald-300", underweight: "border-rose-400/50 text-rose-300", supportive: "border-emerald-400/40 text-emerald-300", adverse: "border-rose-400/40 text-rose-300" };

export default function WorldTransmissionCard({ ticker }: { ticker: string }) {
  const { data, error, isLoading } = useSWR<{ ok: boolean; data?: WsStock; error?: string }>(ticker ? ["ws-stock", ticker] : null,
    () => fetchMarketJson("/api/world-sectors/tools/ws_stock", {}, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker }) }),
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 });
  const { data: strategy } = useWorldStrategy();
  const { data: commodities } = useCommoditySnapshot();
  if (isLoading) return <p className="text-[10.5px] italic text-slate-500">Đang tải truyền dẫn thế giới {ticker}…</p>;
  if (error || !data?.ok || !data.data) return null;
  const d = data.data;
  const items = new Map((commodities?.items ?? []).map((i) => [i.id, i]));
  const rg = strategy?.regime ?? null;
  const brent = items.get("BRENT");
  return (
    <div className="rounded-md border border-sky-400/20 bg-sky-400/[0.03] p-2 text-[10.5px]" data-testid="elite-world">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase text-sky-300">Truyền dẫn thế giới {d.sector ? `— ${d.sector.nameVi} (ICB ${d.sector.icb})` : ""}</p>
        <span className="rounded border border-slate-500/50 px-1.5 py-0.5 text-[10px] text-slate-400">Mô tả · không cộng vào Điểm Elite</span>
      </div>
      {!d.sector ? <p className="mt-1 text-slate-400">{d.note ?? "Ngành của mã không thuộc 22 ngành ICB có ánh xạ thế giới."}</p> : (
        <div className="mt-1.5 grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="space-y-1" data-testid="elite-world-sector">
            <p className="text-[10px] font-bold uppercase text-slate-500">Ngành — phiên VN kế tiếp (ATO)</p>
            {d.sectorShort ? <p className="text-slate-300">
              <span className={`rounded border px-1.5 py-0.5 ${TONE[d.sectorShort.stance] ?? "border-white/15 text-slate-300"}`}>{SHORT_STANCE_VI[d.sectorShort.stance]}</span>{" "}
              α {sgn(d.sectorShort.alphaBps, 1)} đcb · P vượt VN-Index {d.sectorShort.pOutperform == null ? "—" : `${num(d.sectorShort.pOutperform * 100, 1)}%`}
            </p> : <p className="text-slate-500">—</p>}
            <p className="text-[10px] text-slate-500">Chỉ cho phiên kế tiếp lúc mở cửa — Elite 10 vào lệnh đóng cửa d+1 nên đã phản ánh vào giá.</p>
            <p className="text-[10px] font-bold uppercase text-slate-500 pt-1">Ngành — trung hạn (bối cảnh)</p>
            {d.sectorMedium ? <p className="text-slate-300">
              <span className={`rounded border px-1.5 py-0.5 ${TONE[d.sectorMedium.stance] ?? "border-white/15 text-slate-300"}`}>{MEDIUM_STANCE_VI[d.sectorMedium.stance]}</span>{" "}
              thế giới 3T {sgn(d.sectorMedium.ws3m, 2)}{d.sectorMedium.rrg ? ` · RRG ${QUADRANT_VI[d.sectorMedium.rrg] ?? d.sectorMedium.rrg}` : ""}
            </p> : <p className="text-slate-500">—</p>}
          </div>
          <div className="space-y-1" data-testid="elite-world-exposure">
            <p className="text-[10px] font-bold uppercase text-slate-500">Phơi nhiễm của mã (250 phiên)</p>
            {d.stockExposure ? <p className="text-slate-300">
              Tỷ trọng trong ngành {num(d.stockExposure.weightPct)}% · β với ngành thế giới {num(d.stockExposure.betaPct, 2)} · tương quan {num(d.stockExposure.corr, 2)}
              <br />Giá: 1 phiên {sgn(d.stockExposure.d1Pct)}% · 1 tháng {sgn(d.stockExposure.m1Pct)}% · 3 tháng {sgn(d.stockExposure.m3Pct)}%
            </p> : <p className="text-slate-400">{d.note ?? "Chưa tính β riêng — tác động suy từ ngành."}</p>}
          </div>
          <div className="space-y-1" data-testid="elite-world-drivers">
            <p className="text-[10px] font-bold uppercase text-slate-500">Hàng hoá dẫn dắt · vĩ mô</p>
            <p className="text-slate-300">
              {d.drivers.length ? d.drivers.map((x) => { const c = items.get(x.id)?.change; return `${x.nameVi}${x.sign < 0 ? " (chi phí đầu vào)" : ""}${c?.pct != null ? ` ${sgn(c.pct)}% ${c.basisVi}` : ""}`; }).join(" · ") : "Không có hàng hoá dẫn dắt trực tiếp."}
            </p>
            {rg && <p className="text-slate-400">VIX {num(rg.vix, 1)}{rg.vixChg != null ? ` (${sgn(rg.vixChg)}%)` : ""} · DXY {num(rg.dxy, 1)}{rg.dxyChg != null ? ` (${sgn(rg.dxyChg)}%)` : ""}{brent?.value != null ? ` · Brent ${num(brent.value, 1)} USD` : ""}{rg.stressed ? " · căng thẳng" : ""}</p>}
          </div>
        </div>
      )}
      <p className="mt-1 text-[10px] text-slate-500" data-testid="elite-world-evidence">{WORLD_EVIDENCE_VI}</p>
    </div>
  );
}
