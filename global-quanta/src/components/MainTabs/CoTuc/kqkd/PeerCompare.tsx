// K6 (06/11/2026) — so với ngành: hạng phần trăm của mã trong nhóm cùng ngành (thiếu ngành -> cùng mẫu BCTC), quý mới nhất.
import { useMemo } from "react";
import { fin, num, pct, pctPlain } from "../../../../lib/kqkd/format";
import type { KqkdRow } from "../../../../lib/kqkd/types";

type Metric = { id: string; label: string; get: (r: KqkdRow) => number | null; fmt: (v: number | null) => string; lowerBetter?: boolean; hint: string };
const norm = (g: KqkdRow["npatYoY"] | null | undefined) => (g?.status === "NORMAL" ? g.value : null);
const METRICS: Metric[] = [
  { id: "ytd", label: "LNST lũy kế YoY", get: (r) => norm(r.ytd?.growth), fmt: (v) => pct(v), hint: "Lũy kế từ đầu năm so cùng kỳ (tăng trưởng thường)" },
  { id: "ttm", label: "LNST 4 quý YoY", get: (r) => norm(r.ttmGrowth), fmt: (v) => pct(v), hint: "4 quý gần nhất so 4 quý trước đó" },
  { id: "core", label: "LN cốt lõi quý YoY", get: (r) => norm(r.coreYoY), fmt: (v) => pct(v), hint: "LN cốt lõi quý so cùng kỳ" },
  { id: "margin", label: "Biên ròng 4 quý", get: (r) => r.netMarginTtm, fmt: (v) => pctPlain(v), hint: "LNST mẹ ÷ doanh thu (4 quý)" },
  { id: "roe", label: "ROE 4 quý", get: (r) => r.roe, fmt: (v) => pctPlain(v), hint: "LNST mẹ ÷ VCSH bình quân" },
  { id: "cfo", label: "CFO / LNST", get: (r) => r.cfoToNpat, fmt: (v) => num(v), hint: "Dòng tiền HĐKD ÷ LNST (4 quý)" },
  { id: "accrual", label: "Dồn tích Sloan", get: (r) => r.accrual, fmt: (v) => pctPlain(v), lowerBetter: true, hint: "Thấp hơn = lợi nhuận được tiền xác nhận nhiều hơn" },
  { id: "sue", label: "SUE LN cốt lõi", get: (r) => r.sueCore, fmt: (v) => num(v), hint: "Bất ngờ chuẩn hoá của LN cốt lõi" },
];

export default function PeerCompare({ ticker, rows, sectorOf }: { ticker: string; rows: KqkdRow[]; sectorOf?: (t: string) => string | null }) {
  const me = rows.find((r) => r.t === ticker) ?? null;
  const sector = sectorOf?.(ticker) ?? null;
  const peers = useMemo(() => {
    if (!me) return [];
    const bySector = sector ? rows.filter((r) => r.current && sectorOf?.(r.t) === sector) : [];
    return bySector.length >= 5 ? bySector : rows.filter((r) => r.current && r.tpl === me.tpl);
  }, [rows, me, sector, sectorOf]);
  if (!me) return <p className="text-[11px] text-slate-500">Mã chưa có trong bảng toàn thị trường.</p>;
  const usedSector = sector && peers.length && sectorOf?.(peers[0].t) === sector;
  return (
    <div className="space-y-2" data-testid="kq-peers">
      <p className="text-[11px] text-slate-300">So với <b className="text-[#F5CE72]">{usedSector ? `ngành ${sector}` : "cùng mẫu BCTC"}</b> · {peers.length} mã đã công bố quý mới nhất. Thanh = hạng phần trăm trong nhóm (100% = tốt nhất).</p>
      <div className="space-y-1.5">
        {METRICS.map((m) => {
          const v = m.get(me);
          const vals = peers.map(m.get).filter(fin).sort((a, b) => a - b);
          const med = vals.length ? vals[Math.floor(vals.length / 2)] : null;
          const rank = fin(v) && vals.length > 1 ? vals.filter((x) => (m.lowerBetter ? x > v : x < v)).length / (vals.length - 1) : null;
          return (
            <div key={m.id} className="grid grid-cols-[150px_1fr_86px_96px] items-center gap-2 text-[11px]" title={m.hint} data-testid={`kq-peer-${m.id}`}>
              <span className="text-slate-300">{m.label}</span>
              <span className="relative h-2.5 rounded-sm bg-white/[0.05]">
                {fin(rank) && <span className="absolute left-0 top-0 h-full rounded-sm bg-[#E8B84B]" style={{ width: `${Math.max(2, rank * 100)}%` }} />}
                <span className="absolute top-[-2px] h-[14px] w-px bg-slate-400/70" style={{ left: "50%" }} />
              </span>
              <span className="text-right font-mono tabular-nums text-slate-100">{m.fmt(v)}</span>
              <span className="text-right font-mono text-[10.5px] tabular-nums text-slate-500">trung vị {m.fmt(med)}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-500">Vạch giữa = trung vị nhóm. Tăng trưởng nền thấp / đổi dấu không được xếp hạng. Ngành lấy theo phân loại của tab (ICB).</p>
    </div>
  );
}
