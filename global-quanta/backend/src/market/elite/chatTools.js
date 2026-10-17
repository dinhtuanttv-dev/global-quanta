// Elite 10 E5 (2026-10-17) — công cụ chat elite_* cho AI (Claude / Gemini) ở "Hỏi đáp" và "Phòng họp AI": đọc trung tâm quyết định
// (bảng tín hiệu E1, bằng chứng E2, Điểm Elite + danh mục + sổ theo dõi E3). CHỈ ĐỌC. Cùng hợp đồng với /api/world-sectors/tools:
// GET specs { anthropic, guidelines, mode, notice }, POST /:name -> { ok, data, guidance?, error? }.
const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const R = (x, d = 3) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

export const ELITE_TOOL_SPECS = [
  { name: "elite_decision", description: "Bảng quyết định Elite 10 của phiên mới nhất: danh mục 10 mã (tỷ trọng, Điểm Elite Z, α kỳ vọng 5 phiên, xác suất vượt trung vị vũ trụ, cắt lỗ / mục tiêu), các tín hiệu có trọng số (bậc A/B, IC đo và IC hậu nghiệm), nhãn bằng chứng và trạng thái sổ theo dõi tiến. Dùng khi hỏi 'hôm nay nên chú ý mã nào', 'danh mục Elite 10'.", input_schema: obj({}) },
  { name: "elite_ticker", description: "Hồ sơ 360° của một cổ phiếu trong trung tâm quyết định: hạng và Điểm Elite, α, xác suất vượt, đủ điều kiện hay không (lý do), có trong Elite 10 không, và TẤT CẢ 21 tín hiệu từ 7 tab (giá trị, bậc bằng chứng A/B/C, đóng góp vào điểm).", input_schema: obj({ ticker: { type: "string", description: "Mã cổ phiếu, ví dụ HPG." } }, ["ticker"]) },
  { name: "elite_evidence", description: "Bằng chứng định lượng của từng tín hiệu (engine E2, đăng ký trước): IC hạng theo kỳ hạn 1/5/10/20 phiên, t Newey–West, q Benjamini–Hochberg, ổn định hai nửa, bậc hiện hành và lý do thăng/giáng. Dùng khi hỏi 'tín hiệu nào đáng tin', 'vì sao tín hiệu X không có trọng số'.", input_schema: obj({ ids: { type: "array", items: { type: "string" }, description: "Lọc theo id tín hiệu; bỏ trống = tất cả." } }) },
];

export const ELITE_CHAT_GUIDELINES = `Quy tắc công cụ elite_* (trung tâm quyết định Elite 10):
1. Điểm Elite và danh mục đang mang nhãn trong trường label/labelVi (hiện THĂM DÒ cho tới khi sổ theo dõi tiến đạt tiêu chí đăng ký trước). Luôn nói rõ nhãn này; không trình bày như khuyến nghị mua/bán.
2. Lợi thế kỳ vọng nhỏ: IC tổng ≈ 0,01–0,02, xác suất vượt thường 50–52%. Nói đúng độ lớn, không phóng đại.
3. Chỉ tín hiệu bậc A/B có trọng số. Tín hiệu bậc C (Smart Score, bộ lọc kỹ thuật, RRG, xúc tác, Cổ tức…) chỉ là bối cảnh — được nhắc nhưng phải ghi là chưa kiểm định.
4. Cắt lỗ / mục tiêu là dải biến động mô tả (2σ / 3σ của 5 phiên), chưa tối ưu — không gọi là "điểm mua chuẩn".
5. Khi phân tích một mã: elite_ticker trước, sau đó ws_stock / catalyst_* / macro_* nếu cần bối cảnh. Kết luận theo thứ tự: bằng chứng định lượng -> bối cảnh -> rủi ro.`;

function validate(spec, input) {
  const a = input && typeof input === "object" ? input : {};
  const props = spec.input_schema.properties;
  for (const k of Object.keys(a)) if (!props[k]) return `Tham số không hợp lệ: ${k}`;
  for (const k of spec.input_schema.required) if (a[k] == null || a[k] === "") return `Thiếu tham số ${k}`;
  if (a.ids != null && (!Array.isArray(a.ids) || a.ids.some((x) => typeof x !== "string"))) return "ids không hợp lệ.";
  return null;
}

const GUIDE = ["Nhãn bằng chứng của Điểm Elite xem trường label; lợi thế kỳ vọng nhỏ.", "Tham khảo định lượng — không phải khuyến nghị đầu tư."];

