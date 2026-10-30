// Z3 (2026-10-17) — "Tác động ngành & cổ phiếu": một bảng ghép chiến lược ngành thế giới (Gateway, đã kiểm định ngắn hạn),
// bối cảnh trung hạn (không dự báo), hàng hoá dẫn dắt và chất xúc tác (engine Project A) theo 22 ngành ICB; tra cứu từng mã
// qua công cụ ws_stock (cùng công cụ chat AI dùng). Mỗi cột ghi rõ nguồn và ngày; engine xúc tác đứng thì báo thẳng.
import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, MessageSquare } from "lucide-react";
import { useWorldStrategy } from "../../../hooks/useWorldStrategy";
import { useWorldSectorScores } from "../../../hooks/useWorldSectorScores";
import { useCommoditySnapshot } from "../../../hooks/useCommoditySnapshot";
import { useCatalystData } from "../../../hooks/useCatalystData";
import { useAppStore } from "../../../store/useAppStore";
import { fetchMarketJson } from "../../../services/marketDataClient";
import { divergingColor, fmtZ } from "../../../lib/worldSectors/types";
import { MEDIUM_STANCE_VI, QUADRANT_VI, SHORT_STANCE_VI, type MediumStance, type ShortStance } from "../../../lib/worldSectors/strategyTypes";
import { ageDays, askSector, askTicker, catalystByIcb } from "../../../lib/catalyst/impactBoard";
import EvidenceTag from "../KetNoiTheGioi/EvidenceTag";
import WorldSectorDrawer from "../KetNoiTheGioi/worldSectors/WorldSectorDrawer";

const muted = { color: "var(--text-tertiary)" };
const num = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtDate = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const STANCE_BG: Record<ShortStance, string> = { overweight: divergingColor(2.5), underweight: divergingColor(-2.5), neutral: "rgba(148,163,184,0.25)", na: "rgba(148,163,184,0.15)" };
const MED_TONE: Record<MediumStance, number> = { supportive: 2.5, mixed: 0, neutral: 0, adverse: -2.5 };
const chip = "text-[9.5px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap";

function Card({ title, tag, children, testId }: { title: string; tag?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section className="rounded-xl p-3 space-y-2" data-testid={testId} style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-[10px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>{title}</h4>{tag}
      </div>
      {children}
    </section>
  );
}

function AskButton({ onClick, label = "Hỏi AI" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ border: "1px solid rgba(232,184,75,0.4)", color: "var(--gold-bright, #e8b84b)", background: "transparent" }}>
      <MessageSquare className="w-3 h-3" />{label}
    </button>
  );
}

interface WsStock {
  ticker: string; icb: { l1: string; l2: string; l3: string } | null; sector: { icb: string; nameVi: string } | null;
  sectorShort: { stance: ShortStance; alphaBps: number | null; pOutperform: number | null; z: number | null } | null;
  sectorMedium: { stance: MediumStance; ws3m: number | null; rrg: string | null } | null;
  stockExposure: { weightPct: number | null; betaPct: number | null; corr: number | null; d1Pct: number | null; m1Pct: number | null; m3Pct: number | null } | null;
  drivers: { id: string; nameVi: string; sign: 1 | -1 }[]; note: string | null;
}

