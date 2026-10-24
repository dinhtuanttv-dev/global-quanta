"use client";
// Super Chart SC4 — BẢNG CHI TIẾT · Tổng quan: tóm tắt một dòng mỗi phương pháp (đọc từ CHÍNH kết quả engine đang hiển thị — không tính lại),
// bấm thẻ -> mở đúng tab của dock (bảng sâu). Nhãn bằng chứng giữ nguyên ở bảng sâu; ở đây chỉ mô tả.
import type { SmcState } from "../../../../lib/ta-command-center/AnalysisController";
import type { WyckoffResult } from "../../../../lib/ta-command-center/detectors/wyckoffDetector";
import type { AdxResult, MacdResult, RsiResult } from "../../../../lib/ta-command-center/detectors/technicalOscillators";
import type { VsaSignal } from "../../../../lib/quant-core";
import type { DockTab } from "./workspaceModel";

const PHASE_VI: Record<string, string> = { accumulation: "Tích luỹ", spring: "Spring", test: "Test", markup: "Tăng giá", distribution: "Phân phối", decline: "Giảm giá", undetermined: "Chưa xác định" };
const ADX_VI: Record<string, string> = { chua_du: "chưa đủ dữ liệu", yeu: "yếu", trung_binh: "trung bình", manh: "mạnh", rat_manh: "rất mạnh" };
const n1 = (v: number | null | undefined, d = 1) => (v == null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d }));

interface Props {
  smc: SmcState; vsa: VsaSignal[]; wyckoff: WyckoffResult | null; rsi: RsiResult; macd: MacdResult; adx: AdxResult;
  structure: { verdict: string; stage: string; on: boolean } | null; elliottPro: string | null; onOpen: (t: DockTab) => void;
}

export default function InspectorOverview(p: Props) {
  const lastVsa = p.vsa[p.vsa.length - 1];
  const cards: { tab: DockTab; title: string; value: string; sub: string; testid: string }[] = [
    { tab: "structure", title: "Cấu trúc MTF", value: p.structure?.on ? p.structure.verdict : "Chưa bật", sub: p.structure?.on ? p.structure.stage : "Bấm để bật lớp + bảng", testid: "ov-structure" },
    { tab: "elliott", title: "Elliott Pro", value: p.elliottPro ? (p.elliottPro.split(" · ")[1] ?? p.elliottPro) : "—", sub: p.elliottPro ? p.elliottPro.split(" · ").slice(2).join(" · ") : "Chưa đủ nến để đếm sóng", testid: "ov-elliott" },
    { tab: "methods", title: "Wyckoff", value: p.wyckoff ? PHASE_VI[p.wyckoff.phase] ?? p.wyckoff.phase : "—", sub: p.wyckoff ? `Tin cậy ${n1(p.wyckoff.confidenceScore, 0)}%` : "", testid: "ov-wyckoff" },
    { tab: "methods", title: "SMC", value: `${p.smc.totals.obs} OB · ${p.smc.totals.fvgs} FVG`, sub: `${p.smc.totals.bos} BOS · ${p.smc.totals.choch} CHoCH`, testid: "ov-smc" },
    { tab: "methods", title: "VSA", value: lastVsa ? lastVsa.type : "Không có tín hiệu", sub: lastVsa ? `phiên ${lastVsa.date.slice(0, 16)}` : "", testid: "ov-vsa" },
    { tab: "indicators", title: "Động lượng", value: `RSI ${n1(p.rsi.latest)}${p.rsi.flat ? " (giá phẳng)" : ""}`, sub: `MACD ${n1(p.macd.latest.histogram, 2)} · ADX ${n1(p.adx.latest)} (${ADX_VI[p.adx.trendStrength] ?? p.adx.trendStrength})`, testid: "ov-momentum" },
  ];
  return (
    <div className="space-y-1.5" data-testid="inspector-overview">
      {cards.map((c) => (
        <button key={c.testid} type="button" onClick={() => p.onOpen(c.tab)} data-testid={c.testid} className="ws-card w-full text-left">
          <span className="text-[9px] uppercase tracking-wide text-slate-500">{c.title}</span>
          <span className="block text-[12px] font-bold text-slate-100 truncate">{c.value}</span>
          {c.sub && <span className="block text-[9.5px] text-slate-400 truncate">{c.sub}</span>}
        </button>
      ))}
      <p className="text-[9px] text-slate-500 leading-snug">Tóm tắt mô tả từ chính kết quả đang vẽ trên biểu đồ. Nhãn kiểm định và chi tiết ở dock bên dưới.</p>
    </div>
  );
}
