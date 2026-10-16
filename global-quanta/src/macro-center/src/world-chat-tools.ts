/**
 * world-chat-tools.ts — chat tools for the "Kết nối thế giới" tab. Same contract as macro-chat-tools:
 * validated arguments, SMALL payloads copied from the API, and `guidance` the assistant must respect.
 */
import type { WorldApi } from './world-api';
import { WORLD_FACTOR_IDS, VN_SECTORS } from './world-types';
import { validateArgs, type JsonSchema, type ToolResult, type ToolSpec } from './macro-chat-tools';

const factorIds = WORLD_FACTOR_IDS;
const sectorIds = VN_SECTORS.map((s) => s.id);
const ASOF = { type: 'string', description: 'Ngày tham chiếu YYYY-MM-DD; bỏ trống để dùng dữ liệu mới nhất.' };
const obj = (properties: JsonSchema['properties'], required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false });

export const WORLD_TOOL_SPECS: ToolSpec[] = [
  { name: 'world_confirmatory', description: 'Cổng XÁC NHẬN đặt trước (W3): 12 cặp yếu tố thế giới → ngành chọn theo cơ chế kinh tế trước khi chạy, trễ 1 tháng, BY trên 12 cặp, ổn định + ngoài mẫu. Chỉ cặp "đã xác nhận" mới vào quyết định Lọc ngành. Dùng khi hỏi "tín hiệu thế giới nào ĐÃ được kiểm chứng?".', parameters: obj({}) },
  { name: 'world_links', description: 'Ma trận THĂM DÒ: liên kết giữa yếu tố thế giới và ngành Việt Nam (chọn trễ tốt nhất 0–6), kèm bậc bằng chứng (A/B/C), hướng, độ trễ, q-value. Mặc định chỉ trả liên kết bậc A và B. Dùng khi hỏi "yếu tố thế giới nào tác động tới ngành X?".', parameters: obj({ factor: { type: 'string', description: 'Mã yếu tố thế giới.', enum: factorIds }, sector: { type: 'string', description: 'Mã ngành.', enum: sectorIds }, includeC: { type: 'boolean', description: 'Gồm cả liên kết bậc C (chưa đủ bằng chứng); mặc định false.' }, topN: { type: 'number', description: 'Số dòng tối đa 1..15, mặc định 8.', minimum: 1, maximum: 15 }, asOf: ASOF }) },
  { name: 'world_events', description: 'Danh sách sự kiện thế giới đã đo phản ứng của ngành Việt Nam (CAR, q, bậc) hoặc chi tiết một sự kiện nếu truyền eventId.', parameters: obj({ eventId: { type: 'string', description: 'Mã sự kiện để xem chi tiết (ví dụ ev1).' } }) },
  { name: 'world_connectedness', description: 'Mức lan truyền giữa các thị trường (Mỹ, Trung Quốc, Nhật, Hàn Quốc, Thái Lan, Việt Nam): chỉ số lan truyền tổng, Việt Nam nhận từ đâu, phụ thuộc đuôi.', parameters: obj({}) },
  { name: 'world_scenario', description: 'Mô phỏng kịch bản của thế giới (độ lệch chuẩn) và xếp hạng ngành, cổ phiếu chịu tác động. Truyền scenarioId HOẶC shocks [{factor, sigma}].', parameters: obj({ scenarioId: { type: 'string', description: 'Kịch bản có sẵn: tariff-up, usd-strong, oil-spike, fed-cut, china-recovery, risk-off.', enum: ['tariff-up', 'usd-strong', 'oil-spike', 'fed-cut', 'china-recovery', 'risk-off'] }, shocks: { type: 'array', description: 'Cú sốc tuỳ chỉnh [{factor, sigma}], sigma trong [-6, 6] tính bằng độ lệch chuẩn.', items: { type: 'object' } }, horizon: { type: 'number', description: 'Tầm nhìn 1..12 tháng, mặc định 3.', minimum: 1, maximum: 12 } }) },
  { name: 'world_stock_profile', description: 'Hồ sơ phơi nhiễm quốc tế của một cổ phiếu: doanh thu theo vùng, ngoại tệ, độ nhạy sau co rút về ngành và bậc bằng chứng.', parameters: obj({ code: { type: 'string', description: 'Mã cổ phiếu.' } }, ['code']) },
];

