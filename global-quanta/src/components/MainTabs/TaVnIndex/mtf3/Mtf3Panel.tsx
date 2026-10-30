// MTF v3 · S6 — bảng Cấu trúc thị trường Ngày · Tuần · Tháng (thay bảng MTF v2). Gọn theo tab để không rối mắt:
//   Tổng quan        — lớp quyết định + ma trận ba khung (giai đoạn · Dow · xếp lớp EMA · pha dải) + mức giá gần nhất.
//   Xu hướng · Dow   — dải EMA21/50/100/MA200 + cấu trúc Dow / giai đoạn từng khung + "chân dưới đổi theo chân trên".
//   Elliott          — hợp lưu Elliott Pro × dải EMA.
//   Nền · mức giá    — vùng củng cố, VCP, pivot, mô hình trên nền + thang hỗ trợ / kháng cự ba khung.
//   Kiểm định        — trạng thái kiểm định đặt trước MTF-v3 (H1–H6) + sổ thời gian thực M1 (giữ từ v2).
// Phát lại: tài liệu được tính lại trên trình duyệt bằng CÙNG hàm buildStructure3 của Gateway, chỉ với dữ liệu tới phiên chọn.
import { useState } from "react";
import { ChevronLeft, ChevronRight, History, Layers3 } from "lucide-react";
import type { Structure3Doc, Tf3 } from "../../../../hooks/useStructure3";
import type { StructureMomentumStats } from "../../../../hooks/useStructure";
import { STRUCTURE_MODES, type StructureMode } from "../../../../lib/ta-command-center/chart/structureScene";
import DecisionCard from "./DecisionCard";
import RibbonStrip from "./RibbonStrip";
import StructureFrames, { STAGE_STYLE } from "./StructureFrames";
import ElliottConfluence from "./ElliottConfluence";
import BasePanel from "./BasePanel";

export interface ReplayControl { index: number | null; min: number; max: number; date: string | null; available: boolean; onChange: (i: number | null) => void }
type TabKey = "overview" | "trend" | "elliott" | "bases" | "evidence";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Tóm tắt" }, { key: "trend", label: "Xu hướng · Dow" }, { key: "elliott", label: "Elliott" }, { key: "bases", label: "Nền · mức giá" }, { key: "evidence", label: "Kiểm định" },
];
const TAB_KEY = "gq:mtf3Tab";
const TF_NAME: Record<Tf3, string> = { D: "Ngày", W: "Tuần", M: "Tháng" };
const price = (x: number | null | undefined) => (x == null ? "—" : x.toLocaleString("vi-VN", { maximumFractionDigits: x < 100 ? 2 : 0 }));
const pctS = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}%`);
const readTab = (): TabKey => { try { const v = localStorage.getItem(TAB_KEY); return TABS.some((t) => t.key === v) ? (v as TabKey) : "overview"; } catch { return "overview"; } };

/** Thanh phát lại: chọn phiên trong quá khứ, cấu trúc tính lại chỉ với dữ liệu tới phiên đó (không nhìn trước). */
export function ReplayBar({ r }: { r: ReplayControl }) {
  if (!r.available) return null;
  const on = r.index != null;
  const step = (k: number) => r.onChange(Math.min(r.max, Math.max(r.min, (r.index ?? r.max) + k)));
  return (
    <div className={`flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1 ${on ? "bg-amber-500/10 border border-amber-400/30" : ""}`} data-testid="structure-replay">
      <button type="button" onClick={() => r.onChange(on ? null : Math.max(r.min, r.max - 60))} aria-pressed={on}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${on ? "text-amber-200 border-amber-400/50" : "text-slate-400 border-slate-700/60"}`}
        title="Xem cấu trúc như tại một phiên trong quá khứ rồi đối chiếu với diễn biến thực tế phía sau">
        <History className="w-3 h-3" /> {on ? "Thoát phát lại" : "Phát lại"}
      </button>
      {on && (
        <>
          <button type="button" onClick={() => step(-1)} aria-label="Lùi 1 phiên" className="text-amber-200"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <input type="range" min={r.min} max={r.max} value={r.index ?? r.max} onChange={(e) => r.onChange(Number(e.target.value))} aria-label="Chọn phiên phát lại" className="w-32 sm:w-56 accent-amber-400" />
          <button type="button" onClick={() => step(1)} aria-label="Tiến 1 phiên" className="text-amber-200"><ChevronRight className="w-3.5 h-3.5" /></button>
          <span className="text-[10px] font-mono text-amber-200">{r.date}</span>
          <span className="text-[9px] text-slate-500">· chỉ dùng dữ liệu tới phiên này</span>
        </>
      )}
    </div>
  );
}

