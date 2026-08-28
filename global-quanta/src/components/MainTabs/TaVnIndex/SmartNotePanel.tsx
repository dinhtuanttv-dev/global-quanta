"use client";
import { useState } from "react";
import { Sparkles, ChevronDown, ChevronUp, RefreshCw, Bot } from "lucide-react";
import type { WyckoffResult } from "../../../lib/ta-command-center/detectors/wyckoffDetector";
import type { OrderBlock, FairValueGap, BreakOfStructure } from "../../../lib/ta-command-center/detectors/smcDetector";
import type { VSASignal } from "../../../lib/ta-command-center/detectors/vsaDetector";
import type { RsiResult, MacdResult, AdxResult } from "../../../lib/ta-command-center/detectors/technicalOscillators";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const PHASE_LABEL: Record<string, string> = {
  accumulation: "Accumulation", spring: "Spring", test: "Test", markup: "Markup", undetermined: "Chua xac dinh",
};

interface Props {
  ticker: string;
  wyckoff: WyckoffResult;
  smc: { obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[] };
  vsa: VSASignal[];
  rsi: RsiResult;
  macd: MacdResult;
  adx: AdxResult;
}

// Xay prompt CHI tu du lieu that da tinh - khong de AI tu bia them
// so lieu khong co trong danh sach truyen vao (gia muc tieu, xac suat...).
function buildPrompt(p: Props): string {
  const lastVsa = p.vsa[p.vsa.length - 1];
  const lastOb = p.smc.obs[p.smc.obs.length - 1];

  return [
    `Ban la chuyen gia phan tich ky thuat chung khoan Viet Nam. Duoi day la du lieu THAT da tinh san cho ma ${p.ticker} - CHI duoc dung dung cac so nay, KHONG duoc tu bia them gia muc tieu hay xac suat khong co trong danh sach:`,
    `- Wyckoff Cycle (ESTIMATED - suy luan hinh mau, khong phai phan tich dong tien to chuc that): ${PHASE_LABEL[p.wyckoff.phase]}`,
    `- SMC (HARD_DATA): ${p.smc.obs.length} Order Block, ${p.smc.fvgs.length} FVG, ${p.smc.bos.length} BOS.${lastOb ? ` OB gan nhat: ${lastOb.type}, vung ${lastOb.bottom.toLocaleString()}-${lastOb.top.toLocaleString()}.` : ""}`,
    `- VSA (HARD_DATA): ${lastVsa ? `${lastVsa.type} ngay ${lastVsa.date}` : "chua co tin hieu gan day"}.`,
    `- RSI(14) (HARD_DATA): ${p.rsi.latest !== null ? p.rsi.latest.toFixed(1) : "chua du du lieu"}.`,
    `- MACD(12,26,9) (HARD_DATA): histogram ${p.macd.latest.histogram !== null ? p.macd.latest.histogram.toFixed(2) : "chua du du lieu"}.`,
    `- ADX(14) (HARD_DATA): ${p.adx.latest !== null ? p.adx.latest.toFixed(1) : "chua du du lieu"} (${p.adx.trendStrength}).`,
    ``,
    `Viet dung 3 cau tom tat, dung dinh dang: Cau 1 trang thai chu ky Wyckoff hien tai. Cau 2 xac nhan ky thuat tu SMC/VSA hoac dong luong (RSI/MACD/ADX). Cau 3 vung gia quan trong hoac canh bao rui ro cau truc. KHONG dua ra khuyen nghi mua/ban cu the, KHONG bia so lieu ngoai danh sach tren.`,
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
      if (!res.ok) throw new Error(`Loi ${res.status}`);
      const data = await res.json();
      setNote(data.reply ?? "Khong nhan duoc phan hoi tu AI.");
      setUpdatedAt(new Date().toLocaleTimeString("vi-VN"));
    } catch (err) {
      setError(String(err));
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
        <p className="text-[9px] text-slate-500 mb-1.5">Bam de AI tom tat nhanh dua tren du lieu da tinh (Wyckoff+SMC+VSA+RSI/MACD/ADX).</p>
      )}
      {error && <p className="text-[9px] text-red-400 mb-1.5">Loi: {error}</p>}
      {note && (
        <div className="mb-1.5">
          <div className="flex items-start gap-1.5">
            <Bot className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-300 leading-relaxed">{note}</p>
          </div>
          {updatedAt && <p className="text-[8px] text-slate-600 mt-1">Cap nhat: {updatedAt}</p>}
        </div>
      )}

      <button onClick={handleAskAI} disabled={loading}
        style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}
        className="w-full flex items-center justify-center gap-1.5 py-1 rounded-md text-[10px] font-bold text-amber-300 disabled:opacity-40 transition">
        {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {loading ? "Dang phan tich..." : note ? "Lam moi" : "Hoi AI"}
      </button>
    </div>
  );
}