export const WORLD_CHAT_GUIDELINES = `Quy tắc bổ sung khi dùng công cụ world_*:
1. Bậc A: vượt kiểm định bội, ổn định và vượt ngoài mẫu. Bậc B: có ý nghĩa trong mẫu. Bậc C: giả thuyết hoặc chưa đủ bằng chứng. Luôn nêu bậc khi nêu một liên kết; không gọi bậc C là "có tác động".
2. Sự kiện: nói rõ phản ứng là lợi suất bất thường so với mô hình thị trường, kèm cửa sổ (−1, +3). Sự kiện "pending" chưa đo được.
3. Cổ phiếu: độ nhạy đã co rút về ngành; bậc của mã không cao hơn bậc của ngành.
4. Kết nối thị trường mô tả trạng thái truyền biến động, không dự báo hướng đi; phụ thuộc đuôi chỉ nói về xác suất cùng sụt mạnh.
5. Kịch bản: conclusive = false nghĩa là chưa kết luận được hướng. Đây là suy diễn lịch sử, không phải dự báo hay khuyến nghị mua bán.
6. Nếu kết quả có notice (dữ liệu mô phỏng) hãy nêu ngay đầu câu trả lời.
7. world_links là ma trận THĂM DÒ (chọn trễ tốt nhất); chỉ world_confirmatory là kiểm định đặt trước. Khi được hỏi tín hiệu nào dùng được để ra quyết định, dùng world_confirmatory; nếu 0 cặp đạt, nói thẳng là chưa có tín hiệu thế giới nào được kiểm chứng.
8. Sự kiện: ngành được đo là ngành định trước (prespecified). Sự kiện trùng cửa sổ với sự kiện khác thì không tách được tác động; sự kiện ngược chiều kỳ vọng phải nói rõ.`;

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const round = (v: number, d = 2): number => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : NaN);

