// Trading Matrix M6 — vận hành (spec §11 Phase 6): dữ liệu thiếu, sức khoẻ nguồn theo thời gian, khối lượng cảnh báo, độ trôi hiệu chỉnh
// của mô hình đang chạy, kho cục bộ / bản sao Supabase, nhật ký thay đổi quy tắc, chính sách lưu giữ, kịch bản diễn tập sự cố.
import { lastCompletedSessionDate } from "../calendar.js";
import { tradingDatesBack } from "../scanner/scannerJobs.js";
import { BOOTSTRAP_KV } from "../store/localBootstrap.js";
import { MATRIX_MODELS } from "./matrixModels.js";
import { MATRIX_VALIDATION } from "./matrixValidation.js";
import { RULE_VERSION } from "./scenarioEngine.js";

export const RULE_CHANGELOG = [
  { version: "M3-r1", date: "2026-10-22", change: "Bản đầu: SC1–SC3 + SC0, cooldown 5 phiên (prereg 341e569, code ba55f7a).", validation: MATRIX_VALIDATION.verdicts },
];
export const RETENTION = {
  snapshots: "Giữ vĩnh viễn (≈ 3 bản/phiên, vài KB)", signals: "Giữ vĩnh viễn (chỉ ghi khi chuyển trạng thái)",
  ticks: "Dòng lệnh theo phút: 90 ngày (pruneLocal 03:45)", replay: "Bảng phát lại riêng — không ghi đè sổ tín hiệu",
};
export const DRILLS = [
  { id: "SSI_DOWN", scenario: "SSI ngắt (REST + stream)", expect: "Ô trong phiên = UNAVAILABLE, các ô cuối phiên vẫn hiển thị từ kho cục bộ; sức khoẻ PARTIAL", test: "tradingMatrix.test.js › một nguồn lỗi" },
  { id: "SUPABASE_DOWN", scenario: "Supabase khoá / chậm (402, timeout)", expect: "Kho cục bộ phục vụ toàn bộ; cầu dao 15 phút; không gọi lại Supabase", test: "localStore.test.js › Supabase khoá 402" },
  { id: "GATEWAY_DOWN", scenario: "Gateway mất (deploy / sự cố)", expect: "Giao diện báo 'không khả dụng', bảng Siêu Quét vẫn hiện; tự khôi phục từ Volume khi khởi động lại", test: "TradingMatrixPanel.test.tsx › lỗi toàn bộ" },
  { id: "PROJECT_A_DOWN", scenario: "Project A / Neon lỗi", expect: "Sự kiện + RF1 = UNAVAILABLE có lý do; không giả 'không có sự kiện'", test: "tradingMatrix.test.js › M3 service" },
  { id: "VOLUME_EMPTY", scenario: "Volume mới / mất dữ liệu", expect: "localBootstrap tự dựng lại từ SSI / VCI sau 60 giây", test: "localStore.test.js › tự dựng lại" },
  { id: "SSE_GAP", scenario: "Luồng giá mất kết nối", expect: "Snapshot REST tiếp tục; ô trong phiên chuyển DELAYED/STALE theo tuổi dữ liệu", test: "tradingMatrix.test.js › sức khoẻ nguồn" },
];

export async function opsReport({ store, matrix, now = Date.now }) {
  const lastClosed = lastCompletedSessionDate(new Date(now()));
  const expected = tradingDatesBack(lastClosed, 260);
  const have = new Set(await store.getMarketDailyDates());
  const missing = expected.filter((d) => !have.has(d));
  const snaps = await store.selectRows("market_matrix_snapshot", { eq: { scope: "VNINDEX" }, order: "trading_date.desc", limit: 20 });
  const healthCount = {};
  for (const s of snaps) { const h = s.doc?.dataHealth?.status ?? "UNKNOWN"; healthCount[h] = (healthCount[h] ?? 0) + 1; }
  const since = expected.at(-20) ?? lastClosed;
  const sig = await store.selectRows("market_matrix_signal", { gte: { signal_date: since } });
  const flagsOn = snaps.reduce((a, s) => a + (s.doc?.riskFlags ?? []).filter((f) => f.status === "ON").length, 0);
  let local = null, bootstrap = null;
  try { local = store.localInfo?.() ?? null; bootstrap = (await store.getKv(BOOTSTRAP_KV))?.value ?? null; } catch { /* bỏ qua */ }
  return {
    asOf: new Date(now()).toISOString(), ruleVersion: RULE_VERSION,
    dataGaps: { window: expected.length, missing: missing.length, sample: missing.slice(-20), lastClosed, latestLocal: [...have].sort().at(-1) ?? null },
    sourceHealth: { snapshots: snaps.length, byStatus: healthCount, last: snaps[0] ? { date: snaps[0].trading_date, status: snaps[0].doc?.dataHealth?.status, sources: snaps[0].doc?.dataHealth?.sources?.map((x) => ({ id: x.id, status: x.status })) } : null },
    alertVolume: { sessions: 20, scenarioTransitions: sig.length, riskFlagsOn: flagsOn },
    model: await matrix.modelStatus(),
    store: local, bootstrap: bootstrap ? { status: bootstrap.status, finishedAt: bootstrap.finishedAt ?? null, steps: (bootstrap.steps ?? []).map((s) => ({ name: s.name, status: s.status })) } : null,
    ruleChangelog: RULE_CHANGELOG, modelRegistry: MATRIX_MODELS.models.map((m) => ({ id: m.id, status: m.status, trainedTo: m.trainedTo ?? null, n: m.n })),
    retention: RETENTION, drills: DRILLS,
  };
}
