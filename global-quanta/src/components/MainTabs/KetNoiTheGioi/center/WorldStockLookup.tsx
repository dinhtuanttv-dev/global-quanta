// W3 (19/11/2026) — Truyền dẫn & kịch bản › Cổ phiếu: thay dòng "Hồ sơ phơi nhiễm đang ẩn" bằng tra cứu một mã.
// Không bịa số phơi nhiễm: engine thế giới vẫn chưa có dữ liệu BCTC (doanh thu theo vùng, tỷ trọng chi phí hàng hoá) nên ghi rõ.
// Thay vào đó dùng hai nguồn THẬT đã có: khối "Tác động lên cổ phiếu" (D4, /api/elite/impact/:ticker, có dấu bằng chứng)
// và số đo thanh khoản LQ-v1 (/api/elite/liquidity/:ticker) để cảnh báo khi mã thanh khoản thấp hoặc thiếu số liệu.
import { useEffect, useState, type FormEvent } from "react";
import StockImpactCard from "../../../elite10/center/StockImpactCard";
import LiquidityBadge from "../../../elite10/center/LiquidityBadge";
import { useEliteLiquidity } from "../../../../hooks/elite10/useEliteLiquidity";
import { LQ_DEFAULT, LQ_TIER, reasonText } from "../../../../lib/elite10/liquidity";
import { useAppStore } from "../../../../store/useAppStore";

const VALID = /^[A-Z0-9]{3,10}$/;

/** Cảnh báo thanh khoản / thiếu số liệu cho một mã (chỉ hiển thị). */
export function LiquidityWarning({ ticker }: { ticker: string }) {
  const { data, error, isLoading } = useEliteLiquidity(ticker);
  if (isLoading) return null;
  if (error) return <p className="text-[10.5px] text-slate-500" data-testid="world-stock-liq-error">Chưa đọc được số đo thanh khoản của {ticker}.</p>;
  if (!data?.liq) {
    return <p className="rounded border border-amber-400/40 bg-amber-500/[0.06] px-2 py-1 text-[10.5px] text-amber-200" data-testid="world-stock-liq-missing">
      ⚠ {ticker} chưa có số đo thanh khoản ở phiên quyết định gần nhất (mã ngoài vũ trụ Siêu quét hoặc thiếu dữ liệu GTGD). Đọc các con số bên dưới thận trọng.
    </p>;
  }
  const l = data.liq, rules = data.rules ?? LQ_DEFAULT;
  const weak = l.tier === "L3" || l.tier === "L4" || l.tier === "NA";
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded border px-2 py-1 text-[10.5px] ${weak ? "border-amber-400/40 bg-amber-500/[0.06] text-amber-200" : "border-white/10 text-slate-300"}`} data-testid="world-stock-liq" data-tier={l.tier}>
      <span className="font-bold">{weak ? "⚠ Thanh khoản" : "Thanh khoản"}</span>
      <LiquidityBadge liq={l} rules={rules} sigma20={data.sigma20 ?? null} />
      {weak && <span>{LQ_TIER[l.tier].hint}{l.reasons?.length ? ` — ${l.reasons.map((r) => reasonText(r, l, rules)).join("; ")}` : ""}.</span>}
      <span className="text-[10px] text-slate-500">LQ-v1 · phiên {data.date.split("-").reverse().join("/")}</span>
    </div>
  );
}

export default function WorldStockLookup() {
  const global = useAppStore((s) => s.selectedTicker);
  const [ticker, setTicker] = useState(() => (global && VALID.test(global) ? global : "HPG"));
  const [draft, setDraft] = useState(ticker);
  useEffect(() => { if (global && VALID.test(global)) { setTicker(global); setDraft(global); } }, [global]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = draft.trim().toUpperCase();
    if (VALID.test(t)) setTicker(t);
  };
  return (
    <section className="space-y-2 rounded-xl border border-white/10 bg-slate-950/40 p-3" data-testid="world-stock-lookup">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase text-slate-300">Cổ phiếu: tác động và thanh khoản</p>
        <form onSubmit={submit} className="flex items-center gap-1" data-testid="world-stock-form">
          <label htmlFor="world-stock-code" className="text-[10.5px] text-slate-400">Mã</label>
          <input id="world-stock-code" value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} maxLength={10} aria-label="Mã cổ phiếu"
            className="w-24 rounded border border-white/15 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-100" data-testid="world-stock-input" />
          <button type="submit" className="min-h-[28px] rounded border border-amber-400/40 px-2 text-[11px] font-bold text-amber-200 hover:bg-amber-400/10">Xem</button>
        </form>
      </div>
      <p className="text-[10px] text-slate-500" data-testid="world-stock-exposure-note">
        Hồ sơ phơi nhiễm quốc tế riêng từng mã (doanh thu theo vùng, tỷ trọng chi phí hàng hoá, ngoại tệ) chưa có nguồn BCTC nên chưa hiển thị. Bên dưới là các lớp tác động đã có số thật, mỗi lớp kèm dấu bằng chứng.
      </p>
      <LiquidityWarning ticker={ticker} />
      <StockImpactCard ticker={ticker} />
    </section>
  );
}
