// Elliott Wave — giai đoạn 2 (E5): thẻ hai khung Tuần / Ngày + bảng phân tích chi tiết (phác đồ giá thật cạnh sơ đồ mẫu).
// Engine GET (quant-core/elliott) chạy trên trình duyệt từ chuỗi 750 phiên ngày; khung tuần gộp như biểu đồ W.
// Kết quả DIỄN GIẢI (INFERRED) và EXPERIMENTAL: kiểm định E4 không thấy lợi thế lợi suất (vnValidation.ts).
import { useState } from "react";
import { Eye, EyeOff, LineChart, Sparkles, X } from "lucide-react";
import ProvenanceBadge from "./ProvenanceBadge";
import ElliottSketch, { ElliottSchematic } from "./ElliottSketch";
import type { ElliottMtf } from "../../../lib/quant-core/elliott/mtf";
import type { ElliottState } from "../../../lib/quant-core/elliott";
import { ELLIOTT_VN_NOTE, ELLIOTT_VN_TABLES, ELLIOTT_VN_VALIDATION, oscCheckVnNote, type ElliottCheckKey } from "../../../lib/quant-core/elliott/vnValidation";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";

const CARD = { background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" } as const;
const fmtP = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("vi-VN"));
const pct = (v: number | null | undefined, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d).replace(".", ",")}%`);

export const CHECK_LABEL: Record<ElliottCheckKey, string> = {
  wave3Band: "Sóng 3: dao động vượt dải 80% (T-20)",
  wave3Strongest: "Sóng 3: dao động mạnh nhất (T-13)",
  wave4Osc: "Sóng 4: dao động về ≥ 90%, phía đối diện ≤ 38% (T-15/16)",
  wave5Divergence: "Sóng 5: phân kỳ dao động (T-19)",
};
const CHECK_KEYS = Object.keys(CHECK_LABEL) as ElliottCheckKey[];

function WeightBar({ w }: { w: number }) {
  return (
    <div title="Trọng số tương đối giữa các kịch bản sóng (softmax điểm mô hình) — không phải xác suất xảy ra">
      <div className="flex justify-between text-[9px] text-slate-500"><span>Trọng số tương đối (chưa hiệu chỉnh)</span><span className="font-mono text-slate-300">{Math.round(w * 100)}%</span></div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.round(w * 100)}%` }} /></div>
    </div>
  );
}

function Checks({ st }: { st: ElliottState }) {
  const ch = st.scenario?.checks;
  if (!ch) return null;
  const rows = CHECK_KEYS.filter((k) => ch[k]);
  if (!rows.length) return null;
  return (
    <ul className="flex flex-wrap gap-1" data-testid="elliott-checks">
      {rows.map((k) => (
        <li key={k} title={`${CHECK_LABEL[k]} — ${oscCheckVnNote(k, st.scenario)}`}
          className={`text-[8.5px] px-1.5 py-0.5 rounded border ${ch[k]!.pass ? "border-emerald-500/30 text-emerald-300" : "border-slate-700 text-slate-500"}`}>
          {ch[k]!.pass ? "✓" : "✗"} {k === "wave3Band" ? "DĐ3 > dải" : k === "wave3Strongest" ? "DĐ3 mạnh nhất" : k === "wave4Osc" ? "DĐ4 về 0" : "PK sóng 5"}
        </li>
      ))}
    </ul>
  );
}

