// Dịch vụ chiến lược (S1): ghép Nhịp đập thị trường (điểm ngành thế giới → ngành VN), Nhịp đập hàng hoá (qua điểm ngành),
// Truyền dẫn & bằng chứng (engine world: ma trận, cổng xác nhận, yếu tố, kịch bản) và chu kỳ RRG Lọc ngành. Bộ đệm 10 phút.
import { WS_EVIDENCE } from "./wsEvidence.js";
import { mediumTermContext, riskRegime, shortTermStrategy, STRATEGY_VERSION } from "./strategy.js";

const TTL = 10 * 60_000;
const SCENARIOS = ["usd-strong", "oil-spike", "risk-off"];

export function createWorldStrategyService({ worldSectors, worldService = null, pulse = null, vnIndex = null, rrgDoc = null, now = Date.now, log = console } = {}) {
  let cache = null, inflight = null;
  const call = async (req) => {
    if (!worldService) return null;
    try { const r = await worldService.handle(req); return r?.status === 200 ? r.body : null; } catch (e) { log.warn?.(`[strategy] ${req.path}: ${e.message}`); return null; }
  };

  async function build() {
    const [scores, vn, vni, rrg, pl] = await Promise.all([
      worldSectors.scores(), worldSectors.vnSeries(),
      vnIndex ? vnIndex().catch(() => []) : [],
      rrgDoc ? rrgDoc().catch(() => null) : null,
      pulse ? pulse.get().catch(() => null) : null,
    ]);
    const [matrix, overview, confirm, ...scen] = await Promise.all([
      call({ method: "POST", path: "/api/world/matrix", query: {}, body: {} }),
      call({ method: "GET", path: "/api/world/overview", query: {}, body: undefined }),
      call({ method: "GET", path: "/api/world/confirmatory", query: {}, body: undefined }),
      ...SCENARIOS.map((id) => call({ method: "POST", path: "/api/world/scenario", query: {}, body: { scenarioId: id, horizon: 3 } })),
    ]);
    const series = Object.fromEntries([...vn.entries()].map(([k, v]) => [k, v.points]));
    const rrgBy = Object.fromEntries((rrg?.sectors ?? []).map((s) => [s.code, s]));
    const short = shortTermStrategy(scores.rows, series, vni, WS_EVIDENCE);
    const medium = mediumTermContext(scores.rows, rrgBy, {
      cells: matrix?.cells ?? [], pulse: overview?.pulse ?? [], confirm: confirm?.rows ?? [],
      scenarios: scen.filter(Boolean).map((s) => ({ id: s.scenario?.id, nameVi: s.scenario?.nameVi, sectors: s.sectors })),
    });
    const vnLast = scores.rows.find((r) => r.vnLast)?.vnLast ?? null;
    return {
      version: STRATEGY_VERSION, generatedAt: new Date(now()).toISOString(), vnLast,
      evidence: {
        short: { label: WS_EVIDENCE.shortList.pass ? "EVIDENCE" : "EXPERIMENTAL", ic: WS_EVIDENCE.shortList.ic, t: WS_EVIDENCE.shortList.t, version: WS_EVIDENCE.version, sample: WS_EVIDENCE.sample },
        medium: { label: "EXPERIMENTAL", reasonVi: "Không có tín hiệu trung hạn nào đạt kiểm định đặt trước (WS H4, W3 0/12, Lọc ngành L3) — chỉ trình bày bối cảnh, KHÔNG dự báo." },
      },
      regime: riskRegime(pl?.macro),
      method: {
        shortVi: "α = IC × σ × z (Grinold–Kahn). z = điểm ngắn hạn trừ trung bình các ngành, chuẩn hoá cắt ngang; σ = độ lệch chuẩn lợi suất tương đối ngày (ngành − VN-Index) 250 phiên; IC = chỉ IC đã đạt kiểm định đặt trước. P(vượt VN-Index) ≈ Φ(α/σ). Ưu tiên khi z ≥ 1, giảm tỷ trọng khi z ≤ −1.",
        mediumVi: "Bối cảnh = đồng thuận của 3 nguồn: điểm 3 tháng ngành thế giới, chu kỳ RRG Lọc ngành (Dẫn dắt/Cải thiện +, Suy yếu/Tụt hậu −), áp lực yếu tố truyền dẫn (liên kết bậc A/B × z yếu tố, ±0,5). ≥ 2 nguồn cùng chiều và không nguồn nào ngược -> Thuận / Bất lợi; còn lại Hỗn hợp/Trung tính.",
      },
      short, medium,
      sources: { matrix: !!matrix, overview: !!overview, confirm: !!confirm, scenarios: scen.filter(Boolean).length, rrg: !!rrg, pulse: !!pl, vnIndex: vni.length },
    };
  }

  return {
    async strategy() {
      if (cache && now() - cache.at < TTL) return cache.value;
      inflight ??= build().then((value) => { cache = { at: now(), value }; return value; }).finally(() => { inflight = null; });
      return inflight;
    },
  };
}
