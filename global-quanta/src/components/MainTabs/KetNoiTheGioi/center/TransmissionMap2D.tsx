import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetchMarketJson } from "../../../../services/marketDataClient";
import { getMarketGateway } from "../../../../config/marketGateway";
import { createWorldClient } from "../../../../macro-center/src/world-client";
import EvidenceTag from "../EvidenceTag";
import { sectorPressure, transmissionEdges, type MatrixLike, type PulseLike, type TransEdge } from "./world2d";

const W = 760, ROW = 30, TOP = 26, BOTTOM = 10, LX = 186, RX = 574;
const UP = "#3987e5", DOWN = "#e66767", FLAT = "#94a3b8";
const edgeColor = (e: TransEdge) => (e.sign > 0 ? UP : e.sign < 0 ? DOWN : FLAT);
const signed = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d).replace(".", ",")}`;

/**
 * Bản đồ truyền dẫn 2D: yếu tố thế giới hôm nay → ngành Việt Nam. Độ dày = độ mạnh thống kê × mức lệch của yếu tố; màu = yếu tố đang đẩy ngành lên hay xuống.
 * Nét liền = bậc A/B; nét đứt = bậc C (thăm dò, chưa qua hiệu chỉnh kiểm định bội). Quan hệ lịch sử, không phải nhân quả hay dự báo.
 */
export default function TransmissionMap2D() {
  const client = useMemo(() => createWorldClient(getMarketGateway().baseUrl), []);
  const { data, error } = useSWR(["world-trans-map"], async () => {
    const [matrix, overview] = await Promise.all([client.matrix<MatrixLike>({}), fetchMarketJson<{ pulse: PulseLike[] }>("/api/world/overview")]);
    return { matrix, pulse: overview.pulse };
  }, { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 });
  const [focus, setFocus] = useState<string | null>(null);
  const [picked, setPicked] = useState<TransEdge | null>(null);

  const edges = useMemo(() => (data ? transmissionEdges(data.matrix, data.pulse) : []), [data]);
  const pressure = useMemo(() => sectorPressure(edges), [edges]);
  const fName = (id: string) => data?.matrix.factors.find((f) => f.id === id)?.nameVi ?? id;
  const sName = (id: string) => data?.matrix.sectors.find((s) => s.id === id)?.nameVi ?? id;
  const zOf = (id: string) => data?.pulse.find((p) => p.id === id)?.z ?? 0;
  const factors = useMemo(() => {
    if (!data) return [];
    const used = new Set(edges.map((e) => e.factor));
    return data.matrix.factors.filter((f) => used.has(f.id)).sort((a, b) => String(a.channel).localeCompare(String(b.channel)));
  }, [data, edges]);
  const sectors = useMemo(() => [...new Set(edges.map((e) => e.sector))].sort((a, b) => (pressure.get(b) ?? 0) - (pressure.get(a) ?? 0)), [edges, pressure]);
  const rows = Math.max(factors.length, sectors.length, 1);
  const H = TOP + rows * ROW + BOTTOM;
  const yF = (i: number) => TOP + (i + 0.5) * ((rows * ROW) / Math.max(1, factors.length));
  const yS = (i: number) => TOP + (i + 0.5) * ((rows * ROW) / Math.max(1, sectors.length));
  const maxP = Math.max(1, ...edges.map((e) => e.pressure));
  const dim = (e: TransEdge) => focus && e.factor !== focus && e.sector !== focus;

  return (
    <section className="rounded-xl p-3.5" style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }} data-testid="trans-map">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold" style={{ color: "#f1f5f9" }}>Bản đồ truyền dẫn: thế giới → ngành Việt Nam</h4>
          <p className="text-[10px]" style={muted}>Yếu tố đang lệch hôm nay đi vào ngành nào. Rê chuột để lọc, bấm một đường để xem số liệu.</p>
        </div>
        <EvidenceTag kind="heuristic" title="Quan hệ thống kê tháng. Đa số là bậc C: chưa vượt hiệu chỉnh kiểm định bội. Cổng xác nhận đặt trước đang 0/12 cặp, nên bản đồ KHÔNG đi vào quyết định." />
      </div>
      {error && <p role="alert" className="mt-2 text-[11px]" style={{ color: "var(--negative)" }}>Không tải được ma trận: {error.message}</p>}
      {!data && !error && <div className="mt-2 h-60 animate-pulse rounded-lg" style={{ background: "rgba(148,163,184,0.05)" }} aria-busy="true" />}
      {data && edges.length === 0 && <p className="mt-2 text-[11px]" style={muted}>Chưa có liên kết đủ mạnh để vẽ.</p>}
      {edges.length > 0 && <>
        <div className="mt-2 overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" style={{ minWidth: 520 }} role="group" aria-label={`${edges.length} liên kết từ ${factors.length} yếu tố tới ${sectors.length} ngành`} onMouseLeave={() => setFocus(null)}>
          <text x={LX} y={13} textAnchor="end" fontSize={9.5} fill="#64748b">Yếu tố thế giới · độ lệch hôm nay</text>
          <text x={RX} y={13} fontSize={9.5} fill="#64748b">Ngành Việt Nam · áp lực</text>
          {edges.map((e) => {
            const y1 = yF(factors.findIndex((f) => f.id === e.factor)), y2 = yS(sectors.indexOf(e.sector));
            const mid = (LX + RX) / 2;
            const active = picked === e;
            return <path key={`${e.factor}-${e.sector}`} d={`M${LX + 6},${y1} C${mid},${y1} ${mid},${y2} ${RX - 6},${y2}`} fill="none" stroke={edgeColor(e)}
              strokeWidth={active ? 4 : 1 + (e.pressure / maxP) * 4} strokeOpacity={dim(e) ? 0.06 : active ? 1 : e.tier === "C" ? 0.42 : 0.9} strokeDasharray={e.tier === "C" ? "5 4" : undefined}
              role="button" tabIndex={0} aria-label={`${fName(e.factor)} tới ${sName(e.sector)}, bậc ${e.tier}, t ${signed(e.t)}`} style={{ cursor: "pointer", outline: "none" }}
              onClick={() => setPicked(e)} onKeyDown={(k) => { if (k.key === "Enter") setPicked(e); }} data-testid="trans-edge" />;
          })}
          {factors.map((f, i) => { const z = zOf(f.id); return <g key={f.id} onMouseEnter={() => setFocus(f.id)} style={{ cursor: "default" }}>
            <text x={LX} y={yF(i) - 2} textAnchor="end" fontSize={10.5} fill={!focus || focus === f.id ? "#e2e8f0" : "#64748b"}>{f.nameVi.length > 28 ? `${f.nameVi.slice(0, 27)}…` : f.nameVi}</text>
            <text x={LX} y={yF(i) + 9} textAnchor="end" fontSize={8.5} fill={Math.abs(z) >= 2 ? "#fbbf24" : "#64748b"}>{signed(z)} σ{f.channelVi ? ` · ${f.channelVi}` : ""}</text>
            <circle cx={LX + 6} cy={yF(i)} r={3.5} fill="#cbd5e1" />
          </g>; })}
          {sectors.map((s, i) => { const p = pressure.get(s) ?? 0; return <g key={s} onMouseEnter={() => setFocus(s)} style={{ cursor: "default" }}>
            <circle cx={RX - 6} cy={yS(i)} r={3.5} fill={p > 0 ? UP : p < 0 ? DOWN : FLAT} />
            <text x={RX} y={yS(i) - 2} fontSize={10.5} fill={!focus || focus === s ? "#e2e8f0" : "#64748b"}>{sName(s)}</text>
            <text x={RX} y={yS(i) + 9} fontSize={8.5} fill="#94a3b8">{p > 0 ? "▲ đang đẩy lên" : p < 0 ? "▼ đang đẩy xuống" : "cân bằng"} ({signed(p)})</text>
          </g>; })}
        </svg></div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[9.5px]" style={{ color: "var(--text-secondary)" }}>
          <span><i className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: UP }} />Đẩy ngành lên</span>
          <span><i className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: DOWN }} />Đẩy ngành xuống</span>
          <span>Nét liền: bậc A/B · Nét đứt: bậc C (thăm dò)</span><span>Dày hơn: |t| × |độ lệch| lớn hơn</span>
        </div>
        {picked && <p className="mt-2 rounded-lg px-2.5 py-1.5 text-[10.5px]" role="status" data-testid="trans-detail" style={{ background: "rgba(148,163,184,0.06)", color: "#e2e8f0" }}>
          <b>{fName(picked.factor)} → {sName(picked.sector)}</b> · bậc {picked.tier} · β {signed(picked.beta, 2)} · t {signed(picked.t)} · trễ {picked.lag} tháng · yếu tố {signed(zOf(picked.factor))} σ.{" "}
          <span style={muted}>Quan hệ lịch sử, không chứng minh nhân quả.</span>
        </p>}
      </>}
    </section>
  );
}

const muted = { color: "var(--text-tertiary)" };
