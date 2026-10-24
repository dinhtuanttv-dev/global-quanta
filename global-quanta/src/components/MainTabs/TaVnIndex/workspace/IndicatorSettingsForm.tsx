"use client";
// R5 — chỉnh tham số chỉ báo ngay trong menu "Lớp & pane": chu kỳ, ngưỡng, kiểu tính, số nến profile, ngày neo AVWAP.
// Số nhập được kẹp trong miền hợp lệ (sanitizeIndicators) và chỉ áp khi rời ô / Enter (không lưu giá trị gõ dở).
import { useEffect, useState } from "react";
import { DEFAULT_INDICATORS, INDICATOR_LIMITS, isDefaultSection, sanitizeIndicators, type IndicatorSettings } from "./indicatorSettings";

type Section = "rsi" | "macd" | "adx" | "vprofile" | "avwap";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "rsi", label: "RSI" }, { id: "macd", label: "MACD" }, { id: "adx", label: "ADX" }, { id: "vprofile", label: "Profile" }, { id: "avwap", label: "AVWAP" },
];

function NumField({ label, value, range, onCommit, testid }: { label: string; value: number; range: readonly [number, number]; onCommit: (v: number) => void; testid: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => { const n = Number(text); if (Number.isFinite(n) && n !== value) onCommit(n); else setText(String(value)); };
  return (
    <label className="flex items-center justify-between gap-2 text-[10px] text-slate-300">
      <span>{label} <span className="text-slate-500">({range[0]}–{range[1]})</span></span>
      <input type="number" inputMode="numeric" min={range[0]} max={range[1]} value={text} data-testid={testid}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        className="w-16 rounded-md bg-slate-900 border border-slate-700 px-1.5 py-1 text-right font-mono text-slate-100 focus:outline-none focus:border-cyan-500" />
    </label>
  );
}

function Choice<T extends string>({ label, value, options, onChange, testid }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; testid: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-300" role="radiogroup" aria-label={label} data-testid={testid}>
      <span>{label}</span>
      <span className="flex gap-1">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
            className={`ws-btn ws-btn-sm ${value === o.id ? "ws-btn-on" : ""}`}>{o.label}</button>
        ))}
      </span>
    </div>
  );
}

export default function IndicatorSettingsForm({ value, onChange, ticker, anchor, onPickAnchor, onClearAnchor }: {
  value: IndicatorSettings; onChange: (next: IndicatorSettings) => void;
  ticker: string; anchor: string | null; onPickAnchor: () => void; onClearAnchor: () => void;
}) {
  const [open, setOpen] = useState<Section | null>(null);
  const set = <K extends Exclude<Section, "avwap">>(k: K, patch: Partial<IndicatorSettings[K]>) => onChange(sanitizeIndicators({ ...value, [k]: { ...value[k], ...patch } }));
  const reset = (k: Exclude<Section, "avwap">) => onChange({ ...value, [k]: DEFAULT_INDICATORS[k] });
  const L = INDICATOR_LIMITS;
  const edited = (k: Section) => (k === "avwap" ? anchor != null : !isDefaultSection(value, k));
  return (
    <section aria-label="Tham số chỉ báo" data-testid="indicator-settings">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-300">Tham số</h3>
        <span className="text-[9px] text-slate-500 truncate">Lưu theo tài khoản · ngày neo AVWAP theo mã</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" aria-expanded={open === s.id} data-testid={`settings-btn-${s.id}`} onClick={() => setOpen((o) => (o === s.id ? null : s.id))}
            className={`ws-btn ws-btn-sm ${open === s.id ? "ws-btn-on" : ""}`}>⚙ {s.label}{edited(s.id) && <span className="text-amber-300" title="Đã chỉnh khác mặc định"> •</span>}</button>
        ))}
      </div>
      {open && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-slate-700/60 bg-slate-950/60 p-2" data-testid={`settings-form-${open}`}>
          {open === "rsi" && <>
            <NumField label="Chu kỳ" value={value.rsi.period} range={L.rsi.period} onCommit={(v) => set("rsi", { period: v })} testid="set-rsi-period" />
            <NumField label="Ngưỡng trên" value={value.rsi.upper} range={L.rsi.upper} onCommit={(v) => set("rsi", { upper: v })} testid="set-rsi-upper" />
            <NumField label="Ngưỡng dưới" value={value.rsi.lower} range={L.rsi.lower} onCommit={(v) => set("rsi", { lower: v })} testid="set-rsi-lower" />
            <Choice label="Kiểu tính" value={value.rsi.method} onChange={(v) => set("rsi", { method: v })} testid="set-rsi-method"
              options={[{ id: "wilder", label: "Wilder (chuẩn)" }, { id: "cutler", label: "Cutler (SMA)" }]} />
          </>}
          {open === "macd" && <>
            <NumField label="EMA nhanh" value={value.macd.fast} range={L.macd.fast} onCommit={(v) => set("macd", { fast: v })} testid="set-macd-fast" />
            <NumField label="EMA chậm" value={value.macd.slow} range={L.macd.slow} onCommit={(v) => set("macd", { slow: v })} testid="set-macd-slow" />
            <NumField label="Signal" value={value.macd.signal} range={L.macd.signal} onCommit={(v) => set("macd", { signal: v })} testid="set-macd-signal" />
            <p className="text-[9px] text-slate-500">EMA nhanh phải ngắn hơn EMA chậm (sai -&gt; về 12/26).</p>
          </>}
          {open === "adx" && <>
            <NumField label="Chu kỳ" value={value.adx.period} range={L.adx.period} onCommit={(v) => set("adx", { period: v })} testid="set-adx-period" />
            <NumField label="Ngưỡng xu hướng" value={value.adx.threshold} range={L.adx.threshold} onCommit={(v) => set("adx", { threshold: v })} testid="set-adx-threshold" />
          </>}
          {open === "vprofile" && <>
            <NumField label="Số nến (khung D/W/M)" value={value.vprofile.bars} range={L.vprofile.bars} onCommit={(v) => set("vprofile", { bars: v })} testid="set-vp-bars" />
            <Choice label="Phân bổ KL trong nến" value={value.vprofile.method} onChange={(v) => set("vprofile", { method: v })} testid="set-vp-method"
              options={[{ id: "triangular", label: "Tam giác" }, { id: "uniform", label: "Đều" }]} />
            <p className="text-[9px] text-slate-500">D/W/M là ước tính từ OHLCV; intraday dùng nến 1 phút theo phiên (không đổi).</p>
          </>}
          {open === "avwap" && <>
            <p className="text-[10px] text-slate-300" data-testid="set-avwap-state">{ticker}: {anchor ? <>neo tại <b className="font-mono">{anchor.slice(0, 16).replace("T", " ")}</b> (bạn chọn)</> : "tự động — đầu dải giao dịch gần nhất"}</p>
            <div className="flex flex-wrap gap-1">
              <button type="button" className="ws-btn ws-btn-sm" onClick={onPickAnchor} data-testid="set-avwap-pick">Bấm chọn trên chart</button>
              {anchor && <button type="button" className="ws-btn ws-btn-sm" onClick={onClearAnchor} data-testid="set-avwap-auto">Về tự động</button>}
            </div>
          </>}
          {open !== "avwap" && edited(open) && <button type="button" className="ws-btn ws-btn-sm" onClick={() => reset(open)} data-testid={`settings-reset-${open}`}>Mặc định</button>}
        </div>
      )}
    </section>
  );
}