/** Sổ thời gian thực M1 "Đà tăng tiếp diễn" (MTF-momentum-prereg, giữ từ v2 — đang tích luỹ mẫu tới ~05/2027). */
export function MomentumLedgerCard({ m }: { m: StructureMomentumStats | null }) {
  if (!m) return <p className="text-[9px] text-slate-500">Sổ “đà tăng tiếp diễn” bắt đầu ghi ở job 15:47 phiên đầu tiên sau triển khai.</p>;
  const prog = Math.min(1, m.scoredDays / m.minDays);
  const tone = m.verdict === "PASS" ? "text-emerald-300" : m.verdict === "FAIL" ? "text-rose-300" : "text-amber-300";
  return (
    <div className="rounded-md p-2 space-y-1" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.18)" }} data-testid="structure-momentum-ledger">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9.5px] font-bold text-amber-200">Sổ thời gian thực · M1 “Đà tăng tiếp diễn”</span>
        <span className={`text-[8.5px] font-bold ${tone}`} data-testid="structure-momentum-label">{m.label}</span>
      </div>
      <p className="text-[9px] text-slate-400 leading-snug">Mỗi phiên, trong các mã đang tăng: nhóm có cờ Quá đà so với nhóm không có — lợi suất vượt trội 20 phiên kế tiếp. Đặt trước, chỉ chấm dữ liệu từ {m.firstDay ?? "phiên đầu tiên"}; chưa dùng vào kết luận.</p>
      <div className="h-1.5 rounded bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={m.scoredDays} aria-valuemax={m.minDays} aria-label="Tiến độ sổ"><div className="h-full bg-amber-400/70" style={{ width: `${prog * 100}%` }} /></div>
      <div className="text-[9px] text-slate-300 font-mono">{m.scoredDays}/{m.minDays} phiên đã chấm · {m.pendingDays} phiên chờ đủ 20 phiên{m.lastGroup ? ` · hôm ${m.lastGroup.d}: ${m.lastGroup.on} mã BẬT / ${m.lastGroup.off} TẮT` : ""}</div>
      {m.scoredDays > 0 && <div className="text-[9px] text-slate-300">BẬT − TẮT: <b className="font-mono">{pctS(m.meanS)}</b> {m.ciS ? <span className="text-slate-500">[{pctS(m.ciS[0])}; {pctS(m.ciS[1])}]</span> : null} · sau phí {pctS(m.meanL)} · {m.scoredDays < m.minDays ? "chưa đủ mẫu — không kết luận" : ""}</div>}
    </div>
  );
}

const PREREG: { key: string; text: string }[] = [
  { key: "H1", text: "Vào giai đoạn 2 (Trend Template EMA21/50/100 + MA200), Tuần trên EMA21 — 40 phiên" },
  { key: "H2", text: "Chân dưới đổi theo chân trên: Tuần tăng + Ngày CHoCH↑ sau khi chạm dải EMA21–50 — 20 phiên" },
  { key: "H3", text: "Phá vỡ nền (VCP / nền phẳng) trong giai đoạn 2, nền ≤ 3 — 20 phiên" },
  { key: "H4", text: "Nén → mở rộng theo xếp lớp tăng, Tuần không giảm — 20 phiên" },
  { key: "H5", text: "Cổng cấm vào có giá trị: nhóm bị chặn kém hơn nhóm được phép" },
  { key: "H6", text: "Hợp lưu Elliott: sóng 2 kết thúc trong Fib và dải EMA50–100 — 20 phiên" },
];

