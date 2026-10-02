import { REGIME_LABEL, useResearchOverview, type ForwardStats, type PerformanceRow } from "../../../hooks/useResearch";

// Panel cột trái (vĩ mô): AI phân tích riêng VN-Index. Chỉ số cấp MÃ (điểm thích ứng, bảng hiệu suất
// tín hiệu, trọng số học được) nằm trong Bảng phân tích khối lượng của từng mã.
// Màu luôn kèm ký hiệu/chữ: ▲ Uptrend (xanh), ■ Sideway (hổ phách), ▼ Downtrend (đỏ).
const REGIME_STYLE: Record<string, { color: string; glyph: string }> = {
  UPTREND: { color: "#059669", glyph: "▲" },
  SIDEWAY: { color: "#d97706", glyph: "■" },
  DOWNTREND: { color: "#e11d48", glyph: "▼" },
};
const VERDICT: Record<PerformanceRow["verdict"], { glyph: string; text: string; color: string }> = {
  edge: { glyph: "✓", text: "có lợi thế", color: "#059669" },
  negative: { glyph: "✗", text: "ngược kỳ vọng", color: "#e11d48" },
  none: { glyph: "≈", text: "như ngẫu nhiên", color: "#64748b" },
  insufficient: { glyph: "…", text: "chưa đủ mẫu", color: "#64748b" },
};
const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
const signedPct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`);

function StatCell({ s }: { s: ForwardStats | undefined }) {
  if (!s || !s.n) return <td className="px-1 text-right text-slate-600">—</td>;
  return (
    <td className="px-1 text-right whitespace-nowrap" title={`P(tăng) ${pct(s.pUp, 1)} · KTC95% ${pct(s.lo)}–${pct(s.hi)} (n=${s.n}, hiệu dụng ≈ ${s.nEff}) · lợi suất TB ${signedPct(s.meanRet)}`}>
      <span className="text-slate-100">{pct(s.pUp)}</span>
      <span style={{ color: (s.meanRet ?? 0) >= 0 ? "#059669" : "#e11d48" }}> {signedPct(s.meanRet)}</span>
    </td>
  );
}

export default function VnIndexAiPanel() {
  const { data, error, isLoading, enabled } = useResearchOverview();
  if (!enabled) return null;
  const box = { background: "rgba(13,17,26,0.75)", border: "1px solid rgba(255,255,255,0.06)" };
  if (isLoading) return <div style={box} className="rounded-xl p-4 text-[10px] text-slate-500">Đang tải phân tích AI VN-Index…</div>;
  const a = data?.index;
  if (error || !a) return <div style={box} className="rounded-xl p-4 text-[10px] text-slate-500">Chưa có phân tích AI VN-Index (Gateway chưa chạy job nghiên cứu).</div>;

  const cur = a.current;
  const st = REGIME_STYLE[cur.regime];
  const impulseRows = (data.performance ?? []).filter((r) => r.signal === "IMPULSE" && r.regime === "ALL");
  const maPos = (ma: number | null, label: string) => (ma ? `${cur.close >= ma ? "trên" : "dưới"} ${label} (${((cur.close / ma - 1) * 100).toFixed(1)}%)` : null);

  return (
    <div style={box} className="rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-violet-300">AI phân tích VN-Index</h2>
        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ color: st.color, border: `1px solid ${st.color}` }}
          title="Uptrend: giá > MA50, MA20 > MA50, MA50 dốc lên 10 phiên · Downtrend: ngược lại · còn lại: Sideway">
          {st.glyph} {REGIME_LABEL[cur.regime]} · {cur.streak} phiên
        </span>
      </div>

      <div className="text-[9px] text-slate-400 mb-1.5">
        Phiên {cur.date}: VN-Index {cur.close.toLocaleString("vi-VN")} · {[maPos(cur.ma20, "MA20"), maPos(cur.ma50, "MA50"), maPos(cur.ma200, "MA200")].filter(Boolean).join(" · ")}
        {" · "}độ rộng {cur.breadthPct ?? "—"}% · Impulse {cur.impulseScore ?? "—"}
      </div>

      {/* Dải trạng thái 60 phiên gần nhất */}
      <div className="text-[8.5px] text-slate-500 mb-0.5">Trạng thái 60 phiên gần nhất</div>
      <div className="flex gap-px mb-2" role="img" aria-label={`Trạng thái 60 phiên: hiện ${REGIME_LABEL[cur.regime]} ${cur.streak} phiên liên tiếp`}>
        {a.history.map((h) => (
          <div key={h.date} className="flex-1 h-3 rounded-sm" style={{ background: REGIME_STYLE[h.regime].color, opacity: h.date === cur.date ? 1 : 0.6 }}
            title={`${h.date}: ${REGIME_LABEL[h.regime]} · VN-Index ${h.close.toLocaleString("vi-VN")} · Impulse ${h.impulseScore ?? "—"} · độ rộng ${h.breadthPct ?? "—"}%`} />
        ))}
      </div>

      {/* VN-Index sau T+h theo trạng thái */}
      <div className="text-[8.5px] text-slate-500 mb-0.5">VN-Index sau T+h phiên theo trạng thái: P(tăng) · lợi suất TB</div>
      <table className="w-full text-[9px] font-mono mb-2">
        <thead className="text-slate-500">
          <tr><th className="text-left font-normal px-1">Trạng thái</th><th className="text-right font-normal px-1">T+3</th><th className="text-right font-normal px-1">T+5</th><th className="text-right font-normal px-1">T+10</th></tr>
        </thead>
        <tbody>
          {(["UPTREND", "SIDEWAY", "DOWNTREND"] as const).map((reg) => {
            const g = a.byRegime[reg];
            const isCur = reg === cur.regime;
            return (
              <tr key={reg} className={`border-t border-white/5 ${isCur ? "bg-white/5" : ""}`}>
                <td className="px-1 font-sans whitespace-nowrap" style={{ color: REGIME_STYLE[reg].color }}
                  title={`${g.sessions} phiên (${pct(g.share)} thời gian) · mỗi đợt kéo dài TB ${g.avgRun ?? "—"} phiên`}>
                  {REGIME_STYLE[reg].glyph} {REGIME_LABEL[reg]}{isCur ? " (hiện tại)" : ""}
                </td>
                {[3, 5, 10].map((h) => <StatCell key={h} s={g.horizons[String(h)]} />)}
              </tr>
            );
          })}
          <tr className="border-t border-white/10 text-slate-400">
            <td className="px-1 font-sans">Mọi phiên</td>
            {[3, 5, 10].map((h) => <StatCell key={h} s={a.base[String(h)]} />)}
          </tr>
        </tbody>
      </table>

      {/* Theo vùng Market Impulse */}
      <div className="text-[8.5px] text-slate-500 mb-0.5">Theo vùng Market Impulse</div>
      <table className="w-full text-[9px] font-mono mb-2">
        <tbody>
          {(["LOW", "MID", "HIGH"] as const).map((z) => {
            const g = a.byImpulse[z];
            const isCur = z === cur.impulseZone;
            return (
              <tr key={z} className={`border-t border-white/5 ${isCur ? "bg-white/5" : ""}`}>
                <td className="px-1 font-sans text-slate-300 whitespace-nowrap" title={`${g.sessions} phiên`}>{g.label}{isCur ? " (hiện tại)" : ""}</td>
                {[3, 5, 10].map((h) => <StatCell key={h} s={g.horizons[String(h)]} />)}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Chấm điểm tín hiệu Market Impulse */}
      <div className="text-[8.5px] text-slate-500 mb-0.5">Tín hiệu Impulse (≥ 60 mua / ≤ 40 bán) đã chấm: trúng / nền · z (đã tính chồng lấn)</div>
      <div className="grid grid-cols-3 gap-1 text-[9px] mb-1">
        {[3, 5, 10].map((h) => {
          const r = impulseRows.find((x) => x.horizon === h);
          const v = r ? VERDICT[r.verdict] : null;
          return (
            <div key={h} className="rounded px-1 py-0.5 bg-white/5" title={r ? `n=${r.n} (hiệu dụng ≈ ${r.effectiveN ?? r.n}) · mua ${r.long} / bán ${r.short} · KTC95% ${pct(r.hitLow)}–${pct(r.hitHigh)}` : undefined}>
              <div className="text-slate-500">T+{h}</div>
              {r ? (
                <>
                  <div className="text-slate-100">{pct(r.hitRate, 1)} <span className="text-slate-500">/ {pct(r.baseline, 0)}</span> <span className="text-slate-400">z {(r.zHitClustered ?? r.zHit ?? 0).toFixed(1)}</span></div>
                  <div style={{ color: v!.color }}>{v!.glyph} {v!.text}</div>
                </>
              ) : <div className="text-slate-500">chưa có dữ liệu</div>}
            </div>
          );
        })}
      </div>
      <div className="text-[8.5px] text-slate-500">
        Dữ liệu {a.from} → {a.to}. {a.note} Chỉ số AI của từng mã: nhấn đúp một dòng trong Bảng Siêu Quét.
      </div>
    </div>
  );
}
