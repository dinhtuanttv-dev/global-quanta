// HS360-v3 H5 (27/11/2026, docs/ho-so-360-v3/05 §4) — Hồ sơ 360° · Doanh nghiệp: "So sánh trong ngành". Đặt các chỉ số KQKD chính của mã
// cạnh các mã CÙNG NGÀNH ICB cấp 2 và CÙNG MẪU BCTC (doanh nghiệp / ngân hàng / chứng khoán / bảo hiểm — biên ròng và ROE không so được giữa
// các mẫu). Nguồn: bảng KQKD toàn thị trường (/api/fundamentals/kqkd/summary, quý đã công bố) + phân ngành của bảng tín hiệu E1.
// Chỉ mô tả: dưới 5 mã cùng nhóm thì không tính phân vị ngành.
import { useMemo } from "react";
import { useKqkdSummary } from "../../../hooks/useKqkd";
import { useElitePanel } from "../../../hooks/elite10/useEliteCenter";
import type { KqkdRow } from "../../../lib/kqkd/types";
import { Block, Evidence } from "./pfaParts";

export const MIN_PEERS = 5;
type MetricId = "nowcast" | "ttmGrowth" | "npatYoY" | "netMarginTtm" | "roe";
export const PEER_METRICS: { id: MetricId; labelVi: string; get: (r: KqkdRow) => number | null }[] = [
  { id: "nowcast", labelVi: "Ước tính LNST cả năm (tăng trưởng)", get: (r) => r.nowcast?.growth ?? null },
  { id: "ttmGrowth", labelVi: "Tăng trưởng LNST 4 quý", get: (r) => r.ttmGrowth?.value ?? null },
  { id: "npatYoY", labelVi: "LNST quý so cùng kỳ", get: (r) => r.npatYoY?.value ?? null },
  { id: "netMarginTtm", labelVi: "Biên lợi nhuận ròng 4 quý", get: (r) => r.netMarginTtm },
  { id: "roe", labelVi: "ROE", get: (r) => r.roe },
];
const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export interface PeerRow { id: MetricId; labelVi: string; value: number | null; median: number | null; pctSector: number | null; pctMarket: number | null; peers: number }

function pctOf(values: number[], v: number): number {
  let below = 0, equal = 0;
  for (const x of values) { if (x < v) below++; else if (x === v) equal++; }
  return ((below + equal / 2) / values.length) * 100;
}
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Hàm thuần: chỉ số của mã so với nhóm cùng ngành ICB cấp 2 + cùng mẫu BCTC, và so với toàn thị trường cùng mẫu. */
export function sectorPeers(ticker: string, rows: KqkdRow[], l2Of: Map<string, string | undefined>): { group: KqkdRow[]; out: PeerRow[] } | null {
  const me = rows.find((r) => r.t === ticker);
  if (!me) return null;
  const l2 = l2Of.get(ticker);
  const sameTpl = rows.filter((r) => r.tpl === me.tpl);
  const group = l2 ? sameTpl.filter((r) => l2Of.get(r.t) === l2) : [];
  const out = PEER_METRICS.map((m) => {
    const v = m.get(me);
    const sec = group.map(m.get).filter(fin), all = sameTpl.map(m.get).filter(fin);
    return { id: m.id, labelVi: m.labelVi, value: fin(v) ? v : null, median: sec.length >= MIN_PEERS ? median(sec) : null,
      pctSector: fin(v) && sec.length >= MIN_PEERS ? pctOf(sec, v) : null, pctMarket: fin(v) && all.length >= MIN_PEERS ? pctOf(all, v) : null, peers: sec.length };
  });
  return { group, out };
}

const sp = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`);
const p0 = (v: number | null) => (v == null ? "—" : Math.round(v).toString());
const TPL_VI: Record<string, string> = { corp: "doanh nghiệp", bank: "ngân hàng", sec: "chứng khoán", ins: "bảo hiểm" };

function PctBar({ p }: { p: number | null }) {
  if (p == null) return <span className="text-[10px] text-slate-600">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-block h-1.5 w-16 rounded bg-white/10 align-middle"><span className="absolute top-0 h-1.5 rounded" style={{ width: `${p}%`, background: p >= 50 ? "rgba(52,211,153,0.7)" : "rgba(248,113,113,0.7)" }} /></span>
      <span className="font-mono text-[10.5px] text-slate-300">{p0(p)}</span>
    </span>
  );
}

export default function SectorPeersBlock({ ticker }: { ticker: string }) {
  const { data: kq, error } = useKqkdSummary();
  const { data: panel } = useElitePanel();
  const l2Of = useMemo(() => new Map((panel?.rows ?? []).map((r) => [r.ticker, r.icb?.l2])), [panel]);
  const res = useMemo(() => (kq?.rows ? sectorPeers(ticker, kq.rows, l2Of) : null), [kq, ticker, l2Of]);
  const head = <Evidence label="MÔ TẢ" title="So sánh mô tả trên quý đã công bố; không phải tín hiệu. Ước tính LNST cả năm có kiểm định KQ-r1 riêng (xem chỉ số ở trên)." />;
  if (error) return <Block title="So sánh trong ngành" testId="pfa-peers" right={head}><p className="text-[11px] text-slate-500">Không tải được bảng KQKD toàn thị trường.</p></Block>;
  if (!kq) return <Block title="So sánh trong ngành" testId="pfa-peers" right={head}><p className="text-[11px] italic text-slate-500">Đang tải bảng KQKD toàn thị trường…</p></Block>;
  if (!res) return <Block title="So sánh trong ngành" testId="pfa-peers" right={head}><p className="text-[11px] text-slate-500" data-testid="pfa-peers-none">{ticker} chưa có trong bảng KQKD toàn thị trường.</p></Block>;
  const me = kq.rows.find((r) => r.t === ticker)!;
  return (
    <Block title={`So sánh trong ngành · ${res.group.length} mã cùng ngành ICB cấp 2, mẫu BCTC ${TPL_VI[me.tpl] ?? me.tpl}`} testId="pfa-peers" right={head}>
      <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[11px]" style={{ borderCollapse: "collapse" }}>
          <thead><tr className="text-[10px] text-slate-500"><th className="py-1 text-left font-normal">Chỉ số ({me.quarter})</th><th className="px-2 text-right font-normal">{ticker}</th><th className="px-2 text-right font-normal">Trung vị ngành</th><th className="px-2 text-left font-normal">Phân vị trong ngành</th><th className="pl-2 text-left font-normal">Phân vị toàn thị trường</th></tr></thead>
          <tbody>
            {res.out.map((r) => (
              <tr key={r.id} className="border-t border-white/5" data-testid={`pfa-peer-${r.id}`}>
                <td className="py-1 pr-2 text-slate-300">{r.labelVi}</td>
                <td className="px-2 text-right font-mono text-slate-100">{sp(r.value)}</td>
                <td className="px-2 text-right font-mono text-slate-400">{sp(r.median)}</td>
                <td className="px-2"><PctBar p={r.pctSector} /></td>
                <td className="pl-2"><PctBar p={r.pctMarket} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">Dưới {MIN_PEERS} mã cùng nhóm thì không tính trung vị / phân vị ngành. Phân vị cao = chỉ số lớn hơn phần lớn nhóm (với mọi chỉ số ở đây, cao là tốt hơn).</p>
    </Block>
  );
}