function Overview({ doc }: { doc: Structure3Doc }) {
  const st = doc.structure?.context, rb = doc.ribbon?.context, lv = doc.bases?.levels ?? [], close = rb?.D.close ?? null;
  const sup = lv.filter((l) => l.role === "support").sort((a, b) => b.price - a.price)[0], res = lv.filter((l) => l.role === "resistance").sort((a, b) => a.price - b.price)[0];
  const order = (o: number | null) => (o == null ? "—" : o === 1 ? "Xếp lớp tăng" : o === -1 ? "Xếp lớp giảm" : `Đan xen (τ ${o.toLocaleString("vi-VN", { maximumFractionDigits: 2 })})`);
  const phase: Record<string, string> = { squeeze: "Nén", expanding: "Đang mở rộng", extended: "Mở hết", normal: "Bình thường", na: "—" };
  return (
    <div className="space-y-2">
      {doc.decision && <DecisionCard d={doc.decision} />}
      {st && rb && (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]" style={{ borderCollapse: "collapse", minWidth: 420 }} data-testid="mtf3-matrix">
            <thead><tr className="text-left text-[9px] text-slate-500"><th className="py-1 pr-2 font-normal" />{(["D", "W", "M"] as Tf3[]).map((k) => <th key={k} className="pr-2 font-bold text-slate-300">{TF_NAME[k]}</th>)}</tr></thead>
            <tbody>
              <tr className="border-t border-white/5"><td className="py-1 pr-2 text-slate-500">Giai đoạn</td>{(["D", "W", "M"] as Tf3[]).map((k) => <td key={k} className="pr-2"><span className={`rounded border px-1.5 py-0.5 text-[9.5px] font-bold ${STAGE_STYLE[st[k].stage].cls}`}>{STAGE_STYLE[st[k].stage].short}</span></td>)}</tr>
              <tr className="border-t border-white/5"><td className="py-1 pr-2 text-slate-500">Dow</td>{(["D", "W", "M"] as Tf3[]).map((k) => <td key={k} className="pr-2 text-slate-200" title={st[k].dowLabel}>{st[k].dowLabel.split(" (")[0]}</td>)}</tr>
              <tr className="border-t border-white/5"><td className="py-1 pr-2 text-slate-500">Dải EMA</td>{(["D", "W", "M"] as Tf3[]).map((k) => <td key={k} className={`pr-2 ${rb[k].order === 1 ? "text-emerald-300" : rb[k].order === -1 ? "text-rose-300" : "text-slate-300"}`}>{order(rb[k].order)}</td>)}</tr>
              <tr className="border-t border-white/5"><td className="py-1 pr-2 text-slate-500">Pha dải</td>{(["D", "W", "M"] as Tf3[]).map((k) => <td key={k} className="pr-2 text-slate-300">{phase[rb[k].phase]}{rb[k].over ? (rb[k].over > 0 ? " · quá đà tăng" : " · quá đà giảm") : ""}</td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400" data-testid="mtf3-near-levels">
        <span>Hỗ trợ gần nhất <b className="text-emerald-200">{price(sup?.price)}</b>{sup && close ? ` (${(((sup.price / close) - 1) * 100).toFixed(1).replace(".", ",")}%)` : ""}</span>
        <span>Kháng cự gần nhất <b className="text-rose-200">{price(res?.price)}</b>{res && close ? ` (+${(((res.price / close) - 1) * 100).toFixed(1).replace(".", ",")}%)` : ""}</span>
        {st?.trigger.side && <span className={st.trigger.side === "L" ? "text-emerald-300" : "text-rose-300"}>Chân dưới vừa đổi theo chân trên ({st.trigger.side === "L" ? "tăng" : "giảm"})</span>}
      </div>
    </div>
  );
}

export interface Mtf3PanelProps {
  doc?: Structure3Doc; isLoading?: boolean; error?: Error;
  mode: StructureMode; onModeChange: (m: StructureMode) => void;
  replay?: ReplayControl; momentum?: StructureMomentumStats | null;
}

export default function Mtf3Panel({ doc, isLoading, error, mode, onModeChange, replay, momentum = null }: Mtf3PanelProps) {
  const [tab, setTabState] = useState<TabKey>(readTab);
  const setTab = (t: TabKey) => { setTabState(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* bỏ qua */ } };
  if (error) return <div className="rounded-xl p-3 text-[11px] text-rose-300" style={{ background: "rgba(2,6,15,0.5)", border: "1px solid rgba(255,0,85,0.2)" }}>Không tải được cấu trúc: {error.message}</div>;
  if (!doc) return <div className="rounded-xl p-3 text-[11px] text-slate-400" style={{ background: "rgba(2,6,15,0.5)", border: "1px solid rgba(148,163,184,0.1)" }} data-testid="structure-loading">{isLoading ? "Đang phân tích cấu trúc Ngày · Tuần · Tháng…" : "Chưa có dữ liệu cấu trúc."}</div>;
  const replaying = replay?.index != null;
  return (
    <div className="space-y-2 rounded-xl p-2.5" style={{ background: "linear-gradient(180deg, rgba(34,211,238,0.05), rgba(2,6,15,0.35))", border: "1px solid rgba(34,211,238,0.14)" }} data-testid="structure-panel">
      <header className="flex flex-wrap items-center gap-1.5">
        <Layers3 className="w-3.5 h-3.5 text-cyan-300" />
        <span className="text-[11px] font-bold text-slate-200 mr-1" data-testid="mtf3-title">Cấu trúc MTF v3</span>
        <span className="text-[9px] text-slate-500 mr-1">Ngày · Tuần · Tháng · EMA21/50/100 · MA200 · Dow · Minervini · Elliott</span>
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-700/60 bg-slate-900/50 p-0.5" role="group" aria-label="Mức chi tiết lớp vẽ trên biểu đồ">
          <span className="px-1 text-[9px] text-slate-500">Lớp vẽ:</span>
          {STRUCTURE_MODES.map((m) => (
            <button key={m.key} type="button" onClick={() => onModeChange(m.key)} title={`Lớp vẽ trên biểu đồ: ${m.hint}`} aria-pressed={mode === m.key} data-structure-mode={m.key}
              className={`px-2 py-0.5 rounded text-[9.5px] font-bold transition ${mode === m.key ? "bg-cyan-500/20 text-cyan-100" : "text-slate-400 hover:text-slate-200"}`}>{m.label}</button>
          ))}
        </span>
        <span className="ml-auto text-[9px] text-slate-500">{replaying ? `phát lại ${doc.asOf}` : doc.asOf} · engine {doc.version}</span>
      </header>
      {replay && <ReplayBar r={replay} />}
      {replaying && <p className="text-[10px] text-amber-200/90 rounded-lg px-2 py-1 bg-amber-500/5" data-testid="structure-replay-note">Đang phát lại tại phiên {doc.asOf}: mọi thứ dưới đây là những gì hệ thống thấy LÚC ĐÓ (tính lại trên trình duyệt, không có Elliott). Nến sau đường “Phát lại” là diễn biến thực tế để đối chiếu.</p>}
      <div role="tablist" aria-label="Phần của bảng cấu trúc" className="flex flex-wrap gap-1 border-b border-white/5 pb-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} data-testid={`mtf3-tab-${t.key}`}
            className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition ${tab === t.key ? "bg-cyan-500/15 text-cyan-100" : "text-slate-400 hover:text-slate-200"}`}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "overview" && <Overview doc={doc} />}
        {tab === "trend" && (
          <div className="space-y-2">
            {doc.ribbon?.context && <RibbonStrip ctx={doc.ribbon.context} />}
            {doc.structure?.context && <StructureFrames ctx={doc.structure.context} />}
          </div>
        )}
        {tab === "elliott" && (doc.elliott && !("error" in doc.elliott) ? <ElliottConfluence e={doc.elliott} /> : <p className="text-[10px] text-slate-500">{replaying ? "Elliott không tính trong chế độ phát lại." : "Chưa đếm được sóng Elliott cho mã này."}</p>)}
        {tab === "bases" && doc.bases && <BasePanel D={doc.bases.D} W={doc.bases.W} levels={doc.bases.levels} close={doc.ribbon?.context?.D.close ?? null} />}
        {tab === "evidence" && (
          <div className="space-y-2" data-testid="mtf3-evidence">
            <p className="text-[10px] text-slate-400 leading-snug">Kiểm định đặt trước <b className="text-slate-200">MTF-v3</b> (viết TRƯỚC khi có dữ liệu): VNDirect 2013 → 2026 kể cả mã đã huỷ niêm yết, trong mẫu ≤ 2020, ngoài mẫu ≥ 2021, phí 0,6%, BH-FDR q = 0,10. Chỉ thành phần ĐẠT mới được gắn nhãn “ĐÃ KIỂM ĐỊNH”.</p>
            <ul className="space-y-0.5">
              {PREREG.map((h) => <li key={h.key} className="flex gap-2 text-[10px]"><b className="w-6 text-slate-300">{h.key}</b><span className="flex-1 text-slate-400">{h.text}</span><span className="text-amber-300">chưa chạy (S7)</span></li>)}
            </ul>
            <MomentumLedgerCard m={momentum} />
          </div>
        )}
      </div>
    </div>
  );
}
