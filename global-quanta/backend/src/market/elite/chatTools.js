// Elite 10 E5 (2026-10-17) — công cụ chat elite_* cho AI (Claude / Gemini) ở "Hỏi đáp" và "Phòng họp AI": đọc trung tâm quyết định
// (bảng tín hiệu E1, bằng chứng E2, Điểm Elite + danh mục + sổ theo dõi E3). CHỈ ĐỌC. Cùng hợp đồng với /api/world-sectors/tools:
// GET specs { anthropic, guidelines, mode, notice }, POST /:name -> { ok, data, guidance?, error? }.
const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
import { SIGNAL_SPECS } from "./signalRegistry.js";

const R = (x, d = 3) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
/** Phần trăm từ phân số; null khi thiếu (không biến null thành 0). */
const P = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : R(x * 100, d));
const RRG_VI = { 2: "Dẫn dắt", 1: "Cải thiện", "-1": "Suy yếu", "-2": "Tụt hậu" };
const HL_CLASS_VI = { STRONG: "Hợp lưu mạnh", CONFLUENCE: "Hợp lưu", T1_SECTOR_AGAINST: "Đạt tầng 1, ngành phản đối", T1_SECTOR_NA: "Đạt tầng 1, chưa có RRG ngành", NOT_T1: "Đã rời tầng 1" };

export const ELITE_TOOL_SPECS = [
  { name: "elite_decision", description: "Bảng quyết định của phiên mới nhất. Trường portfolioKind cho biết danh mục chính thức là loại nào: 'ELITE_HL' = danh mục Elite HL (quy tắc Hợp lưu đa yếu tố: số mã tối đa ở hl.rule.slots, có thể giữ tiền mặt; mỗi vị thế có lớp hợp lưu, điểm tầng 1/2/3, khoảng cách tới ngưỡng ra, cảnh báo; kèm thay đổi trong phiên, hàng chờ và ghi chú kết quả mô phỏng K0) hoặc 'ELITE_FLOW' = danh mục Elite 10 dòng tiền (xếp theo Điểm Elite Z, tỷ trọng ERC). Luôn kèm tín hiệu có trọng số của Điểm Elite (bậc A/B, IC), nhãn bằng chứng và trạng thái sổ theo dõi tiến. Dùng khi hỏi 'hôm nay nên chú ý mã nào', 'danh mục Elite'.", input_schema: obj({}) },
  { name: "elite_ticker", description: `Hồ sơ 360° của một cổ phiếu trong trung tâm quyết định: hạng và Điểm Elite, α, xác suất vượt, đủ điều kiện hay không (lý do), có trong Elite 10 không, và TẤT CẢ ${SIGNAL_SPECS.length} tín hiệu trong sổ đăng ký (giá trị, bậc bằng chứng A/B/C, đóng góp vào điểm).`, input_schema: obj({ ticker: { type: "string", description: "Mã cổ phiếu, ví dụ HPG." } }, ["ticker"]) },
  { name: "elite_evidence", description: "Bằng chứng định lượng của từng tín hiệu (engine E2, đăng ký trước): IC hạng theo kỳ hạn 1/5/10/20 phiên, t Newey–West, q Benjamini–Hochberg, ổn định hai nửa, bậc hiện hành và lý do thăng/giáng. Dùng khi hỏi 'tín hiệu nào đáng tin', 'vì sao tín hiệu X không có trọng số'.", input_schema: obj({ ids: { type: "array", items: { type: "string" }, description: "Lọc theo id tín hiệu; bỏ trống = tất cả." } }) },
];

