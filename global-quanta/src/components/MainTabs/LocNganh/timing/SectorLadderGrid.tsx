// Lưới thang kỳ hạn ngành (LD1): một hàng mỗi ngành, sáu nấc 1, 5, 20 phiên và 8, 13, 26 tuần, cùng công thức trên cùng chỉ số ngành.
// Nền ô theo Z (hai màu, giữa là trung tính), chữ giữ màu thường; luôn có số nên không phụ thuộc màu. Chỉ mô tả, không phải tín hiệu.
import { useMemo, useState } from "react";
import type { SectorLadderDoc, SectorLadderRow, SectorLadderRung, SectorStructureKey } from "../../../../lib/locnganh/types";

const COLS: { h: number; label: string }[] = [{ h: 1, label: "1 phiên" }, { h: 5, label: "5 phiên" }, { h: 20, label: "20 phiên" }, { h: 40, label: "8 tuần" }, { h: 65, label: "13 tuần" }, { h: 130, label: "26 tuần" }];
const STRUCTURE_RANK: Record<SectorStructureKey, number> = { UP_ALIGNED: 0, PULLBACK: 1, MIXED: 2, BOUNCE: 3, DOWN_ALIGNED: 4, INSUFFICIENT: 5 };
const STRUCTURE_COLOR: Record<SectorStructureKey, string> = { UP_ALIGNED: "#22c55e", PULLBACK: "#38bdf8", MIXED: "#94a3b8", BOUNCE: "#f59e0b", DOWN_ALIGNED: "#f87171", INSUFFICIENT: "#64748b" };
const vn = (v: number, d = 1) => v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (v: number | null, d = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${vn(v, d)}`);

/** Nền theo Z: đậm dần tới |Z| = 2, giữa trong suốt. */
export function zBackground(z: number | null): string | undefined {
  if (z == null) return undefined;
  const a = Math.min(Math.abs(z) / 2, 1) * 0.42;
  return z >= 0 ? `rgba(34,197,94,${a.toFixed(3)})` : `rgba(248,113,113,${a.toFixed(3)})`;
}

function Cell({ r, muted }: { r: SectorLadderRung | undefined; muted: boolean }) {
  const title = r ? `RS ${signed(r.rs, 2)} điểm % · Z ${signed(r.z, 2)}${r.beat != null ? ` · ${vn(r.beat, 0)}% mã vượt VN-Index (${r.n} mã, KTC 95% ${vn(r.lo ?? 0, 0)}–${vn(r.hi ?? 0, 0)}%)` : ` · ${r.n} mã, chưa đủ để tính độ tham gia`}` : undefined;
  return (
    <td title={title} data-testid="ladder-cell" style={{ padding: "4px 6px", textAlign: "right", whiteSpace: "nowrap", background: muted ? undefined : zBackground(r?.z ?? null), opacity: muted ? 0.75 : 1, fontVariantNumeric: "tabular-nums" }}>
      <span style={{ display: "block", fontWeight: 600, color: "var(--text-primary, #e2e8f0)" }}>{signed(r?.rs ?? null)}</span>
      <span style={{ display: "block", fontSize: 11, color: "var(--text-secondary)" }}>{r?.beat != null ? `${vn(r.beat, 0)}% mã` : "—"}</span>
    </td>
  );
}

export default function SectorLadderGrid({ doc, level, openSector = null, onSelectSector }: { doc: SectorLadderDoc; level: 2 | 3; openSector?: string | null; onSelectSector?: (code: string) => void }) {
  const [sortH, setSortH] = useState<number | null>(null);
  const rows = useMemo(() => {
    const zOf = (s: SectorLadderRow, h: number) => s.rungs.find((r) => r.h === h)?.z ?? -Infinity;
    return doc.sectors.filter((s) => s.level === level).sort((a, b) => (sortH != null ? zOf(b, sortH) - zOf(a, sortH) : STRUCTURE_RANK[a.structure.key] - STRUCTURE_RANK[b.structure.key] || zOf(b, 20) - zOf(a, 20)));
  }, [doc, level, sortH]);
  if (!rows.length) return null;
  return (
    <section className="panel-block" style={{ marginBottom: 12 }} data-testid="sector-ladder" aria-label="Thang kỳ hạn ngành">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <b style={{ color: "var(--text-secondary)", fontSize: 12 }}>Thang kỳ hạn ngành · so với VN-Index</b>
        <span style={{ color: "var(--text-tertiary)", fontSize: 11 }} data-testid="ladder-asof">Phiên {doc.asOf} · chỉ mô tả, không phải dự báo</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 560, fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
              <th scope="col" style={{ textAlign: "left", padding: "4px 6px 4px 0", position: "sticky", left: 0, background: "var(--bg-surface-1, #0b1220)", zIndex: 1 }}><button type="button" data-testid="ladder-sort-structure" onClick={() => setSortH(null)} aria-pressed={sortH == null} style={{ all: "unset", cursor: "pointer", fontWeight: sortH == null ? 700 : 400 }}>Ngành · cấu trúc</button></th>
              {COLS.map((c) => <th key={c.h} scope="col" style={{ textAlign: "right", padding: "4px 6px" }}><button type="button" data-testid={`ladder-sort-${c.h}`} onClick={() => setSortH(c.h)} aria-pressed={sortH === c.h} style={{ all: "unset", cursor: "pointer", fontWeight: sortH === c.h ? 700 : 400 }}>{c.label}</button></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.code} data-testid={`ladder-row-${s.code}`} style={{ borderTop: "1px solid var(--bg-surface-2)", outline: openSector === s.code ? "1px solid var(--gold)" : undefined }}>
                <th scope="row" style={{ textAlign: "left", padding: "4px 6px 4px 0", fontWeight: 600, position: "sticky", left: 0, background: "var(--bg-surface-1, #0b1220)", zIndex: 1, width: "clamp(124px, 26vw, 250px)", minWidth: 124 }}>
                  <button type="button" onClick={() => onSelectSector?.(s.code)} data-testid={`ladder-sector-${s.code}`} style={{ all: "unset", cursor: onSelectSector ? "pointer" : "default", color: "var(--gold)", display: "block" }}>{s.name}</button>
                  <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: STRUCTURE_COLOR[s.structure.key] }} data-testid="ladder-structure">{s.structure.label}</span>
                </th>
                {COLS.map((c) => <Cell key={c.h} r={s.rungs.find((r) => r.h === c.h)} muted={c.h === 1} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "6px 0 0" }}>
        Số trên: chênh lợi suất log so với VN-Index (điểm %). Số dưới: % mã của ngành vượt VN-Index trong đúng kỳ đó. Nền ô: Z = RS / (σ√h), đậm dần tới |Z| = 2. Riêng 1 phiên không tô nền vì là nhịp ngắn, thứ hạng gần như không giữ được sau 5 phiên.
        Cấu trúc: ngắn = 5 phiên, trung = 20 phiên và 8 tuần, dài = 13 và 26 tuần, có vùng đệm chống nhảy nhãn. Kiểm tra khám phá 01/11 trên 193 mốc chưa thấy kỳ nào dự báo được rõ ràng.
      </p>
    </section>
  );
}
