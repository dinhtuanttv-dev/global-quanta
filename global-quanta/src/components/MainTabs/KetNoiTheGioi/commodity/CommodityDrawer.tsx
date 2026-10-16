// Bảng phân tích chuyên sâu một mặt hàng (C3): xu hướng giá Việt Nam ↔ thế giới (quy về 100, một trục), biến động, sụt giảm,
// bảng số liệu, quan hệ VN ↔ thế giới (THĂM DÒ), cổng xác nhận W3 nếu có, khối truyền dẫn (HEURISTIC). Dữ liệu: Gateway C2.
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { X } from "lucide-react";
import { fetchMarketJson } from "../../../../services/marketDataClient";
import { useAppStore } from "../../../../store/useAppStore";
import { lookupSectorMapping } from "../../../../lib/macro-mapping";
import { fmtPct, fmtPeriod, fmtPrice, type CommodityHistory, type CommodityItem, type CommodityRange, type CommodityRelation } from "../../../../lib/commodities/types";
import EvidenceTag from "../EvidenceTag";
import LineChart, { SERIES_COLORS, type ChartSeries } from "./LineChart";

const RANGES: { id: CommodityRange; label: string }[] = [{ id: "1y", label: "1 năm" }, { id: "3y", label: "3 năm" }, { id: "5y", label: "5 năm" }, { id: "10y", label: "10 năm" }];
const muted = { color: "var(--text-tertiary)" };
const CHANGE_LABELS: Record<string, string> = { d1: "1 phiên", w1: "1 tuần", m1: "1 tháng", m3: "3 tháng", m6: "6 tháng", y1: "1 năm", y3: "3 năm", ytd: "Từ đầu năm" };
const num = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));

/** Màu theo đối tượng: thế giới → s1, quy đổi VND → s2, ngành ICB → s3, mã CP / mặt hàng so sánh → s4. */
function colorOf(key: string) {
  if (key === "world") return SERIES_COLORS.s1;
  if (key === "vnd") return SERIES_COLORS.s2;
  if (key.startsWith("vn:") && /^\d{4}$/.test(key.slice(3))) return SERIES_COLORS.s3;
  return SERIES_COLORS.s4;
}

interface ConfirmDoc { rows: { id: string; factor: string; sector: string; sectorName?: string; sign: 1 | -1; beta: number | null; q: number; confirmed: boolean; signOk: boolean | null; reasonVi: string }[]; version: string }

function Section({ title, tag, children }: { title: string; tag?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl p-3 space-y-2" style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-[10px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>{title}</h4>
        {tag}
      </div>
      {children}
    </section>
  );
}

