"use client";
import { useState } from "react";
import { Sparkles, ChevronDown, ChevronUp, RefreshCw, Bot } from "lucide-react";
import { WYCKOFF_PHASE_LABEL, type WyckoffResult } from "../../../lib/ta-command-center/detectors/wyckoffDetector";
import type { SmcState } from "../../../lib/ta-command-center/AnalysisController";
import type { VSASignal } from "../../../lib/ta-command-center/detectors/vsaDetector";
import type { RsiResult, MacdResult, AdxResult } from "../../../lib/ta-command-center/detectors/technicalOscillators";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

interface Props {
  ticker: string;
  wyckoff: WyckoffResult;
  smc: SmcState;
  vsa: VSASignal[];
  rsi: RsiResult;
  macd: MacdResult;
  adx: AdxResult;
}

// Prompt CHỈ chứa số liệu đã tính, kèm nhãn nguồn gốc (DERIVED/INFERRED) — AI không được bịa thêm số.
export function buildPrompt(p: Props): string {
  const lastVsa = p.vsa[p.vsa.length - 1];
  const lastOb = p.smc.obs[p.smc.obs.length - 1];
  const t = p.smc.totals;
  return [
    `Bạn là chuyên gia phân tích kỹ thuật chứng khoán Việt Nam. Dưới đây là dữ liệu ĐÃ TÍNH cho mã ${p.ticker}. CHỈ dùng đúng các số này, KHÔNG tự đưa ra giá mục tiêu hay xác suất không có trong danh sách:`,
    `- Wyckoff (INFERRED — suy luận mẫu hình giá/khối lượng, không phải dòng tiền tổ chức thật): ${WYCKOFF_PHASE_LABEL[p.wyckoff.phase]}; sự kiện khớp mẫu ${p.wyckoff.confidenceScore}% (không phải xác suất).`,
    `- SMC (DERIVED): ${t.obs} Order Block, ${t.fvgs} FVG, ${t.bos} BOS, ${t.choch} CHoCH trên toàn bộ dữ liệu.${lastOb ? ` OB gần nhất: ${lastOb.type}, vùng ${lastOb.bottom.toLocaleString("vi-VN")}–${lastOb.top.toLocaleString("vi-VN")}.` : ""}`,
    `- VSA (DERIVED): ${lastVsa ? `${lastVsa.type} ngày ${lastVsa.date}` : "chưa có tín hiệu gần đây"}.`,
    `- RSI(14) (DERIVED): ${p.rsi.latest !== null ? p.rsi.latest.toFixed(1) : "chưa đủ dữ liệu"}.`,
    `- MACD(12,26,9) (DERIVED): histogram ${p.macd.latest.histogram !== null ? p.macd.latest.histogram.toFixed(2) : "chưa đủ dữ liệu"}.`,
    `- ADX(14) (DERIVED): ${p.adx.latest !== null ? p.adx.latest.toFixed(1) : "chưa đủ dữ liệu"} (${p.adx.trendStrength}).`,
    ``,
    `Viết đúng 3 câu: Câu 1 trạng thái chu kỳ Wyckoff. Câu 2 xác nhận từ SMC/VSA hoặc động lượng (RSI/MACD/ADX). Câu 3 vùng giá quan trọng hoặc rủi ro cấu trúc. KHÔNG khuyến nghị mua/bán, KHÔNG bịa số liệu ngoài danh sách.`,
  ].join("\n");
}

export default function SmartNotePanel(props: Props) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const handleAskAI = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: buildPrompt(props) }),
      });
      if (!res.ok) throw new Error(`AI chưa sẵn sàng (máy chủ trả ${res.status}) — sẽ khôi phục ở P9`);
      const data = await res.json();
      setNote(data.reply ?? "Không nhận được phản hồi từ AI.");
      setUpdatedAt(new Date().toLocaleTimeString("vi-VN"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)}
        style={{ background: "rgba(14,22,38,0.9)", border: "1px solid rgba(245,158,11,0.3)" }}
        className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-amber-300">
        <Sparkles className="w-3 h-3" /> Smart Note <ChevronDown className="w-3 h-3" />
      </button>
    );
  }

  return (
    <div style={{ background: "rgba(14,22,38,0.95)", border: "1px solid rgba(245,158,11,0.3)", maxWidth: 260 }}
      className="absolute top-3 right-3 z-10 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Smart Note
        </span>
        <button onClick={() => setExpanded(false)} className="text-slate-400 hover:text-slate-200">
          <ChevronUp className="w-3 h-3" />
        </button>
      </div>

      {!note && !loading && !error && (
        <p className="text-[9px] text-slate-500 mb-1.5">AI tóm tắt 3 câu, chỉ từ số liệu đã tính (Wyckoff · SMC · VSA · RSI/MACD/ADX).</p>
      )}
      {error && <p className="text-[9px] text-rose-400 mb-1.5">{error}</p>}
      {note && (
        <div className="mb-1.5">
          <div className="flex items-start gap-1.5">
            <Bot className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-300 leading-relaxed">{note}</p>
          </div>
          {updatedAt && <p className="text-[8px] text-slate-600 mt-1">Cập nhật {updatedAt}</p>}
        </div>
      )}

      <button onClick={handleAskAI} disabled={loading}
        style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}
        className="w-full flex items-center justify-center gap-1.5 py-1 rounded-md text-[10px] font-bold text-amber-300 disabled:opacity-40 transition">
        {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {loading ? "Đang phân tích…" : note ? "Làm mới" : "Tóm tắt bằng AI"}
      </button>
    </div>
  );
}
