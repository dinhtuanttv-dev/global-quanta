// Bảng phụ PHÂN TÍCH CHUYÊN SÂU của bộ lọc SEPA Minervini (SP4) — cùng khuôn với bảng phụ CAN SLIM / Base Breakout / Hợp lưu:
// mở bằng bấm mã / nhấn đúp dòng, đóng bằng bấm lại hoặc Esc; không mở biểu đồ (có nút riêng).
// Dữ liệu: dòng kết quả của Gateway (engine sepa/SP2, khớp 1:1 gói Python sepa_screener) + nến điều chỉnh cùng cơ sở giá.
// Bố cục bám sách "Giao dịch như một phù thủy chứng khoán": Hình 10.6/10.4 (dấu chân VCP), 10.8 (cung–cầu, KL cạn kiệt),
// 5.6 (4 giai đoạn), Trend Template 8 tiêu chí (s.101–102), 10.38 (LNST/doanh thu theo quý), Chương 9 (dẫn dắt),
// Chương 12–13 (kế hoạch lệnh, Hình 13.2), theo dõi sau phá vỡ (s.271–285).
import { Fragment, useEffect, useMemo, useState } from "react";
import { LineChart, X, Cpu } from "lucide-react";
import { useTaSeries } from "../../../hooks/useTaSeries";
import { useVolumeAnalysis } from "../../../hooks/useVolumeAnalysis";
import { isS2Signal, type SepaDoc, type SepaRow } from "../../../hooks/useSepa";
import { Card, ForeignBars, Tile, VolumeBars } from "./ScreenerDeepPanel";
import SepaSketch from "./SepaSketch";
import { ContractionShapes, FootprintDiagram, QuarterlyGrowth, RLadder, RoiCurve, StageCycleMap } from "./SepaDiagrams";

const UP = "#059669";
const ACCENT = "#0284c7";
const AMBER = "#d97706";

