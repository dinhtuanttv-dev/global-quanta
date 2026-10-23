// DW8 — chỉnh tay cách đếm Elliott: bảng điểm (nhãn · ngày · giá), chọn điểm trên biểu đồ (bám high/low của nến),
// kiểm tra quy tắc ngay khi sửa (vi phạm vẫn cho lưu nhưng gắn cờ), hoàn tác / làm lại, lưu phiên bản, lịch sử, về cách đếm tự động.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, History, MousePointerClick, Plus, Redo2, RotateCcw, Save, Trash2, Undo2, X } from "lucide-react";
import { COUNT_LABELS, STATUS_LABEL, type UserCountDisplayStatus, type UserCountPoint, type UserCountsDoc, type UserCountVersion } from "../../../lib/quant-core/elliott/userCount";
import { PATTERN_NAME, type PatternTag } from "../../../lib/quant-core/elliott/patterns";
import { loadCloudCounts, loadLocalCounts, newerCounts, saveCloudCounts, saveLocalCounts } from "../../../lib/ta-command-center/elliottCountsStore";

const CARD = { background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" } as const;
const fmtP = (v: number) => Math.round(v).toLocaleString("vi-VN");

/** Đồng bộ tài liệu cách đếm của (mã, khung): localStorage ngay, rồi Gateway (bản mới hơn thắng). */
export function useElliottUserCounts(symbol: string, tf: string) {
  const [doc, setDoc] = useState<UserCountsDoc>(() => loadLocalCounts(symbol, tf));
  const [syncing, setSyncing] = useState(false);
  const [cloudOk, setCloudOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    setDoc(loadLocalCounts(symbol, tf));
    loadCloudCounts(symbol, tf).then((c) => {
      if (!alive) return;
      setCloudOk(c != null);
      setDoc((cur) => { const n = newerCounts(cur, c); saveLocalCounts(symbol, tf, n); return n; });
    });
    return () => { alive = false; };
  }, [symbol, tf]);
  const save = useCallback(async (next: UserCountsDoc) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setDoc(stamped); saveLocalCounts(symbol, tf, stamped);
    setSyncing(true);
    const r = await saveCloudCounts(symbol, tf, stamped);
    setSyncing(false); setCloudOk(r != null);
    if (r) { setDoc(r); saveLocalCounts(symbol, tf, r); }
  }, [symbol, tf]);
  const active = doc.versions.find((v) => v.id === doc.activeId) ?? null;
  return { doc, active, save, syncing, cloudOk };
}

