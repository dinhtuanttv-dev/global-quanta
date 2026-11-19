// V4 (19/11/2026) — chuyển từ Project A (lib/catalyst/chat/catalystTools.ts), giữ nguyên hợp đồng.
// Công cụ "xúc tác": CHỈ ĐỌC snapshot engine Chất xúc tác (kho Gateway) — không tự tính lại. Mọi con số trả về đều có trong
// snapshot; kèm trạng thái cũ/mới của snapshot và hướng dẫn đọc.

const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
const r2 = (x) => Math.round(x * 100) / 100;

const STALE_NOTE = (s) =>
  s.isStale ? `Dữ liệu xúc tác CŨ: lần quét gần nhất cách đây ${Math.round((s.ageMinutes ?? 0) / 60)} giờ (${s.scannedAt}) — phải nói rõ điều này với người dùng.` : null;

const GUIDE = [
  "direction là hướng do engine suy ra từ tin/sự kiện (benefit = có lợi, harm = bất lợi) — là đánh giá của engine, không phải dự báo giá.",
  "historicalWinRate là tỷ lệ thắng thực tế đã đối chiếu giá của nhóm tín hiệu cùng loại (%); dưới 50% nghĩa là nhóm tín hiệu này lịch sử KHÔNG tốt hơn tung đồng xu — phải nói rõ. Đúng 50 có thể là giá trị MẶC ĐỊNH khi chưa đủ mẫu hiệu chỉnh — khi đó nói là chưa có số liệu kiểm chứng.",
  "priceInStatus 'reflected' = giá đã tăng mạnh hơn VN-Index >5% trong 63 phiên (có thể đã phản ánh tin).",
  "Không đưa khuyến nghị mua/bán; trình bày như thông tin tham khảo.",
];

const cardOut = (c, sector) => ({
  ticker: c.ticker, sector, catalyst: c.sourceTitle, direction: c.direction, impact: r2(c.netSignedImpact),
  propagation: c.propagationDistance, horizon: c.horizon, daysRemaining: c.daysRemaining,
  corroboration: c.corroborationCount, historicalWinRatePct: r2(c.historicalWinRate), priceInStatus: c.priceInStatus,
  volumeFlag: c.volumeFlag, foreignFlow: c.foreignFlowDirection, compositeScore: r2(c.compositeScore), trustScore: r2(c.trustScore),
  conflicted: c.isConflicted,
});

export const CATALYST_TOOL_SPECS = [
  {
    name: "catalyst_overview",
    description: "Tổng quan engine Chất xúc tác hiện tại: các ngành có điểm xúc tác ròng cao/thấp nhất, mã được hưởng lợi / bất lợi nhiều nhất, cảnh báo đang mở, thời điểm quét và độ cũ của dữ liệu. Dùng khi hỏi 'đang có xúc tác gì', 'ngành nào hưởng lợi'.",
    input_schema: { type: "object", properties: { topN: { type: "integer", minimum: 1, maximum: 10, description: "Số ngành/mã mỗi danh sách, mặc định 5." } }, required: [], additionalProperties: false },
  },
  {
    name: "catalyst_ticker",
    description: "Các xúc tác đang tác động lên MỘT mã cổ phiếu (tin/sự kiện, hướng, mức tác động, độ lan tỏa, số nguồn xác nhận, tỷ lệ thắng lịch sử của nhóm tín hiệu, giá đã phản ánh chưa, dòng tiền). Dùng khi hỏi về một mã cụ thể.",
    input_schema: { type: "object", properties: { ticker: { type: "string", description: "Mã cổ phiếu, ví dụ HPG." } }, required: ["ticker"], additionalProperties: false },
  },
  {
    name: "catalyst_sector",
    description: "Các xúc tác và mã chịu tác động trong MỘT ngành (tên ngành tiếng Việt, có hoặc không dấu, ví dụ 'Ngân hàng', 'bat dong san').",
    input_schema: { type: "object", properties: { sector: { type: "string" }, topN: { type: "integer", minimum: 1, maximum: 15 } }, required: ["sector"], additionalProperties: false },
  },
];

