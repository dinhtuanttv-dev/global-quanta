// Công cụ chat ws_* cho "Hỏi đáp xúc tác" (Z1, 2026-10-17): dữ liệu Kết nối thế giới đã nâng cấp — chiến lược ngành (α = IC·σ·z),
// ngành thế giới → ngành ICB VN, hàng hoá (Yahoo/Pink Sheet), phơi nhiễm thế giới của từng cổ phiếu. CHỈ ĐỌC. Cùng hợp đồng với
// /api/world/tools: GET specs { anthropic, guidelines, mode, notice }, POST /:name -> { ok, data, guidance?, notice?, error? }.
import { COMMODITIES, COMMODITY_IDS } from "../commodities/catalog.js";
import { VN_SECTORS } from "./catalog.js";

const ICBS = VN_SECTORS.map((s) => s.icb);
const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const R = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

export const WS_TOOL_SPECS = [
  { name: "ws_strategy", description: "Chiến lược ngành Việt Nam (22 ngành ICB): ngắn hạn phiên kế tiếp α = IC×σ×z (đcb so với VN-Index, xác suất vượt, tư thế Ưu tiên/Trung tính/Giảm tỷ trọng — xếp hạng đã kiểm định đặt trước, lợi thế nhỏ) và bối cảnh trung hạn 1–3 tháng (KHÔNG dự báo). Dùng khi hỏi 'ngành nào thuận/ngược gió', 'nên nghiêng ngành nào'.", input_schema: obj({ horizon: { type: "string", enum: ["short", "medium", "both"], description: "Mặc định both." }, topN: { type: "integer", minimum: 1, maximum: 22, description: "Số ngành mỗi phía, mặc định 5." } }) },
  { name: "ws_sector", description: "Phân tích sâu MỘT ngành ICB Việt Nam dưới tác động thế giới: điểm ngắn/trung hạn và phân rã theo khu vực (Mỹ/Âu/Nhật/Hàn/Đài/TQ) + hàng hoá, quan hệ với từng ETF ngành nước ngoài (tương quan, beta), hàng hoá dẫn dắt, cổ phiếu thành phần theo tỷ trọng kèm beta thế giới.", input_schema: obj({ icb: { type: "string", enum: ICBS, description: "Mã ngành ICB, ví dụ 8300 Ngân hàng, 0500 Dầu khí, 1750 Kim loại công nghiệp." } }, ["icb"]) },
  { name: "ws_commodities", description: "Bảng giá 19 hàng hoá (vàng, dầu, khí, quặng sắt, thép HRC, đồng, nhôm, cao su, cà phê, gạo VN/Thái, đường, phân bón, than, dầu cọ…): giá, phiên/kỳ, % thay đổi, so với cùng kỳ, nguồn.", input_schema: obj({ ids: { type: "array", items: { type: "string", enum: COMMODITY_IDS }, description: "Lọc mặt hàng; bỏ trống = tất cả." } }) },
  { name: "ws_commodity", description: "Phân tích sâu một mặt hàng: thay đổi nhiều khung, phân vị 5 năm, z-score, sụt giảm từ đỉnh, biến động thực, quy đổi VND, quan hệ với ngành/cổ phiếu Việt Nam liên quan (thăm dò).", input_schema: obj({ id: { type: "string", enum: COMMODITY_IDS } }, ["id"]) },
  { name: "ws_stock", description: "Phơi nhiễm thế giới của một cổ phiếu Việt Nam: ngành ICB, tỷ trọng trong chỉ số ngành, điểm/tư thế chiến lược của ngành, beta & tương quan với tín hiệu ngành thế giới (nếu là thành phần lớn), hàng hoá dẫn dắt ngành.", input_schema: obj({ ticker: { type: "string", description: "Mã cổ phiếu, ví dụ HPG." } }, ["ticker"]) },
];

export const WS_CHAT_GUIDELINES = `Quy tắc công cụ ws_* (ngành thế giới → ngành ICB Việt Nam):
1. ws_strategy ngắn hạn: xếp hạng ĐÃ qua kiểm định đặt trước nhưng IC chỉ ≈ 0,02 — lợi thế NHỎ (xác suất vượt VN-Index thường 49–55%). Luôn nói rõ; không biến thành khuyến nghị mua/bán.
2. Trung hạn KHÔNG có tín hiệu đạt kiểm định — chỉ trình bày như bối cảnh (thuận / hỗn hợp / bất lợi), không dự báo.
3. Tương quan / beta / độ trễ là mô tả lịch sử (thăm dò), không phải nhân quả.
4. Hàng hoá: nêu phiên/kỳ và nguồn; giá tháng (World Bank) trễ khoảng 1 tháng. Quy đổi VND không phải giá bán lẻ trong nước.
5. Khi trả lời về một cổ phiếu, dùng ws_stock trước, rồi ws_sector của ngành đó nếu cần chi tiết.`;

