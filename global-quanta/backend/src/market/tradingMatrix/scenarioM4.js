// Kịch bản M4-r1 (M4-prereg.md): chạy song song M3-r1, ghi sổ riêng. Không thay nhãn trên giao diện cho tới khi đạt cổng.
// Sửa 2 điểm yếu của M3: SC3 chỉ theo biến động; độ rộng rơi tách thành SC4. Thêm chống rung: điều kiện phải giữ 2 phiên liền.
export const M4_RULE_VERSION = "M4-r1";
export const M4_RULES = Object.freeze({
  sc1: { breadthMin: 50, invalidBreadth: 40, yzPctMax: 80 },
  sc2: { pgPct: 80, pgPctExit: 50 },
  sc3: { yzPct: 90, moveSd: 2.5, calmYzPct: 70, calmMoveSd: 1.5 },
  sc4: { drop: -15, calmDrop: -5 },
  confirmSessions: 2,
  cooldown: 5,
});
export const M4_SCENARIOS = {
  SC1: { title: "Xu hướng có độ rộng hỗ trợ", expect: 1 },
  SC2: { title: "Chỉ số dẫn dắt, số đông yếu", expect: -1 },
  SC3: { title: "Cú sốc biến động", expect: 0 },
  SC4: { title: "Độ rộng rơi nhanh", expect: 0 },
};
const ok = (v) => typeof v === "number" && Number.isFinite(v);

/** Biên động một phiên tính theo độ lệch chuẩn ngày; σ năm hoá chia căn 252. */
const moveSd = (s) => (ok(s.idx1) && ok(s.sigma) && s.sigma > 0 ? Math.abs(s.idx1) / (s.sigma / Math.sqrt(252)) : null);

export function evaluateM4(s, regime, R = M4_RULES) {
  const up = regime === "UPTREND", md = moveSd(s);
  const shock = (ok(s.yzPct) && s.yzPct >= R.sc3.yzPct) || (ok(md) && md >= R.sc3.moveSd);
  return {
    SC1: { watch: up && ((ok(s.b20) && s.b20 >= R.sc1.breadthMin) || (ok(s.mo) && s.mo > 0)), confirm: up && ok(s.b20) && s.b20 >= R.sc1.breadthMin && ok(s.mo) && s.mo > 0 && ok(s.yzPct) && s.yzPct < R.sc1.yzPctMax, invalid: (regime != null && !up) || (ok(s.b20) && s.b20 < R.sc1.invalidBreadth) },
    SC2: { watch: ok(s.pgPct) && s.pgPct >= R.sc2.pgPct, confirm: ok(s.pgPct) && s.pgPct >= R.sc2.pgPct && ok(s.db5) && s.db5 < 0, invalid: ok(s.pgPct) && s.pgPct < R.sc2.pgPctExit },
    SC3: { watch: shock, confirm: shock, invalid: ok(s.yzPct) && s.yzPct < R.sc3.calmYzPct && (!ok(md) || md < R.sc3.calmMoveSd) },
    SC4: { watch: ok(s.ddb) && s.ddb <= R.sc4.drop, confirm: ok(s.ddb) && s.ddb <= R.sc4.drop, invalid: ok(s.ddb) && s.ddb > R.sc4.calmDrop },
  };
}

/** @param rows [{ date, regime, ...số đo }] cũ -> mới. Đợt bắt đầu ở phiên vào CONFIRMED, tức phiên thứ hai liên tiếp đủ điều kiện. */
export function runM4Lifecycle(rows, R = M4_RULES) {
  const ids = Object.keys(M4_SCENARIOS);
  const cur = Object.fromEntries(ids.map((k) => [k, { state: "INACTIVE", cool: 0, since: null, streak: 0 }]));
  const timeline = [], episodes = [];
  rows.forEach((s) => {
    const ev = evaluateM4(s, s.regime, R);
    const day = { date: s.date };
    for (const k of ids) {
      const c = cur[k], e = ev[k], prev = c.state;
      c.streak = e.confirm ? c.streak + 1 : 0;
      if (c.state === "COOLDOWN") { c.cool--; if (c.cool <= 0) c.state = "INACTIVE"; }
      else if (c.state === "INVALIDATED") { c.state = "COOLDOWN"; c.cool = R.cooldown; }
      else if (c.state === "CONFIRMED") { if (e.invalid) c.state = "INVALIDATED"; }
      else if (c.streak >= R.confirmSessions) { c.state = "CONFIRMED"; episodes.push({ scenario: k, start: s.date }); }
      else if (e.watch) c.state = "WATCH";
      else c.state = "INACTIVE";
      if (c.state !== prev) c.since = s.date;
      day[k] = c.state;
    }
    timeline.push(day);
  });
  const last = rows.at(-1)?.date ?? null;
  return { rule: M4_RULE_VERSION, asOf: last, timeline, episodes, current: ids.map((id) => ({ id, title: M4_SCENARIOS[id].title, state: cur[id].state, since: cur[id].since })) };
}
