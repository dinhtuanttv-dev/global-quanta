// Theo dõi THỰC TẾ tín hiệu bộ lọc (Screener Engine v2 / S6) — hoàn toàn ngoài mẫu, chỉ từ ngày triển khai.
// Dùng lại sổ cái nghiên cứu sẵn có (market_signal_ledger / market_signal_outcomes — không cần migration):
//   - scanStrategies ghi mỗi tín hiệu BREAKOUT/SETUP của phiên vào sổ cái (signal = SCR_CS_* / SCR_BB_*).
//   - Hợp lưu v2 (H4): mỗi mã trong danh sách -> SCR_CV_{BUY|SELL}_{READY|WATCH}, direction +1 (mua) / −1 (bán):
//     chấm đúng chiều (phía bán "trúng" khi kém VN-Index).
//   - SEPA (SP5, người dùng duyệt 2026-10-09): SCR_SEPA_READY (SẴN SÀNG MUA), SCR_SEPA_ALERT (CẢNH BÁO MUA) và thêm
//     SCR_SEPA_S2 cho tín hiệu S2 của kiểm định SP3 (SẴN SÀNG + phá vỡ KL ≥ 1,4× TB50). THEO DÕI / LOẠI không ghi.
//   - researchEvaluate (16:40) tự chấm T+3/T+5/T+10 so với VN-Index và tổng hợp vào KV research:performance
//     (tỷ lệ trúng so với mốc nền cùng ngày, z đã tính sai số cụm ngày × mã, kết luận).
// Bảng hiệu suất của Siêu Quét chỉ hiện danh sách tín hiệu cố định của nó -> SCR_* không lẫn vào đó.

export const LEDGER_TABLE = "market_signal_ledger";
export const PERFORMANCE_KV = "research:performance";
const PREFIX = { camslim: "SCR_CS", "base-breakout": "SCR_BB", convergence: "SCR_CV", sepa: "SCR_SEPA" };
const SEPA_SIGNAL = { "SẴN SÀNG MUA": "READY", "CẢNH BÁO MUA": "ALERT" };
/** Tín hiệu S2 (SP3): SẴN SÀNG MUA + phá vỡ với KL đạt chuẩn. */
export const isSepaS2 = (r) => r.list === "SẴN SÀNG MUA" && r.status === "BREAKOUT" && Boolean(r.pattern?.breakout?.KL_pha_vo_dat);

/** Mã tín hiệu trong sổ cái. Hợp lưu v2 tách theo phía (mua/bán) và trạng thái (READY/WATCH). */
export const signalId = (strategy, status, side = "buy") => strategy === "sepa"
  ? `${PREFIX.sepa}_${status}`
  : strategy === "convergence"
  ? `${PREFIX[strategy]}_${side === "sell" ? "SELL" : "BUY"}_${status === "READY" ? "READY" : "WATCH"}`
  : `${PREFIX[strategy]}_${status === "BREAKOUT" ? "BO" : "SETUP"}`;

/** Dòng sổ cái cho các tín hiệu của một lần quét. */
export function ledgerRows(docs) {
  const rows = [];
  for (const [strategy, doc] of Object.entries(docs)) {
    if (!PREFIX[strategy]) continue;
    if (strategy === "sepa") { rows.push(...sepaLedgerRows(doc)); continue; }
    for (const r of doc.results ?? []) {
      const plan = r.plan ?? r.metrics?.plan ?? null;
      rows.push({
        symbol: r.ticker, signal_date: r.date, signal: signalId(strategy, r.status, r.side), direction: r.side === "sell" ? -1 : 1,
        score: r.metrics?.score ?? null, regime: null, model_version: doc.engine ?? null,
        features: {
          grade: r.grade ?? null, entry: plan?.entry ?? null, stop: plan?.stop ?? null, target: plan?.target ?? null,
          pivot: r.metrics?.pivot ?? r.metrics?.basePivot ?? null, marketUp: doc.market?.up ?? null,
          handleAtConfluence: r.handle?.handleAtConfluence ?? null,
          ...(strategy === "convergence" ? {
            side: r.side ?? null, phase: r.wyckoff?.cyclePhase ?? null, zoneKinds: r.zone?.kinds ?? [],
            testsPassed: r.wyckoff?.testsPassed ?? null, tranche: r.wyckoff?.tranche?.n ?? null,
          } : {}),
        },
      });
    }
  }
  return rows;
}

