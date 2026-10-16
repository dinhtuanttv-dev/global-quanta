// Bảng phụ phân tích chuyên sâu một ngành VN (M4): điểm & phân rã theo khu vực/hàng hoá, xu hướng VN ↔ Mỹ/Âu/Á (quy về 100,
// một trục), quan hệ từng mã nước ngoài (THĂM DÒ), hàng hoá dẫn dắt, cổ phiếu thành phần theo trọng số ICB kèm beta.
// Dữ liệu: Gateway /api/world-sectors/:icb/detail (M2) + nhãn kiểm định đặt trước (M3).
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { X } from "lucide-react";
import { fetchMarketJson } from "../../../../services/marketDataClient";
import { useAppStore } from "../../../../store/useAppStore";
import { fmtZ, labelVi, REGION_ORDER, REGION_SHORT, type WsDetail, type WsRelation, type WsRow } from "../../../../lib/worldSectors/types";
import EvidenceTag from "../EvidenceTag";
import LineChart, { SERIES_COLORS, type ChartSeries } from "../commodity/LineChart";

const muted = { color: "var(--text-tertiary)" };
const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const num = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtDate = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");
/** Màu theo đối tượng: ngành VN s1, Mỹ s2, châu Âu s3, châu Á s4. */
const colorFor = (key: string, region?: string) => (key === "vn" ? SERIES_COLORS.s1 : region === "US" ? SERIES_COLORS.s2 : region === "EU" ? SERIES_COLORS.s3 : SERIES_COLORS.s4);

function Section({ title, tag, children }: { title: string; tag?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl p-3 space-y-2" style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-[10px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>{title}</h4>{tag}
      </div>
      {children}
    </section>
  );
}

