/**
 * macro-chat-tools.ts — lets a chat assistant (LLM with tool/function calling) use the macro
 * center safely.
 *
 *  - TOOL SPECS (JSON schema) + adapters for Anthropic and OpenAI style tool definitions;
 *  - an EXECUTOR that validates arguments, calls the macro API in-process, and returns SMALL
 *    payloads (a chat context window is not a database) together with `guidance` strings the model
 *    must respect — e.g. "do not present an insignificant cell as an effect";
 *  - MACRO_CHAT_SYSTEM_PROMPT: the rules of the road for presenting results.
 *
 * The executor never invents numbers: every figure in `data` is copied from an API payload.
 */
import type { MacroApi } from './macro-api';
import { VN_CATALOG } from './macro-data';
import { NAMED_SCENARIOS } from './macro-scenario';

// ───────────────────────────── Specs ─────────────────────────────

export interface JsonSchema {
  type: 'object';
  properties: Record<string, { type: string; description: string; enum?: (string | number)[]; items?: unknown; minimum?: number; maximum?: number }>;
  required: string[];
  additionalProperties: false;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

const factorIds = VN_CATALOG.filter((m) => m.role === 'factor').map((m) => m.id);
const targetIds = VN_CATALOG.filter((m) => m.role === 'target').map((m) => m.id);
const ASOF = { type: 'string', description: 'Ngày tham chiếu YYYY-MM-DD; bỏ trống để dùng dữ liệu mới nhất. Chỉ dùng thông tin đã biết tại ngày đó.' };

export const MACRO_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'macro_overview',
    description:
      'Tổng quan vĩ mô hiện tại cho một chỉ số: nhiệt kế vĩ mô (điểm −1..+1 và nhãn), yếu tố đóng góp chính, chế độ vĩ mô, cảnh báo, và liệu điểm này đã vượt cổng kiểm định ngoài mẫu để dùng cho quyết định hay chưa. Dùng khi người dùng hỏi "vĩ mô đang thuận lợi hay bất lợi?".',
    parameters: { type: 'object', properties: { target: { type: 'string', description: 'Mã chỉ số, mặc định VNINDEX.', enum: targetIds }, asOf: ASOF }, required: [], additionalProperties: false },
  },
  {
    name: 'macro_impact_lookup',
    description:
      'Tra cứu tác động lịch sử của biến vĩ mô lên chỉ số (hệ số, thống kê t, q-value sau hiệu chỉnh kiểm định bội, độ trễ, độ ổn định). Mặc định chỉ trả các cặp có ý nghĩa thống kê. Dùng khi hỏi "lạm phát/lãi suất/M2... ảnh hưởng gì tới VN30/Smallcap?".',
    parameters: {
      type: 'object',
      properties: {
        factor: { type: 'string', description: 'Mã biến vĩ mô.', enum: factorIds },
        target: { type: 'string', description: 'Mã chỉ số.', enum: targetIds },
        onlySignificant: { type: 'boolean', description: 'Chỉ trả cặp có ý nghĩa thống kê (mặc định true).' },
        topN: { type: 'number', description: 'Số dòng tối đa, 1..20, mặc định 8.', minimum: 1, maximum: 20 },
        asOf: ASOF,
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'macro_scenario',
    description:
      'Mô phỏng một kịch bản vĩ mô và xếp hạng chỉ số thắng/thua sau N tháng, kèm khoảng tin cậy 90%. Truyền scenarioId (kịch bản có sẵn) HOẶC shocks (cú sốc tuỳ chỉnh). Dùng khi hỏi "nếu Fed giảm lãi suất / VND mất giá / siết tín dụng thì sao?".',
    parameters: {
      type: 'object',
      properties: {
        scenarioId: { type: 'string', description: 'Kịch bản có sẵn.', enum: NAMED_SCENARIOS.map((s) => s.id) },
        shocks: { type: 'array', description: "Cú sốc tuỳ chỉnh: [{factor, amount, unit}] với unit 'pct' (% thay đổi của biến dạng mức như M2, tỷ giá) hoặc 'pp' (điểm phần trăm của biến dạng tỷ lệ như CPI, lãi suất).", items: { type: 'object' } },
        horizon: { type: 'number', description: 'Tầm nhìn tính theo tháng, 1..12, mặc định 3.', minimum: 1, maximum: 12 },
        asOf: ASOF,
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'macro_cell_detail',
    description: 'Chi tiết một cặp biến–chỉ số: hệ số, sai số, khoảng tin cậy bootstrap và độ ổn định theo thời gian. Dùng khi người dùng muốn kiểm tra độ tin cậy của một kết luận cụ thể.',
    parameters: {
      type: 'object',
      properties: {
        factor: { type: 'string', description: 'Mã biến vĩ mô.', enum: factorIds },
        target: { type: 'string', description: 'Mã chỉ số.', enum: targetIds },
        lag: { type: 'number', description: 'Độ trễ tháng 0..12; mặc định 1.', minimum: 0, maximum: 12 },
        asOf: ASOF,
      },
      required: ['factor', 'target'],
      additionalProperties: false,
    },
  },
  {
    name: 'macro_calendar_alerts',
    description: 'Cảnh báo vĩ mô đang hiệu lực và lịch công bố số liệu sắp tới (ngày công bố là ƯỚC TÍNH). Dùng khi hỏi "sắp có số liệu gì?" hoặc "có gì bất thường không?".',
    parameters: { type: 'object', properties: { asOf: ASOF }, required: [], additionalProperties: false },
  },
  {
    name: 'macro_report',
    description: 'Báo cáo vĩ mô tháng đầy đủ dạng Markdown. Chỉ gọi khi người dùng yêu cầu báo cáo; nội dung dài.',
    parameters: { type: 'object', properties: { asOf: ASOF }, required: [], additionalProperties: false },
  },
];

export const toAnthropicTools = (specs: ToolSpec[] = MACRO_TOOL_SPECS) =>
  specs.map((s) => ({ name: s.name, description: s.description, input_schema: s.parameters }));

export const toOpenAITools = (specs: ToolSpec[] = MACRO_TOOL_SPECS) =>
  specs.map((s) => ({ type: 'function' as const, function: { name: s.name, description: s.description, parameters: s.parameters } }));

// ───────────────────────────── System prompt ─────────────────────────────

export const MACRO_CHAT_SYSTEM_PROMPT = `Bạn có các công cụ phân tích vĩ mô (macro_*). Quy tắc khi dùng:

1. Số liệu: chỉ nêu con số lấy từ kết quả công cụ; không tự suy ra hay làm tròn thành kết luận mạnh hơn. Không gọi công cụ thì không nói về độ nhạy vĩ mô cụ thể.
2. Ý nghĩa thống kê: chỉ gọi là "có tác động" khi kết quả ghi status là stable hoặc unstable/significant-unchecked kèm chú thích. Ô "insignificant" nghĩa là CHƯA ĐỦ BẰNG CHỨNG, không phải "không có tác động" và cũng không phải "có tác động nhỏ". Luôn nêu độ trễ (tháng) và hướng.
3. Độ ổn định: status "unstable" phải được nói rõ là không ổn định theo thời gian.
4. Nhân quả: đây là quan hệ thống kê lịch sử, không phải bằng chứng nhân quả; không hứa hẹn tương lai.
5. Quyết định: chỉ coi điểm vĩ mô là tín hiệu có thể dùng khi usableForDecisions = true. Nếu false, nói rõ chưa vượt kiểm định ngoài mẫu và không đưa khuyến nghị mua/bán dựa trên nó.
6. Kịch bản: nêu khoảng tin cậy; nếu conclusive = false thì nói "chưa kết luận được hướng", không xếp như kết quả chắc chắn.
7. Ngày công bố trong lịch là ước tính; nếu kết quả có trường notice (ví dụ dữ liệu mô phỏng) thì nêu ngay đầu câu trả lời.
8. Lỗi công cụ: nói thật là không lấy được dữ liệu; không bịa số.
9. Trình bày ngắn gọn bằng tiếng Việt, kết luận trước, rồi 1-3 con số quan trọng, rồi lưu ý.`;

// ───────────────────────────── Executor ─────────────────────────────

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  /** statements the assistant must respect when writing its answer */
  guidance?: string[];
  notice?: string;
  error?: string;
}

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const NAMES = Object.fromEntries(VN_CATALOG.map((m) => [m.id, m.nameVi]));
const round = (v: number, d = 2): number => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : NaN);

/** Minimal JSON-schema check: unknown keys, primitive types, enums, numeric bounds, required keys. */
export function validateArgs(schema: JsonSchema, args: unknown): string | null {
  if (args === undefined || args === null) args = {};
  if (typeof args !== 'object' || Array.isArray(args)) return 'Tham số phải là một đối tượng JSON.';
  const a = args as Obj;
  for (const k of Object.keys(a)) if (!(k in schema.properties)) return `Tham số không hợp lệ: ${k}. Cho phép: ${Object.keys(schema.properties).join(', ') || '(không có)'}.`;
  for (const r of schema.required) if (a[r] === undefined) return `Thiếu tham số bắt buộc: ${r}.`;
  for (const [k, p] of Object.entries(schema.properties)) {
    const v = a[k];
    if (v === undefined) continue;
    const ok = p.type === 'array' ? Array.isArray(v) : typeof v === p.type;
    if (!ok) return `Tham số ${k} phải có kiểu ${p.type}.`;
    if (p.enum && !p.enum.includes(v as string | number)) return `Giá trị ${k} = ${String(v)} không hợp lệ. Cho phép: ${p.enum.join(', ')}.`;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return `Tham số ${k} phải là số hữu hạn.`;
      if (p.minimum !== undefined && v < p.minimum) return `Tham số ${k} phải ≥ ${p.minimum}.`;
      if (p.maximum !== undefined && v > p.maximum) return `Tham số ${k} phải ≤ ${p.maximum}.`;
    }
  }
  return null;
}

