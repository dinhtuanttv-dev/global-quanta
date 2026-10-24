// EP4 (24/10/2026) — BẢNG "ELLIOTT PRO": một bảng duy nhất cho mọi thứ về Elliott, thay các khối rời.
//   Tổng quan — vị trí trên cây sóng v3 theo khung Tuần / Ngày / (khung trong ngày đang xem), nhãn kép, bật lớp + chế độ.
//   Kịch bản  — kịch bản có vòng đời + "Theo dõi kịch bản" (tạo một lần 3 cảnh báo: kích hoạt · mục tiêu 1 · vô hiệu).
//   Quy tắc   — quy tắc cứng / mềm của cấu trúc ở bậc hiển thị và các sóng con.
//   Hiệu quả  — sổ theo dõi thời gian thực (Gateway) + kiểm định lịch sử (EP5).
//   Của tôi   — chỉnh tay cách đếm, lịch sử phiên bản, cảnh báo.
//   Theo sách — engine GET cũ (E1–E6, DW1–DW9) để đối chiếu theo sách.
import { useMemo, useState, type ReactNode } from "react";
import { Bell, BellRing, Eye, EyeOff } from "lucide-react";
import useSWR from "swr";
import { fetchMarketJson, isMarketGatewayEnabled } from "../../../services/marketDataClient";
import { aggregateToWeekly } from "../../../lib/ta-command-center/TimeframeController";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";
import { buildWaveTree, describePosition, treeCovers, type WaveNode, type WaveTree } from "../../../lib/quant-core/elliott/v3/waveTree";
import { EP1_VALIDATION } from "../../../lib/quant-core/elliott/v3/validation";
import { STATE_LABEL, type EwScenario } from "../../../lib/quant-core/elliott/v3/scenarios";
import { displayLevel, ELLIOTT_PRO_MODES, type ElliottProMode, type ScenarioView } from "../../../lib/ta-command-center/chart/elliottProScene";
import { PATTERN_NAME } from "../../../lib/quant-core/elliott/patterns";
import { ElliottLedgerSummary, ElliottScenarioList } from "./ElliottScenarioList";
import { useElliottAlerts, type ElliottAlert } from "./ElliottAlertsPanel";
import { EP5_BACKTEST } from "../../../lib/quant-core/elliott/v3/backtestResults";

const CARD = { background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" } as const;
type Tab = "overview" | "scenarios" | "rules" | "performance" | "mine" | "book";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Tổng quan" }, { id: "scenarios", label: "Kịch bản" }, { id: "rules", label: "Quy tắc" },
  { id: "performance", label: "Hiệu quả" }, { id: "mine", label: "Của tôi" }, { id: "book", label: "Theo sách" },
];
const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");
const toCandles = (bars: OhlcvBar[]) => bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));

/** Ba cảnh báo của một kịch bản (máy chủ chỉ so giá): kích hoạt (mức / đường B–D trên khung D), mục tiêu 1, vô hiệu. */
export function alertsForScenario(sc: EwScenario, ticker: string, tf: string): Omit<ElliottAlert, "id" | "createdAt" | "lastFiredAt" | "firedCount">[] {
  const up = sc.dir > 0;
  const base = { symbol: ticker, timeframe: tf, source: "auto" as const, channels: { telegram: false }, enabled: true, oneShot: true, cooldownMin: 240 };
  const trigger = sc.trigger.line && tf === "D"
    ? { type: "line" as const, a: { date: sc.trigger.line.a.time.slice(0, 10), price: sc.trigger.line.a.price }, b: { date: sc.trigger.line.b.time.slice(0, 10), price: sc.trigger.line.b.price }, side: (up ? "above" : "below") as "above" | "below" }
    : { type: "level" as const, price: sc.trigger.price, side: (up ? "above" : "below") as "above" | "below" };
  return [
    { ...base, kind: "channel", label: `${sc.title}: kích hoạt — ${sc.trigger.text}`, condition: trigger },
    { ...base, kind: "target", label: `${sc.title}: mục tiêu 1 ${sc.targets[0].label} ${fmt(sc.targets[0].price)}`, condition: { type: "level", price: sc.targets[0].price, side: up ? "above" : "below" } },
    { ...base, kind: "invalidation", label: `${sc.title}: vô hiệu — ${sc.invalidation.text}`, condition: { type: "level", price: sc.invalidation.price, side: up ? "below" : "above" } },
  ];
}