const fmtP = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("vi-VN"));
const fmtPct = (v?: number | null, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")}%`);
const fmtBn = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${v < 0 ? "−" : ""}${(Math.abs(v) / 1e9).toFixed(1).replace(".", ",")} tỷ`);
/** VND: ≥ 1 tỷ -> "x,x tỷ", nhỏ hơn -> "x triệu". */
const fmtVnd = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : Math.abs(v) >= 1e9 ? fmtBn(v) : `${v < 0 ? "−" : ""}${Math.round(Math.abs(v) / 1e6).toLocaleString("vi-VN")} triệu`);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const LIST_STYLE: Record<string, string> = {
  "SẴN SÀNG MUA": "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  "CẢNH BÁO MUA": "bg-amber-500/15 text-amber-200 border-amber-500/40",
  "THEO DÕI": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "LOẠI": "bg-slate-500/10 text-slate-400 border-slate-600/40",
};
export const STATUS_VI: Record<string, string> = {
  BREAKOUT: "Phá vỡ", NEAR_PIVOT: "Gần pivot", FORMING: "Đang hình thành", SQUAT: "Squat (quay lại nền)", EXTENDED: "Đã chạy xa (> 5%)", FAILED: "Thất bại", NONE: "—",
};

/** Trend Template 8 tiêu chí [s.101–102] — nhãn + giá trị đo. */
export function trendRows(row: SepaRow) {
  const v = row.trend.values ?? {}, c = row.trend.criteria;
  const n = (k: string) => num(v[k]);
  return [
    { k: "TC1_gia_tren_MA150_MA200", label: "Giá trên MA150 và MA200", value: `${fmtP(n("gia"))} · ${fmtP(n("ma150"))} / ${fmtP(n("ma200"))}` },
    { k: "TC2_MA150_tren_MA200", label: "MA150 trên MA200", value: `${fmtP(n("ma150"))} > ${fmtP(n("ma200"))}` },
    { k: "TC3_MA200_doc_len_1thang", label: "MA200 đi lên ≥ 1 tháng (ưa thích 4–5 tháng)", value: n("so_thang_MA200_tang") != null ? `${n("so_thang_MA200_tang")} tháng` : "—" },
    { k: "TC4_MA50_tren_MA150_MA200", label: "MA50 trên MA150 và MA200", value: fmtP(n("ma50")) },
    { k: "TC5_gia_tren_MA50", label: "Giá trên MA50", value: n("gia") != null && n("ma50") ? fmtPct((n("gia")! / n("ma50")! - 1) * 100) : "—" },
    { k: "TC6_cao_hon_day52t_30pct", label: "Cao hơn đáy 52 tuần ≥ 30%", value: n("pct_tren_day52t") != null ? fmtPct(n("pct_tren_day52t")! * 100, 0) : "—" },
    { k: "TC7_cach_dinh52t_toi_da_25pct", label: "Cách đỉnh 52 tuần ≤ 25%", value: n("pct_duoi_dinh52t") != null ? `−${(n("pct_duoi_dinh52t")! * 100).toFixed(1).replace(".", ",")}%` : "—" },
    { k: "TC8_RS_rating_>=70", label: "RS Rating ≥ 70 (ưa thích 80–90)", value: row.metrics.rs != null ? String(Math.round(row.metrics.rs)) : "chưa có" },
  ].map((r) => ({ ...r, ok: Boolean(c[r.k]) }));
}

const FUND_FLAGS: [string, string][] = [
  ["EPS_quy_gan_nhat_>=20pct", "LNST quý gần nhất ≥ +20% so cùng kỳ"],
  ["EPS_2-3_quy_>=30pct", "2–3 quý gần nhất ≥ +30%"],
  ["DT_quy_gan_nhat_>=15pct", "Doanh thu quý gần nhất ≥ +15%"],
  ["EPS_tang_toc_3_quy", "LNST tăng tốc 3 quý liên tiếp (s.159)"],
  ["DT_tang_toc", "Doanh thu tăng tốc ≥ 2 quý"],
  ["MAT_MA_33", "Mật mã 33: LNST, doanh thu, biên LN cùng tăng tốc 3 quý (s.190)"],
  ["bien_gop_mo_rong", "Biên lợi nhuận gộp mở rộng"],
  ["EPS_MA2_quy_di_len", "Đường trung bình 2 quý LNST đi lên (s.162)"],
  ["NAM_DOT_PHA", "Năm đột phá (s.164)"],
  ["PHUC_HOI_TU_KHO_KHAN", "Phục hồi từ khó khăn (s.165)"],
];
const LEAD_ROWS: [string, string, boolean?][] = [
  ["duong_RS_dinh_moi", "Đường RS lập đỉnh mới"],
  ["duong_RS_dinh_moi_truoc_gia", "Đường RS lập đỉnh TRƯỚC giá"],
  ["duong_RS_doc_len_3thang", "Đường RS đi lên 3 tháng"],
  ["giu_gia_tot", "Giữ giá tốt khi thị trường điều chỉnh (s.223)"],
  ["phan_ky_duong_voi_chi_so", "Phân kỳ dương với chỉ số"],
  ["DINH_MOI_SOM", "Lập đỉnh mới sớm sau đáy chỉ số (≤ 8 tuần, s.200)"],
  ["tang_20pct_trong_5_tuan_gan_day", "Tăng ≥ 20% trong ≤ 5 tuần"],
  ["gan_dinh_khi_TT_dieu_chinh", "Cách đỉnh 52 tuần ≤ 15% khi thị trường điều chỉnh"],
  ["GIAM_GAP_DOI_THI_TRUONG", "Giảm gấp đôi thị trường (cần tránh)", true],
];
/** Nhãn chỉ số của các mô hình nền (khóa của gói Python) — kiểu: % | giá | x (bội số) | n (số) | b (có/không) | t (chữ). */
const DETAIL_VI: Record<string, [string, "%" | "p" | "x" | "n" | "b" | "t"]> = {
  loai: ["Loại", "t"], vi_tri_vung_cheat_trong_coc: ["Vị trí vùng cheat trong cốc", "%"], do_sau_coc: ["Độ sâu cốc", "%"],
  so_phien_tam_ngung: ["Số phiên tạm ngưng", "n"], bien_do_tam_ngung: ["Biên độ vùng tạm ngưng", "%"], tang_truoc_do: ["Tăng trước đó", "%"],
  tren_MA200: ["Trên MA200", "b"], KL_tam_ngung_x_TB50: ["KL tạm ngưng / TB50", "x"], drift_thung_day_cu: ["Drift thủng đáy cũ (rũ bỏ)", "b"],
  tang_truoc_nen: ["Tăng trước nền", "%"], KL_nen_x_TB50: ["KL trong nền / TB50", "x"],
  dinh_trai: ["Đỉnh trái", "p"], day_coc: ["Đáy cốc", "p"], vanh_phai: ["Vành phải", "p"], vanh_phai_hoi_phuc_pct_chieu_cao: ["Vành phải hồi phục (chiều cao cốc)", "%"],
  so_phien_tay_cam: ["Số phiên tay cầm", "n"], do_sau_tay_cam: ["Độ sâu tay cầm", "%"], tay_cam_o_1_3_tren: ["Tay cầm ở 1/3 trên", "b"], KL_tay_cam_x_TB50: ["KL tay cầm / TB50", "x"],
  tang_trong_pha_dam: ["Tăng trong pha đâm", "%"], so_phien_pha_dam: ["Số phiên pha đâm", "n"], KL_pha_dam_x_truoc: ["KL pha đâm / trước", "x"],
  so_phien_co: ["Số phiên lá cờ", "n"], do_sau_co: ["Độ sâu lá cờ", "%"], co_that_chat_dan: ["Cờ thắt chặt dần", "b"],
  so_phien_tu_niem_yet: ["Số phiên từ niêm yết", "n"], tang_tu_niem_yet_den_dinh: ["Tăng từ niêm yết tới đỉnh", "%"], so_phien_nen: ["Số phiên nền", "n"], do_sau: ["Độ sâu", "%"],
};
function detailValue(kind: string, v: unknown): string {
  if (typeof v === "boolean") return v ? "có" : "không";
  if (typeof v !== "number" || !Number.isFinite(v)) return String(v ?? "—");
  if (kind === "%") return `${Math.round(v * 100)}%`;
  if (kind === "p") return fmtP(v);
  if (kind === "x") return `${v.toFixed(2).replace(".", ",")}×`;
  return String(v).replace(".", ",");
}
const SCREEN_VI: Record<string, string> = { loc_xu_huong: "Xu hướng", loc_co_ban: "Cơ bản", loc_mo_hinh: "Mô hình giá", loc_dan_dat: "Dẫn dắt", loc_RS: "RS ≥ 80" };

const Check = ({ ok, bad }: { ok: boolean; bad?: boolean }) => (
  <span className={`inline-flex w-3.5 h-3.5 shrink-0 rounded-[3px] text-[9px] font-black leading-[14px] justify-center ${ok ? (bad ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300") : "bg-slate-800 text-slate-500"}`}>{ok ? (bad ? "!" : "✓") : "✗"}</span>
);

const EQUITY_KEY = "gq_sepa_equity_vnd";
function readEquity(def: number) { try { const v = Number(window.localStorage.getItem(EQUITY_KEY)); return Number.isFinite(v) && v > 0 ? v : def; } catch { return def; } }
function writeEquity(v: number) { try { window.localStorage.setItem(EQUITY_KEY, String(v)); } catch { /* bỏ qua */ } }

/** Quy mô vị thế theo vốn của người dùng (giống planTrade của Gateway). */
export function sizePosition(entry: number, stop: number, equity: number, risk: SepaDoc["risk"]) {
  const r = entry - stop;
  let shares = r > 0 ? Math.trunc((equity * risk.riskPerTrade) / r) : 0;
  const cap = Math.trunc((equity * risk.maxPositionPct) / entry);
  const capped = shares > cap;
  if (capped) shares = cap;
  shares = Math.floor(shares / (risk.lot || 100)) * (risk.lot || 100);
  return { shares, value: shares * entry, riskAmount: shares * r, riskPct: (shares * r) / equity, capped };
}

function Ring({ score, list }: { score: number; list: string }) {
  const r = 22, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, score / 100));
  const color = list === "SẴN SÀNG MUA" ? UP : list === "CẢNH BÁO MUA" ? AMBER : list === "THEO DÕI" ? ACCENT : "#64748b";
  return (
    <svg viewBox="0 0 56 56" className="w-14 h-14 shrink-0" role="img" aria-label={`Điểm SEPA ${score}/100 — ${list}`}>
      <circle cx={28} cy={28} r={r} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={5} />
      <circle cx={28} cy={28} r={r} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 28 28)" />
      <text x={28} y={27} textAnchor="middle" fontSize={14} fontWeight={800} fill="#e2e8f0">{Math.round(score)}</text>
      <text x={28} y={39} textAnchor="middle" fontSize={7.5} fill="#94a3b8">SEPA</text>
    </svg>
  );
}