export function runCatalystTool(name, input, snap) {
  if (!snap) return { ok: false, error: "Chưa có snapshot Chất xúc tác (engine chưa quét lần nào hoặc kho dữ liệu lỗi)." };
  const a = input && typeof input === "object" ? input : {};
  const notice = STALE_NOTE(snap);
  const meta = { scannedAt: snap.scannedAt, isStale: !!snap.isStale, ageHours: snap.ageMinutes != null ? r2(snap.ageMinutes / 60) : null, marketData: snap.marketData ?? null };
  const sectors = snap.sectors ?? [];

  if (name === "catalyst_overview") {
    const n = Number.isInteger(a.topN) ? Math.min(10, Math.max(1, a.topN)) : 5;
    const ranked = [...sectors].sort((x, y) => y.netScore - x.netScore);
    return {
      ok: true, notice,
      data: {
        ...meta,
        topSectors: ranked.slice(0, n).map((s) => ({ sector: s.sector, netScore: r2(s.netScore), tickerCount: s.tickerCount })),
        bottomSectors: ranked.slice(-n).reverse().filter((s) => s.netScore < 0).map((s) => ({ sector: s.sector, netScore: r2(s.netScore), tickerCount: s.tickerCount })),
        topBenefit: (snap.upMovers ?? []).slice(0, n).map((m) => ({ ticker: m.ticker, compositeScore: r2(m.compositeScore), label: m.label })),
        topHarm: (snap.downMovers ?? []).slice(0, n).map((m) => ({ ticker: m.ticker, compositeScore: r2(m.compositeScore), label: m.label })),
        activeAlerts: (snap.activeAlerts ?? []).slice(0, 5).map((x) => x.message),
      },
      guidance: GUIDE,
    };
  }

  if (name === "catalyst_ticker") {
    if (typeof a.ticker !== "string" || !/^[A-Za-z0-9]{2,10}$/.test(a.ticker.trim())) return { ok: false, error: "ticker phải là mã cổ phiếu (2–10 ký tự chữ/số)." };
    const t = a.ticker.trim().toUpperCase();
    const cards = sectors.flatMap((s) => [...(s.primaryCards ?? []), ...(s.cascadeCards ?? [])].filter((c) => c.ticker === t).map((c) => cardOut(c, s.sector)));
    const impact = snap.tickerImpacts?.[t] ?? null;
    return {
      ok: true, notice,
      data: { ...meta, ticker: t, impact: impact && { direction: impact.direction, compositeScore: r2(impact.compositeScore) }, cards: cards.slice(0, 8), found: cards.length > 0 || (impact != null && impact.direction !== "none") },
      guidance: cards.length ? GUIDE : ["Không có xúc tác nào đang gắn với mã này trong snapshot — nói rõ là engine chưa ghi nhận, KHÔNG suy diễn là 'không có tin'."],
    };
  }

  if (name === "catalyst_sector") {
    if (typeof a.sector !== "string" || !a.sector.trim()) return { ok: false, error: "Thiếu tên ngành." };
    const q = fold(a.sector);
    const s = sectors.find((x) => fold(x.sector) === q) ?? sectors.find((x) => fold(x.sector).includes(q) || q.includes(fold(x.sector)));
    if (!s) return { ok: false, error: `Không có ngành "${a.sector}" trong snapshot. Ngành hiện có: ${sectors.map((x) => x.sector).join(", ") || "(trống)"}.` };
    const n = Number.isInteger(a.topN) ? Math.min(15, Math.max(1, a.topN)) : 8;
    return {
      ok: true, notice,
      data: { ...meta, sector: s.sector, netScore: r2(s.netScore), tickerCount: s.tickerCount, direct: (s.primaryCards ?? []).slice(0, n).map((c) => cardOut(c, s.sector)), cascade: (s.cascadeCards ?? []).slice(0, n).map((c) => cardOut(c, s.sector)) },
      guidance: GUIDE,
    };
  }

  return { ok: false, error: `Không có công cụ ${name}.` };
}
