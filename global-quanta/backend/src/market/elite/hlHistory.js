// HL-RADAR P4 (20/11/2026, tài liệu 20) — lịch sử GỌN của danh mục Elite HL theo phiên, dựng từ chính các tài liệu quyết định đã lưu
// (elite:decision:{ngày}). Không tính số mới: chỉ trích các trường đã có của từng phiên. Dùng cho đường xu hướng LS-v1 trên bảng và
// thanh "tua lại" phiên cũ. Một tài liệu đầy đủ nặng 200–300 KB; bản gọn vài KB cho cả 10 phiên.
// Phiên trước khi có Elite HL (tài liệu không có `hl`) bị bỏ qua.

const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 10_000) / 10_000 : null);

/** Một phiên -> bản gọn. `doc` = tài liệu quyết định đã lưu. */
export function hlSession(doc) {
  if (!doc?.hl || !Array.isArray(doc.portfolio)) return null;
  const held = doc.portfolio.filter((p) => p?.hl).map((p) => ({
    t: p.ticker, rank: p.hl.rank ?? null, cls: p.hl.cls ?? null, w: r4(p.weight), ls: r1(p.hl.lsPct), t1: p.hl.t1 ?? null, ta: p.hl.taCount ?? null,
    rrg: p.hl.rrg ?? null, status: p.hl.status ?? null, since: p.hl.since ?? null, ret: r4(p.hl.sinceRet), pz: p.hl.pz?.state ?? null, lane: p.hl.pz?.lane ?? null,
    close: Number.isFinite(p.close) ? p.close : null,
  }));
  const ch = doc.hl.changes ?? {};
  return {
    date: doc.date, rebalance: Boolean(doc.hl.rebalance), frozen: Boolean(doc.hl.dataGuard?.frozen),
    cash: r4(doc.hl.cash), invested: r4(doc.hl.invested), exitLsPct: doc.hl.rule?.exitLsPct ?? null,
    held,
    added: Array.isArray(ch.added) ? ch.added : [],
    exits: Array.isArray(ch.exits) ? ch.exits.map((x) => ({ t: x.ticker, code: x.code ?? null, reasonVi: x.reasonVi ?? null, w: r4(x.weight) })) : [],
    // HL-H2 (20/11/2026, buồng lái C6 — docs/elite-hl-cockpit 04 mục 5): thành viên Hàng chờ và Chưa giao dịch được của phiên, trích
    // nguyên văn từ tài liệu đã lưu — để breadcrumb có bước "Hàng chờ → Danh mục". Trường MỚI, không đổi trường cũ (tương thích ngược).
    queue: Array.isArray(doc.hl.queue) ? doc.hl.queue.map((q) => ({ t: q.ticker, code: q.code ?? null })) : [],
    ill: Array.isArray(doc.hl.queueIlliquid) ? doc.hl.queueIlliquid.map((q) => q.ticker) : [],
  };
}

/** Nhiều phiên (cũ -> mới) -> { dates, sessions }. */
export function hlHistoryFromDocs(docs) {
  const sessions = docs.map(hlSession).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  return { version: "HL-H2", dates: sessions.map((s) => s.date), sessions };
}