export function createWorldChatTools(api: WorldApi) {
  const call = async (method: 'GET' | 'POST', path: string, body?: Obj): Promise<{ status: number; body: Obj }> => {
    const r = await api.handle({ method, path: `/api/world/${path}`, query: method === 'GET' ? Object.fromEntries(Object.entries(body ?? {}).map(([k, v]) => [k, String(v)])) : {}, body: method === 'POST' ? body : undefined });
    return { status: r.status, body: r.body as Obj };
  };
  const fail = (r: { status: number; body: Obj }): ToolResult => ({ ok: false, error: String(r.body.error ?? `Lỗi ${r.status}`) });
  const withAsOf = (a: Obj, extra: Obj = {}): Obj => ({ ...extra, ...(a.asOf ? { asOf: a.asOf } : {}) });

  const handlers: Record<string, (a: Obj) => Promise<ToolResult>> = {
    async world_confirmatory() {
      const r = await call('GET', 'confirmatory');
      if (r.status !== 200) return fail(r);
      return {
        ok: true, notice: r.body.notice,
        data: {
          version: r.body.version, family: r.body.family, lagMonths: r.body.lag, confirmed: r.body.confirmed, period: `${r.body.firstPeriod}..${r.body.lastPeriod}`,
          rows: (r.body.rows as Obj[]).map((x) => ({ id: x.id, factor: x.factor, factorName: x.factorName, sector: x.sector, sectorName: x.sectorName, expected: x.sign > 0 ? 'tăng' : 'giảm', beta: x.beta == null ? null : round(x.beta, 3), t: x.t == null ? null : round(x.t, 2), pOneSided: round(x.pOneSided, 4), q: round(x.q, 3), stable: x.stable, oosPass: x.oosPass, confirmed: x.confirmed, reason: x.reasonVi })),
        },
        guidance: ['Chỉ cặp confirmed = true mới được coi là tín hiệu đã kiểm chứng.', ...(r.body.confirmed === 0 ? ['0 cặp đạt: nói thật là chưa có tín hiệu thế giới nào được kiểm chứng; các bậc A/B của world_links chỉ là thăm dò.'] : [])],
      };
    },
    async world_links(a) {
      const r = await call('POST', 'matrix', withAsOf(a));
      if (r.status !== 200) return fail(r);
      const name = Object.fromEntries((r.body.factors as Obj[]).map((f) => [f.id, f.nameVi]));
      const sname = Object.fromEntries((r.body.sectors as Obj[]).map((s) => [s.id, s.nameVi]));
      const all = (r.body.cells as Obj[]).filter((c) => (!a.factor || c.factor === a.factor) && (!a.sector || c.sector === a.sector));
      const rows = all.filter((c) => a.includeC === true || c.tier !== 'C').sort((x, y) => Math.abs(y.t) - Math.abs(x.t)).slice(0, Math.min(15, Math.max(1, Math.floor(a.topN ?? 8))));
      return {
        ok: true, notice: r.body.notice,
        data: { counts: r.body.counts, matched: all.length, rows: rows.map((c) => ({ factor: c.factor, factorName: name[c.factor], sector: c.sector, sectorName: sname[c.sector], direction: c.direction === '+' ? 'tăng' : 'giảm', beta: round(c.beta), t: round(c.t, 1), q: c.q < 0.001 ? '<0.001' : round(c.q, 3), lagMonths: c.lag, tier: c.tier, reason: c.reasonVi })) },
        guidance: ['Đây là ma trận THĂM DÒ (chọn trễ tốt nhất 0–6) — không phải kiểm định đặt trước; xem world_confirmatory cho tín hiệu đã kiểm chứng.', 'Luôn nêu bậc (A/B/C), hướng và độ trễ khi nêu một liên kết.', 'Bậc C là chưa đủ bằng chứng hoặc giả thuyết, không phải "có tác động".', ...(rows.length === 0 ? ['Không có liên kết bậc A/B nào thoả điều kiện: nói thật là chưa tìm thấy bằng chứng.'] : [])],
      };
    },
    async world_events(a) {
      if (a.eventId) {
        const r = await call('GET', `events/${a.eventId}`);
        if (r.status !== 200) return fail(r);
        const e = r.body.event as Obj;
        return {
          ok: true, notice: r.body.notice,
          data: { id: e.id, title: e.titleVi, tier: e.tier, status: e.status ?? null, sessionDate: r.body.alignment?.date ?? null, sector: e.sectorName ?? null, carPct: e.car === undefined ? null : round(e.car), q: e.q === undefined ? null : round(e.q, 4), ci90: e.ci90 ? [round(e.ci90[0]), round(e.ci90[1])] : null, bmp: e.bmp ?? null, topSectors: (r.body.sectors as Obj[]).slice(0, 3).map((s) => ({ name: s.nameVi, carPct: round(s.car) })), reason: e.reasonVi ?? null },
          guidance: ['Phản ứng là lợi suất bất thường tích luỹ (−1, +3) so với mô hình thị trường.', 'Sự kiện có tier "pending" chưa đo được; không suy diễn.'],
        };
      }
      const r = await call('GET', 'events');
      if (r.status !== 200) return fail(r);
      return {
        ok: true, notice: r.body.notice,
        data: { events: (r.body.events as Obj[]).map((e) => ({ id: e.id, title: e.titleVi, tier: e.tier, sector: e.sectorName ?? null, carPct: e.car === undefined ? null : round(e.car, 1), q: e.q === undefined ? null : round(e.q, 4) })) },
        guidance: ['Hiệu chỉnh kiểm định bội trên toàn bộ sự kiện × ngành.', 'Tier C là chưa đủ bằng chứng; pending là chưa đủ phiên để đo.'],
      };
    },
    async world_connectedness() {
      const r = await call('GET', 'connectedness');
      if (r.status !== 200) return fail(r);
      const b = r.body;
      return {
        ok: true, notice: b.notice,
        data: { totalRecentPct: round(b.recent.total, 1), totalFullSamplePct: round(b.full.total, 1), vnReceivesFrom: (b.vnReceivesFrom as Obj[]).map((x) => ({ market: x.nameVi, sharePct: round(x.share, 1) })), netTransmitters: (b.names as string[]).map((n, i) => ({ market: n, netPct: round(b.recent.net[i], 1) })).sort((x, y) => y.netPct - x.netPct), tailDependence: (b.tailDependence as Obj[]).map((t) => ({ market: t.nameVi, jointCrashProb: round(t.lowerTail, 2), independentBaseline: t.independentBaseline })) },
        guidance: ['Đo mức truyền biến động, không dự báo hướng đi.', 'Phụ thuộc đuôi là xác suất cùng nằm trong 5% ngày tệ nhất; hai thị trường độc lập cho khoảng 0,05.'],
      };
    },
    async world_scenario(a) {
      if (!a.scenarioId && !(Array.isArray(a.shocks) && a.shocks.length)) return { ok: false, error: 'Cần scenarioId (tariff-up, usd-strong, oil-spike, fed-cut, china-recovery, risk-off) hoặc shocks.' };
      const body: Obj = { horizon: a.horizon ?? 3 };
      if (a.scenarioId) body.scenarioId = a.scenarioId;
      else body.shocks = a.shocks;
      const r = await call('POST', 'scenario', body);
      if (r.status !== 200) return fail(r);
      return {
        ok: true, notice: r.body.notice,
        data: { scenario: r.body.scenario.nameVi, horizonMonths: r.body.horizon, conclusiveSectors: r.body.conclusiveCount, sectors: (r.body.sectors as Obj[]).map((s) => ({ name: s.nameVi, estPct: round(s.est, 1), ciLowPct: round(s.lo, 1), ciHighPct: round(s.hi, 1), conclusive: s.conclusive })), stocks: (r.body.stocks as Obj[]).slice(0, 5).map((s) => ({ code: s.code, sector: s.sectorName, estPct: round(s.est, 1), tier: s.tier })), warnings: r.body.warnings },
        guidance: ['Khoảng tin cậy 90%; conclusive = false nghĩa là chưa kết luận được hướng.', 'Bậc của mã không cao hơn bậc của ngành.', 'Suy diễn lịch sử, không phải dự báo hay khuyến nghị.'],
      };
    },
    async world_stock_profile(a) {
      const r = await call('GET', `stock/${a.code}`);
      if (r.status !== 200) return fail(r);
      const b = r.body;
      return {
        ok: true, notice: b.notice,
        data: { code: b.code, sector: b.sectorName, revenueByRegionPct: b.exposure.revenueByRegion, fxRevenuePct: round(b.exposure.fxRevenueShare * 100, 0), fxDebtPct: round(b.exposure.fxDebtShare * 100, 0), source: `${b.exposure.sourceRef}, kỳ ${b.exposure.asOfPeriod}`, betas: (b.betas as Obj[]).map((x) => ({ factor: x.nameVi, own: round(x.own), sectorPrior: round(x.sectorPrior), shrunk: round(x.shrunk), ownDataWeightPct: round(x.ownWeight * 100, 0), tier: x.tier })) },
        guidance: ['Phơi nhiễm là dữ kiện từ báo cáo tài chính; độ nhạy là ước lượng đã co rút về ngành.', 'Bậc của mã không cao hơn bậc của ngành.'],
      };
    },
  };

  return {
    specs: WORLD_TOOL_SPECS,
    async run(name: string, args: unknown): Promise<ToolResult> {
      const spec = WORLD_TOOL_SPECS.find((s) => s.name === name);
      if (!spec) return { ok: false, error: `Không có công cụ ${name}. Công cụ hợp lệ: ${WORLD_TOOL_SPECS.map((s) => s.name).join(', ')}.` };
      const bad = validateArgs(spec.parameters, args);
      if (bad) return { ok: false, error: bad };
      try {
        return await handlers[name]((args ?? {}) as Obj);
      } catch {
        return { ok: false, error: 'Lỗi nội bộ khi chạy công cụ thế giới.' };
      }
    },
  };
}
export type WorldChatTools = ReturnType<typeof createWorldChatTools>;