function LeadLagBars({ rel }: { rel: WsRelation }) {
  const ll = rel.leadLag ?? [], band = rel.band ?? 0;
  const max = Math.max(0.2, band * 1.4, ...ll.map((l) => Math.abs(l.r ?? 0)));
  const W = 180, H = 56, bw = W / Math.max(1, ll.length);
  const y = (v: number) => H / 2 - (v / max) * (H / 2 - 3);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 11}`} role="img" aria-label={`Tương quan theo độ trễ 0–${ll.length - 1} phiên của ${rel.nameVi}; ngưỡng ±${num(band)}`}>
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(148,163,184,0.35)" />
      {[band, -band].map((b) => <line key={b} x1={0} x2={W} y1={y(b)} y2={y(b)} stroke="rgba(148,163,184,0.5)" strokeDasharray="3 3" />)}
      {ll.map((l, i) => { const r = l.r ?? 0; return (
        <g key={l.lag}><title>{`Trễ ${l.lag} phiên: r = ${num(l.r)} (n = ${l.n})`}</title>
          <rect x={i * bw + 2} y={Math.min(y(r), H / 2)} width={Math.max(2, bw - 4)} height={Math.max(1, Math.abs(y(r) - H / 2))} rx={2} fill={SERIES_COLORS.s1} opacity={Math.abs(r) > band ? 1 : 0.45} />
          <text x={i * bw + bw / 2} y={H + 9} textAnchor="middle" fontSize="8" fill="var(--text-tertiary)">{l.lag}</text></g>); })}
    </svg>
  );
}

export default function WorldSectorDrawer({ icb, row, onClose }: { icb: string; row: WsRow; onClose: () => void }) {
  const [range, setRange] = useState<"1y" | "3y" | "5y">("3y");
  const [relPick, setRelPick] = useState<string | null>(null);
  const selectTicker = useAppStore((s) => s.selectTicker);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { data, error, isLoading } = useSWR<WsDetail>(["ws-detail", icb, range], () => fetchMarketJson<WsDetail>(`/api/world-sectors/${icb}/detail`, { range }), { revalidateOnFocus: false, keepPreviousData: true });
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const series: ChartSeries[] = (data?.chart ?? []).map((c) => ({ key: c.key, label: c.labelVi, color: colorFor(c.key, c.region), points: c.rebased }));
  const rels = (data?.relations ?? []).filter((r) => !r.unavailable);
  const focus = rels.find((r) => r.symbol === relPick) ?? rels[0];
  const s = data?.scores.short ?? row.short, m = data?.scores.medium ?? row.medium;

  return (
    <div className="tw-scope fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Phân tích ngành ${row.nameVi}`} data-testid="ws-drawer">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0" style={{ background: "rgba(0,0,0,0.55)" }} />
      <div className="relative h-full w-full md:w-[800px] flex flex-col" style={{ background: "var(--bg-surface, #0e1626)", borderLeft: "1px solid rgba(148,163,184,0.15)" }}>
        <header className="flex items-start justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: "rgba(148,163,184,0.15)" }}>
          <div>
            <p className="text-[9px] uppercase font-bold" style={muted}>Ngành Việt Nam · ICB {icb} · phân tích tác động thế giới</p>
            <h3 className="text-sm font-black" style={{ color: "#f1f5f9" }}>{row.nameVi}</h3>
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Ngắn hạn {fmtZ(s.score, 2)} ({labelVi[s.label]}) · Trung hạn {fmtZ(m.score, 2)} ({labelVi[m.label]}) · phiên VN {fmtDate(row.vnLast)}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng bảng phân tích" className="p-1.5 rounded" style={{ color: "var(--text-secondary)" }}><X className="w-4 h-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" data-testid="ws-drawer-body">
          <div className="flex gap-1.5" role="group" aria-label="Khung thời gian">
            {(["1y", "3y", "5y"] as const).map((r) => (
              <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className="text-[10px] font-bold px-2.5 py-1 rounded-md"
                style={{ background: range === r ? "rgba(245,158,11,0.15)" : "rgba(148,163,184,0.06)", color: range === r ? "var(--gold, #f59e0b)" : "var(--text-secondary)" }}>{r.replace("y", " năm")}</button>
            ))}
            {isLoading && <span className="text-[10px] self-center" style={muted}>Đang tải…</span>}
          </div>
          {error && <p className="text-xs" style={{ color: "var(--negative)" }}>Không tải được: {error.message}</p>}

          <Section title="Điểm thuận / ngược gió & phân rã" tag={<EvidenceTag kind={s.evidence?.label === "EVIDENCE" ? "evidence" : "heuristic"} title={s.evidence?.labelVi} />}>
            <table className="w-full text-[10.5px]" style={{ borderCollapse: "collapse" }}>
              <thead><tr style={muted}><th className="text-left font-normal">Thành phần</th><th className="font-normal">Ngắn hạn</th><th className="font-normal">1 tuần</th><th className="font-normal">Trung hạn 3T</th></tr></thead>
              <tbody>
                {REGION_ORDER.filter((r) => s.sectors.byRegion[r] || m.sectors.byRegion[r] || s.week?.byRegion[r]).map((r) => (
                  <tr key={r} style={{ borderTop: "1px solid rgba(148,163,184,0.08)" }}>
                    <td className="py-1" style={{ color: "var(--text-secondary)" }}>{REGION_SHORT[r]}</td>
                    <td className="text-center">{fmtZ(s.sectors.byRegion[r]?.z ?? null, 2)}</td>
                    <td className="text-center">{fmtZ(s.week?.byRegion[r]?.z ?? null, 2)}</td>
                    <td className="text-center">{fmtZ(m.sectors.byRegion[r]?.z ?? null, 2)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "1px solid rgba(148,163,184,0.08)" }}><td className="py-1" style={{ color: "var(--text-secondary)" }}>Hàng hoá dẫn dắt</td><td className="text-center">{fmtZ(s.commodity, 2)}</td><td /><td className="text-center">{fmtZ(m.commodity, 2)}</td></tr>
                <tr style={{ borderTop: "1px solid rgba(148,163,184,0.2)" }}><td className="py-1 font-bold" style={{ color: "#f1f5f9" }}>Tổng hợp</td><td className="text-center font-bold">{fmtZ(s.score, 2)}</td><td className="text-center">{fmtZ(s.week?.score ?? null, 2)}</td><td className="text-center font-bold">{fmtZ(m.score, 2)}</td></tr>
              </tbody>
            </table>
            <p className="text-[9.5px]" style={muted}>
              {s.evidence?.labelVi}. Trung hạn: {data?.evidence.medium.labelVi ?? "thăm dò"}.
              {m.gap3m != null && ` Khoảng chênh 3 tháng (thế giới − ngành VN): ${fmtZ(m.gap3m, 2)} — ${m.gap3m > 0 ? "VN đang đi sau ngành thế giới" : "VN đang đi trước ngành thế giới"} (mô tả, không phải tín hiệu đã kiểm định).`}
            </p>
          </Section>

          {data?.available && (
            <>
              <Section title="Xu hướng: ngành VN ↔ Mỹ / Âu / Á (quy về 100 đầu khung)" tag={<EvidenceTag kind="data" />}>
                <LineChart testId="ws-chart" series={series} height={240} refLines={[{ y: 100, label: "100" }]} ariaLabel={`Xu hướng ngành ${row.nameVi} so với ngành tương ứng ở Mỹ, châu Âu, châu Á`} />
                <p className="text-[9.5px]" style={muted}>Chọn mã đại diện tốt nhất mỗi khu vực theo mức khớp rồi tương quan. Giá ETF bằng đồng tiền địa phương (không quy đổi).</p>
              </Section>

              <Section title="Quan hệ với từng mã nước ngoài" tag={<EvidenceTag kind="heuristic" title={data.evidence.relationsVi} />}>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10.5px]" style={{ borderCollapse: "collapse", minWidth: 520 }}>
                    <thead><tr style={muted}><th className="text-left font-normal">Mã</th><th className="font-normal">Khớp</th><th className="font-normal">Tương quan</th><th className="font-normal">Beta</th><th className="font-normal">Đồng thời</th><th className="font-normal">Phiên mới</th></tr></thead>
                    <tbody>
                      {(data.relations ?? []).map((r) => {
                        const c = data.components.find((x) => x.symbol === r.symbol);
                        return (
                          <tr key={r.symbol} onClick={() => setRelPick(r.symbol)} style={{ borderTop: "1px solid rgba(148,163,184,0.08)", cursor: "pointer", background: focus?.symbol === r.symbol ? "rgba(245,158,11,0.06)" : undefined }}>
                            <td className="py-1" style={{ color: "#f1f5f9" }}>{r.symbol} <span style={muted}>{r.nameVi} · {r.regionVi}</span></td>
                            <td className="text-center" style={muted} title={r.matchVi}>{r.match === "exact" ? "chuẩn" : r.match === "close" ? "gần" : "một phần"}</td>
                            <td className="text-center" style={{ color: r.significant ? "#f1f5f9" : "var(--text-tertiary)" }}>{r.unavailable ? "—" : `${num(r.corr)}${r.significant ? "*" : ""}`}</td>
                            <td className="text-center">{num(r.beta)}</td>
                            <td className="text-center" style={muted}>{r.contemporaneous == null ? "—" : num(r.contemporaneous)}</td>
                            <td className="text-center">{c?.new?.pct == null ? "—" : `${pct(c.new.pct, 2)} (${fmtDate(c.new.sessions[c.new.sessions.length - 1])})`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[9.5px]" style={muted}>Tương quan/beta: lợi suất phiên VN với phiên nước ngoài TRƯỚC đó, 250 phiên; * vượt ngưỡng ~95%. "Đồng thời" = cùng phiên (chỉ sàn châu Á giao dịch cùng giờ). Thăm dò — không phải bằng chứng.</p>
                {focus && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div><p className="text-[9px]" style={muted}>{focus.symbol}: tương quan theo độ trễ (phiên nước ngoài đi trước)</p><LeadLagBars rel={focus} /></div>
                    <div><p className="text-[9px]" style={muted}>{focus.symbol}: tương quan cuộn 60 phiên</p>
                      <LineChart series={[{ key: "rc", label: "Tương quan cuộn", color: SERIES_COLORS.s3, points: (focus.rolling ?? []).filter((p): p is [string, number] => p[1] != null) }]} height={96} yFmt={(v) => num(v, 1)} refLines={[{ y: 0, label: "0" }]} ariaLabel={`Tương quan cuộn ${focus.symbol}`} directLabels={false} />
                    </div>
                  </div>
                )}
              </Section>

              {data.drivers.length > 0 && (
                <Section title="Hàng hoá dẫn dắt" tag={<EvidenceTag kind="heuristic" title="Chiều tác động đặt theo cơ chế kinh tế" />}>
                  {data.drivers.map((c) => (
                    <p key={c.id} className="text-[10.5px]" style={{ color: "var(--text-secondary)" }}>
                      {c.nameVi} ({c.sign > 0 ? "giá tăng có lợi" : "giá tăng bất lợi"}): ngắn hạn {c.short?.pct == null ? "— (giá tháng)" : `${pct(c.short.pct, 2)} → z ${fmtZ(c.short.z, 2)}`} · trung hạn {c.medium?.pct == null ? "—" : `${pct(c.medium.pct)} → z ${fmtZ(c.medium.z, 2)}`}
                    </p>
                  ))}
                </Section>
              )}

              <Section title={`Cổ phiếu thành phần (trọng số ICB${data.rebalanceDate ? `, kỳ ${fmtDate(data.rebalanceDate)}` : ""})`} tag={<EvidenceTag kind="heuristic" title="Beta mô tả, không phải khuyến nghị" />}>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10.5px]" style={{ borderCollapse: "collapse", minWidth: 480 }}>
                    <thead><tr style={muted}><th className="text-left font-normal">Mã</th><th className="font-normal">Tỷ trọng</th><th className="font-normal">Beta thế giới</th><th className="font-normal">Tương quan</th><th className="font-normal">1 phiên</th><th className="font-normal">1 tháng</th><th className="font-normal">3 tháng</th></tr></thead>
                    <tbody>
                      {data.stocks.map((st) => (
                        <tr key={st.symbol} style={{ borderTop: "1px solid rgba(148,163,184,0.08)" }}>
                          <td className="py-1"><button type="button" onClick={() => selectTicker(st.symbol)} className="font-black" style={{ color: "var(--gold, #f59e0b)" }}>{st.symbol}</button></td>
                          <td className="text-center">{num(st.weight * 100, 1)}%</td>
                          <td className="text-center">{st.beta == null ? "—" : `${num(st.beta)}%`}</td>
                          <td className="text-center" style={muted}>{num(st.corr)}</td>
                          <td className="text-center">{pct(st.d1)}</td><td className="text-center">{pct(st.m1)}</td><td className="text-center">{pct(st.m3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[9.5px]" style={muted}>{data.stocksNoteVi}</p>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