/** deps: decision() -> doc E3 (kèm ledgerSummary); panel() -> bảng E1 mới nhất; evidence() -> tài liệu E2. */
export function createEliteChatTools({ decision, panel, evidence }) {
  const handlers = {
    async elite_decision() {
      const d = await decision();
      if (!d) return { ok: false, error: "Chưa có quyết định Elite 10." };
      return {
        ok: true,
        data: {
          date: d.date, version: d.version, label: d.ledgerSummary?.label ?? "EXPERIMENTAL", labelVi: d.ledgerSummary?.labelVi ?? null,
          icComb: R(d.icComb, 4), universe: d.universe,
          portfolio: d.portfolio.map((p) => ({ ticker: p.ticker, sectorIcb: p.sectorKey, weightPct: R(p.weight * 100, 1), Z: R(p.Z, 2), alpha5Pct: R(p.alpha5Pct, 2), pOutperformPct: R(p.pOutperform * 100, 1), close: p.close, stop: Math.round(p.stop), target: Math.round(p.target) })),
          weightedSignals: d.weights.map((w) => ({ id: w.id, labelVi: w.labelVi, tier: w.tier, icMeasured: R(w.icMeas, 4), days: w.n, icPosterior: R(w.icPost, 4), weightPct: R(w.w * 100, 1) })),
          ledger: d.ledgerSummary ? { sessions: d.ledgerSummary.criteria.sessions, h5: d.ledgerSummary.horizons["5"]?.n ?? 0, h10: d.ledgerSummary.horizons["10"]?.n ?? 0 } : null,
        },
        guidance: GUIDE,
      };
    },
    async elite_ticker(a) {
      const t = String(a.ticker).trim().toUpperCase();
      if (!/^[A-Z0-9]{3,10}$/.test(t)) return { ok: false, error: "Mã không hợp lệ." };
      const [d, p, ev] = await Promise.all([decision(), panel(), evidence()]);
      const row = p?.rows?.find((r) => r.ticker === t);
      if (!row) return { ok: false, error: `${t} không nằm trong vũ trụ Siêu quét của bảng tín hiệu (chỉ số hoặc mã ngoài danh sách).` };
      const sc = d?.scores?.find((x) => x.ticker === t) ?? null;
      const tier = new Map((ev?.signals ?? []).map((s) => [s.id, s.tier]));
      const contrib = new Map((sc?.contributions ?? []).map((c) => [c.id, c.contribution]));
      return {
        ok: true,
        data: {
          ticker: t, date: p.date, icb: row.icb,
          elite: sc ? { rank: sc.rank, of: d.universe.panel, Z: R(sc.Z, 2), alpha5Pct: R(sc.alpha5Pct, 2), pOutperformPct: R(sc.pOutperform * 100, 1), eligible: sc.eligible, reason: sc.reason, inPortfolio: d.portfolio.some((x) => x.ticker === t), label: d.ledgerSummary?.label ?? "EXPERIMENTAL" } : null,
          signals: p.signals.map((s) => ({ id: s.id, tab: s.tab, labelVi: s.labelVi, value: row.values[s.id], tier: tier.get(s.id) ?? s.tier, contribution: contrib.has(s.id) ? R(contrib.get(s.id), 3) : null })),
          missingSources: p.missingSources,
        },
        guidance: ["Chỉ tín hiệu bậc A/B có đóng góp (contribution); bậc C là bối cảnh chưa kiểm định.", ...GUIDE],
      };
    },
    async elite_evidence(a) {
      const ev = await evidence();
      if (!ev) return { ok: false, error: "Chưa có kết quả engine bằng chứng." };
      const want = a.ids?.length ? new Set(a.ids) : null;
      return {
        ok: true,
        data: {
          version: ev.version, calendarLast: ev.calendarLast, counts: ev.counts,
          signals: ev.signals.filter((s) => !want || want.has(s.id)).map((s) => ({
            id: s.id, labelVi: s.labelVi, tab: s.tab, priorTier: s.priorTier, tier: s.tier, reasonVi: s.reasonVi, source: s.source, mainH: s.mainH,
            byH: Object.fromEntries(Object.entries(s.byH).map(([h, x]) => [h, { days: x.n, ic: x.mean, t: x.t, q: x.q, stable: x.stable }])),
          })),
        },
        guidance: ["IC hạng 0,01–0,03 là mức điển hình của tín hiệu có ích nhưng yếu; q là sau hiệu chỉnh đa kiểm định.", ...GUIDE],
      };
    },
  };
  return {
    specs: () => ({ anthropic: ELITE_TOOL_SPECS, guidelines: ELITE_CHAT_GUIDELINES, mode: "real", notice: null }),
    async run(name, input) {
      const spec = ELITE_TOOL_SPECS.find((s) => s.name === name);
      if (!spec) return { ok: false, error: `Không có công cụ ${name}.` };
      const err = validate(spec, input);
      if (err) return { ok: false, error: err };
      try { return await handlers[name](input ?? {}); } catch (e) { return { ok: false, error: `Lỗi khi chạy ${name}: ${e.message}` }; }
    },
  };
}