export function createMacroChatTools(api: MacroApi) {
  const call = async (method: 'GET' | 'POST', path: string, payload: Obj = {}): Promise<{ status: number; body: Obj }> => {
    const r = await api.handle({ method, path: `/api/macro/${path}`, query: method === 'GET' ? stringify(payload) : {}, body: method === 'POST' ? payload : undefined });
    return { status: r.status, body: r.body as Obj };
  };
  const stringify = (o: Obj): Record<string, string> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  const fail = (r: { status: number; body: Obj }): ToolResult => ({ ok: false, error: String(r.body.error ?? `Lỗi ${r.status}`) });
  const withAsOf = (a: Obj, extra: Obj = {}): Obj => ({ ...extra, ...(a.asOf ? { asOf: a.asOf } : {}) });

  const handlers: Record<string, (a: Obj) => Promise<ToolResult>> = {
    async macro_overview(a) {
      const target = a.target ?? 'VNINDEX';
      const s = await call('POST', 'score', withAsOf(a, { target }));
      if (s.status !== 200) return fail(s);
      const [reg, al] = await Promise.all([call('GET', 'regime', withAsOf(a)), call('GET', 'alerts', withAsOf(a))]);
      const t = s.body.thermometer;
      const guidance = [s.body.gateNote as string];
      if (!s.body.usableForDecisions) guidance.push('KHÔNG đưa khuyến nghị mua/bán dựa trên điểm vĩ mô này.');
      return {
        ok: true, notice: s.body.notice,
        data: {
          target, targetName: NAMES[target], asOf: s.body.asOf,
          thermometer: t && { value: round(t.value), band: t.bandVi, period: t.period, topContributors: t.topContributors.map((c: Obj) => ({ factor: c.factor, name: NAMES[c.factor], contributionPctPerMonth: round(c.contribution) })) },
          usableForDecisions: s.body.usableForDecisions,
          backtest: s.body.backtest && { ic: round(s.body.backtest.ic), pValue: round(s.body.backtest.icP, 3), hitRate: round(s.body.backtest.hitRate, 3) },
          regime: reg.status === 200 ? { label: reg.body.current.label, probability: round(Math.max(...reg.body.current.probs), 2) } : null,
          alerts: al.status === 200 ? (al.body.alerts as Obj[]).slice(0, 3).map((x) => ({ level: x.level, message: x.messageVi })) : [],
        },
        guidance,
      };
    },

    async macro_impact_lookup(a) {
      const r = await call('POST', 'impact', withAsOf(a));
      if (r.status !== 200) return fail(r);
      const onlySig = a.onlySignificant !== false;
      const topN = Math.min(20, Math.max(1, Math.floor(a.topN ?? 8)));
      const all = (r.body.best as Obj[]).filter((c) => (!a.factor || c.factor === a.factor) && (!a.target || c.target === a.target));
      const rows = all.filter((c) => !onlySig || c.significant).sort((x, y) => Math.abs(y.t) - Math.abs(x.t));
      const status = (c: Obj): string => (!c.significant ? 'insignificant' : r.body.stability[`${c.factor}|${c.target}`] ? (r.body.stability[`${c.factor}|${c.target}`].stable ? 'stable' : 'unstable') : 'significant-unchecked');
      return {
        ok: true, notice: r.body.notice,
        data: {
          asOf: r.body.asOf, dataRange: [r.body.firstPeriod, r.body.lastPeriod], matched: all.length, significant: all.filter((c) => c.significant).length, shown: Math.min(rows.length, topN),
          rows: rows.slice(0, topN).map((c) => ({
            factor: c.factor, factorName: NAMES[c.factor], target: c.target, targetName: NAMES[c.target], direction: c.direction === '+' ? 'tăng' : 'giảm',
            beta: round(c.beta), t: round(c.t, 1), q: c.q < 0.001 ? '<0.001' : round(c.q, 3), lagMonths: c.lag, status: status(c),
          })),
        },
        guidance: [
          'Hệ số là điểm phần trăm lợi suất tháng của chỉ số trên mỗi đơn vị thay đổi của biến (xem đơn vị biến trong danh mục); nêu độ trễ.',
          'status "insignificant" = chưa đủ bằng chứng, không phải không có tác động.',
          'status "unstable" = có ý nghĩa nhưng không ổn định theo thời gian; phải nói rõ.',
          ...(rows.length === 0 ? ['Không có cặp nào thoả điều kiện: nói thật là chưa tìm thấy bằng chứng, đừng suy diễn.'] : []),
        ],
      };
    },

    async macro_scenario(a) {
      if (!a.scenarioId && !(Array.isArray(a.shocks) && a.shocks.length)) return { ok: false, error: `Cần scenarioId (${NAMED_SCENARIOS.map((s) => s.id).join(', ')}) hoặc shocks.` };
      const body: Obj = withAsOf(a, { horizon: a.horizon ?? 3 });
      if (a.scenarioId) body.scenarioId = a.scenarioId;
      else body.shocks = a.shocks;
      const r = await call('POST', 'scenario', body);
      if (r.status !== 200) return fail(r);
      return {
        ok: true, notice: r.body.notice,
        data: {
          scenario: r.body.scenario.nameVi, description: r.body.scenario.descriptionVi, horizonMonths: r.body.horizon,
          ranking: (r.body.ranking as Obj[]).map((x) => ({ target: x.target, name: NAMES[x.target], estimatePct: round(x.est, 1), ciLowPct: round(x.lo, 1), ciHighPct: round(x.hi, 1), conclusive: x.significant })),
          warnings: r.body.warnings,
        },
        guidance: [
          'Ước tính là lợi suất cộng dồn sau N tháng, khoảng tin cậy 90%.',
          'conclusive = false nghĩa là khoảng tin cậy chứa 0: chưa kết luận được hướng, không xếp như kết quả chắc chắn.',
          'Đây là suy diễn từ quan hệ lịch sử, không phải dự báo.',
        ],
      };
    },

    async macro_cell_detail(a) {
      const r = await call('POST', 'cell', withAsOf(a, { factor: a.factor, target: a.target, lag: a.lag ?? 1 }));
      if (r.status !== 200) return fail(r);
      const beta: number[] = r.body.rolling.beta;
      const sign = Math.sign(r.body.beta);
      const same = beta.filter((b) => Math.sign(b) === sign).length / Math.max(beta.length, 1);
      let flips = 0;
      for (let i = 1; i < beta.length; i++) if (Math.sign(beta[i]) !== Math.sign(beta[i - 1])) flips++;
      return {
        ok: true, notice: r.body.notice,
        data: {
          factor: a.factor, factorName: NAMES[a.factor], target: a.target, targetName: NAMES[a.target], lagMonths: r.body.lag, observations: r.body.nobs,
          beta: round(r.body.beta, 3), standardError: round(r.body.se, 3), t: round(r.body.t, 2), pValueUncorrected: round(r.body.p, 4),
          bootstrapCI95: [round(r.body.bootstrapCI[0]), round(r.body.bootstrapCI[1])],
          rolling48m: { windows: beta.length, shareSameSign: round(same, 2), signFlips: flips },
        },
        guidance: ['p-value ở đây CHƯA hiệu chỉnh kiểm định bội; dùng macro_impact_lookup để xem q-value.', 'shareSameSign thấp hoặc signFlips cao nghĩa là tác động không ổn định.'],
      };
    },

    async macro_calendar_alerts(a) {
      const [c, al] = await Promise.all([call('GET', 'calendar', withAsOf(a)), call('GET', 'alerts', withAsOf(a))]);
      if (c.status !== 200) return fail(c);
      return {
        ok: true, notice: c.body.notice,
        data: {
          upcoming: (c.body.releases as Obj[]).slice(0, 6).map((x) => ({ name: x.nameVi, period: x.period, expectedDate: x.expectedDate, status: x.status === 'overdue' ? 'chậm so với lịch' : 'sắp tới', daysUntil: x.daysUntil })),
          alerts: al.status === 200 ? (al.body.alerts as Obj[]).map((x) => ({ level: x.level, message: x.messageVi })) : [],
        },
        guidance: ['Ngày công bố là ƯỚC TÍNH; khuyên người dùng đối chiếu lịch chính thức của cơ quan công bố.'],
      };
    },

    async macro_report(a) {
      const r = await call('GET', 'report', withAsOf(a));
      if (r.status !== 200) return fail(r);
      return { ok: true, notice: r.body.notice, data: { markdown: r.body.markdown }, guidance: ['Có thể trích các phần quan trọng; không bỏ phần "Phương pháp và giới hạn" khi chuyển tiếp nguyên văn.'] };
    },
  };

  return {
    specs: MACRO_TOOL_SPECS,
    async run(name: string, args: unknown): Promise<ToolResult> {
      const spec = MACRO_TOOL_SPECS.find((s) => s.name === name);
      if (!spec) return { ok: false, error: `Không có công cụ ${name}. Công cụ hợp lệ: ${MACRO_TOOL_SPECS.map((s) => s.name).join(', ')}.` };
      const bad = validateArgs(spec.parameters, args);
      if (bad) return { ok: false, error: bad };
      try {
        return await handlers[name]((args ?? {}) as Obj);
      } catch {
        return { ok: false, error: 'Lỗi nội bộ khi chạy công cụ vĩ mô.' };
      }
    },
  };
}

export type MacroChatTools = ReturnType<typeof createMacroChatTools>;
