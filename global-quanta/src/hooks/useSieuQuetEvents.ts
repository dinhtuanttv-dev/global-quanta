import useSWR from "swr";
import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "https://tuan-quant-scanner-psi.vercel.app";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface SieuQuetEvent {
  id: string; title: string; category: string; source: string;
  severity: number; description: string; sectors: string[];
  magnitude: string; direction: string;
  sourceUrl: string | null; sourceName: string | null;
  createdAt: string;
}

export interface SieuQuetEventCandidate {
  id: string; rawTitle: string; category: string; sectors: string[];
  magnitude: string; direction: string;
  sourceUrl: string | null; sourceName: string | null;
  announcementDate: string | null; aiSummary: string;
  discoveredAt: string;
}

function uuidLike(): string {
  return "idem-" + Math.random().toString(36).slice(2) + Date.now();
}

// SIEU QUET AI - GIAI DOAN 3: Multi-AI Consensus (Event System). Nguoi
// dung LA BEN "doi chung" cuoi cung (thay cho 2-3 AI doc lap cua ban
// goc, vi chi co 1 AI provider - Gemini + Google Search Grounding).
export function useSieuQuetEvents() {
  // N3 (2026-10-17): tab mặc định — 15 phút/lần thay vì 2–5 phút (CSDL Neon của Project A chỉ ngủ sau 5 phút không truy vấn).
  // Ứng viên mới chỉ sinh từ cron sieu-quet-event-discover 3 lần/ngày; xác nhận/bỏ qua vẫn cập nhật ngay qua mutate().
  // Lỗi (VD CSDL hết hạn mức): thử lại tối đa 3 lần rồi chờ nhịp làm mới kế tiếp — SWR mặc định thử lại vô hạn ~30 giây/lần.
  const eventsRes = useSWR<{ events: SieuQuetEvent[] }>(`${API_BASE}/api/sieu-quet-ai/events`, fetcher, {
    refreshInterval: 15 * 60 * 1000, revalidateOnFocus: false, errorRetryCount: 3,
  });
  const candidatesRes = useSWR<{ candidates: SieuQuetEventCandidate[] }>(`${API_BASE}/api/sieu-quet-ai/candidates`, fetcher, {
    refreshInterval: 15 * 60 * 1000, revalidateOnFocus: false, errorRetryCount: 3,
  });

  const [actionError, setActionError] = useState<string | null>(null);

  async function confirmCandidate(id: string) {
    setActionError(null);
    const res = await fetch(`${API_BASE}/api/sieu-quet-ai/candidates/${id}/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: uuidLike() }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); setActionError(e.error ?? "Lỗi xác nhận."); return; }
    await Promise.all([eventsRes.mutate(), candidatesRes.mutate()]);
  }

  async function skipCandidate(id: string) {
    setActionError(null);
    const res = await fetch(`${API_BASE}/api/sieu-quet-ai/candidates/${id}/skip`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: uuidLike() }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); setActionError(e.error ?? "Lỗi bỏ qua."); return; }
    await candidatesRes.mutate();
  }

  async function submitManualEvent(payload: {
    title: string; description: string; category: string; severity: number;
    sectors: string[]; magnitude: string; direction: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`${API_BASE}/api/sieu-quet-ai/events`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); return { ok: false, error: e.error ?? "Lỗi tạo sự kiện." }; }
    await eventsRes.mutate();
    return { ok: true };
  }

  return {
    events: eventsRes.data?.events ?? [],
    candidates: candidatesRes.data?.candidates ?? [],
    isLoading: eventsRes.isLoading || candidatesRes.isLoading,
    actionError, confirmCandidate, skipCandidate, submitManualEvent,
  };
}