function StockLookup({ onAsk, commodityPct, catalyst }: { onAsk: (q: string) => void; commodityPct: Map<string, { pct: number | null; basisVi: string }>; catalyst: Record<string, { direction: string; compositeScore: number }> }) {
  const selectTicker = useAppStore((s) => s.selectTicker);
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ loading: boolean; data: WsStock | null; error: string | null; guidance: string[] }>({ loading: false, data: null, error: null, guidance: [] });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ticker = q.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,5}$/.test(ticker)) { setState({ loading: false, data: null, error: "Nhập mã cổ phiếu 3–5 ký tự (VD HPG).", guidance: [] }); return; }
    setState({ loading: true, data: null, error: null, guidance: [] });
    try {
      const r = await fetchMarketJson<{ ok: boolean; data?: WsStock; error?: string; guidance?: string[] }>("/api/world-sectors/tools/ws_stock", {}, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker }),
      });
      setState(r.ok && r.data ? { loading: false, data: r.data, error: null, guidance: r.guidance ?? [] } : { loading: false, data: null, error: r.error ?? "Không tra cứu được.", guidance: [] });
    } catch (err) {
      setState({ loading: false, data: null, error: err instanceof Error ? err.message : "Lỗi kết nối.", guidance: [] });
    }
  };
  const d = state.data;
  const cat = d ? catalyst[d.ticker] : undefined;
  return (
    <Card title="Tra cứu tác động lên một cổ phiếu" testId="impact-stock-lookup">
      <form onSubmit={submit} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã cổ phiếu, VD HPG" aria-label="Mã cổ phiếu" maxLength={5}
          className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-[11.5px] uppercase"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)", outline: "none" }} />
        <button type="submit" disabled={state.loading} className="rounded-lg px-3 text-[11px] font-bold" style={{ background: "var(--gold-bright, #e8b84b)", color: "#0b1220", opacity: state.loading ? 0.6 : 1 }}>
          {state.loading ? "Đang tra…" : "Tra cứu"}
        </button>
      </form>
      {state.error && <p className="text-[10.5px]" style={{ color: "var(--negative)" }}>{state.error}</p>}
      {d && (
        <div className="space-y-2" data-testid="impact-stock-result">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[12px] font-bold" style={{ color: "#f1f5f9" }}>
              {d.ticker} <span className="font-normal text-[10.5px]" style={muted}>{d.sector ? `${d.sector.nameVi} · ICB ${d.sector.icb}` : "chưa có ngành trong bảng 22 ngành"}</span>
            </p>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => selectTicker(d.ticker)} className="text-[9.5px] font-bold px-1.5 py-0.5 rounded" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Mở biểu đồ</button>
              <AskButton onClick={() => onAsk(askTicker(d.ticker))} label="Hỏi AI về mã này" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10.5px]">
            <div className="rounded-lg p-2 space-y-1" style={{ background: "rgba(148,163,184,0.05)" }}>
              <p className="text-[9px] font-bold uppercase" style={muted}>Ngành — ngắn hạn (đã kiểm định, lợi thế nhỏ)</p>
              {d.sectorShort ? (
                <p style={{ color: "var(--text-secondary)" }}>
                  <span className={chip} style={{ background: STANCE_BG[d.sectorShort.stance], color: "#f1f5f9" }}>{SHORT_STANCE_VI[d.sectorShort.stance]}</span>{" "}
                  α <b style={{ color: "#f1f5f9" }}>{fmtZ(d.sectorShort.alphaBps, 1)}</b> đcb/phiên · P vượt VN-Index {d.sectorShort.pOutperform == null ? "—" : `${num(d.sectorShort.pOutperform * 100, 1)}%`}
                </p>
              ) : <p style={muted}>—</p>}
              <p className="text-[9px] font-bold uppercase pt-1" style={muted}>Ngành — trung hạn (bối cảnh, không dự báo)</p>
              {d.sectorMedium ? (
                <p style={{ color: "var(--text-secondary)" }}>
                  <span className={chip} style={{ background: MED_TONE[d.sectorMedium.stance] ? divergingColor(MED_TONE[d.sectorMedium.stance]) : "rgba(148,163,184,0.25)", color: "#f1f5f9" }}>{MEDIUM_STANCE_VI[d.sectorMedium.stance]}</span>{" "}
                  thế giới 3T {fmtZ(d.sectorMedium.ws3m, 2)}{d.sectorMedium.rrg ? ` · RRG ${QUADRANT_VI[d.sectorMedium.rrg] ?? d.sectorMedium.rrg}` : ""}
                </p>
              ) : <p style={muted}>—</p>}
            </div>
            <div className="rounded-lg p-2 space-y-1" style={{ background: "rgba(148,163,184,0.05)" }}>
              <p className="text-[9px] font-bold uppercase" style={muted}>Phơi nhiễm của mã (mô tả)</p>
              {d.stockExposure ? (
                <p style={{ color: "var(--text-secondary)" }}>
                  Tỷ trọng trong ngành {num(d.stockExposure.weightPct)}% · β với ngành thế giới {num(d.stockExposure.betaPct, 2)} · tương quan {num(d.stockExposure.corr, 2)}
                  <br />Giá: 1 phiên {fmtZ(d.stockExposure.d1Pct, 1)}% · 1 tháng {fmtZ(d.stockExposure.m1Pct, 1)}% · 3 tháng {fmtZ(d.stockExposure.m3Pct, 1)}%
                </p>
              ) : <p style={muted}>{d.note ?? "Mã không nằm trong nhóm thành phần lớn — tác động suy từ ngành."}</p>}
              <p className="text-[9px] font-bold uppercase pt-1" style={muted}>Hàng hoá dẫn dắt · chất xúc tác</p>
              <p style={{ color: "var(--text-secondary)" }}>
                {d.drivers.length ? d.drivers.map((x) => {
                  const c = commodityPct.get(x.id);
                  return `${x.nameVi}${x.sign < 0 ? " (chiều ngược)" : ""}${c?.pct != null ? ` ${fmtZ(c.pct, 1)}% ${c.basisVi}` : ""}`;
                }).join(" · ") : "Không có hàng hoá dẫn dắt trực tiếp."}
                <br />Xúc tác: {cat && cat.direction !== "none" ? <b style={{ color: cat.direction === "benefit" ? "var(--positive)" : "var(--negative)" }}>{cat.direction === "benefit" ? "tích cực" : "tiêu cực"} (điểm {cat.compositeScore}, thử nghiệm)</b> : "không có tin tác động trong lần quét gần nhất"}
              </p>
            </div>
          </div>
          {state.guidance.length > 0 && <p className="text-[9px]" style={muted}>{state.guidance.join(" ")}</p>}
        </div>
      )}
    </Card>
  );
}