function validate(spec, input) {
  const a = input && typeof input === "object" ? input : {};
  const props = spec.input_schema.properties;
  for (const k of Object.keys(a)) if (!props[k]) return `Tham số không hợp lệ: ${k}`;
  for (const k of spec.input_schema.required) if (a[k] == null || a[k] === "") return `Thiếu tham số ${k}`;
  for (const [k, p] of Object.entries(props)) {
    const v = a[k];
    if (v == null) continue;
    if (p.enum && !p.enum.includes(v)) return `${k} không hợp lệ.`;
    if (p.type === "integer" && (!Number.isInteger(v) || v < (p.minimum ?? -Infinity) || v > (p.maximum ?? Infinity))) return `${k} phải là số nguyên trong [${p.minimum}, ${p.maximum}].`;
    if (p.type === "array" && (!Array.isArray(v) || (p.items?.enum && v.some((x) => !p.items.enum.includes(x))))) return `${k} không hợp lệ.`;
  }
  return null;
}

const evGuidance = ["Xếp hạng ngắn hạn đã kiểm định đặt trước (IC ≈ 0,02 — lợi thế nhỏ); trung hạn chỉ là bối cảnh.", "Tham khảo — không phải khuyến nghị đầu tư."];

/**
 * deps: strategy() -> doc /strategy; worldSectors.detail(icb); commodities.snapshot(), commodities.history(id); taxonomy() -> { symbols };
 * sectorDoc() -> { [icb]: { rebalances } }.
 */
