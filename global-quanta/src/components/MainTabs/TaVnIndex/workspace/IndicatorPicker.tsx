"use client";
// TA-T5 (28/11/2026, docs/ta-tradingview §T5) — hộp "Chỉ báo" như TradingView: ô tìm (theo tên + từ khoá tiếng Việt / tiếng Anh),
// nhóm, Yêu thích (★, nhớ theo trình duyệt), bật / tắt từng lớp và chỉnh tham số ngay trong hộp (cột phải).
// Chỉ là một lối vào khác của cùng LayerManager + IndicatorSettings: menu "Lớp & pane" cũ giữ nguyên (hợp đồng E2E data-layer).
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Search, Settings2, Star } from "lucide-react";
import type { LayerKey, LayerState } from "../../../../lib/ta-command-center/LayerManager";
import { Modal } from "./ui";
import { LAYER_LABEL } from "./LayerMenu";
import IndicatorSettingsForm, { type Section } from "./IndicatorSettingsForm";

type Group = "fav" | "trend" | "momentum" | "volume" | "volatility" | "method" | "elliott" | "drawing";
const GROUPS: { id: Group | "all"; label: string }[] = [
  { id: "all", label: "Tất cả" }, { id: "fav", label: "Yêu thích" }, { id: "trend", label: "Xu hướng" }, { id: "momentum", label: "Động lượng" },
  { id: "volume", label: "Khối lượng & dòng tiền" }, { id: "volatility", label: "Biến động" }, { id: "method", label: "Phương pháp" },
  { id: "elliott", label: "Elliott" }, { id: "drawing", label: "Hình vẽ tay" },
];

/** Danh mục: nhóm · mô tả ngắn · từ khoá tìm (có cả tên tiếng Anh như TradingView) · mục tham số (nếu có). */
export const CATALOG: { key: LayerKey; group: Exclude<Group, "fav">; desc: string; kw: string; settings?: Section }[] = [
  { key: "maSet", group: "trend", desc: "Bốn đường trung bình động, chỉnh chu kỳ / EMA–SMA", kw: "ma ema sma moving average đường trung bình", settings: "ma" },
  { key: "ichimoku", group: "trend", desc: "Mây Ichimoku 9 / 26 / 52", kw: "ichimoku cloud mây kinko hyo" },
  { key: "supertrend", group: "trend", desc: "Xu hướng theo ATR", kw: "supertrend", settings: "supertrend" },
  { key: "psar", group: "trend", desc: "Điểm dừng và đảo chiều", kw: "parabolic sar psar" },
  { key: "adx", group: "trend", desc: "Sức mạnh xu hướng + DI±", kw: "adx dmi directional movement", settings: "adx" },
  { key: "rsi", group: "momentum", desc: "Chỉ số sức mạnh tương đối", kw: "rsi relative strength", settings: "rsi" },
  { key: "macd", group: "momentum", desc: "Hội tụ / phân kỳ trung bình động", kw: "macd convergence divergence", settings: "macd" },
  { key: "stoch", group: "momentum", desc: "Dao động ngẫu nhiên %K / %D", kw: "stochastic stoch oscillator", settings: "stoch" },
  { key: "stochRsi", group: "momentum", desc: "Stochastic của RSI", kw: "stoch rsi stochastic", settings: "stochRsi" },
  { key: "mfi", group: "volume", desc: "Chỉ số dòng tiền (RSI có khối lượng)", kw: "mfi money flow dòng tiền", settings: "mfi" },
  { key: "volume", group: "volume", desc: "Khối lượng (pane riêng / chồng giá)", kw: "volume khối lượng kl vol" },
  { key: "obv", group: "volume", desc: "Khối lượng cân bằng", kw: "obv on balance volume" },
  { key: "vprofile", group: "volume", desc: "Phân bổ khối lượng theo giá", kw: "volume profile vpvr poc", settings: "vprofile" },
  { key: "avwap", group: "volume", desc: "VWAP neo theo mốc", kw: "vwap anchored avwap", settings: "avwap" },
  { key: "orderflow", group: "volume", desc: "Delta + CVD (ước lượng)", kw: "order flow delta cvd" },
  { key: "foreign", group: "volume", desc: "Khối ngoại ròng + luỹ kế", kw: "khối ngoại foreign nước ngoài" },
  { key: "bollinger", group: "volatility", desc: "Dải Bollinger", kw: "bollinger bands bb", settings: "bollinger" },
  { key: "atr", group: "volatility", desc: "Biên độ thực trung bình", kw: "atr average true range biến động", settings: "atr" },
  { key: "msgarch", group: "volatility", desc: "Dải rủi ro MS-GARCH 20 phiên", kw: "msgarch garch rủi ro risk" },
  { key: "smc", group: "method", desc: "Smart Money Concepts", kw: "smc order block fvg bos choch" },
  { key: "vsa", group: "method", desc: "Phân tích giá – khối lượng", kw: "vsa volume spread" },
  { key: "wyckoff", group: "method", desc: "Pha Wyckoff", kw: "wyckoff" },
  { key: "pring", group: "method", desc: "Mô hình giá (Pattern Scanner v2)", kw: "pring pattern mô hình" },
  { key: "structure", group: "method", desc: "Cấu trúc thị trường đa khung", kw: "mtf structure cấu trúc" },
  { key: "corporate", group: "method", desc: "Sự kiện quyền trên chart", kw: "corporate sự kiện quyền cổ tức" },
  { key: "elliottPro", group: "elliott", desc: "Elliott Pro (cây sóng + kịch bản)", kw: "elliott pro wave sóng" },
  { key: "elliottMine", group: "elliott", desc: "Cách đếm sóng của tôi", kw: "elliott mine của tôi" },
  { key: "elliottOsc", group: "elliott", desc: "Elliott Oscillator 5 / 35", kw: "elliott oscillator eo" },
  { key: "trendline", group: "drawing", desc: "Hiện / ẩn trendline đã vẽ", kw: "trendline đường xu hướng" },
  { key: "demandzone", group: "drawing", desc: "Hiện / ẩn vùng đã vẽ", kw: "zone demand vùng" },
  { key: "elliott", group: "drawing", desc: "Hiện / ẩn sóng vẽ tay", kw: "elliott vẽ tay" },
];
const FAV_KEY = "gq.ta.indicatorFav.v1";
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