/** Dòng sổ cái SEPA: READY / ALERT theo danh sách, cộng S2 (cùng mã, cùng ngày, mã tín hiệu riêng). */
export function sepaLedgerRows(doc) {
  const out = [];
  for (const r of doc.results ?? []) {
    const kind = SEPA_SIGNAL[r.list];
    if (!kind) continue;
    const base = {
      symbol: r.ticker, signal_date: r.date, direction: 1, score: r.score ?? null, regime: null, model_version: doc.engine ?? null,
      features: {
        list: r.list, status: r.status ?? null, pattern: r.metrics?.pattern ?? null, footprint: r.metrics?.footprint ?? null,
        trendScore: r.metrics?.trendScore ?? null, stage: r.metrics?.stage ?? null, rs: r.metrics?.rs ?? null,
        entry: r.plan?.entry ?? null, stop: r.plan?.stop ?? null, target: r.plan?.target2r ?? null, pivot: r.metrics?.pivot ?? null,
        market: doc.market?.sepa?.danh_gia ?? null, marketUp: doc.market?.up ?? null,
      },
    };
    out.push({ ...base, signal: signalId("sepa", kind) });
    if (isSepaS2(r)) out.push({ ...base, signal: signalId("sepa", "S2") });
  }
  return out;
}

export async function recordSignals(store, docs) {
  if (typeof store.upsertRows !== "function") return 0;
  const rows = ledgerRows(docs);
  if (rows.length) await store.upsertRows(LEDGER_TABLE, rows, "symbol,signal_date,signal");
  return rows.length;
}

/** Hiệu suất thực tế của bộ lọc từ KV research:performance (regime ALL). */
export function liveTracking(performance, strategy) {
  const rows = (performance?.rows ?? []).filter((r) => r.regime === "ALL" && String(r.signal).startsWith(`${PREFIX[strategy]}_`));
  const pick = (status) => Object.fromEntries([3, 5, 10].map((h) => {
    const r = rows.find((x) => x.signal === signalId(strategy, status) && Number(x.horizon) === h);
    return [`h${h}`, r ? { n: r.n, hitRate: r.hitRate, baseline: r.baseline, hitLow: r.hitLow, hitHigh: r.hitHigh, z: r.zHitClustered ?? r.zHit ?? null, avgSignedExcess: r.avgSignedExcess ?? null, verdict: r.verdict } : null];
  }));
  if (strategy === "sepa") {
    const grp = (kind) => Object.fromEntries([3, 5, 10].map((h) => {
      const r = rows.find((x) => x.signal === signalId("sepa", kind) && Number(x.horizon) === h);
      return [`h${h}`, r ? { n: r.n, hitRate: r.hitRate, baseline: r.baseline, hitLow: r.hitLow, hitHigh: r.hitHigh, z: r.zHitClustered ?? r.zHit ?? null, avgSignedExcess: r.avgSignedExcess ?? null, verdict: r.verdict } : null];
    }));
    const groups = [
      { key: "ready", label: "SẴN SÀNG MUA", ...grp("READY") }, { key: "alert", label: "CẢNH BÁO MUA", ...grp("ALERT") }, { key: "s2", label: "S2 · phá vỡ đạt chuẩn", ...grp("S2") },
    ];
    return { generatedAt: performance?.generatedAt ?? null, breakout: grp("S2"), setup: grp("READY"), groups };
  }
  if (strategy === "convergence") {
    // Hợp lưu v2: 4 nhóm theo phía × trạng thái (giữ breakout/setup = phía mua READY/WATCH cho giao diện cũ).
    const grp = (side, status) => Object.fromEntries([3, 5, 10].map((h) => {
      const r = rows.find((x) => x.signal === signalId(strategy, status, side) && Number(x.horizon) === h);
      return [`h${h}`, r ? { n: r.n, hitRate: r.hitRate, baseline: r.baseline, hitLow: r.hitLow, hitHigh: r.hitHigh, z: r.zHitClustered ?? r.zHit ?? null, avgSignedExcess: r.avgSignedExcess ?? null, verdict: r.verdict } : null];
    }));
    const groups = [
      { key: "buyReady", label: "Mua · READY", ...grp("buy", "READY") }, { key: "buyWatch", label: "Mua · theo dõi", ...grp("buy", "WATCH") },
      { key: "sellReady", label: "Bán · READY", ...grp("sell", "READY") }, { key: "sellWatch", label: "Bán · theo dõi", ...grp("sell", "WATCH") },
    ];
    return { generatedAt: performance?.generatedAt ?? null, breakout: grp("buy", "READY"), setup: grp("buy", "WATCH"), groups };
  }
  return { generatedAt: performance?.generatedAt ?? null, breakout: pick("BREAKOUT"), setup: pick("SETUP") };
}
