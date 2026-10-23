// DW4 — hiển thị mô hình Elliott theo danh mục quy tắc (patterns.ts): chip gọn trên thẻ + bảng quy tắc trong phác đồ chi tiết.
// Thẻ mô hình là DIỄN GIẢI theo quy tắc, không phải tín hiệu (EXPERIMENTAL — Elliott chưa có lợi thế ngoài mẫu trên VN).
import type { ElliottPatterns, ElliottState, SegmentPattern } from "../../../lib/quant-core/elliott";
import { DW4_VALIDATION, PATTERN_NAME } from "../../../lib/quant-core/elliott/patterns";

const CARD = { background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" } as const;

type Row = { key: string; label: string; seg: SegmentPattern; extra?: string };
function rowsOf(p: ElliottPatterns): Row[] {
  const out: Row[] = [];
  if (p.motive) out.push({ key: "motive", label: "Sóng đẩy 0→5", seg: p.motive });
  if (p.wave2) out.push({ key: "wave2", label: "Sóng 2", seg: p.wave2, extra: p.wave2.alt });
  if (p.wave4) out.push({ key: "wave4", label: "Sóng 4", seg: p.wave4, extra: p.wave4.alt });
  if (p.correction) out.push({ key: "correction", label: "Điều chỉnh sau sóng 5", seg: p.correction });
  return out;
}

export function PatternChips({ st }: { st: ElliottState | null }) {
  const p = st?.patterns;
  if (!p) return null;
  const rows = rowsOf(p);
  if (!rows.length) return null;
  return (
    <ul className="flex flex-wrap gap-1" data-testid="elliott-pattern-chips">
      {rows.map((r) => (
        <li key={r.key} title={r.seg.best ? `${r.label}: ${r.seg.best.name}` : `${r.label}: chưa khớp mô hình nào theo quy tắc`}
          className={`text-[8.5px] px-1.5 py-0.5 rounded border ${r.seg.best ? "border-amber-500/30 text-amber-200" : "border-slate-700 text-slate-500"}`}>
          {r.key === "motive" ? "" : `${r.label.replace("Điều chỉnh sau sóng 5", "ĐC")} `}{r.seg.best?.tag ?? "?"}{r.extra ? ` · ${r.extra}` : ""}
        </li>
      ))}
      {!p.consistent && <li className="text-[8.5px] px-1.5 py-0.5 rounded border border-rose-500/40 text-rose-300" title="Có đỉnh/đáy sóng không phải cực trị của đoạn kề bên">⚠ không nhất quán</li>}
      {p.alternationOk != null && (
        <li className={`text-[8.5px] px-1.5 py-0.5 rounded border ${p.alternationOk ? "border-emerald-500/30 text-emerald-300" : "border-slate-700 text-slate-500"}`}
          title="Luân phiên (T-31): sóng 2 và sóng 4 khác dạng — một Sharp, một Sideways">
          {p.alternationOk ? "✓" : "✗"} luân phiên
        </li>
      )}
    </ul>
  );
}

export function PatternRules({ st }: { st: ElliottState | null }) {
  const p = st?.patterns;
  if (!p) return null;
  const rows = rowsOf(p);
  if (!rows.length) return null;
  return (
    <div className="rounded-lg p-2 space-y-2" style={CARD} data-testid="elliott-pattern-rules">
      <p className="text-[9px] font-semibold text-slate-400 uppercase">Mô hình theo danh mục quy tắc · quy tắc cứng loại bỏ, hướng dẫn mềm xếp hạng</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {rows.map((r) => {
          const shown = r.seg.best ?? r.seg.fits[0] ?? null;
          const others = r.seg.fits.filter((f) => f !== shown && f.valid).map((f) => f.tag);
          return (
            <div key={r.key} className="space-y-0.5" data-testid={`elliott-pattern-${r.key}`}>
              <p className="text-[10px] text-slate-200">
                <span className="text-slate-400">{r.label}:</span>{" "}
                {shown ? <><b className={r.seg.best ? "text-amber-300" : "text-slate-500"}>{shown.tag}</b> {PATTERN_NAME[shown.tag]}{!r.seg.best && " — không đạt quy tắc cứng"}</> : "chưa đủ sóng con để phân loại"}
                {r.extra && <span className="ml-1 text-[9px] text-cyan-300">({r.extra})</span>}
              </p>
              {shown && (
                <ul className="text-[9px] space-y-0.5">
                  {shown.rules.map((x) => (
                    <li key={x.id} className={x.pass === false ? (x.severity === "hard" ? "text-rose-300" : "text-slate-500") : x.pass ? "text-emerald-300/90" : "text-slate-500"}>
                      {x.pass === false ? "✗" : x.pass ? "✓" : "…"} {x.severity === "hard" ? "[cứng]" : "[mềm]"} {x.text}
                    </li>
                  ))}
                </ul>
              )}
              {others.length > 0 && <p className="text-[8.5px] text-slate-500">Cũng hợp lệ: {others.join(", ")}</p>}
            </div>
          );
        })}
      </div>
      {!p.consistent && <p className="text-[9px] text-rose-300" data-testid="elliott-pattern-inconsistent">⚠ Cách đếm này không nhất quán với giá: có đỉnh/đáy sóng không phải cực trị của đoạn kề bên — nên xem phương án khác.</p>}
      <p className="text-[8.5px] text-slate-500 leading-snug">{DW4_VALIDATION.summary}</p>
    </div>
  );
}
