// BL4 (07/11/2026) — Bộ lọc cổ phiếu cổ tức: bộ lọc mẫu kèm số mã đạt, số mã từng điều kiện đang loại (đếm ngay khi chỉnh),
// bộ lọc đã lưu theo tài khoản (đặt làm mặc định khi mở), chọn cột hiển thị.
import { useMemo, useState } from "react";
import {
  activeFilterKeys, countPass, DEFAULT_FILTER, marginalCounts,
  type DividendFilter, type DividendStock, type FilterKey,
} from "../../../../lib/quant-cotuc";
import {
  COLUMN_LABEL, filterToSaved, savedToFilter, SCREENER_COLUMNS, SCREENER_PRESETS,
  type ScreenerColumn, type ScreenerPrefs, type SortKey,
} from "../../../../lib/cotuc/screenerPrefs";
import type { PrefsCloud } from "../../../../hooks/useScreenerPrefs";

const KEY_LABEL: Record<FilterKey, string> = {
  minYield: "Yield", minRoe: "ROE", maxPe: "P/E", maxDebt: "Nợ/VCSH", minFscore: "F-Score", minQuintile: "Hạng NT",
  trend: "Xu hướng", phase: "Vị thế", upcomingGDKHQ: "Sắp GDKHQ", upcomingAGM: "Sắp ĐHCĐ", hideRiskFlags: "Ẩn cờ rủi ro",
  hideStaleEvents: "Ẩn mã chưa có lịch mới", hideTraps: "Ẩn bẫy lợi suất", showUnknown: "Hiện mã thiếu số liệu",
};
const CLOUD_TEXT: Record<PrefsCloud, string> = { idle: "", saving: "đang lưu…", saved: "đã lưu theo tài khoản", local: "lưu trên máy này" };

const sameFilter = (a: DividendFilter, b: DividendFilter) => JSON.stringify(filterToSaved(a)) === JSON.stringify(filterToSaved(b));