export const ELITE_CHAT_GUIDELINES = `Quy tắc công cụ elite_* (trung tâm quyết định Elite 10):
1. Điểm Elite và danh mục đang mang nhãn trong trường label/labelVi (hiện THĂM DÒ cho tới khi sổ theo dõi tiến đạt tiêu chí đăng ký trước). Luôn nói rõ nhãn này; không trình bày như khuyến nghị mua/bán.
2. Lợi thế kỳ vọng nhỏ: IC tổng ≈ 0,01–0,02, xác suất vượt thường 50–52%. Nói đúng độ lớn, không phóng đại.
3. Chỉ tín hiệu bậc A/B có trọng số. Tín hiệu bậc C (Smart Score, bộ lọc kỹ thuật, RRG, xúc tác, Cổ tức…) chỉ là bối cảnh — được nhắc nhưng phải ghi là chưa kiểm định.
4. Dải giá tham chiếu (stop / target) là dải biến động mô tả, độ dài theo trường bandSessions — chưa tối ưu, không phải lệnh, không gọi là "điểm mua chuẩn". Giá trị null nghĩa là thiếu dữ liệu, không được hiểu là 0.
5. Khi phân tích một mã: elite_ticker trước, sau đó ws_stock / catalyst_* / macro_* nếu cần bối cảnh. Kết luận theo thứ tự: bằng chứng định lượng -> bối cảnh -> rủi ro.
6. Đọc portfolioKind trước khi mô tả danh mục. "ELITE_HL": danh mục chính thức dựng theo quy tắc Hợp lưu do chủ dự án đặt (tầng 1 LS-v1 + mô hình TA -> RRG ngành -> tích điểm các tab); tỷ trọng định theo biến động lúc vào và KHÔNG cân lại; ô trống là TIỀN MẶT (xem hl.cashPct); mã chỉ vào ở phiên cân bằng đầu tuần và ra theo các ngưỡng trong hl.rule. Z / α / P vượt của từng vị thế chỉ là bối cảnh từ Điểm Elite — KHÔNG phải lý do chọn mã. Khi nói về hiệu quả phải nêu kết quả mô phỏng trong hl.k0NoteVi (ngang thị trường, chưa có ý nghĩa thống kê). "ELITE_FLOW": tỷ trọng ERC (mỗi mã đóng góp rủi ro như nhau) và có vùng đệm giữ mã — đó là quy tắc xây danh mục, không phải mức độ "tin tưởng" từng mã.
7. α ngành thế giới có tiên nghiệm 0 trong Điểm Elite vì lệch kỳ hạn (nó nhắm phiên ngay sau phiên Mỹ).`;

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
      const hl = d.hl ?? null;
      // Z / α / P vượt / stop / target giữ nguyên tên cho thẻ hiển thị; thiếu dữ liệu -> null (không phải 0).
      const row = (p) => ({ ticker: p.ticker, sectorIcb: p.sectorKey ?? null, weightPct: P(p.weight, 1), Z: R(p.Z, 2), alpha5Pct: R(p.alpha5Pct, 2), pOutperformPct: P(p.pOutperform, 1), close: p.close ?? null, stop: R(p.stop, 0), target: R(p.target, 0), riskContributionPct: P(p.riskContribution, 1), retainedFromPrevious: p.retained ?? false });
      const hlRow = (p) => {
        const h = p.hl ?? {};
        return {
          ...row(p), status: h.status === "NEW" ? "Vào mới" : "Giữ", since: h.since ?? null, hlRank: h.rank ?? null, hlClass: HL_CLASS_VI[h.cls] ?? h.cls ?? null,
          tier1Score: h.t1 ?? null, lsPercentile: R(h.lsPct, 0), taModelsPassing: h.taCount ?? null, sectorRrg: RRG_VI[h.rrg] ?? null, tier3Score: h.t3 ?? null,
          exitBufferLsPoints: R(h.exitBufferLs, 0), warnings: h.warnings ?? [], returnSinceEntryPct: P(h.sinceRet, 1),
        };
      };
      const construction = hl
        ? { method: "Elite HL (G2r): định cỡ theo biến động lúc vào, không cân lại khi đang giữ; ô trống là tiền mặt", retained: hl.changes?.kept ?? null, turnoverPct: P(hl.changes?.turnover, 0) }
        : d.construction ? { method: d.construction.method === "erc" ? "ERC (cân bằng đóng góp rủi ro, Ledoit–Wolf)" : "tỷ lệ nghịch biến động", retained: d.construction.retained, turnoverPct: P(d.construction.turnover, 0) } : null;
      const ledgerOf = (x) => (x ? { sessions: x.criteria?.sessions ?? null, h5: x.horizons?.["5"]?.n ?? 0, h10: x.horizons?.["10"]?.n ?? 0 } : null);
      const rule = hl?.rule;
      return {
        ok: true,
        data: {
          date: d.date, version: d.version, portfolioKind: hl ? "ELITE_HL" : "ELITE_FLOW",
          label: d.ledgerSummary?.label ?? "EXPERIMENTAL", labelVi: hl?.labelVi ?? d.ledgerSummary?.labelVi ?? null,
          icComb: R(d.icComb, 4), universe: d.universe,
          portfolio: d.portfolio.map(hl ? hlRow : row),
          ...(hl ? {
            hl: {
              version: hl.version, investedPct: P(hl.invested, 1), cashPct: P(hl.cash, 1), names: d.portfolio.length,
              rebalanceSession: Boolean(hl.rebalance), dataGuardFrozen: Boolean(hl.dataGuard?.frozen), dataGuardReasonsVi: hl.dataGuard?.reasonsVi ?? [],
              market: hl.market ? { regimeVi: hl.market.regimeVi ?? null, breadthPct: hl.market.breadth ?? null, crashGuard: Boolean(hl.market.guard) } : null,
              rule: rule ? { slots: rule.slots, maxPerSector: rule.maxPerSector, sectorCapPct: P(rule.sectorCap, 0), minAdvBn: rule.minAdvBn, exitLsPercentile: rule.exitLsPct, warnLsPercentile: rule.warnLsPct, exitWhenTaModelsBelow: rule.exitTaMin, costBuyPct: P(rule.costBuy, 2), costSellPct: P(rule.costSell, 2), bandSessions: rule.bandSessions } : null,
              changes: { added: hl.changes?.added ?? [], kept: hl.changes?.kept ?? null, exits: (hl.changes?.exits ?? []).map((x) => ({ ticker: x.ticker, weightPct: P(x.weight, 1), reasonVi: x.reasonVi })), costEstPct: P(hl.changes?.costEst, 2) },
              queue: (hl.queue ?? []).slice(0, 8).map((q) => ({ ticker: q.ticker, hlRank: q.hlRank, reasonVi: q.reasonVi })),
              sectorAgainst: (hl.against ?? []).map((x) => ({ ticker: x.ticker, sectorRrg: x.rrgVi ?? null })),
              k0NoteVi: hl.k0?.noteVi ?? null,
            },
            flowPortfolioNoteVi: "Danh mục Elite dòng tiền (cũ) vẫn dựng song song để so sánh; không còn là danh mục chính thức.",
            flowPortfolio: (d.flowPortfolio ?? []).map((p) => ({ ticker: p.ticker, weightPct: P(p.weight, 1), Z: R(p.Z, 2) })),
            flowLedger: ledgerOf(d.flowLedgerSummary),
            weightedSignalsNoteVi: "Các tín hiệu có trọng số dưới đây thuộc Điểm Elite (mô hình E3). Danh mục Elite HL không chọn mã theo Điểm Elite.",
          } : {}),
          construction,
          signalWeighting: d.signalWeighting?.method === "correlation" ? "theo tương quan giữa tín hiệu (C̃⁻¹·IC)" : "∝ IC",
          weightedSignals: d.weights.map((w) => ({ id: w.id, labelVi: w.labelVi, tier: w.tier, icMeasured: R(w.icMeas, 4), days: w.n, icPrior: w.icPrior, icPosterior: R(w.icPost, 4), weightPct: R(w.w * 100, 1) })),
          ledger: ledgerOf(d.ledgerSummary),
        },
        guidance: hl ? ["Danh mục chính thức là Elite HL — quy tắc do chủ dự án đặt, nhãn THĂM DÒ; mô phỏng K0 cho kết quả ngang thị trường (xem hl.k0NoteVi).", "Tham khảo định lượng — không phải khuyến nghị đầu tư."] : GUIDE,
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
          elite: sc ? { rank: sc.rank, of: d.universe.panel, Z: R(sc.Z, 2), alpha5Pct: R(sc.alpha5Pct, 2), pOutperformPct: R(sc.pOutperform * 100, 1), eligible: sc.eligible, reason: sc.reason, inPortfolio: d.portfolio.some((x) => x.ticker === t), portfolioKind: d.hl ? "ELITE_HL" : "ELITE_FLOW", label: d.ledgerSummary?.label ?? "EXPERIMENTAL" } : null,
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
