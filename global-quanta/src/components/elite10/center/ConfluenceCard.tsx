// HL-v1 (12/11/2026) — khối "Hợp lưu đa yếu tố" trong Hồ sơ 360°: quy tắc lọc / xếp hạng của chủ dự án.
//   Tầng 1 (ưu tiên đầu tiên): LS-v1 + các mô hình TA · Tầng 2: RRG ngành (Cải thiện / Dẫn dắt ủng hộ; Suy yếu / Tụt hậu phản đối)
//   · Tầng 3: tích điểm yếu tố các tab. Nhãn THĂM DÒ; không thay Điểm Elite / Danh mục Elite 10.
import { useMemo } from "react";
import { useElitePanel } from "../../../hooks/elite10/useEliteCenter";
import { HL_CLASS_VI, HL_EVIDENCE_VI, HL_RULES, HL_VERSION, hlScores, type HlClass } from "../../../lib/elite10/confluence";

const num = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d }));
const CLS_TONE: Record<HlClass, string> = {
  STRONG: "border-emerald-400/60 bg-emerald-500/15 text-emerald-200", CONFLUENCE: "border-emerald-400/40 text-emerald-300",
  T1_SECTOR_AGAINST: "border-amber-400/50 text-amber-300", T1_SECTOR_NA: "border-amber-400/30 text-amber-200", NOT_T1: "border-slate-500/50 text-slate-400",
};
const RRG_VI: Record<string, string> = { "2": "Dẫn dắt", "1": "Cải thiện", "-1": "Suy yếu", "-2": "Tụt hậu" };
const mark = (ok: boolean | null) => (ok === null ? "·" : ok ? "✓" : "✗");
const ptsTxt = (p: number) => (p > 0 ? `+${p}` : String(p));

export default function ConfluenceCard({ ticker }: { ticker: string }) {
  const { data: panel } = useElitePanel();
  const all = useMemo(() => (panel ? hlScores(panel.rows) : null), [panel]);
  const r = all?.get(ticker);
  if (!panel || !r) return null;
  const selected = [...all!.values()].filter((x) => x.cls === "STRONG" || x.cls === "CONFLUENCE").length;
  const byTab = new Map<string, typeof r.factors>();
  for (const f of r.factors) { if (!byTab.has(f.tab)) byTab.set(f.tab, []); byTab.get(f.tab)!.push(f); }
  return (
    <div className="rounded-md border border-emerald-400/25 bg-emerald-500/[0.03] p-2 text-[10.5px]" data-testid="elite-confluence">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase text-emerald-300">Hợp lưu đa yếu tố ({HL_VERSION}) — phiên {panel.date.split("-").reverse().join("/")}</p>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded border px-1.5 py-0.5 font-bold ${CLS_TONE[r.cls]}`} data-testid="elite-confluence-class">{HL_CLASS_VI[r.cls]}</span>
          <span className="rounded border border-white/15 px-1.5 py-0.5 text-slate-300" data-testid="elite-confluence-rank">Hạng hợp lưu <b>{r.rank}</b>/{all!.size}</span>
          <span className="rounded border border-slate-500/50 px-1.5 py-0.5 text-[10px] text-slate-400">THĂM DÒ</span>
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-1 gap-2 md:grid-cols-3">
        <div data-testid="elite-confluence-t1">
          <p className="text-[10px] font-bold uppercase text-slate-500">Tầng 1 · Dẫn dắt + mô hình TA <span className={r.pass1 ? "text-emerald-300" : "text-slate-400"}>— {r.pass1 ? "ĐẠT" : "chưa đạt"} · {r.t1}/10 điểm</span></p>
          <p className="text-slate-300">LS-v1 phân vị <b>{num(r.lsPct)}</b> <span className="text-slate-500">(cần ≥ {HL_RULES.lsLeaderPct}) · {r.lsPts} điểm</span></p>
          <p className="text-slate-300">Mô hình TA đạt <b>{r.taCount}</b>/{r.taKnown || r.taModels.length} <span className="text-slate-500">(cần ≥ {HL_RULES.taMin}) · {r.taPts} điểm</span></p>
          <ul className="mt-0.5 space-y-0.5">
            {r.taModels.map((m) => <li key={m.id} className={m.ok === true ? "text-emerald-300" : m.ok === false ? "text-slate-500" : "text-slate-600"}>{mark(m.ok)} {m.label}{m.ok === null ? " — chưa có dữ liệu" : ""}</li>)}
          </ul>
        </div>
        <div data-testid="elite-confluence-t2">
          <p className="text-[10px] font-bold uppercase text-slate-500">Tầng 2 · RRG ngành</p>
          <p className={r.t2 > 0 ? "text-emerald-300" : r.t2 < 0 ? "text-rose-300" : "text-slate-400"}>
            {r.rrg == null ? "Chưa có góc phần tư RRG cho ngành của mã" : <>Ngành ở góc <b>{RRG_VI[String(r.rrg)] ?? r.rrg}</b> — {r.t2 > 0 ? "ỦNG HỘ" : r.t2 < 0 ? "PHẢN ĐỐI" : "trung tính"}</>}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">Quy tắc: Cải thiện / Dẫn dắt = ủng hộ; Suy yếu / Tụt hậu = phản đối.</p>
          <p className="mt-1 text-[10px] text-slate-500">Hôm nay {selected}/{all!.size} mã đạt tầng 1 và có RRG ủng hộ.</p>
        </div>
        <div data-testid="elite-confluence-t3">
          <p className="text-[10px] font-bold uppercase text-slate-500">Tầng 3 · Tích điểm các tab <span className={r.t3 > 0 ? "text-emerald-300" : r.t3 < 0 ? "text-rose-300" : "text-slate-400"}>— {ptsTxt(r.t3)} điểm</span></p>
          {[...byTab].map(([tab, fs]) => (
            <p key={tab} className="text-slate-300"><span className="text-slate-500">{tab}:</span>{" "}
              {fs.map((f, i) => <span key={f.id} title={f.label} className={f.pts > 0 ? "text-emerald-300" : f.pts < 0 ? "text-rose-300" : "text-slate-500"}>{i ? " · " : ""}{f.label.split(" (")[0]} {ptsTxt(f.pts)}</span>)}
            </p>
          ))}
          {r.factors.length === 0 && <p className="text-slate-500">Chưa có yếu tố nào có dữ liệu.</p>}
        </div>
      </div>
      <p className="mt-1 text-[10px] text-slate-500" data-testid="elite-confluence-evidence">{HL_EVIDENCE_VI}</p>
    </div>
  );
}
