"use client";
// EP6 — cột "Elliott" trong các bảng lọc Siêu Quét: kịch bản Elliott Pro đang mở mới nhất của mã (từ sổ theo dõi trên Gateway).
// Nổi bật khi ĐÃ KÍCH HOẠT / ĐẠT MT1 (vd. "Sóng 3 ↑ · vừa kích hoạt"); chờ kích hoạt hiện mờ. Không thay đổi kết quả của bộ lọc.
import useSWR from "swr";
import { fetchMarketJson, isMarketGatewayEnabled } from "../../../services/marketDataClient";
import { STATE_LABEL, type ScenarioState } from "../../../lib/quant-core/elliott/v3/scenarios";

export interface ElliottLatest { template: string; title: string; dir: 1 | -1; level: number; state: ScenarioState; trigger: number; target1: number; invalidation: number; loggedAt: string; triggeredAt: string | null }

/** Một lần tải / 10 phút cho mọi bảng. */
export function useElliottLatest() {
  const { data } = useSWR<{ bySymbol: Record<string, ElliottLatest> } | null>(isMarketGatewayEnabled() ? "elliott-ledger-latest" : null,
    () => fetchMarketJson<{ bySymbol: Record<string, ElliottLatest> }>("/api/market/elliott/ledger/latest").catch(() => null),
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false, dedupingInterval: 5 * 60_000 });
  return data?.bySymbol ?? {};
}

const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");

export function ElliottCell({ row }: { row: ElliottLatest | undefined }) {
  if (!row) return <span className="text-slate-600">—</span>;
  const active = row.state === "triggered" || row.state === "target1";
  const tone = row.dir > 0 ? "text-emerald-400" : "text-rose-400";
  return (
    <span className={`whitespace-nowrap ${active ? "" : "opacity-60"}`} data-testid="elliott-cell"
      title={`${row.title} (bậc ${row.level}) · ${STATE_LABEL[row.state]}${row.triggeredAt ? ` từ ${row.triggeredAt}` : ""} · kích hoạt ${fmt(row.trigger)} · MT1 ${fmt(row.target1)} · vô hiệu ${fmt(row.invalidation)} — Elliott Pro, không phải khuyến nghị`}>
      <span className={`font-bold ${tone}`}>{row.title} {row.dir > 0 ? "↑" : "↓"}</span>
      <span className={`block text-[8px] ${active ? "text-cyan-300" : "text-slate-500"}`}>{row.state === "triggered" && row.triggeredAt ? `đã kích hoạt ${row.triggeredAt.slice(5)}` : STATE_LABEL[row.state]}</span>
    </span>
  );
}
