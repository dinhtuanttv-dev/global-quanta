// Trading Matrix M3 — bảng kịch bản (spec §6.5), cờ rủi ro (§6.6) và sổ tín hiệu (§6.10). THỰC NGHIỆM công khai:
// trạng thái CONFIRMED chỉ được gọi "Xác nhận" khi kịch bản đạt kiểm định đặt trước; còn lại "Đủ điều kiện quy tắc".
import type { MatrixOverview, MatrixSignals, RiskFlag, Scenario } from "../../../../hooks/useTradingMatrix";
import { TONE, vn, when } from "./MatrixCards";

const STATE_STYLE: Record<Scenario["state"], { glyph: string; tone: keyof typeof TONE }> = {
  CONFIRMED: { glyph: "◉", tone: "warn" }, WATCH: { glyph: "◎", tone: "neutral" }, INVALIDATED: { glyph: "✕", tone: "bear" },
  COOLDOWN: { glyph: "◌", tone: "missing" }, INACTIVE: { glyph: "○", tone: "missing" },
};

function ScenarioCard({ s }: { s: Scenario }) {
  const st = STATE_STYLE[s.state], t = TONE[st.tone];
  const active = s.state === "CONFIRMED" || s.state === "WATCH";
  return (
    <div className={`rounded-lg border ${t.bd} ${active ? t.bg : ""} p-2 space-y-1 min-w-0`} data-testid={`mx-scenario-${s.id}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-100 leading-tight">{s.title}</span>
        <span className="text-[8px] px-1 rounded text-amber-300 bg-amber-500/10 shrink-0" title={s.validation.summary}>{s.validation.label}</span>
      </div>
      <div className={`text-[11px] font-semibold ${t.fg}`}><span aria-hidden>{st.glyph}</span> {s.displayState}{s.since ? <span className="text-[9px] text-slate-500 font-normal"> · từ {when(s.since)}</span> : null}</div>
      <p className="text-[9.5px] text-slate-400 leading-snug">{s.meaning}</p>
      {s.evidence.length > 0 && <ul className="text-[9.5px] text-slate-300 space-y-0.5">{s.evidence.map((e) => <li key={e}><span className="text-emerald-400" aria-label="ủng hộ">✓</span> {e}</li>)}</ul>}
      {active && s.contradictions.length > 0 && <ul className="text-[9.5px] text-slate-400 space-y-0.5">{s.contradictions.map((e) => <li key={e}><span className="text-rose-400" aria-label="mâu thuẫn">✗</span> {e}</li>)}</ul>}
      <p className="text-[9px] text-amber-200/80 leading-snug border-t border-white/5 pt-1">Kiểm định: {s.validation.summary}</p>
    </div>
  );
}

export function ScenarioBoard({ d }: { d: MatrixOverview }) {
  if (!d.scenarios?.length) return <p className="text-[10px] text-slate-500">Kịch bản: chưa đủ dữ liệu ngày để đánh giá.</p>;
  return (
    <div className="space-y-1.5" data-testid="mx-scenarios">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[10px] font-bold text-slate-300">Kịch bản thị trường · {d.scope.label}</h3>
        <span className="text-[9px] text-slate-500">Quy tắc {d.scenarios[0].ruleVersion} · ≥ 2 nhóm bằng chứng độc lập (giá chỉ số / độ rộng / biến động) · THỰC NGHIỆM</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
        {d.scenarios.map((s) => <ScenarioCard key={s.id} s={s} />)}
        <div className={`rounded-lg border ${d.neutral?.active ? TONE.neutral.bd : "border-dashed border-slate-700/50"} p-2 space-y-1`} data-testid="mx-scenario-SC0">
          <span className="text-[11px] font-semibold text-slate-100">Chuyển pha / chưa xác định</span>
          <div className={`text-[11px] font-semibold ${d.neutral?.active ? "text-slate-200" : "text-slate-500"}`}>{d.neutral?.active ? "■ Đang áp dụng" : "○ Không áp dụng"}</div>
          {d.neutral?.reasons?.length ? <ul className="text-[9.5px] text-slate-400">{d.neutral.reasons.map((r) => <li key={r}>• {r}</li>)}</ul> : <p className="text-[9.5px] text-slate-500">Có kịch bản đang theo dõi.</p>}
        </div>
      </div>
    </div>
  );
}

const FLAG_GLYPH: Record<RiskFlag["status"], { g: string; text: string; cls: string }> = {
  ON: { g: "▲", text: "Đang bật", cls: "text-amber-300" }, OFF: { g: "○", text: "Không", cls: "text-slate-500" },
  UNAVAILABLE: { g: "✕", text: "Chưa có nguồn", cls: "text-slate-500" }, CHECKLIST: { g: "☐", text: "Tự kiểm tra", cls: "text-cyan-300" },
};

export function RiskChecklist({ flags }: { flags: RiskFlag[] }) {
  return (
    <div className="space-y-1 min-w-0" data-testid="mx-risk">
      <h3 className="text-[10px] font-bold text-slate-300">Cờ rủi ro cần xem xét <span className="font-normal text-slate-500">(không phải lệnh mua / bán)</span></h3>
      <ul className="space-y-1">
        {flags.map((f) => {
          const g = FLAG_GLYPH[f.status];
          return (
            <li key={f.id} className="text-[10px] flex gap-2">
              <span className={`shrink-0 ${g.cls}`} aria-hidden>{g.g}</span>
              <span className="min-w-0 flex-1">
                <span className="text-slate-200">{f.title}</span> <span className={`text-[9px] ${g.cls}`}>· {g.text}</span>
                {f.detail && <span className="block text-[9px] text-slate-400">{f.detail}</span>}
                {f.status === "ON" && f.evidence?.length ? <span className="block text-[9px] text-slate-400">{f.evidence.join(" · ")}</span> : null}
                {f.trigger && <span className="block text-[9px] text-slate-500">Bật khi: {f.trigger}{f.close ? ` · Tắt khi: ${f.close}` : ""}</span>}
                {f.validation && <span className="block text-[9px] text-amber-200/70">{f.validation}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SignalJournal({ data }: { data: MatrixSignals | undefined }) {
  if (!data) return <p className="text-[10px] text-slate-500">Đang tải sổ tín hiệu…</p>;
  const ids = ["SC1", "SC2", "SC3"];
  return (
    <div className="space-y-1.5 min-w-0" data-testid="mx-journal">
      <h3 className="text-[10px] font-bold text-slate-300">Sổ tín hiệu & kiểm định</h3>
      <table className="w-full text-[9.5px] font-mono">
        <thead><tr className="text-slate-500"><th className="text-left font-normal">Kịch bản</th><th className="text-right font-normal">Lịch sử OOS (10 phiên)</th><th className="text-right font-normal">Thực tế T+10</th></tr></thead>
        <tbody>
          {ids.map((id) => {
            const v = data.validation.stats[id], lv = data.live[id]?.["10"];
            return (
              <tr key={id} className="border-t border-white/5 text-slate-300">
                <td className="font-sans">{id} <span className="text-[8px] text-amber-300">{data.validation.verdicts[id]}</span></td>
                <td className="text-right">{v?.OOS?.n ?? 0} đợt · {v?.OOS?.mean != null ? `${v.OOS.mean > 0 ? "+" : ""}${vn(v.OOS.mean, 2)}%` : "—"}</td>
                <td className="text-right">{lv?.n ? `${lv.n} đợt · ${vn(lv.meanExcess, 2)}%` : "chưa có"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {data.recent.length > 0 ? (
        <ul className="text-[9.5px] text-slate-400 space-y-0.5">{data.recent.slice(0, 6).map((r) => <li key={`${r.scenario}${r.date}`}>{when(r.date)} · {r.scenario} → {r.state}</li>)}</ul>
      ) : <p className="text-[9.5px] text-slate-500">Sổ bắt đầu ghi từ phiên đầu tiên sau triển khai (16:50).</p>}
      <p className="text-[9px] text-slate-500">{data.note} Kết quả so với nền = TB lợi suất cùng kỳ hạn 250 phiên trước.</p>
    </div>
  );
}