interface Props { row: SepaRow; doc: SepaDoc; onClose: () => void; onOpenChart: (ticker: string) => void; onOpenVision?: (ticker: string) => void }

export default function SepaDeepPanel({ row, doc, onClose, onOpenChart, onOpenVision }: Props) {
  const full = row.list !== "LOẠI";
  const series = useTaSeries(full ? row.ticker : null);
  const { data: vol } = useVolumeAnalysis(full ? row.ticker : null);
  const bars = useMemo(() => series.bars.filter((b) => !(b as { partial?: boolean }).partial), [series.bars]);
  const [equity, setEquity] = useState<number>(() => readEquity(doc.equityRef ?? 1e9));
  useEffect(() => writeEquity(equity), [equity]);
  const p = row.pattern ?? null, plan = row.plan ?? null, st = row.stage, fu = row.fundamentals, lead = row.lead ?? {};
  const mh = doc.market?.sepa;
  const tt = trendRows(row);
  const pivotDist = p?.pivot ? (row.metrics.close / p.pivot - 1) * 100 : null;
  const sized = plan ? sizePosition(plan.entry, plan.stop, equity, doc.risk) : null;
  const npQ = (fu?.metrics?.tang_truong_EPS_cac_quy as (number | null)[] | undefined) ?? [];
  const revQ = (fu?.metrics?.tang_truong_DT_cac_quy as (number | null)[] | undefined) ?? [];
  const cons = p?.name === "VCP" ? p.details.thu_hep_chi_tiet ?? [] : [];

  return (
    <div className="p-3 font-sans space-y-2" style={{ background: "linear-gradient(180deg, rgba(5,150,105,0.07), rgba(2,6,15,0.2))" }} data-testid="sepa-deep-panel">
      <header className="flex flex-wrap items-center gap-3">
        <Ring score={row.score} list={row.list} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-lg font-black text-amber-400 tracking-wide">{row.ticker}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${LIST_STYLE[row.list]}`} data-testid="sepa-deep-list">{row.list}</span>
            {p && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-violet-500/15 text-violet-200">{p.name} · {STATUS_VI[p.status] ?? p.status}</span>}
            {st && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-slate-500/15 text-slate-200">{st.label}{st.stage === 2 ? ` · nền thứ ${st.baseCount + 1}` : ""}</span>}
            <span className="text-[8px] px-1.5 py-0.5 rounded font-bold bg-amber-500/10 text-amber-300">{doc.evidence?.label === "VALIDATED" ? "VALIDATED" : "EXPERIMENTAL"}</span>
            {isS2Signal(row) && <span className="text-[8px] px-1.5 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-300" title="Ngoài mẫu: n 37, +3,66%/20 phiên, KTC [0,69; 7,33]; trong mẫu −0,48%" data-testid="sepa-deep-s2">S2 phá vỡ đạt chuẩn · đạt OOS (thận trọng)</span>}
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {row.name ?? ""}{row.sector ? ` · ${row.sector}` : ""} · SEPA (Minervini) · engine {doc.engine} · dữ liệu tới {row.date}
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          {onOpenVision && (
            <button type="button" onClick={() => onOpenVision(row.ticker)} data-testid="open-vision" className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20">
              <Cpu className="w-3 h-3" />AI Chart Vision
            </button>
          )}
          <button type="button" onClick={() => onOpenChart(row.ticker)} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-slate-700 text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300">
            <LineChart className="w-3 h-3" />Mở biểu đồ TA
          </button>
          <button type="button" onClick={onClose} aria-label="Đóng phân tích chuyên sâu" className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"><X className="w-3.5 h-3.5" /></button>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
        <Tile label="Giá" value={fmtP(row.metrics.close)} sub={`phiên ${row.date}`} />
        <Tile label="Trend Template" value={`${row.trend.score}/8`} sub={row.trend.passed ? "đạt cổng đầu tiên" : "chưa đạt"} tone={row.trend.passed ? "up" : undefined} />
        <Tile label="Giai đoạn" value={st ? `GĐ${st.stage}` : row.stageLabel?.slice(0, 3) ?? "—"} sub={st?.stage === 2 ? `nền thứ ${st.baseCount + 1}` : undefined} tone={st?.stage === 2 ? "up" : st?.stage === 4 ? "down" : undefined} />
        <Tile label="RS Rating" value={row.metrics.rs != null ? String(Math.round(row.metrics.rs)) : "—"} sub="phân vị toàn universe" tone={(row.metrics.rs ?? 0) >= 80 ? "up" : undefined} />
        <Tile label="Pivot" value={fmtP(p?.pivot ?? row.metrics.pivot)} sub={pivotDist != null ? `giá ${fmtPct(pivotDist)} so pivot` : undefined} />
        <Tile label="Dừng lỗ" value={plan ? `−${(plan.stopPct * 100).toFixed(1).replace(".", ",")}%` : "—"} sub={plan ? (mh?.hardMarket ? "thị trường khó: tối đa 6%" : "½ lãi TB, tối đa 10%") : undefined} tone={plan ? "down" : undefined} />
      </div>

      {!full && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Card title="Trend Template 8 tiêu chí" right={`${row.trend.score}/8`}>
            <ul className="space-y-0.5 text-[10px]" data-testid="sepa-tt">{tt.map((r) => <li key={r.k} className="flex items-center gap-1.5"><Check ok={r.ok} /><span className={r.ok ? "text-slate-200" : "text-slate-400"}>{r.label}</span></li>)}</ul>
          </Card>
          <Card title="Vì sao LOẠI" right={row.stageLabel}>
            <p className="text-[10px] text-slate-300">Chưa qua cổng Trend Template (s.101–102){row.metrics.pattern ? ` — dù có mô hình ${row.metrics.pattern} (${row.metrics.footprint ?? ""})` : ""}.</p>
            {row.warnings.length > 0 && <ul className="mt-1 text-[9px] text-amber-300/90 list-disc pl-4">{row.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
            <p className="mt-1 text-[9px] text-slate-500">Dòng LOẠI được lưu rút gọn để bản quét gọn nhẹ; mở biểu đồ TA để xem chi tiết.</p>
          </Card>
        </div>
      )}

      {full && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
            <Card title="Mô phỏng mẫu hình trên giá thật" className="lg:col-span-2"
              right={p ? `${p.footprint || p.name} · nền ${p.baseStart} → ${p.baseEnd ?? "nay"}` : "chưa có mô hình nền"}>
              {series.isLoading && !bars.length
                ? <div className="text-[10px] text-slate-500 py-10 text-center">Đang tải nến…</div>
                : series.error && !bars.length
                  ? <div role="alert" className="text-[10px] text-rose-300 py-10 text-center">Không tải được nến {row.ticker}: {String((series.error as Error)?.message ?? series.error)}</div>
                  : <SepaSketch bars={bars} row={row} />}
            </Card>
            <Card title={cons.length ? "Dấu chân kỹ thuật (Hình 10.6)" : "Nền giá"} right={p?.footprint || undefined}>
              {cons.length && p ? (
                <>
                  <FootprintDiagram contractions={cons} depthsPct={p.details.cac_lan_thu_hep_pct ?? []} footprint={p.footprint} baseStart={p.baseStart ?? cons[0].ngay_dinh} baseEnd={p.baseEnd ?? row.date} leftHigh={num(p.details.dinh_trai) ?? cons[0].dinh} />
                  <ContractionShapes count={cons.length} />
                  <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-[10px]" data-testid="sepa-vcp-facts">
                    <dt className="text-slate-500">Tỷ lệ thu hẹp TB (lý tưởng ~0,5)</dt><dd className="text-right font-mono text-slate-200">{String(num(p.details.ty_le_thu_hep_TB) ?? "—").replace(".", ",")}</dd>
                    <dt className="text-slate-500">KL vùng pivot / TB50</dt><dd className="text-right font-mono text-slate-200">{String(num(p.details.KL_vung_pivot_x_TB50) ?? "—").replace(".", ",")}×</dd>
                    <dt className="text-slate-500">Phiên KL cạn kiệt (&lt; 50% TB50)</dt><dd className="text-right font-mono text-slate-200">{String(p.details.so_phien_KL_can_kiet ?? "—")}</dd>
                    <dt className="text-slate-500">Rũ bỏ · bắn vọt KL lớn</dt><dd className="text-right font-mono text-slate-200">{String(p.details.ru_bo_undercut ?? 0)} · {String(p.details.ban_vot_KL_lon ?? 0)}</dd>
                    <dt className="text-slate-500">KL giảm dần theo từng nhịp</dt><dd className="text-right text-slate-200">{p.details.KL_giam_dan ? "có" : "không"}</dd>
                  </dl>
                </>
              ) : p ? (
                <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-[10px]">
                  <dt className="text-slate-500">Mô hình</dt><dd className="text-right text-slate-200">{p.name}</dd>
                  <dt className="text-slate-500">Độ rộng · độ sâu</dt><dd className="text-right font-mono text-slate-200">{p.baseWeeks ?? "—"} tuần · {p.depth != null ? `${Math.round(p.depth * 100)}%` : "—"}</dd>
                  {Object.entries(p.details).filter(([k]) => k in DETAIL_VI).map(([k, v]) => (
                    <Fragment key={k}><dt className="text-slate-500 truncate">{DETAIL_VI[k][0]}</dt><dd className="text-right font-mono text-slate-200">{detailValue(DETAIL_VI[k][1], v)}</dd></Fragment>
                  ))}
                </dl>
              ) : <p className="text-[10px] text-slate-500">Chưa nhận diện mô hình nền nào ({row.patterns?.filter((x) => !x.detected).map((x) => x.name).join(", ")}).</p>}
              {p?.notes?.length ? <ul className="mt-1 text-[9px] text-emerald-300/90 list-disc pl-4">{p.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Card title="Trend Template 8 tiêu chí" right={`${row.trend.score}/8 · s.101`}>
              <ul className="space-y-0.5 text-[10px]" data-testid="sepa-tt">
                {tt.map((r) => (
                  <li key={r.k} className="grid grid-cols-[14px_1fr_auto] items-center gap-1.5">
                    <Check ok={r.ok} /><span className={`truncate ${r.ok ? "text-slate-200" : "text-slate-400"}`} title={r.label}>{r.label}</span>
                    <span className="font-mono text-slate-400 text-right whitespace-nowrap">{r.value}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="4 giai đoạn (Hình 5.6)" right={st ? `tin cậy ${Math.round(st.confidence * 100)}%` : undefined}>
              <StageCycleMap stage={st?.stage ?? 0} />
              {st?.bases?.length ? (
                <ul className="mt-1 space-y-0.5 text-[10px]" data-testid="sepa-bases">
                  {st.bases.map((b, i) => (
                    <li key={b.bat_dau} className="flex justify-between gap-2">
                      <span className="text-slate-300">Nền {i + 1}{b.dang_hinh_thanh ? " (đang hình thành)" : ""}</span>
                      <span className="font-mono text-slate-400">{b.bat_dau.slice(5).split("-").reverse().join("/")} · {String(b.so_tuan).replace(".", ",")}T · −{Math.round(b.do_sau * 100)}%</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[9px] text-slate-500 mt-1">Nền 1–2 tốt nhất, nền 3 còn mua được, nền 4–5 là "nền cuối" dễ thất bại (s.103).</p>}
              {st?.warnings?.length ? <ul className="mt-1 text-[9px] text-rose-300/90 list-disc pl-4">{st.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
            </Card>
            <Card title="Điểm SEPA · 5 bộ lọc tách biệt" right={`${row.score}/100 · ${row.screensPassed}/5 bộ lọc`}>
              {row.components && (
                <ul className="space-y-1" data-testid="sepa-components">
                  {([["trend", "Xu hướng (Trend Template)", 25], ["fund", "Cơ bản", 25], ["rs", "RS Rating", 15], ["pattern", "Mô hình giá", 25], ["lead", "Dẫn dắt", 10]] as const).map(([k, label, max]) => {
                    const v = row.components![k];
                    return (
                      <li key={k} className="text-[10px]">
                        <div className="flex justify-between gap-2"><span className="text-slate-300">{label}</span><span className="font-mono text-slate-300">{v.toFixed(1).replace(".", ",")}/{max}</span></div>
                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: v / max >= 0.6 ? UP : ACCENT }} /></div>
                      </li>
                    );
                  })}
                  {row.components.penalty < 0 && <li className="text-[10px] flex justify-between"><span className="text-rose-300">Cảnh báo (−3 mỗi cảnh báo)</span><span className="font-mono text-rose-300">{row.components.penalty}</span></li>}
                </ul>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {Object.entries(row.screens).map(([k, ok]) => <span key={k} className={`text-[8.5px] px-1.5 py-0.5 rounded border ${ok ? "border-emerald-500/40 text-emerald-300" : "border-slate-700 text-slate-500"}`}>{ok ? "✓" : "✗"} {SCREEN_VI[k] ?? k}</span>)}
              </div>
              <p className="mt-1 text-[9px] text-slate-500">Chạy nhiều bộ lọc tách biệt rồi tổng hợp bằng điểm (s.52) · kiểm định SP3: thứ bậc danh sách và Trend Template chưa có lợi thế ngoài mẫu.</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Card title="Cơ bản theo quý (Hình 10.38)" right={fu?.latestQuarter ? `tới ${fu.latestQuarter} · ${fu.score}/100` : `${fu?.score ?? 0}/100`}>
              <QuarterlyGrowth np={npQ} rev={revQ} latest={fu?.latestQuarter} />
              <ul className="mt-1 space-y-0.5 text-[10px]" data-testid="sepa-fund">
                {FUND_FLAGS.filter(([k]) => fu && k in fu.flags).map(([k, label]) => (
                  <li key={k} className="flex items-center gap-1.5"><Check ok={Boolean(fu!.flags[k])} /><span className={fu!.flags[k] ? "text-slate-200" : "text-slate-400"}>{label}</span></li>
                ))}
              </ul>
              {fu?.warnings?.length ? <ul className="mt-1 text-[9px] text-amber-300/90 list-disc pl-4">{fu.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
              <p className="mt-1 text-[8.5px] text-slate-600">{fu?.source ?? "VCI"} · tăng trưởng đo bằng LNST (EPS của VCI chưa điều chỉnh cổ tức cổ phiếu){fu?.columns && !fu.columns.includes("inventory") ? " · tồn kho/phải thu: chưa có dữ liệu" : ""}.</p>
            </Card>
            <Card title="Cổ phiếu dẫn dắt (Chương 9)" right={`${num(lead.diem_dan_dat) ?? "—"}/100`}>
              <ul className="space-y-0.5 text-[10px]" data-testid="sepa-lead">
                {LEAD_ROWS.filter(([k]) => k in lead).map(([k, label, bad]) => (
                  <li key={k} className="flex items-center gap-1.5"><Check ok={Boolean(lead[k])} bad={bad} /><span className={lead[k] ? (bad ? "text-rose-300" : "text-slate-200") : "text-slate-400"}>{label}</span></li>
                ))}
              </ul>
              {num(lead.chi_so_dieu_chinh) != null && (
                <p className="mt-1 text-[9px] text-slate-400">Trong 6 tháng: VN-Index điều chỉnh {Math.round(num(lead.chi_so_dieu_chinh)! * 100)}%, {row.ticker} {Math.round((num(lead.cp_dieu_chinh_cung_ky) ?? 0) * 100)}% cùng kỳ · cách đỉnh 52 tuần {Math.round((num(lead.dist_dinh_52t) ?? 0) * 100)}%.</p>
              )}
            </Card>
            <Card title="Kế hoạch lệnh (Chương 12–13)" right="minh hoạ, không phải khuyến nghị">
              {plan ? (
                <>
                  <RLadder entry={plan.entry} stop={plan.stop} pivot={p?.pivot} target2r={plan.target2r} target3r={plan.target3r} />
                  <label className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-400">
                    Vốn của bạn (VND)
                    <input type="number" min={10_000_000} step={10_000_000} value={equity} onChange={(e) => setEquity(Math.max(1, Number(e.target.value) || 0))}
                      className="w-32 rounded bg-slate-900 border border-slate-700 px-1.5 py-0.5 text-right font-mono text-slate-200" aria-label="Vốn để tính quy mô vị thế" data-testid="sepa-equity" />
                  </label>
                  {sized && (
                    <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-[10px]" data-testid="sepa-plan">
                      <dt className="text-slate-500">Khối lượng (lô 100)</dt><dd className="text-right font-mono text-slate-200">{sized.shares.toLocaleString("vi-VN")} cp</dd>
                      <dt className="text-slate-500">Giá trị vị thế</dt><dd className="text-right font-mono text-slate-200">{fmtVnd(sized.value)} · {((sized.value / equity) * 100).toFixed(0)}% vốn</dd>
                      <dt className="text-slate-500">Rủi ro nếu chạm dừng lỗ</dt><dd className="text-right font-mono text-rose-300">{fmtVnd(sized.riskAmount)} · {(sized.riskPct * 100).toFixed(2).replace(".", ",")}% vốn</dd>
                    </dl>
                  )}
                  <p className="mt-1 text-[9px] text-slate-500">
                    Rủi ro {Math.round(doc.risk.riskPerTrade * 100)}%/lệnh, trần {Math.round(doc.risk.maxPositionPct * 100)}%/vị thế{sized?.capped ? " (trần đang chặn)" : ""} · lãi đạt 3R thì dời dừng lỗ về hoà vốn (s.366){plan.stopTooWide ? " · ⚠ cần dừng lỗ > 10%: sai thời điểm mua (s.356)" : ""}.
                  </p>
                </>
              ) : <p className="text-[10px] text-slate-500">Chưa có pivot để lập kế hoạch (THEO DÕI: chờ mô hình nền hình thành).</p>}
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Card title="Sau phá vỡ (s.271–285)" right={row.monitor ? `${String(row.monitor.so_phien ?? 0)} phiên từ phá vỡ` : "chưa phá vỡ"}>
              {row.monitor ? (
                <div className="text-[10px] space-y-0.5" data-testid="sepa-monitor">
                  <div className="flex justify-between"><span className="text-slate-500">Lãi/lỗ so pivot</span><span className="font-mono text-slate-200">{fmtPct((num(row.monitor.lai_lo_hien_tai) ?? 0) * 100)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Squat (đóng cửa dưới pivot)</span><span className="text-slate-200">{row.monitor.squat ? `có · ${row.monitor.squat_bat_day ? "đã bật dậy" : "chưa bật dậy"}` : "không"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Phiên đóng cửa dưới MA20</span><span className="font-mono text-slate-200">{String(row.monitor.so_phien_duoi_MA20 ?? 0)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">"Quả bóng tennis" (s.282)</span><span className="text-slate-200">{row.monitor.qua_bong_tennis ? "có" : "chưa"}</span></div>
                  {(row.monitor.canh_bao ?? []).length > 0 && <ul className="text-[9px] text-rose-300 list-disc pl-4">{row.monitor.canh_bao!.map((w) => <li key={w}>{w}</li>)}</ul>}
                </div>
              ) : <p className="text-[10px] text-slate-500">Điểm mua: vượt pivot với KL tăng đáng kể (≥ 1,4× TB50), không đuổi quá pivot + 5% (s.265, s.270).</p>}
              {row.warnings.length > 0 && <ul className="mt-1.5 text-[9px] text-amber-300/90 list-disc pl-4" data-testid="sepa-warnings">{row.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
            </Card>
            <Card title="Toán học của dừng lỗ (Hình 13.2)" right="10 lệnh · lãi/lỗ 2:1">
              <RoiCurve stopPct={plan?.stopPct ?? null} />
              <p className="mt-1 text-[9px] text-slate-500">Tỷ lệ thắng dưới 50% thì không nới rộng dừng lỗ — đó là thực tế toán học (s.375).</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Card title="Khối lượng 30 phiên" right={vol ? `KL tăng/giảm 20 phiên ${vol.trend.upDownVolumeRatio20?.toFixed(2).replace(".", ",") ?? "—"}×` : undefined}>
              {vol ? <VolumeBars data={vol.trend} /> : <div className="text-[10px] text-slate-500 py-6 text-center">Đang tải khối lượng…</div>}
            </Card>
            <Card title="Khối ngoại 20 phiên" right={vol ? `5 phiên ${fmtBn(vol.foreign.net5Val)} · 20 phiên ${fmtBn(vol.foreign.net20Val)}` : undefined}>
              {vol ? <ForeignBars series={vol.foreign.netSeries20} /> : <div className="text-[10px] text-slate-500 py-6 text-center">Đang tải khối ngoại…</div>}
            </Card>
          </div>
        </>
      )}
      <p className="text-[9px] text-slate-600">
        Bấm lại mã hoặc Esc để đóng · {doc.disclaimer} · {series.priceBasis === "ADJUSTED_CUMULATIVE" ? "giá điều chỉnh cộng dồn" : series.priceBasis} · cùng engine với Gateway (khớp gói Python sepa_screener)
      </p>
    </div>
  );
}