function FollowButton({ sc, ticker, tf }: { sc: EwScenario; ticker: string; tf: string }) {
  const { data, save } = useElliottAlerts();
  if (!data || sc.provisional) return null;
  const want = alertsForScenario(sc, ticker, tf);
  const same = (a: ElliottAlert, w: (typeof want)[number]) => a.symbol === ticker && JSON.stringify(a.condition) === JSON.stringify(w.condition);
  const following = want.every((w) => data.alerts.some((a) => a.enabled && same(a, w)));
  const toggle = () => {
    const next = following ? data.alerts.filter((a) => !want.some((w) => same(a, w)))
      : [...data.alerts, ...want.filter((w) => !data.alerts.some((a) => same(a, w))).map((w, k) => ({ ...w, id: `f${Date.now().toString(36)}${k}`, createdAt: new Date().toISOString(), lastFiredAt: null, firedCount: 0 }))];
    void save(next as ElliottAlert[]);
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={following} data-testid="elliott-follow"
      className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border ${following ? "border-amber-500/50 text-amber-300 bg-amber-500/10" : "border-slate-700 text-slate-300"}`}
      title="Tạo một lần 3 cảnh báo: kích hoạt · mục tiêu 1 · vô hiệu (máy chủ kiểm mỗi phút trong phiên)">
      {following ? <BellRing className="w-3 h-3" /> : <Bell className="w-3 h-3" />}{following ? "Đang theo dõi" : "Theo dõi kịch bản"}
    </button>
  );
}

function RuleBlock({ n, title }: { n: WaveNode; title: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-slate-200"><span className="text-slate-400">{title}:</span> <b className="text-amber-300">{n.pattern}</b> {n.pattern ? PATTERN_NAME[n.pattern] : ""} {n.complete ? "" : "(đang hình thành)"}</p>
      {n.fit ? (
        <ul className="text-[9px] space-y-0.5">{n.fit.rules.map((r) => (
          <li key={r.id} className={r.pass === false ? (r.severity === "hard" ? "text-rose-300" : "text-slate-500") : r.pass ? "text-emerald-300/90" : "text-slate-500"}>
            {r.pass === false ? "✗" : r.pass ? "✓" : "…"} {r.severity === "hard" ? "[cứng]" : "[mềm]"} {r.text}
          </li>))}
        </ul>
      ) : <p className="text-[9px] text-slate-500">Cấu trúc đang hình thành: đã qua các quy tắc cứng áp dụng được (sóng 2 không vượt gốc, sóng 3 vượt đỉnh 1, sóng 4 không lấn sóng 1…) và quy tắc cực trị.</p>}
    </div>
  );
}

interface LedgerRow { scenario: EwScenario; loggedAt: string; state: keyof typeof STATE_LABEL; outcome: string | null }

function SymbolLedger({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ rows: LedgerRow[] } | null>(isMarketGatewayEnabled() ? ["elliott-ledger", ticker] : null,
    () => fetchMarketJson<{ rows: LedgerRow[] }>("/api/market/elliott/ledger", { symbol: ticker }).catch(() => null), { revalidateOnFocus: false });
  if (!data?.rows.length) return <p className="text-[9px] text-slate-500">Sổ chưa có kịch bản của {ticker} (ghi sổ mỗi phiên sau 16:10).</p>;
  return (
    <ul className="space-y-0.5" data-testid="elliott-symbol-ledger">
      {data.rows.slice(0, 12).map((r) => (
        <li key={r.scenario.id} className="text-[9px] text-slate-400">
          <span className="font-mono">{r.loggedAt}</span> · {r.scenario.title} {r.scenario.dir > 0 ? "↑" : "↓"} (bậc {r.scenario.level}) · <span className="text-slate-200">{STATE_LABEL[r.state]}</span>
          {r.outcome && <span className={r.outcome === "hit" ? "text-emerald-300" : "text-rose-300"}> · {r.outcome === "hit" ? "đạt MT1 trước vô hiệu" : "vô hiệu sau kích hoạt"}</span>}
        </li>
      ))}
    </ul>
  );
}

function BacktestTable() {
  const b = EP5_BACKTEST;
  const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
  return (
    <div className="space-y-1" data-testid="elliott-backtest">
      <p className="text-[9px] text-slate-400">{b.summary}</p>
      <table className="w-full text-[9px]">
        <thead><tr className="text-slate-500 text-left"><th>Mẫu</th><th className="text-right">Kết thúc</th><th className="text-right">Đạt MT1</th><th className="text-right">Ngẫu nhiên</th><th className="text-right">z</th></tr></thead>
        <tbody>{b.byTemplate.map((r) => (
          <tr key={r.template} className="text-slate-300"><td>{r.title}</td><td className="text-right">{r.n}</td><td className="text-right">{pct(r.hitRate)}</td><td className="text-right">{pct(r.expectedRate)}</td>
            <td className={`text-right ${r.z != null && r.z >= 1.96 ? "text-emerald-300" : r.z != null && r.z <= -1.96 ? "text-rose-300" : ""}`}>{r.z == null ? "—" : r.z.toFixed(2).replace(".", ",")}</td></tr>))}
          <tr className="text-slate-100 font-semibold border-t border-slate-800"><td>Tất cả</td><td className="text-right">{b.all.n}</td><td className="text-right">{pct(b.all.hitRate)}</td><td className="text-right">{pct(b.all.expectedRate)}</td><td className="text-right">{b.all.z == null ? "—" : b.all.z.toFixed(2).replace(".", ",")}</td></tr>
        </tbody>
      </table>
      <p className="text-[9px]">Kết luận theo đăng ký trước: <b className={b.verdict === "ĐẠT" ? "text-emerald-300" : "text-rose-300"}>{b.verdict}</b></p>
    </div>
  );
}

interface Props {
  ticker: string;
  timeframe: string;
  tree: WaveTree | null;
  scenarios: ScenarioView[];
  dailyBars: OhlcvBar[];
  layerOn: boolean;
  onToggleLayer: () => void;
  mode: ElliottProMode;
  onMode: (m: ElliottProMode) => void;
  mine: ReactNode;
  book: ReactNode;
}

export default function ElliottProPanel({ ticker, timeframe, tree, scenarios, dailyBars, layerOn, onToggleLayer, mode, onMode, mine, book }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const frames = useMemo(() => {
    const d = dailyBars.length >= 60 ? buildWaveTree(toCandles(dailyBars)) : null;
    const wk = dailyBars.length >= 300 ? aggregateToWeekly(dailyBars) : [];
    const w = wk.length >= 60 ? buildWaveTree(toCandles(wk)) : null;
    const rows: { tag: string; t: WaveTree | null }[] = [{ tag: "Tuần", t: w }, { tag: "Ngày", t: d }];
    if (timeframe === "1H" || timeframe === "15m") rows.push({ tag: timeframe, t: tree });
    return rows;
  }, [dailyBars, timeframe, tree]);
  const tf = timeframe === "W" || timeframe === "1H" || timeframe === "15m" ? timeframe : "D";
  const lv = tree ? displayLevel(tree) : 0;
  const shown = tree && lv ? tree.levels[lv][tree.levels[lv].length - 1] : null;
  return (
    <div style={CARD} className="rounded-xl p-3 space-y-2" data-testid="elliott-pro-panel">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold text-cyan-300 uppercase tracking-wide">Elliott Pro</span>
        <span className="text-[8.5px] px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-300" title={EP5_BACKTEST.summary}>{EP5_BACKTEST.label}</span>
        <button type="button" onClick={onToggleLayer} aria-pressed={layerOn} data-testid="elliott-pro-toggle"
          className={`ml-auto inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md border ${layerOn ? "border-cyan-500/50 text-cyan-300 bg-cyan-500/10" : "border-slate-700 text-slate-400"}`}>
          {layerOn ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}Trên biểu đồ
        </button>
        <span className="flex gap-0.5" role="radiogroup" aria-label="Chế độ Elliott Pro">
          {ELLIOTT_PRO_MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => onMode(m.id)} data-testid={`elliott-pro-panel-mode-${m.id}`}
              className={`text-[9px] px-1.5 py-0.5 rounded border ${mode === m.id ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-400"}`}>{m.label}</button>
          ))}
        </span>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-800 pb-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`elliott-pro-tab-${t.id}`}
            className={`text-[10px] px-2 py-0.5 rounded-md ${tab === t.id ? "bg-slate-800 text-cyan-200" : "text-slate-400 hover:text-slate-200"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-1.5" data-testid="elliott-pro-overview">
          {frames.map((f) => (
            <div key={f.tag} className="rounded-lg p-2" style={{ background: "rgba(148,163,184,0.04)" }}>
              <div className="flex items-center gap-1.5">
                <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{f.tag}</span>
                {f.t?.dualLabel && <span className="text-[8.5px] px-1 rounded border border-amber-500/40 text-amber-300">{f.t.dualLabel}</span>}
                {f.t && <span className="ml-auto text-[8px] text-slate-500">{f.t.levels.length - 1} bậc · ngưỡng {(f.t.basePct * 100).toFixed(1).replace(".", ",")}%</span>}
              </div>
              <p className={`text-[10px] leading-snug ${treeCovers(f.t) ? "text-cyan-100" : "text-slate-500"}`}>{f.t ? describePosition(f.t) : "Chưa đủ nến."}</p>
            </div>
          ))}
          {scenarios[0] && <p className="text-[9px] text-slate-400">Kịch bản chính: <b className="text-slate-200">{scenarios[0].sc.title} {scenarios[0].sc.dir > 0 ? "↑" : "↓"}</b> — {scenarios[0].sc.provisional ? "tạm" : STATE_LABEL[scenarios[0].lc.state]} (xem tab Kịch bản)</p>}
          <p className="text-[8.5px] text-slate-500 leading-snug">{EP1_VALIDATION.summary}</p>
        </div>
      )}

      {tab === "scenarios" && (
        <div className="space-y-1.5" data-testid="elliott-pro-scenarios">
          <ElliottScenarioList items={scenarios} />
          {scenarios.filter((v) => !v.sc.provisional && (v.lc.state === "waiting" || v.lc.state === "triggered")).slice(0, 3).map((v) => (
            <div key={v.sc.id} className="flex items-center gap-1 text-[9px] text-slate-400"><span>{v.sc.title} {v.sc.dir > 0 ? "↑" : "↓"}:</span><FollowButton sc={v.sc} ticker={ticker} tf={tf} /></div>
          ))}
          <ElliottLedgerSummary />
        </div>
      )}

      {tab === "rules" && (
        <div className="space-y-2" data-testid="elliott-pro-rules">
          {shown ? <>
            <RuleBlock n={shown} title={`Bậc ${lv} (đang xem)`} />
            {shown.children.filter((c) => (c.kind === "motive" || c.kind === "corrective") && c.fit).slice(-3).map((c, k) => <RuleBlock key={k} n={c} title={`Sóng con ${shown.childLabels[shown.children.indexOf(c)] ?? ""}`} />)}
          </> : <p className="text-[9px] text-slate-500">Chưa dựng được cấu trúc ở khung này.</p>}
          <p className="text-[8.5px] text-slate-500">Quy tắc cứng loại bỏ, hướng dẫn mềm xếp hạng (không phải xác suất). Thêm quy tắc cực trị: mỗi điểm là đỉnh/đáy thật của đoạn kề bên.</p>
        </div>
      )}

      {tab === "performance" && (
        <div className="space-y-2" data-testid="elliott-pro-performance">
          <ElliottLedgerSummary />
          <SymbolLedger ticker={ticker} />
          <BacktestTable />
        </div>
      )}

      {tab === "mine" && <div className="space-y-2" data-testid="elliott-pro-mine">{mine}</div>}
      {tab === "book" && <div className="space-y-2" data-testid="elliott-pro-book">{book}</div>}
    </div>
  );
}