export function ScreenerToolbar({ stocks, filter, setFilter, sort, setSort, prefs, updatePrefs, cloud, notice, shown }: {
  stocks: DividendStock[];
  filter: DividendFilter;
  setFilter: (f: DividendFilter) => void;
  sort: { field: string; asc: boolean };
  setSort: (s: { field: SortKey; asc: boolean }) => void;
  prefs: ScreenerPrefs;
  updatePrefs: (fn: (p: ScreenerPrefs) => ScreenerPrefs) => void;
  cloud: PrefsCloud;
  notice: string | null;
  /** Số mã đang hiển thị (sau ô tìm kiếm). */
  shown: number;
}) {
  const [name, setName] = useState("");
  const [showCols, setShowCols] = useState(false);
  const noSearch = useMemo(() => ({ ...filter, searchQ: "" }), [filter]);
  const presetCounts = useMemo(() => SCREENER_PRESETS.map((p) => countPass(stocks, { ...DEFAULT_FILTER, ...p.f })), [stocks]);
  const marginal = useMemo(() => marginalCounts(stocks, noSearch), [stocks, noSearch]);
  const active = activeFilterKeys(noSearch);
  const current = prefs.screens.find((s) => sameFilter(savedToFilter(s.filter), noSearch));

  const save = () => {
    const n = name.trim().slice(0, 40);
    if (!n) return;
    const screen = { name: n, filter: filterToSaved(filter), ...(["ticker", "dividendYield", "score", "pe", "roe", "price"].includes(sort.field) ? { sort: { field: sort.field as SortKey, asc: sort.asc } } : {}) };
    updatePrefs((p) => ({ ...p, screens: [...p.screens.filter((s) => s.name.toLowerCase() !== n.toLowerCase()), screen].slice(-20) }));
    setName("");
  };
  const apply = (n: string) => {
    const s = prefs.screens.find((x) => x.name === n);
    if (!s) return;
    setFilter({ ...savedToFilter(s.filter), searchQ: filter.searchQ });
    if (s.sort) setSort(s.sort);
  };
  const hiddenCount = SCREENER_COLUMNS.filter((c) => prefs.columns[c] === false).length;

  return (
    <div className="tw-scope space-y-2" data-testid="screener-toolbar">
      {/* Bộ lọc mẫu — số trong ngoặc = số mã đạt nếu áp riêng bộ lọc mẫu đó. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SCREENER_PRESETS.map((p, i) => (
          <button key={p.id} type="button" title={p.title} data-testid={`preset-${p.id}`}
            onClick={() => setFilter({ ...DEFAULT_FILTER, ...p.f, searchQ: filter.searchQ })}
            className={`rounded-lg border px-2 py-1 text-[10.5px] font-semibold transition ${sameFilter({ ...DEFAULT_FILTER, ...p.f }, noSearch) ? "border-amber-400/60 bg-amber-400/15 text-amber-200" : "border-white/10 text-slate-300 hover:border-amber-400/40"}`}>
            {p.label} <span className="font-mono tabular-nums text-slate-500">{presetCounts[i]}</span>
          </button>
        ))}
        <button type="button" onClick={() => setFilter({ ...DEFAULT_FILTER, searchQ: filter.searchQ })} data-testid="preset-clear"
          className="rounded-lg border border-white/10 px-2 py-1 text-[10.5px] text-slate-400 hover:text-slate-200">🔄 Xoá lọc</button>
      </div>

      {/* Đếm ngay khi chỉnh: số mã đạt + mỗi điều kiện đang bật loại bao nhiêu mã (bấm ✕ để bỏ riêng điều kiện đó). */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]" data-testid="filter-live">
        <span className="rounded-md bg-cyan-400/10 px-2 py-0.5 font-semibold text-cyan-200">
          <span className="font-mono tabular-nums" data-testid="filter-live-count">{shown}</span> / <span className="font-mono tabular-nums">{stocks.length}</span> mã đạt
        </span>
        {active.length === 0 && <span className="text-slate-500">chưa bật điều kiện nào</span>}
        {active.map((k) => (
          <button key={k} type="button" data-testid={`chip-${k}`} onClick={() => setFilter({ ...filter, [k]: DEFAULT_FILTER[k] } as DividendFilter)}
            title="Bỏ riêng điều kiện này" className="rounded-md border border-white/10 px-1.5 py-0.5 text-slate-300 hover:border-rose-400/40">
            {KEY_LABEL[k]} {k === "showUnknown" ? null : <span className="font-mono tabular-nums text-rose-300">−{marginal[k] ?? 0}</span>} ✕
          </button>
        ))}
      </div>

      {/* Bộ lọc đã lưu theo tài khoản + chọn cột */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
        <select value={current?.name ?? ""} onChange={(e) => apply(e.target.value)} data-testid="saved-select"
          className="cf-panel-input max-w-[12rem] rounded-md px-1.5 py-1 text-[10.5px] text-cf-primary" aria-label="Bộ lọc đã lưu">
          <option value="">{prefs.screens.length ? "— Bộ lọc đã lưu —" : "Chưa có bộ lọc đã lưu"}</option>
          {prefs.screens.map((s) => <option key={s.name} value={s.name}>{s.name}{prefs.defaultScreen === s.name ? " ★" : ""}</option>)}
        </select>
        {current && (
          <>
            <button type="button" data-testid="saved-default" onClick={() => updatePrefs((p) => ({ ...p, defaultScreen: p.defaultScreen === current.name ? undefined : current.name }))}
              className="rounded-md border border-white/10 px-1.5 py-1 text-slate-300 hover:text-amber-200" title="Tự áp bộ lọc này khi mở Bộ lọc cổ phiếu">
              {prefs.defaultScreen === current.name ? "★ Đang là mặc định" : "☆ Đặt mặc định"}
            </button>
            <button type="button" data-testid="saved-delete" onClick={() => updatePrefs((p) => ({ ...p, screens: p.screens.filter((s) => s.name !== current.name), defaultScreen: p.defaultScreen === current.name ? undefined : p.defaultScreen }))}
              className="rounded-md border border-white/10 px-1.5 py-1 text-slate-400 hover:text-rose-300" title="Xoá bộ lọc đã lưu này">🗑</button>
          </>
        )}
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} maxLength={40} data-testid="saved-name"
          placeholder="Tên bộ lọc…" className="cf-panel-input w-32 rounded-md px-1.5 py-1 text-[10.5px] text-cf-primary" />
        <button type="button" onClick={save} disabled={!name.trim()} data-testid="saved-save"
          className="rounded-md border border-amber-400/40 px-2 py-1 font-semibold text-amber-200 disabled:opacity-40">💾 Lưu bộ lọc</button>
        {CLOUD_TEXT[cloud] && <span className="text-[10px] text-slate-500" data-testid="prefs-cloud">{CLOUD_TEXT[cloud]}</span>}
        <button type="button" onClick={() => setShowCols(!showCols)} data-testid="cols-toggle" aria-expanded={showCols}
          className="ml-auto rounded-md border border-white/10 px-2 py-1 text-slate-300 hover:text-cyan-200">▦ Cột{hiddenCount ? ` (ẩn ${hiddenCount})` : ""}</button>
      </div>
      {notice && <p className="text-[10px] text-amber-300">{notice}</p>}
      {showCols && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-white/10 p-2 text-[10.5px]" data-testid="cols-panel">
          {SCREENER_COLUMNS.map((c: ScreenerColumn) => (
            <label key={c} className="flex cursor-pointer items-center gap-1 text-slate-300">
              <input type="checkbox" className="accent-amber-500" data-testid={`col-${c}`} checked={prefs.columns[c] !== false}
                onChange={() => updatePrefs((p) => ({ ...p, columns: { ...p.columns, [c]: p.columns[c] === false } }))} />
              {COLUMN_LABEL[c]}
            </label>
          ))}
          <button type="button" onClick={() => updatePrefs((p) => ({ ...p, columns: {} }))} className="text-slate-500 underline decoration-dotted hover:text-slate-300">hiện tất cả</button>
        </div>
      )}
    </div>
  );
}