/** Lịch sử hoàn tác cho bản nháp điểm. */
export function useUndo<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const set = useCallback((v: T) => setState((s) => ({ past: [...s.past, s.present].slice(-50), present: v, future: [] })), []);
  const reset = useCallback((v: T) => setState({ past: [], present: v, future: [] }), []);
  const undo = useCallback(() => setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s)), []);
  const redo = useCallback(() => setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)), []);
  return { value: state.present, set, reset, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

interface EditorProps {
  points: UserCountPoint[];
  onChange: (p: UserCountPoint[]) => void;
  placing: number | null;
  onPlace: (k: number | null) => void;
  violations: string[];
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  onSave: (meta: { note: string; pattern: PatternTag | null; confirm: boolean }) => void;
  onCancel: () => void;
  syncing: boolean;
  cloudOk: boolean | null;
}

const PATTERNS = Object.keys(PATTERN_NAME) as PatternTag[];

export function ElliottCountEditor({ points, onChange, placing, onPlace, violations, canUndo, canRedo, onUndo, onRedo, onSave, onCancel, syncing, cloudOk }: EditorProps) {
  const [note, setNote] = useState("");
  const [pattern, setPattern] = useState<PatternTag | null>(null);
  const btn = "inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md border border-slate-700 text-slate-300 hover:text-white disabled:opacity-40";
  const nextLabel = COUNT_LABELS[COUNT_LABELS.indexOf((points[points.length - 1]?.label ?? "-1") as (typeof COUNT_LABELS)[number]) + 1];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (placing != null) ref.current?.scrollIntoView?.({ block: "nearest" }); }, [placing]);
  return (
    <div ref={ref} className="rounded-lg p-2 space-y-1.5" style={{ ...CARD, borderColor: "rgba(34,211,238,0.35)" }} data-testid="elliott-count-editor">
      <p className="text-[9px] font-semibold text-cyan-300 uppercase flex items-center gap-1">
        Chỉnh tay cách đếm
        <span className="ml-auto normal-case text-[8.5px] text-slate-500">{syncing ? "đang lưu…" : cloudOk === false ? "chỉ lưu trên máy này" : cloudOk ? "đồng bộ tài khoản" : ""}</span>
      </p>
      {placing != null && (
        <p className="text-[9px] text-amber-300" data-testid="elliott-placing">Bấm lên biểu đồ để đặt điểm {points[placing]?.label ?? nextLabel} — điểm tự bám đỉnh/đáy nến. <button type="button" className="underline" onClick={() => onPlace(null)}>Huỷ</button></p>
      )}
      <table className="w-full text-[9.5px]">
        <tbody>
          {points.map((p, k) => (
            <tr key={k} className={placing === k ? "bg-amber-500/10" : ""} data-testid={`elliott-edit-row-${k}`}>
              <td className="font-bold text-cyan-300 w-6">{p.label}</td>
              <td className="font-mono text-slate-400">{p.date}</td>
              <td className="font-mono text-slate-200 text-right">{fmtP(p.price)}</td>
              <td className="text-right whitespace-nowrap">
                <button type="button" className={btn} onClick={() => onPlace(k)} title="Chọn lại điểm này trên biểu đồ" data-testid={`elliott-edit-place-${k}`}><MousePointerClick className="w-3 h-3" /></button>
                {k === points.length - 1 && <button type="button" className={`${btn} ml-1`} onClick={() => onChange(points.slice(0, -1))} title="Bỏ điểm cuối"><Trash2 className="w-3 h-3" /></button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-1">
        {nextLabel && <button type="button" className={btn} onClick={() => onPlace(points.length)} data-testid="elliott-edit-add"><Plus className="w-3 h-3" />Thêm điểm {nextLabel}</button>}
        <button type="button" className={btn} onClick={onUndo} disabled={!canUndo} title="Hoàn tác"><Undo2 className="w-3 h-3" /></button>
        <button type="button" className={btn} onClick={onRedo} disabled={!canRedo} title="Làm lại"><Redo2 className="w-3 h-3" /></button>
      </div>
      {violations.length > 0 ? (
        <ul className="text-[9px] text-rose-300 space-y-0.5" data-testid="elliott-edit-violations">{violations.map((v) => <li key={v}>✗ {v}</li>)}</ul>
      ) : points.length >= 2 ? <p className="text-[9px] text-emerald-300" data-testid="elliott-edit-ok">✓ Đạt các quy tắc cứng đã kiểm</p> : null}
      <div className="flex flex-wrap gap-1 items-center">
        <select value={pattern ?? ""} onChange={(e) => setPattern((e.target.value || null) as PatternTag | null)} className="text-[9px] bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300" aria-label="Thẻ mô hình">
          <option value="">Thẻ mô hình (tuỳ chọn)</option>
          {PATTERNS.map((t) => <option key={t} value={t}>{t} — {PATTERN_NAME[t]}</option>)}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="Ghi chú" className="flex-1 min-w-[120px] text-[9px] bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200" aria-label="Ghi chú" />
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={btn} disabled={points.length < 2} onClick={() => onSave({ note, pattern, confirm: false })} data-testid="elliott-edit-save"><Save className="w-3 h-3" />Lưu phiên bản</button>
        <button type="button" className={btn} disabled={points.length < 2} onClick={() => onSave({ note, pattern, confirm: true })} data-testid="elliott-edit-confirm"><Check className="w-3 h-3" />Lưu & xác nhận</button>
        <button type="button" className={btn} onClick={onCancel} data-testid="elliott-edit-cancel"><X className="w-3 h-3" />Đóng</button>
      </div>
      {violations.length > 0 && <p className="text-[8.5px] text-slate-500">Vẫn lưu được — phiên bản sẽ mang cờ vi phạm.</p>}
    </div>
  );
}

interface HistoryProps {
  doc: UserCountsDoc;
  statusOf: (v: UserCountVersion) => UserCountDisplayStatus;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onAuto: () => void;
}

export function ElliottCountHistory({ doc, statusOf, onRestore, onDelete, onAuto }: HistoryProps) {
  if (!doc.versions.length) return null;
  const btn = "text-[9px] px-1 rounded border border-slate-700 text-slate-400 hover:text-white";
  return (
    <div className="rounded-lg p-2 space-y-1" style={CARD} data-testid="elliott-count-history">
      <p className="text-[9px] font-semibold text-slate-400 uppercase flex items-center gap-1"><History className="w-3 h-3" />Cách đếm của tôi · lịch sử
        {doc.activeId && <button type="button" className={`${btn} ml-auto normal-case`} onClick={onAuto} data-testid="elliott-count-auto"><RotateCcw className="w-3 h-3 inline" /> Về cách đếm tự động</button>}
      </p>
      <ul className="space-y-0.5">
        {[...doc.versions].reverse().map((v) => {
          const st = statusOf(v);
          return (
            <li key={v.id} className={`text-[9px] flex items-center gap-1 ${v.id === doc.activeId ? "text-cyan-200" : "text-slate-400"}`} data-testid={`elliott-version-${v.id}`}>
              <span className="font-mono">{v.createdAt.slice(0, 16).replace("T", " ")}</span>
              <span>{v.points.map((p) => p.label).join("")}</span>
              {v.pattern && <span className="text-amber-300">{v.pattern}</span>}
              <span className={st === "invalidated" ? "text-rose-300" : st === "stale" ? "text-amber-300" : st === "user_confirmed" ? "text-emerald-300" : ""}>{STATUS_LABEL[st]}</span>
              {v.violations.length > 0 && <span className="text-rose-300" title={v.violations.join("\n")}>⚠ {v.violations.length}</span>}
              {v.note && <span className="truncate max-w-[140px]" title={v.note}>· {v.note}</span>}
              <span className="ml-auto flex gap-1">
                {v.id !== doc.activeId && <button type="button" className={btn} onClick={() => onRestore(v.id)}>Dùng</button>}
                <button type="button" className={btn} onClick={() => onDelete(v.id)} aria-label="Xoá phiên bản">✕</button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
