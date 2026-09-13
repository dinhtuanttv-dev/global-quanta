import { useState } from "react";
import { useSieuQuetEvents, type SieuQuetEventCandidate } from "../../../hooks/useSieuQuetEvents";

const CATEGORY_LABEL: Record<string, string> = {
  monetary_policy: "Chính sách tiền tệ", geopolitical: "Địa chính trị",
  earnings: "Kết quả kinh doanh", upgrade: "Nâng hạng/Xếp hạng", other: "Khác",
};

function CandidateModal({ candidate, onClose }: { candidate: SieuQuetEventCandidate; onClose: () => void }) {
  const { confirmCandidate, skipCandidate, actionError } = useSieuQuetEvents();
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => { setBusy(true); await confirmCandidate(candidate.id); setBusy(false); onClose(); };
  const handleSkip = async () => { setBusy(true); await skipCandidate(candidate.id); setBusy(false); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-amber-400 font-semibold mb-1">{candidate.rawTitle}</h3>
        <p className="text-[10px] text-slate-500 mb-3">
          {CATEGORY_LABEL[candidate.category] ?? candidate.category} · Ngành: {candidate.sectors.join(", ") || "—"} ·
          {" "}{candidate.direction === "positive" ? "Tích cực" : "Tiêu cực"} · Mức độ: {candidate.magnitude}
        </p>
        <p className="text-xs text-slate-300 mb-3">{candidate.aiSummary}</p>
        {candidate.sourceUrl && (
          <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-sky-400 hover:underline block mb-3 truncate">
            📎 Nguồn: {candidate.sourceName ?? candidate.sourceUrl}
          </a>
        )}
        <p className="text-[9px] text-slate-600 mb-3">
          Đây là sự kiện do AI (Gemini + Google Search) tìm thấy — bạn là người xác nhận cuối cùng. Nhãn "đã xác thực" không phải bảo chứng pháp lý tuyệt đối.
        </p>
        {actionError && <p className="text-[10px] text-rose-400 mb-2">{actionError}</p>}
        <div className="flex gap-2">
          <button disabled={busy} onClick={handleConfirm}
            className="flex-1 py-1.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-400 hover:bg-emerald-900 text-xs disabled:opacity-50">
            ✅ Xác nhận
          </button>
          <button disabled={busy} onClick={handleSkip}
            className="flex-1 py-1.5 rounded bg-white/5 border border-white/20 text-slate-300 hover:bg-white/10 text-xs disabled:opacity-50">
            ⏭ Bỏ qua
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualEventForm({ onDone }: { onDone: () => void }) {
  const { submitManualEvent } = useSieuQuetEvents();
  const [form, setForm] = useState({ title: "", description: "", category: "other", severity: 3, sectors: "", magnitude: "medium", direction: "positive" });
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    const sectors = form.sectors.split(",").map((s) => s.trim()).filter(Boolean);
    if (!form.title || !form.description || sectors.length === 0) {
      setMsg({ text: "Cần nhập đủ Tiêu đề, Mô tả, và ít nhất 1 Ngành.", ok: false });
      return;
    }
    setBusy(true);
    const result = await submitManualEvent({ ...form, sectors });
    setBusy(false);
    setMsg(result.ok ? { text: "✔ Đã lưu.", ok: true } : { text: `✗ ${result.error}`, ok: false });
    if (result.ok) { setForm({ title: "", description: "", category: "other", severity: 3, sectors: "", magnitude: "medium", direction: "positive" }); onDone(); }
  };

  return (
    <div className="space-y-2 text-xs">
      <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Tiêu đề sự kiện"
        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-slate-200" />
      <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Mô tả chi tiết"
        rows={2} className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-slate-200" />
      <div className="grid grid-cols-2 gap-2">
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-slate-300">
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={form.sectors} onChange={(e) => setForm({ ...form, sectors: e.target.value })} placeholder="Ngành (cách nhau dấu phẩy)"
          className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}
          className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-slate-300">
          <option value="positive">Tích cực</option>
          <option value="negative">Tiêu cực</option>
        </select>
        <select value={form.magnitude} onChange={(e) => setForm({ ...form, magnitude: e.target.value })}
          className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-slate-300">
          <option value="high">Mức độ cao</option>
          <option value="medium">Mức độ vừa</option>
          <option value="low">Mức độ thấp</option>
        </select>
      </div>
      <button disabled={busy} onClick={handleSubmit}
        className="w-full py-1.5 rounded bg-blue-950 border border-blue-700 text-blue-400 hover:bg-blue-900 disabled:opacity-50">
        + Lưu sự kiện
      </button>
      {msg && <p className={msg.ok ? "text-emerald-400" : "text-rose-400"}>{msg.text}</p>}
    </div>
  );
}

export function EventPanel() {
  const { events, candidates, isLoading } = useSieuQuetEvents();
  const [activeCandidate, setActiveCandidate] = useState<SieuQuetEventCandidate | null>(null);
  const [showForm, setShowForm] = useState(false);

  return (
    <div style={{ background: "rgba(13,17,26,0.75)", border: "1px solid rgba(255,255,255,0.06)" }} className="rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-amber-400">Sự Kiện Vĩ Mô</h2>
        <button onClick={() => setShowForm(!showForm)} className="text-[10px] text-sky-400 hover:underline">
          {showForm ? "Đóng form" : "+ Nhập tay"}
        </button>
      </div>

      {showForm && <div className="mb-3 pb-3 border-b border-white/10"><ManualEventForm onDone={() => setShowForm(false)} /></div>}

      {isLoading ? (
        <div className="text-[10px] text-slate-500">Đang tải...</div>
      ) : (
        <div className="space-y-1.5">
          {candidates.length > 0 && (
            <button onClick={() => setActiveCandidate(candidates[0])}
              className="w-full text-left px-2 py-1.5 rounded bg-amber-950/40 border border-amber-700/50 hover:bg-amber-950/60 text-xs text-amber-300">
              🔔 {candidates.length} sự kiện chờ xác nhận: {candidates[0].rawTitle}
            </button>
          )}
          {events.length === 0 && candidates.length === 0 && <div className="text-[10px] text-slate-500">Chưa có sự kiện nào.</div>}
          {events.slice(0, 6).map((e) => (
            <div key={e.id} className="px-2 py-1.5 rounded bg-white/5 border border-white/10 text-xs">
              <div className="text-slate-200">{e.title}</div>
              <div className="text-slate-500 text-[10px]">
                {CATEGORY_LABEL[e.category] ?? e.category} · {e.source === "manual_input" ? "nhập tay" : "AI xác nhận"} · mức độ {e.severity}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeCandidate && <CandidateModal candidate={activeCandidate} onClose={() => setActiveCandidate(null)} />}
    </div>
  );
}