function LeadLag({ rel }: { rel: CommodityRelation }) {
  const ll = rel.leadLag ?? [];
  const band = rel.band ?? 0;
  const max = Math.max(0.3, band * 1.3, ...ll.map((l) => Math.abs(l.r ?? 0)));
  const W = 260, H = 70, bw = W / Math.max(1, ll.length);
  const y = (v: number) => H / 2 - (v / max) * (H / 2 - 4);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 12}`} role="img" aria-label={`Tương quan theo độ trễ 0 đến ${ll.length - 1}; ngưỡng xấp xỉ 95% là ±${num(band)}`}>
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(148,163,184,0.35)" />
      {[band, -band].map((b) => <line key={b} x1={0} x2={W} y1={y(b)} y2={y(b)} stroke="rgba(148,163,184,0.5)" strokeDasharray="3 3" />)}
      {ll.map((l, i) => {
        const r = l.r ?? 0, top = Math.min(y(r), H / 2), h = Math.max(1, Math.abs(y(r) - H / 2));
        return (
          <g key={l.lag}>
            <title>{`Trễ ${l.lag}: r = ${num(l.r)} (n = ${l.n})`}</title>
            <rect x={i * bw + 2} y={top} width={Math.max(2, bw - 4)} height={h} rx={2} fill={SERIES_COLORS.s1} opacity={Math.abs(r) > band ? 1 : 0.45} />
            <text x={i * bw + bw / 2} y={H + 10} textAnchor="middle" fontSize="8" fill="var(--text-tertiary)">{l.lag}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function CommodityDrawer({ item, onClose }: { item: CommodityItem; onClose: () => void }) {
  const [range, setRange] = useState<CommodityRange>("3y");
  const selectTicker = useAppStore((s) => s.selectTicker);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { data, error, isLoading } = useSWR<CommodityHistory>(["commodity-history", item.id, range],
    () => fetchMarketJson<CommodityHistory>(`/api/commodities/${item.id}/history`, { range }), { revalidateOnFocus: false, keepPreviousData: true });
  const factor = data?.worldFactor ?? null;
  const { data: confirm } = useSWR<ConfirmDoc>(factor ? "world-confirmatory" : null, () => fetchMarketJson<ConfirmDoc>("/api/world/confirmatory"), { revalidateOnFocus: false });
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mapping = item.sectorKey ? lookupSectorMapping(item.sectorKey) : null;
  const s = data?.stats ?? null;
  const priceSeries: ChartSeries[] = (data?.chart ?? []).map((c) => ({ key: c.key, label: c.labelVi, color: colorOf(c.key), points: c.rebased }));
  const unitWord = data?.freq === "month" ? "tháng" : "phiên";
  const pairs = factor && confirm ? confirm.rows.filter((r) => r.factor === factor) : [];

  return (
    <div className="tw-scope fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Phân tích chuyên sâu: ${item.nameVi}`} data-testid="commodity-drawer">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0" style={{ background: "rgba(0,0,0,0.55)" }} />
      <div className="relative h-full w-full md:w-[760px] flex flex-col" style={{ background: "var(--bg-surface, #0e1626)", borderLeft: "1px solid rgba(148,163,184,0.15)" }}>
        <header className="flex items-start justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: "rgba(148,163,184,0.15)" }}>
          <div>
            <p className="text-[9px] uppercase font-bold" style={muted}>{item.group} · phân tích chuyên sâu</p>
            <h3 className="text-sm font-black" style={{ color: "#f1f5f9" }}>{item.nameVi}</h3>
            {s && <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{fmtPrice(s.last)} {item.unit} · {data?.freq === "month" ? "kỳ" : "phiên"} {fmtPeriod(s.lastDate)}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng bảng phân tích" className="p-1.5 rounded" style={{ color: "var(--text-secondary)" }}><X className="w-4 h-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" data-testid="commodity-drawer-body">
          <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Khung thời gian">
            {RANGES.map((r) => (
              <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}
                className="text-[10px] font-bold px-2.5 py-1 rounded-md"
                style={{ background: range === r.id ? "rgba(245,158,11,0.15)" : "rgba(148,163,184,0.06)", color: range === r.id ? "var(--gold, #f59e0b)" : "var(--text-secondary)" }}>
                {r.label}
              </button>
            ))}
            {isLoading && <span className="text-[10px] self-center" style={muted}>Đang tải…</span>}
          </div>
          {error && <p className="text-xs" style={{ color: "var(--negative)" }}>Không tải được phân tích: {error.message}</p>}
          {data && !data.available && <p className="text-xs italic" style={muted}>{data.reasonVi}</p>}

          {data?.available && (
            <>
              <Section title="Xu hướng giá Việt Nam ↔ thế giới (quy về 100 đầu khung)" tag={<EvidenceTag kind="data" />}>
                <LineChart testId="cm-chart-price" series={priceSeries} height={240} ariaLabel={`Xu hướng ${item.nameVi} và chuỗi Việt Nam, quy về 100 tại ${fmtPeriod(data.from)}`}
                  refLines={[{ y: 100, label: "100" }]} />
                <ul className="text-[9.5px] space-y-0.5" style={muted}>
                  <li>• Giá thế giới: {data.source.symbol ? `${data.source.symbol} — ` : ""}{data.source.labelVi}{data.freq === "month" ? " (trung bình tháng)" : ""}.</li>
                  {data.vnd?.points.length ? <li>• Quy đổi VND = giá thế giới × USD/VND ({data.vnd.source}{data.freq === "month" ? ", trung bình tháng" : ", cùng phiên"}) — KHÔNG phải giá bán lẻ trong nước; mới nhất {num(data.vnd.points[data.vnd.points.length - 1][1], 0)} {data.vnd.labelVi}.</li> : null}
                  {(data.vnSeries ?? []).map((v) => <li key={v.code}>• {v.labelVi} — {v.priceBasis === "INDEX_POINTS" ? "điểm chỉ số" : "giá điều chỉnh theo sự kiện quyền"}, từ {fmtPeriod(v.first)}{data.freq === "month" ? " (giá cuối tháng)" : ""}.</li>)}
                  {data.vnPrice && <li>• Đây là giá xuất khẩu <b>của Việt Nam</b> (World Bank), so với gạo Thái cùng loại.</li>}
                  {(data.notes ?? []).map((n) => <li key={n}>• {n}</li>)}
                </ul>
              </Section>

              {s && (
                <Section title="Số liệu chính" tag={<EvidenceTag kind="data" />}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(s.changes).map(([k, v]) => (
                      <div key={k} className="rounded-lg p-2" style={{ background: "rgba(148,163,184,0.05)" }}>
                        <p className="text-[9px]" style={muted}>{CHANGE_LABELS[k] ?? k}</p>
                        <p className="text-xs font-bold" style={{ color: v == null ? "var(--text-tertiary)" : v >= 0 ? "var(--positive)" : "var(--negative)" }}>{fmtPct(v, 1)}</p>
                      </div>
                    ))}
                  </div>
                  <table className="w-full text-[10.5px]" style={{ borderCollapse: "collapse" }}>
                    <tbody>
                      {[
                        ["Đỉnh / đáy 1 năm", `${fmtPrice(s.high1y)} / ${fmtPrice(s.low1y)} ${item.unit}`],
                        ["Phân vị trong 5 năm", s.percentile5y == null ? "—" : `${num(s.percentile5y, 0)}% (giá hiện tại cao hơn ${num(s.percentile5y, 0)}% số ${unitWord})`],
                        ["Z-score so với 1 năm", s.zScore1y == null ? "—" : `${num(s.zScore1y)} độ lệch chuẩn`],
                        ["Cách đỉnh 5 năm", fmtPct(s.drawdown5y, 1)],
                        [`Biến động thực (${s.vol.unitVi})`, `${num(s.vol.now, 1)}% · TB 5 năm ${num(s.vol.avg5y, 1)}%`],
                      ].map(([k, v]) => (
                        <tr key={k} style={{ borderTop: "1px solid rgba(148,163,184,0.08)" }}><td className="py-1" style={muted}>{k}</td><td className="py-1 text-right" style={{ color: "#f1f5f9" }}>{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              )}

              {s && (
                <Section title="Biến động & sụt giảm" tag={<EvidenceTag kind="data" />}>
                  <p className="text-[9.5px]" style={muted}>Biến động thực ({s.vol.unitVi}), đường đứt = trung bình 5 năm.</p>
                  <LineChart testId="cm-chart-vol" series={[{ key: "vol", label: "Biến động thực (%)", color: SERIES_COLORS.s1, points: s.volSeries }]} height={130}
                    ariaLabel={`Biến động thực của ${item.nameVi}`} refLines={s.vol.avg5y != null ? [{ y: s.vol.avg5y, label: `TB 5 năm ${num(s.vol.avg5y, 1)}%` }] : []} directLabels={false} />
                  <p className="text-[9.5px]" style={muted}>Sụt giảm từ đỉnh gần nhất (%).</p>
                  <LineChart testId="cm-chart-dd" series={[{ key: "dd", label: "Cách đỉnh (%)", color: SERIES_COLORS.s2, points: s.ddSeries }]} height={110}
                    ariaLabel={`Sụt giảm từ đỉnh của ${item.nameVi}`} refLines={[{ y: 0, label: "đỉnh" }]} directLabels={false} />
                </Section>
              )}

              <Section title="Quan hệ Việt Nam ↔ thế giới" tag={<EvidenceTag kind="heuristic" title="Tương quan lịch sử (thăm dò) — không phải bằng chứng nhân quả, chưa kiểm định ngoài mẫu" />}>
                {(data.relations ?? []).length === 0 && <p className="text-[10px] italic" style={muted}>Không có chuỗi Việt Nam để so sánh.</p>}
                {(data.relations ?? []).map((r) => (
                  <div key={r.code} className="space-y-1.5 pt-1">
                    <p className="text-[10.5px] font-bold" style={{ color: "#f1f5f9" }}>{r.labelVi}</p>
                    {r.unavailable ? <p className="text-[10px] italic" style={muted}>Chưa đủ dữ liệu chung để tính.</p> : (
                      <>
                        <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                          Tương quan {num(r.corr)} (ngưỡng ~95%: ±{num(r.band)}) — <b>{r.significant ? "vượt ngưỡng" : "không khác 0 có ý nghĩa"}</b>;
                          beta {num(r.beta)}; độ trễ có |r| lớn nhất: {r.bestLag?.lag} {unitWord} (r = {num(r.bestLag?.r)}).
                        </p>
                        <p className="text-[9px]" style={muted}>{r.basisVi} Thăm dò: không phải bằng chứng, không dùng để ra quyết định.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <p className="text-[9px]" style={muted}>Tương quan theo độ trễ (0 = cùng kỳ; đường đứt = ngưỡng ~95%)</p>
                            <LeadLag rel={r} />
                          </div>
                          <div>
                            <p className="text-[9px]" style={muted}>Tương quan cuộn {r.window} {unitWord}</p>
                            <LineChart series={[{ key: "rc", label: "Tương quan cuộn", color: SERIES_COLORS.s3, points: (r.rolling ?? []).filter((p): p is [string, number] => p[1] != null) }]}
                              height={100} yFmt={(v) => num(v, 1)} refLines={[{ y: 0, label: "0" }]} ariaLabel={`Tương quan cuộn giữa ${r.labelVi} và ${item.nameVi}`} directLabels={false} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {pairs.length > 0 && (
                  <div className="pt-2 border-t space-y-1" style={{ borderColor: "rgba(148,163,184,0.1)" }}>
                    <p className="text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>Cổng xác nhận đặt trước ({confirm?.version})</p>
                    {pairs.map((p) => (
                      <p key={p.id} className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                        {p.id} {p.factor} → {p.sectorName ?? p.sector}: <b style={{ color: p.confirmed ? "var(--positive)" : p.signOk === false ? "var(--negative)" : "var(--text-tertiary)" }}>{p.confirmed ? "Đã xác nhận" : p.signOk === false ? "Ngược chiều kỳ vọng" : "Chưa xác nhận"}</b> — {p.reasonVi}
                      </p>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Truyền dẫn tới Việt Nam" tag={<EvidenceTag kind="heuristic" />}>
                {mapping && <p className="text-[10.5px]" style={{ color: "var(--text-secondary)" }}>{mapping.transmissionNote}</p>}
                {item.twoWayVi && <p className="text-[10px] italic" style={muted}>⚠ {item.twoWayVi}</p>}
                {item.vnTickers.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[9px]" style={muted}>Mã liên quan (ánh xạ đặt tay, không phải khuyến nghị):</span>
                    {item.vnTickers.map((t) => <button key={t} type="button" onClick={() => selectTicker(t)} className="text-[10px] font-black px-1.5 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.08)", color: "var(--gold, #f59e0b)" }}>{t}</button>)}
                  </div>
                ) : <p className="text-[10px] italic" style={muted}>Chưa có danh sách mã đại diện đã xác nhận — không bịa mã.</p>}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