export default function IndicatorPicker({ open, onClose, state, onToggle, settings, focus }: {
  open: boolean; onClose: () => void; state: LayerState; onToggle: (k: LayerKey) => void;
  settings: Omit<ComponentProps<typeof IndicatorSettingsForm>, "initial" | "only">;
  /** Mở thẳng tới chỉ báo này (nút ⚙ trên chú giải). */
  focus?: LayerKey | null;
}) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<Group | "all">("all");
  const [sel, setSel] = useState<LayerKey | null>(null);
  const [fav, setFav] = useState<Set<LayerKey>>(() => { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]")); } catch { return new Set(); } });
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setSel(focus ?? null); if (!focus) setQ(""); setTimeout(() => input.current?.focus(), 30); } }, [open, focus]);
  const toggleFav = (k: LayerKey) => setFav((f) => {
    const n = new Set(f); if (n.has(k)) n.delete(k); else n.add(k);
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...n])); } catch { /* bộ nhớ bị chặn */ }
    return n;
  });
  const rows = useMemo(() => {
    const t = norm(q.trim());
    return CATALOG.filter((c) => (group === "all" || (group === "fav" ? fav.has(c.key) : c.group === group))
      && (!t || norm(`${LAYER_LABEL[c.key]} ${c.desc} ${c.kw}`).includes(t)));
  }, [q, group, fav]);
  const cur = CATALOG.find((c) => c.key === sel) ?? null;
  return (
    <Modal open={open} onClose={onClose} title="Chỉ báo" testid="indicator-picker" wide>
      <div className="ws-picker">
        <div className="ws-picker-search">
          <Search className="w-4 h-4" aria-hidden />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm chỉ báo: RSI, MACD, Stoch, ATR, Ichimoku…" aria-label="Tìm chỉ báo" data-testid="indicator-search" />
        </div>
        <div className="ws-picker-body">
          <nav className="ws-picker-groups" aria-label="Nhóm chỉ báo">
            {GROUPS.map((g) => (
              <button key={g.id} type="button" aria-pressed={group === g.id} onClick={() => setGroup(g.id)} data-picker-group={g.id}>{g.label}
                {g.id === "fav" && fav.size > 0 && <span className="ws-tf-code"> {fav.size}</span>}</button>
            ))}
          </nav>
          <ul className="ws-picker-list" data-testid="indicator-list">
            {rows.length === 0 && <li className="ws-picker-empty">Không có chỉ báo khớp “{q}”.</li>}
            {rows.map((c) => (
              <li key={c.key} className={sel === c.key ? "is-selected" : ""}>
                <button type="button" className="ws-picker-star" aria-pressed={fav.has(c.key)} aria-label={`${fav.has(c.key) ? "Bỏ" : "Thêm"} ${LAYER_LABEL[c.key]} vào Yêu thích`} onClick={() => toggleFav(c.key)}>
                  <Star className="w-3.5 h-3.5" fill={fav.has(c.key) ? "currentColor" : "none"} />
                </button>
                <button type="button" className="ws-picker-name" onClick={() => setSel(c.key)} data-picker-item={c.key}>
                  <b>{LAYER_LABEL[c.key]}</b><span>{c.desc}</span>
                </button>
                {c.settings && <button type="button" className="ws-picker-gear" aria-label={`Cài đặt ${LAYER_LABEL[c.key]}`} onClick={() => setSel(c.key)}><Settings2 className="w-3.5 h-3.5" /></button>}
                <button type="button" className={`ws-toggle ${state[c.key] ? "ws-toggle-on" : ""}`} aria-pressed={state[c.key]} onClick={() => onToggle(c.key)} data-picker-layer={c.key}
                  aria-label={`${state[c.key] ? "Tắt" : "Bật"} ${LAYER_LABEL[c.key]}`}>
                  <span className="ws-switch" aria-hidden><span /></span>
                </button>
              </li>
            ))}
          </ul>
          <aside className="ws-picker-detail" aria-label="Chi tiết chỉ báo">
            {cur ? <>
              <p className="ws-picker-title">{LAYER_LABEL[cur.key]}</p>
              <p className="ws-picker-desc">{cur.desc}</p>
              <button type="button" className={`ws-btn ${state[cur.key] ? "ws-btn-on" : ""}`} onClick={() => onToggle(cur.key)} data-testid="picker-detail-toggle">{state[cur.key] ? "Đang bật — bấm để tắt" : "Bật trên chart"}</button>
              {cur.settings
                ? <div className="mt-2"><IndicatorSettingsForm {...settings} initial={cur.settings} only /></div>
                : <p className="ws-picker-desc mt-2">Chỉ báo này không có tham số chỉnh được.</p>}
            </> : <p className="ws-picker-desc">Chọn một chỉ báo để xem mô tả và chỉnh tham số. Bật / tắt bằng công tắc ở cuối dòng.</p>}
          </aside>
        </div>
      </div>
    </Modal>
  );
}