export function createWsChatTools({ strategy, worldSectors, commodities, taxonomy }) {
  const handlers = {
    async ws_strategy(a) {
      const s = await strategy();
      const n = a.topN ?? 5, h = a.horizon ?? "both";
      const short = s.short.rows.map((r) => ({ icb: r.icb, nameVi: r.nameVi, stance: r.stance, alphaBps: r.alphaBps, pOutperform: r.pOutperform, z: r.zx, ic: r.ic, topStocks: r.constituents.slice(0, 3).map((c) => c.ticker) }));
      const data = { asOf: s.vnLast, version: s.version, regime: { stressed: s.regime.stressed, vix: s.regime.vix, vixChgPct: s.regime.vixChg, note: s.regime.noteVi }, evidence: s.evidence };
      if (h !== "medium") Object.assign(data, { shortTop: short.slice(0, n), shortBottom: short.slice(-n).reverse() });
      if (h !== "short") data.medium = { supportive: s.medium.filter((m) => m.stance === "supportive").map((m) => ({ icb: m.icb, nameVi: m.nameVi, ws3m: m.ws.score, rrg: m.rrg?.quadrant ?? null })), adverse: s.medium.filter((m) => m.stance === "adverse").map((m) => ({ icb: m.icb, nameVi: m.nameVi, ws3m: m.ws.score, rrg: m.rrg?.quadrant ?? null })) };
      return { ok: true, data, guidance: evGuidance };
    },
    async ws_sector(a) {
      const r = await worldSectors.detail(a.icb, "1y");
      if (r.status !== 200 || !r.body.available) return { ok: false, error: r.body?.reasonVi ?? r.body?.error ?? "Không có dữ liệu ngành." };
      const b = r.body;
      return {
        ok: true,
        data: {
          icb: b.icb, nameVi: b.nameVi, asOf: b.vnLast,
          short: { score: b.scores.short.score, label: b.scores.short.label, byRegion: b.scores.short.sectors.byRegion, commodity: b.scores.short.commodity, evidence: b.evidence.short.labelVi },
          medium: { score: b.scores.medium.score, label: b.scores.medium.label, gap3m: b.scores.medium.gap3m, evidence: b.evidence.medium.labelVi },
          relations: b.relations.filter((x) => !x.unavailable).map((x) => ({ symbol: x.symbol, nameVi: x.nameVi, region: x.region, match: x.match, corr: x.corr, beta: x.beta, significant: x.significant })).slice(0, 8),
          drivers: b.drivers.map((c) => ({ id: c.id, nameVi: c.nameVi, sign: c.sign, shortPct: c.short?.pct ?? null, mediumPct: c.medium?.pct ?? null })),
          stocks: b.stocks.map((s) => ({ ticker: s.symbol, weightPct: R(s.weight * 100, 1), betaPct: s.beta ?? null, corr: s.corr ?? null, d1Pct: s.d1 ?? null, m1Pct: s.m1 ?? null })),
        },
        guidance: ["Beta cổ phiếu = % lợi suất phiên cho 1 độ lệch chuẩn của tín hiệu ngành thế giới (mô tả).", ...evGuidance],
      };
    },
    async ws_commodities(a) {
      const s = await commodities.snapshot();
      const items = s.items.filter((i) => !a.ids?.length || a.ids.includes(i.id)).map((i) => (i.available
        ? { id: i.id, nameVi: i.nameVi, unit: i.unit, value: R(i.value, 3), period: i.period, changePct: R(i.change?.pct), basis: i.change?.basisVi, yoyPct: R(i.yoyPct, 1), freq: i.freq, source: i.source.labelVi }
        : { id: i.id, nameVi: i.nameVi, available: false, reason: i.reasonVi }));
      return { ok: true, data: { pinkSheet: s.pinkSheet ? { updatedOn: s.pinkSheet.updatedOn, lastPeriod: s.pinkSheet.lastPeriod } : null, items }, guidance: ["Giá ngày = hợp đồng tương lai kỳ gần (Yahoo); giá tháng = World Bank Pink Sheet (trung bình tháng, trễ ~1 tháng)."] };
    },
    async ws_commodity(a) {
      const r = await commodities.history(a.id, "3y");
      if (r.status !== 200 || !r.body.available) return { ok: false, error: r.body?.reasonVi ?? r.body?.error ?? "Không có dữ liệu." };
      const b = r.body, st = b.stats;
      return {
        ok: true,
        data: {
          id: b.id, nameVi: b.nameVi, unit: b.unit, freq: b.freq, last: st?.last, lastDate: st?.lastDate, changesPct: st?.changes, high1y: st?.high1y, low1y: st?.low1y,
          percentile5y: st?.percentile5y, zScore1y: st?.zScore1y, drawdown5yPct: st?.drawdown5y, volNowPct: st?.vol?.now, volAvg5yPct: st?.vol?.avg5y,
          vndLatest: b.vnd?.points?.length ? R(b.vnd.points.at(-1)[1], 0) : null, vndUnit: b.vnd?.labelVi ?? null,
          relations: (b.relations ?? []).filter((x) => !x.unavailable).map((x) => ({ code: x.code, labelVi: x.labelVi, corr: x.corr, band: x.band, significant: x.significant, beta: x.beta })),
        },
        guidance: ["Quan hệ với ngành/cổ phiếu VN là tương quan lịch sử (thăm dò).", "Quy đổi VND = giá thế giới × USD/VND, không phải giá nội địa."],
      };
    },
    async ws_stock(a) {
      const t = String(a.ticker).toUpperCase().trim();
      const tax = await taxonomy();
      const sym = tax?.symbols?.[t];
      if (!sym) return { ok: false, error: `Không tìm thấy mã ${t} trong phân ngành ICB.` };
      const icb = ICBS.includes(sym.l3) ? sym.l3 : ICBS.includes(sym.l2) ? sym.l2 : null;
      const s = await strategy();
      const st = icb ? s.short.rows.find((r) => r.icb === icb) : null;
      const md = icb ? s.medium.find((r) => r.icb === icb) : null;
      let stock = null, sectorName = st?.nameVi ?? md?.nameVi ?? null, drivers = [];
      if (icb) {
        const d = await worldSectors.detail(icb, "1y");
        if (d.status === 200 && d.body.available) {
          sectorName = d.body.nameVi;
          const row = d.body.stocks.find((x) => x.symbol === t);
          if (row) stock = { weightPct: R(row.weight * 100, 1), betaPct: row.beta ?? null, corr: row.corr ?? null, d1Pct: row.d1 ?? null, m1Pct: row.m1 ?? null, m3Pct: row.m3 ?? null };
          drivers = d.body.drivers.map((c) => ({ id: c.id, nameVi: c.nameVi, sign: c.sign }));
        }
      }
      return {
        ok: true,
        data: {
          ticker: t, icb: { l1: sym.l1, l2: sym.l2, l3: sym.l3 }, sector: icb ? { icb, nameVi: sectorName } : null,
          sectorShort: st ? { stance: st.stance, alphaBps: st.alphaBps, pOutperform: st.pOutperform, z: st.zx } : null,
          sectorMedium: md ? { stance: md.stance, ws3m: md.ws.score, rrg: md.rrg?.quadrant ?? null } : null,
          stockExposure: stock, drivers,
          note: icb ? (stock ? null : "Mã không nằm trong 10 thành phần lớn nhất của chỉ số ngành — chưa tính beta riêng; dùng tác động của ngành.") : "Ngành ICB của mã không có trong 22 ngành được ánh xạ với thế giới.",
        },
        guidance: ["Tác động lên cổ phiếu suy từ ngành ICB; beta riêng chỉ có với thành phần lớn (mô tả).", ...evGuidance],
      };
    },
  };
  return {
    specs: () => ({ anthropic: WS_TOOL_SPECS, guidelines: WS_CHAT_GUIDELINES, mode: "real", notice: null }),
    async run(name, input) {
      const spec = WS_TOOL_SPECS.find((s) => s.name === name);
      if (!spec) return { ok: false, error: `Không có công cụ ${name}.` };
      const err = validate(spec, input);
      if (err) return { ok: false, error: err };
      try { return await handlers[name](input ?? {}); } catch (e) { return { ok: false, error: `Lỗi khi chạy ${name}: ${e.message}` }; }
    },
  };
}

export const WS_COMMODITY_NAMES = Object.fromEntries(COMMODITIES.map((c) => [c.id, c.nameVi]));
