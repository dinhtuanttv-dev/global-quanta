// "Bộ não Phòng họp AI" (ARL-v1, 26/11/2026): hồ sơ độ tin cậy đo bằng thị trường thật — dùng ở tab 3 (khối trái), tab 2 Hồ sơ 360° và
// tab 4 Bằng chứng & sổ theo dõi. Chỉ mô tả: không đổi danh mục Elite HL. Dưới 30 bản đã chấm -> "CHƯA ĐỦ MẪU", không hiện tỷ lệ như kết luận.
import { useAiRoomLedger, type AiLedgerEntry } from "../../../hooks/elite10/useAiRoomLedger";

const H = ["5", "10", "20"] as const;
const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const rate = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const dm = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
const balanceVi = (b: number | null) => (b == null ? "chưa đủ hai phe" : b > 0 ? `+${b} nghiêng thuận` : b < 0 ? `${b} nghiêng phản biện` : "0 cân bằng");
const stateVi: Record<string, string> = { READY: "Đủ ba vai", PARTIAL: "Thiếu vai", RETRY: "Đang thử lại", SNAPSHOT: "Đã khoá snapshot" };

function EntryRow({ e }: { e: AiLedgerEntry }) {
  return (
    <tr className="border-t border-white/5">
      <td className="py-1 pr-2 font-semibold text-slate-100">{e.ticker}</td>
      <td className="py-1 pr-2 text-slate-300">{dm(e.session)}</td>
      <td className="py-1 pr-2 text-slate-300">{stateVi[e.state ?? ""] ?? e.state ?? "—"}</td>
      <td className="py-1 pr-2 text-slate-200">{balanceVi(e.balance)}</td>
      {H.map((h) => { const r = e.results[h]; return (
        <td key={h} className={`py-1 pr-2 text-right font-mono ${r?.limitUp ? "text-slate-400" : r ? (r.excess >= 0 ? "text-emerald-300" : "text-rose-300") : "text-slate-400"}`}
          title={r ? `${r.entry} → ${r.exit} · mã ${pct(r.ret)} · VN-Index ${pct(r.vnRet)}${r.limitUp ? " · phiên vào sát trần: không tính" : ""}` : "chưa đủ phiên"}>
          {r ? (r.limitUp ? "trần" : pct(r.excess)) : "chờ"}
        </td>); })}
    </tr>
  );
}

/** Chế độ gọn (khối trái tab 3, Hồ sơ 360°): mỗi bản ghi 2 dòng thay cho bảng 7 cột — đọc được ở cột hẹp. */
function EntryItem({ e }: { e: AiLedgerEntry }) {
  return (
    <li className="border-t border-white/5 py-1.5" data-testid="ai-brain-entry">
      <p className="flex flex-wrap items-baseline justify-between gap-x-2"><b className="text-slate-100">{e.ticker} · {dm(e.session)}</b><span className="text-slate-300">{stateVi[e.state ?? ""] ?? e.state ?? "—"}</span></p>
      <p className="text-slate-300">Cán cân {balanceVi(e.balance)}</p>
      <p className="flex flex-wrap gap-x-3 font-mono">{H.map((h) => { const r = e.results[h]; return (
        <span key={h} className={r?.limitUp ? "text-slate-400" : r ? (r.excess >= 0 ? "text-emerald-300" : "text-rose-300") : "text-slate-400"}>+{h}: {r ? (r.limitUp ? "trần" : pct(r.excess)) : "chờ"}</span>); })}</p>
    </li>
  );
}