export default function ImpactBoard({ onAsk }: { onAsk: (question: string) => void }) {
  const { data: strategy, error: stErr } = useWorldStrategy();
  const { data: scores } = useWorldSectorScores();
  const { data: commodities } = useCommoditySnapshot();
  const { snapshot } = useCatalystData();
  const [open, setOpen] = useState<string | null>(null);

  const constituents = useMemo(() => new Map((strategy?.short.rows ?? []).map((r) => [r.icb, r.constituents.map((c) => c.ticker)])), [strategy]);
  const cat = useMemo(() => catalystByIcb(snapshot, constituents), [snapshot, constituents]);
  const medium = useMemo(() => new Map((strategy?.medium ?? []).map((m) => [m.icb, m])), [strategy]);
  const wsRows = useMemo(() => new Map((scores?.rows ?? []).map((r) => [r.icb, r])), [scores]);
  const commodityPct = useMemo(() => new Map((commodities?.items ?? []).filter((i) => i.available && i.change).map((i) => [i.id, i.change!])), [commodities]);
  const catAge = ageDays(snapshot?.scannedAt);
  const catalystStale = catAge != null && catAge >= 2;
  const lastDaily = useMemo(() => (commodities?.items ?? []).filter((i) => i.freq === "day" && i.period).map((i) => i.period!).sort().pop() ?? null, [commodities]);

  if (stErr) return <p className="text-xs" style={{ color: "var(--negative)" }}>Không tải được chiến lược ngành: {stErr.message}</p>;
  const rows = strategy?.short.rows ?? [];
  const max = Math.max(5, ...rows.map((r) => Math.abs(r.alphaBps ?? 0)));
  const drawerRow = open ? wsRows.get(open) : undefined;

  return (
    <div className="tw-scope space-y-3" data-testid="impact-board">
      <div>
        <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>Tác động tới ngành & cổ phiếu Việt Nam</p>
        <p className="text-[9.5px]" style={muted}>Ghép chiến lược ngành thế giới · hàng hoá · chất xúc tác theo 22 ngành ICB. Bấm một ngành để xem phân tích chuyên sâu, hoặc “Hỏi AI” để Claude/Gemini phân tích bằng công cụ.</p>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[9.5px]" data-testid="impact-freshness">
        <span className="px-2 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.08)", color: "var(--text-secondary)" }}>Chiến lược thế giới: phiên VN {fmtDate(strategy?.vnLast)}</span>
        <span className="px-2 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.08)", color: "var(--text-secondary)" }}>Hàng hoá: phiên {fmtDate(lastDaily)}</span>
        <span className="px-2 py-0.5 rounded" style={{ background: catalystStale ? "rgba(245,158,11,0.12)" : "rgba(148,163,184,0.08)", color: catalystStale ? "var(--gold, #fbbf24)" : "var(--text-secondary)" }}>
          Chất xúc tác: quét {fmtDate(snapshot?.scannedAt)}{catAge != null ? ` (${catAge === 0 ? "hôm nay" : `${catAge} ngày trước`})` : ""}
        </span>
      </div>
      {catalystStale && (
        <p className="text-[10px] rounded-lg px-3 py-2 flex items-start gap-1.5" data-testid="impact-catalyst-stale" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--gold, #fbbf24)" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Engine chất xúc tác chưa quét lại từ {fmtDate(snapshot?.scannedAt)} — cột “Xúc tác” là kết quả lần quét cuối. Chiến lược thế giới, hàng hoá và vĩ mô vẫn cập nhật bình thường (Market Gateway).
        </p>
      )}
      {strategy?.regime.stressed && (
        <p className="text-[10px] rounded-lg px-3 py-2 flex items-start gap-1.5" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--gold, #fbbf24)" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> VIX {num(strategy.regime.vix, 2)} ({fmtZ(strategy.regime.vixChg, 1)}% phiên {fmtDate(strategy.regime.date)}). {strategy.regime.noteVi}
        </p>
      )}

      <StockLookup onAsk={onAsk} commodityPct={commodityPct} catalyst={snapshot?.tickerImpacts ?? {}} />

      <Card title="Bảng tác động theo ngành ICB" testId="impact-sector-board"
        tag={strategy && <EvidenceTag kind={strategy.evidence.short.label === "EVIDENCE" ? "evidence" : "heuristic"} title={`Ngắn hạn: ${strategy.evidence.short.version}, IC ${strategy.evidence.short.ic}. Trung hạn: ${strategy.evidence.medium.reasonVi} Xúc tác: chiều tác động chưa kiểm chứng đủ mẫu (thử nghiệm).`} />}>
        {!strategy ? <p className="text-xs italic py-4 text-center" style={muted}>Đang tổng hợp…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10.5px]" style={{ borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr style={muted}>
                  <th className="text-left font-normal">Ngành</th>
                  <th className="font-normal" title="Đã kiểm định đặt trước — lợi thế nhỏ">Ngắn hạn · α (đcb/phiên)</th>
                  <th className="font-normal" title="Bối cảnh 1–3 tháng — không dự báo">Trung hạn</th>
                  <th className="text-left font-normal">Hàng hoá dẫn dắt</th>
                  <th className="text-left font-normal" title="Engine xúc tác — chiều chưa kiểm chứng (thử nghiệm)">Xúc tác</th>
                  <th className="text-left font-normal">Mã lớn nhất</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const m = medium.get(r.icb);
                  const c = cat.get(r.icb);
                  const drivers = wsRows.get(r.icb)?.drivers ?? [];
                  return (
                    <tr key={r.icb} onClick={() => wsRows.has(r.icb) && setOpen(r.icb)} data-testid={`impact-row-${r.icb}`} style={{ borderTop: "1px solid rgba(148,163,184,0.08)", cursor: wsRows.has(r.icb) ? "pointer" : "default" }}>
                      <td className="py-1.5" style={{ color: "#f1f5f9" }}>{r.parent ? "· " : ""}{r.nameVi} <span style={muted}>{r.icb}</span></td>
                      <td className="text-center whitespace-nowrap">
                        <span className={chip} style={{ background: STANCE_BG[r.stance], color: "#f1f5f9" }}>{SHORT_STANCE_VI[r.stance]}</span>{" "}
                        <span aria-hidden="true" style={{ display: "inline-block", width: 36, height: 5, position: "relative", background: "rgba(148,163,184,0.12)", borderRadius: 3, verticalAlign: "middle" }}>
                          {r.alphaBps != null && <span style={{ position: "absolute", top: 0, height: 5, borderRadius: 3, background: divergingColor(r.alphaBps >= 0 ? 2.5 : -2.5), left: r.alphaBps >= 0 ? "50%" : `${50 - Math.min(1, Math.abs(r.alphaBps) / max) * 50}%`, width: `${Math.min(1, Math.abs(r.alphaBps) / max) * 50}%` }} />}
                        </span>{" "}
                        <b style={{ color: "#f1f5f9" }}>{fmtZ(r.alphaBps, 1)}</b>
                      </td>
                      <td className="text-center">{m ? <span className={chip} style={{ background: MED_TONE[m.stance] ? divergingColor(MED_TONE[m.stance]) : "rgba(148,163,184,0.2)", color: "#f1f5f9" }}>{MEDIUM_STANCE_VI[m.stance]}</span> : "—"}</td>
                      <td style={{ color: "var(--text-secondary)" }}>
                        {drivers.length ? drivers.map((x) => {
                          const pct = commodityPct.get(x.id)?.pct ?? x.short?.pct ?? null;
                          const eff = pct == null ? null : pct * x.sign;
                          return <span key={x.id} className="mr-1.5 whitespace-nowrap" title={`${commodityPct.get(x.id)?.basisVi ?? "phiên gần nhất"} · ${x.sign < 0 ? "chiều ngược: giá tăng là bất lợi cho ngành" : "cùng chiều"}`}>{x.nameVi} <b style={{ color: eff == null || eff === 0 ? "var(--text-secondary)" : eff > 0 ? "var(--positive)" : "var(--negative)" }}>{fmtZ(pct, 1)}%</b></span>;
                        }) : <span style={muted}>—</span>}
                      </td>
                      <td style={{ color: "var(--text-secondary)" }}>
                        {c ? (
                          <>
                            {c.sectors.length > 0 && Math.abs(c.netScore) >= 0.05 && <span className="mr-1">điểm {fmtZ(c.netScore, 1)}</span>}
                            {c.benefit.length > 0 && <span className="mr-1" style={{ color: "var(--positive)" }}>▲ {c.benefit.slice(0, 3).join(", ")}</span>}
                            {c.harm.length > 0 && <span style={{ color: "var(--negative)" }}>▼ {c.harm.slice(0, 3).join(", ")}</span>}
                          </>
                        ) : <span style={muted}>—</span>}
                      </td>
                      <td style={{ color: "var(--gold, #f59e0b)" }} className="font-bold text-[9.5px]">{r.constituents.slice(0, 3).map((x) => x.ticker).join(" ")}</td>
                      <td className="text-right"><AskButton onClick={() => onAsk(askSector(r.nameVi, r.icb))} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[9px] leading-relaxed" style={muted}>
          Ngắn hạn: α = IC × σ × z, xếp hạng ngành đã kiểm định đặt trước (IC ≈ {strategy?.evidence.short.ic ?? "0,02"} — lợi thế nhỏ, P vượt ≈ 50–55%). Trung hạn chỉ là bối cảnh (kiểm định không đạt).
          Hàng hoá: biến động phiên/kỳ gần nhất, màu theo chiều tác động lên ngành. Xúc tác: engine tin tức, chiều chưa kiểm chứng đủ mẫu. Tham khảo — không phải khuyến nghị đầu tư.
        </p>
      </Card>
      {open && drawerRow && <WorldSectorDrawer icb={open} row={drawerRow} onClose={() => setOpen(null)} />}
    </div>
  );
}