function FrameRow({ tag, st, partial }: { tag: string; st: ElliottState | null; partial?: boolean }) {
  return (
    <div className="rounded-lg p-2 space-y-1" style={{ background: "rgba(148,163,184,0.04)" }} data-testid={`elliott-row-${tag === "Tuần" ? "W" : "D"}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{tag}</span>
        {partial && <span className="text-[8px] text-amber-300/80" title="Nến tuần cuối chưa đóng — cấu trúc tuần có thể đổi khi hết tuần">tuần chưa hết</span>}
      </div>
      {!st ? <p className="text-[10px] text-slate-500">Chưa đủ dữ liệu (cần ≥ 60 nến).</p> : (
        <>
          <p className={`text-[11px] font-bold leading-snug ${st.dir === "up" ? "text-emerald-300" : st.dir === "down" ? "text-rose-300" : "text-slate-400"}`}>{st.label}</p>
          {st.weight != null && <WeightBar w={st.weight} />}
          {st.invalidation && <p className="text-[9px] text-slate-400">Vô hiệu nếu giá {st.invalidation.side === "below" ? "thủng" : "vượt"} <span className="font-mono text-slate-200">{fmtP(st.invalidation.price)}</span></p>}
          <Checks st={st} />
        </>
      )}
    </div>
  );
}

interface CardProps {
  mtf: ElliottMtf | null;
  /** Khung biểu đồ đang xem — nút Gợi ý / lớp tự động dùng khung này (D hoặc W). */
  timeframe: string;
  autoOn: boolean;
  oscOn: boolean;
  onToggleAuto: () => void;
  onToggleOsc: () => void;
  onSuggest: () => void;
  detailOpen: boolean;
  onToggleDetail: () => void;
}

export default function ElliottWavePanel({ mtf, timeframe, autoOn, oscOn, onToggleAuto, onToggleOsc, onSuggest, detailOpen, onToggleDetail }: CardProps) {
  const frameOk = timeframe === "D" || timeframe === "W";
  const btn = (on: boolean) => `inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md border ${on ? "border-cyan-500/50 text-cyan-300 bg-cyan-500/10" : "border-slate-700 text-slate-400 hover:text-slate-200"}`;
  return (
    <div style={CARD} className="rounded-xl p-3 space-y-1.5" data-testid="elliott-panel">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1 flex-wrap">
        Elliott Wave <ProvenanceBadge kind="INFERRED" />
        <span className="ml-auto normal-case text-[8.5px] px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-300" title={ELLIOTT_VN_NOTE}>EXPERIMENTAL</span>
      </p>
      {!mtf ? <p className="text-[10px] text-slate-500">Đang tính…</p> : (
        <>
          <FrameRow tag="Tuần" st={mtf.week} partial={mtf.week?.partial} />
          <FrameRow tag="Ngày" st={mtf.day} />
          <p className="text-[9px] text-slate-400 leading-snug" data-testid="elliott-relation">{mtf.relationText}</p>
        </>
      )}
      <div className="flex flex-wrap gap-1 pt-0.5">
        <button type="button" onClick={onToggleAuto} aria-pressed={autoOn} className={btn(autoOn)} data-testid="elliott-toggle-auto">
          {autoOn ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}Trên biểu đồ
        </button>
        <button type="button" onClick={onToggleOsc} aria-pressed={oscOn} className={btn(oscOn)} data-testid="elliott-toggle-osc">
          {oscOn ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}Oscillator
        </button>
        <button type="button" onClick={onSuggest} disabled={!frameOk} className={btn(false)} data-testid="elliott-suggest"
          title={frameOk ? "Đưa đếm sóng của engine thành BẢN NHÁP hình vẽ tay — bạn chấp nhận hoặc huỷ" : "Gợi ý chỉ có trên khung D / W"}>
          <Sparkles className="w-3 h-3" />Gợi ý vẽ
        </button>
        <button type="button" onClick={onToggleDetail} aria-expanded={detailOpen} className={btn(detailOpen)} data-testid="elliott-open-detail">
          <LineChart className="w-3 h-3" />Phác đồ chi tiết
        </button>
      </div>
    </div>
  );
}

/** Bucket của tỷ lệ trong bảng (sách hoặc VN). */
function bucketOf(table: { max: number; p: number | null }[], r: number, f: (v: number) => string = (v) => pct(v)) {
  const k = table.findIndex((b) => r <= b.max);
  const lo = k > 0 ? table[k - 1].max : 0, hi = table[k]?.max ?? Infinity;
  return { range: hi === Infinity ? `> ${f(lo)}` : k === 0 ? `≤ ${f(hi)}` : `${f(lo)}–${f(hi)}`, p: table[k]?.p ?? null };
}
const times = (v: number) => `×${v.toFixed(2).replace(".", ",")}`;

interface DetailProps { mtf: ElliottMtf; daily: OhlcvBar[]; weekly: OhlcvBar[]; ticker: string; onClose: () => void }

export function ElliottDeepPanel({ mtf, daily, weekly, ticker, onClose }: DetailProps) {
  const [frame, setFrame] = useState<"W" | "D">(mtf.day?.scenario || !mtf.week?.scenario ? "D" : "W");
  const st = frame === "W" ? mtf.week : mtf.day;
  const bars = frame === "W" ? weekly : daily;
  const higher = frame === "D" && mtf.week?.scenario
    ? { points: mtf.weekPivotsOnDaily.map((p) => ({ date: p.dayDate, price: p.price })), labels: mtf.weekPivotsOnDaily.map((_, k) => `(${k})`) } : null;
  const sc = st?.scenario ?? null;
  const corr = sc?.correction ?? null;
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: "linear-gradient(180deg, rgba(2,132,199,0.07), rgba(2,6,15,0.2))", border: "1px solid rgba(148,163,184,0.1)" }} data-testid="elliott-deep-panel">
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-base font-black text-amber-400 tracking-wide">{ticker}</span>
        <span className="text-[10px] text-slate-400">Elliott Wave · engine GET · dữ liệu tới {mtf.day?.asOf ?? "—"}</span>
        <div className="flex gap-1 ml-auto" role="tablist">
          {(["W", "D"] as const).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={frame === f} onClick={() => setFrame(f)} data-testid={`elliott-frame-${f}`}
              className={`text-[10px] px-2 py-0.5 rounded-md border ${frame === f ? "border-cyan-500/50 text-cyan-300 bg-cyan-500/10" : "border-slate-700 text-slate-400"}`}>
              {f === "W" ? "Tuần" : "Ngày"}
            </button>
          ))}
          <button type="button" onClick={onClose} aria-label="Đóng phác đồ" className="p-1 rounded-md border border-slate-700 text-slate-400 hover:text-slate-200"><X className="w-3 h-3" /></button>
        </div>
      </header>
      <p className="text-[10px] text-slate-300 leading-snug">{mtf.relationText}</p>

      {!st || st.wave === "none" ? (
        <p className="text-[10px] text-slate-500 py-4 text-center">{st ? st.label : "Chưa đủ dữ liệu cho khung này."} — không vẽ cấu trúc cũ.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          <div className="lg:col-span-2 rounded-lg p-2" style={CARD}>
            <p className={`text-[11px] font-bold mb-1 ${st.dir === "up" ? "text-emerald-300" : "text-rose-300"}`}>{st.label}</p>
            <ElliottSketch bars={bars} state={st} higher={higher} ticker={ticker} frame={frame} />
          </div>
          <div className="space-y-2">
            <div className="rounded-lg p-2" style={CARD}>
              <p className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Sơ đồ mẫu (sách)</p>
              <ElliottSchematic wave={st.wave} dir={st.dir} />
            </div>
            {st.weight != null && <div className="rounded-lg p-2" style={CARD}><WeightBar w={st.weight} />
              {st.alternatives.length > 0 && <ul className="text-[9px] text-slate-400 mt-1 space-y-0.5">{st.alternatives.map((a) => <li key={a.label}>Phương án khác: {a.label}{a.weight != null ? ` · trọng số ${Math.round(a.weight * 100)}%` : ""}</li>)}</ul>}
            </div>}
          </div>
        </div>
      )}

      {sc && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px]">
          <div className="rounded-lg p-2 space-y-1" style={CARD} data-testid="elliott-osc-checks">
            <p className="text-[9px] font-semibold text-slate-400 uppercase">Điều kiện dao động (sách) · tỷ lệ VN</p>
            {CHECK_KEYS.filter((k) => sc.checks[k]).map((k) => (
              <div key={k}>
                <span className={sc.checks[k]!.pass ? "text-emerald-300" : "text-slate-500"}>{sc.checks[k]!.pass ? "✓" : "✗"} {CHECK_LABEL[k]}</span>
                <div className="text-[8.5px] text-slate-500">{oscCheckVnNote(k, sc)}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-2" style={CARD} data-testid="elliott-ratios">
            <p className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Tỷ lệ sóng · sách vs VN</p>
            <table className="w-full text-[9.5px]">
              <thead><tr className="text-slate-500"><th className="text-left font-normal">Sóng</th><th className="text-right font-normal">Tỷ lệ</th><th className="text-right font-normal">Khoảng</th><th className="text-right font-normal">Sách</th><th className="text-right font-normal">VN</th></tr></thead>
              <tbody>
                {(["w2", "w3", "w4"] as const).map((k) => {
                  const r = sc.ratios[k], f = k === "w3" ? times : (v: number) => pct(v), b = bucketOf(ELLIOTT_VN_TABLES[k], r, f), book = sc.stats?.[k]?.pct ?? null;
                  return (
                    <tr key={k} className="text-slate-300">
                      <td>{k === "w2" ? "2 / 1" : k === "w3" ? "3 / 1" : "4 / 3"}</td>
                      <td className="text-right font-mono">{f(r)}</td>
                      <td className="text-right text-slate-500">{b.range}</td>
                      <td className="text-right font-mono">{book == null ? "—" : `${book}%`}</td>
                      <td className="text-right font-mono">{pct(b.p)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[8.5px] text-slate-500 mt-1">VN: 1.553 xung lực (225 mã, 2023–2026). Sóng 2 trên VN thường hồi sâu hơn sách.</p>
          </div>
          <div className="rounded-lg p-2 space-y-0.5" style={CARD} data-testid="elliott-levels">
            <p className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Mức giá</p>
            {st!.levels.map((l) => <div key={l.label} className="flex justify-between gap-2"><span className="text-slate-400 truncate">{l.label}</span><span className="font-mono text-slate-200">{fmtP(l.price)}</span></div>)}
            {corr && (
              <p className="text-[9px] text-slate-400 pt-1">
                Điều chỉnh: <span className="text-slate-200">{corr.kind}</span>
                {corr.aWaves != null && ` · sóng A ${corr.aWaves} sóng con`}
                {corr.structureOk === false && " · cấu trúc A không khớp loại"}
                {corr.cDivergence && ` · ${corr.cDivergence.pass ? "C phân kỳ" : "C chưa phân kỳ"}`}
              </p>
            )}
          </div>
        </div>
      )}

      <details className="rounded-lg p-2 text-[9.5px]" style={CARD} data-testid="elliott-validation">
        <summary className="cursor-pointer text-slate-300 font-semibold">Kiểm định trên dữ liệu VN (đặt trước) — không tín hiệu nào có lợi thế</summary>
        <ul className="mt-1 space-y-0.5">
          {Object.entries(ELLIOTT_VN_VALIDATION).map(([k, v]) => (
            <li key={k}><span className={`font-mono mr-1 ${v.status === "PASS" ? "text-emerald-300" : v.status === "FAIL" ? "text-rose-300" : "text-amber-300"}`}>{k}</span><span className="text-slate-400">{v.summary}</span></li>
          ))}
        </ul>
      </details>
      <p className="text-[8.5px] text-slate-500">{ELLIOTT_VN_NOTE}</p>
    </div>
  );
}