export default function AiBrainCard({ ticker = null, compact = false, testId = "ai-brain-card" }: { ticker?: string | null; compact?: boolean; testId?: string }) {
  // Mã truyền vào nhưng không phải cổ phiếu 3 ký tự (VD VNINDEX ở Hồ sơ 360°): không gọi sổ, không rơi về danh sách toàn sổ.
  const notStock = ticker != null && !/^[A-Z][A-Z0-9]{2}$/.test(ticker);
  const { data, error, isLoading } = useAiRoomLedger(ticker, !notStock);
  if (notStock) return (
    <section className="tw-scope space-y-1 text-[11.5px] text-slate-200" data-testid={testId} aria-label="Bộ não Phòng họp AI — sổ phán quyết">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-[#F5CE72]">Bộ não Phòng họp AI · sổ phán quyết</h3>
      <p className="text-slate-300">{ticker} là chỉ số / mã ngoài vũ trụ cổ phiếu — Phòng họp AI chỉ phân tích cổ phiếu, nên không có bản ghi.</p>
    </section>
  );
  const s = data?.summary;
  const h10 = s?.horizons["10"];
  const enough = s?.label === "THĂM DÒ";
  return (
    <section className="tw-scope space-y-2 text-[11.5px] text-slate-200" data-testid={testId} aria-label="Bộ não Phòng họp AI — sổ phán quyết">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-[#F5CE72]">Bộ não Phòng họp AI · sổ phán quyết</h3>
        {s && <span className={`rounded border px-1.5 py-0.5 text-[10.5px] ${enough ? "border-amber-300/50 text-amber-100" : "border-white/20 text-slate-300"}`}>{s.label}</span>}
      </div>
      {error && <p className="text-amber-200">Chưa đọc được sổ phán quyết từ Gateway.</p>}
      {isLoading && !data && <p className="text-slate-300">Đang tải sổ phán quyết…</p>}
      {s && (
        <>
          <p className="text-slate-300" data-testid={`${testId}-headline`}>
            {s.total} bản phân tích đã ghi · {s.ready} đủ ba vai · {h10?.n ?? 0} đã chấm ở 10 phiên.
            {enough && h10?.hitRate != null && <> Cán cân đúng chiều <b className="text-slate-100">{rate(h10.hitRate)}</b> (KTC 90% {rate(h10.hitCi90?.[0])}–{rate(h10.hitCi90?.[1])}, {h10.directional} lần).</>}
          </p>
          {!compact && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[11px]">
                <caption className="sr-only">Hiệu quả theo kỳ hạn, lợi suất vượt VN-Index</caption>
                <thead className="text-slate-300"><tr>
                  <th className="py-1 pr-2 font-semibold">Kỳ hạn</th><th className="py-1 pr-2 font-semibold">Đã chấm</th><th className="py-1 pr-2 font-semibold">Đường cơ sở (mọi mã lõi)</th>
                  <th className="py-1 pr-2 font-semibold">Cán cân thuận</th><th className="py-1 pr-2 font-semibold">AI thêm giá trị</th><th className="py-1 pr-2 font-semibold">Đúng chiều (KTC 90%)</th>
                </tr></thead>
                <tbody>{H.map((h) => { const x = s.horizons[h]; return (
                  <tr key={h} className="border-t border-white/5">
                    <td className="py-1 pr-2">+{h} phiên</td><td className="py-1 pr-2 font-mono">{x?.n ?? 0}</td>
                    <td className="py-1 pr-2 font-mono">{pct(x?.baseline)}</td><td className="py-1 pr-2 font-mono">{pct(x?.positive.meanExcess)} ({x?.positive.n ?? 0})</td>
                    <td className="py-1 pr-2 font-mono">{pct(x?.valueAdd)}</td>
                    <td className="py-1 pr-2 font-mono">{x?.hitRate == null ? "—" : `${rate(x.hitRate)} (${rate(x.hitCi90?.[0])}–${rate(x.hitCi90?.[1])})`}</td>
                  </tr>); })}</tbody>
              </table>
            </div>
          )}
          {data.entries.length > 0 && compact ? (
            <ul aria-label={ticker ? `Các bản phân tích của ${ticker}` : "Các bản phân tích gần nhất"}>{data.entries.slice(0, 5).map((e) => <EntryItem key={e.id} e={e} />)}</ul>
          ) : data.entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className={`w-full text-left text-[11px] ${compact ? "" : "min-w-[520px]"}`}>
                <caption className="sr-only">{ticker ? `Các bản phân tích của ${ticker}` : "Các bản phân tích gần nhất"}</caption>
                <thead className="text-slate-300"><tr>
                  <th className="py-1 pr-2 font-semibold">Mã</th><th className="py-1 pr-2 font-semibold">Phiên</th><th className="py-1 pr-2 font-semibold">Trạng thái</th>
                  <th className="py-1 pr-2 font-semibold">Cán cân</th>{H.map((h) => <th key={h} className="py-1 pr-2 text-right font-semibold">+{h}</th>)}
                </tr></thead>
                <tbody>{data.entries.slice(0, compact ? 5 : 20).map((e) => <EntryRow key={e.id} e={e} />)}</tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-300">{ticker ? `Chưa có bản phân tích nào của ${ticker} trong sổ.` : "Sổ chưa có bản ghi."} Sổ ghi từ ngày 26/11/2026, mỗi khi Phòng họp AI hoàn tất một vai; cần tín dụng Anthropic để có đủ ba vai.</p>
          )}
          <p className="text-[11px] text-slate-300">{s.labelVi} {!compact && s.methodVi}</p>
        </>
      )}
    </section>
  );
}
