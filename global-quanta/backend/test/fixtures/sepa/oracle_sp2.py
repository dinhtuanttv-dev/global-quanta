"""Chuẩn đối chiếu SP2: cơ bản, dẫn dắt, sức khỏe thị trường, run_screen (điểm SEPA + danh sách) của gói Python sepa_screener.
Chạy: python -I oracle_sp2.py <thu_muc_sepa_screener> <file_ra.json.gz>"""
import gzip, json, math, os, sys

ROOT, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, ROOT)

import numpy as np
import pandas as pd
from sepa_screener import synthetic as S
from sepa_screener.config import SEPAConfig
from sepa_screener.data import CSVSource
from sepa_screener.fundamentals import analyze_fundamentals
from sepa_screener.leadership import leadership_profile, market_health
from sepa_screener import screener as SCR
from sepa_screener.screener import run_screen

# Bản Python: summary_table ném ValueError khi RS = NaN (mã < 64 phiên trong vũ trụ < 30 mã). Bảng tóm tắt chỉ dùng để
# lấy thứ tự -> thay bằng bản an toàn (cùng thứ tự: danh sách, rồi điểm SEPA giảm dần; ổn định).
def _safe_table(results):
    order = {"SẴN SÀNG MUA": 0, "CẢNH BÁO MUA": 1, "THEO DÕI": 2, "LOẠI": 3}
    rows = [{"Mã": s, "_o": order[r["danh_sach"]], "d": r["diem_SEPA"]} for s, r in results.items()]
    t = pd.DataFrame(rows)
    if t.empty:
        return t
    return t.sort_values(["_o", "d"], ascending=[True, False]).reset_index(drop=True)
SCR.summary_table = _safe_table


def J(x):
    if isinstance(x, dict):
        return {str(k): J(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [J(v) for v in x]
    if isinstance(x, pd.Timestamp):
        return x.strftime("%Y-%m-%d")
    if isinstance(x, (np.bool_, bool)):
        return bool(x)
    if isinstance(x, np.integer):
        return int(x)
    if isinstance(x, (np.floating, float)):
        x = float(x)
        if math.isnan(x):
            return None
        if math.isinf(x):
            return "Infinity" if x > 0 else "-Infinity"
        return x
    return x


def rnd(df):
    d = df.copy()
    for c in ["open", "high", "low", "close"]:
        d[c] = d[c].round(4)
    d["volume"] = d["volume"].round(0)
    return d


def bars(df):
    return {"date": [d.strftime("%Y-%m-%d") for d in df.index],
            **{c: [J(v) for v in df[c].values] for c in ["open", "high", "low", "close", "volume"]}}


def qrows(q):
    return {"date": [d.strftime("%Y-%m-%d") for d in q.index], "cols": {c: [J(v) for v in q[c].values] for c in q.columns}}


def fres(fr):
    return J({"score": fr.score, "passed_min": fr.passed_min, "flags": fr.flags, "metrics": fr.metrics,
              "warnings": fr.warnings, "positives": fr.positives})


out = {"fund": [], "screens": []}

# ---------------- 1. Cơ bản: mẫu sách + ngẫu nhiên có số âm, quý thiếu, ước tính ----------------
fq = {k: S.make_quarterly(k) for k in ["growth", "decel", "inventory"]}
idx8 = pd.date_range("2022-03-31", periods=8, freq="QE")
fq["nonrec"] = pd.DataFrame({"eps": [2.4] * 4 + [2.4, 2.4, 2.4, 3.01], "revenue": [100] * 8, "nonrecurring": [0] * 7 + [0.84]}, index=idx8)
rng = np.random.default_rng(7)
for k in range(12):
    n = int(rng.integers(5, 21))
    idx = pd.date_range("2021-03-31", periods=n, freq="QE")
    rev = np.round(100 * np.cumprod(1 + rng.normal(0.04, 0.12, n)), 3)
    ni = np.round(rev * rng.normal(0.06, 0.05, n), 4)   # có quý lỗ
    q = pd.DataFrame({"eps": ni / 10, "revenue": rev, "net_income": ni,
                      "gross_profit": np.round(rev * rng.uniform(0.15, 0.35, n), 3),
                      "inventory": np.round(rev * rng.uniform(0.3, 1.2, n), 3),
                      "receivables": np.round(rev * rng.uniform(0.1, 0.5, n), 3)}, index=idx)
    if k % 3 == 0 and n > 6:
        q.iloc[int(rng.integers(0, n - 1)), 0] = np.nan          # quý thiếu
        q.iloc[int(rng.integers(0, n - 1)), 1] = np.nan
    if k % 4 == 1:
        q["eps_estimate"] = np.round(q["eps"] * rng.normal(1.0, 0.15, n), 5)
        q["est_cur_q_now"] = rng.normal(1, 0.1, n); q["est_cur_q_30d"] = rng.normal(1, 0.1, n)
        q["est_fy_now"] = rng.normal(4, 0.3, n); q["est_fy_30d"] = rng.normal(4, 0.3, n)
    if k % 5 == 2:
        q.iloc[4, 1] = 0.0                                        # doanh thu 0
        q["nonrecurring"] = np.where(rng.uniform(size=n) < 0.2, 0.05, 0.0)
    fq[f"rand{k}"] = q
for k, q in fq.items():
    q = q.round(6)
    fq[k] = q
    out["fund"].append({"name": k, "q": qrows(q), "res": fres(analyze_fundamentals(q))})

# ---------------- 2. Các vũ trụ cho run_screen ----------------
def align(prices, idx):
    for v in prices.values():
        v.index = pd.bdate_range(end=idx.index[-1], periods=len(v))
    return prices


universes = {}
idx = S.make_index(400)
universes["full"] = (align({"A": S.make_vcp(True, 2), "B": S.make_downtrend(), "C": S.make_vcp(False, 3)}, idx), idx,
                     {"A": fq["growth"]}, None)
src = CSVSource(os.path.join(ROOT, "examples", "data"))
ex_prices = {s: src.prices(s) for s in src.symbols() if s != "VNINDEX"}
ex_f = {s: src.fundamentals(s) for s in ex_prices if src.fundamentals(s) is not None}
universes["examples"] = (ex_prices, src.prices("VNINDEX"), ex_f, src.meta())

big = {"vcp%d" % s: S.make_vcp(False, s) for s in range(1, 7)}
big.update({"vcpbo%d" % s: S.make_vcp(True, s) for s in range(1, 5)})
big.update({"down": S.make_downtrend(), "flat": S.make_flat_base(), "cup": S.make_cup_handle(), "threec": S.make_three_c(),
            "power": S.make_power_play()})
VCP_SEGS = S.stage2_runup() + [(14, -0.26, 1.3), (16, 0.30, 0.9), (10, -0.14, 0.8), (12, 0.14, 0.7),
                               (7, -0.07, 0.55), (8, 0.065, 0.5), (8, -0.025, 0.3), (4, 0.012, 0.28)]
BO = [(1, 0.05, 2.6), (1, 0.01, 1.8)]
big["squat"] = S._path(VCP_SEGS + BO + [(3, -0.07, 1.0)], seed=21, noise=0.004)
big["weakbo"] = S._path(VCP_SEGS + [(1, 0.05, 0.6), (1, 0.005, 0.5)], seed=24, noise=0.004)
big["multibase"] = S._path([(120, 0.02, 1.0), (50, 0.40, 1.6), (25, -0.15, 0.8), (30, 0.30, 1.5), (30, -0.18, 0.8),
                            (35, 0.35, 1.5), (25, -0.14, 0.8), (30, 0.30, 1.5), (30, -0.2, 0.9), (30, 0.3, 1.4),
                            (20, -0.12, 0.8)], seed=26, noise=0.005)
big["topping"] = S._path(S.stage2_runup() + [(40, 0.25, 1.3), (30, -0.05, 1.2), (1, -0.09, 3.5), (6, 0.01, 1.0)], seed=27, noise=0.006)
for k in range(15):
    r2 = np.random.default_rng(100 + k)
    big[f"rw{k}"] = S._path([(int(r2.integers(30, 80)), float(r2.normal(0.05, 0.25)), float(r2.uniform(0.6, 1.6))) for _ in range(7)],
                            seed=200 + k, noise=0.01)
bidx = S.make_index(max(len(v) for v in big.values()) + 5, seed=98)
bf = {}
kinds = ["growth", "decel", "inventory", "nonrec"] + [f"rand{k}" for k in range(12)]
for i, sym in enumerate(sorted(big)):
    if i % 3 != 2:
        bf[sym] = fq[kinds[i % len(kinds)]]
universes["big"] = (align(big, bidx), bidx, bf, None)

for uname, (prices, ix, funds, meta) in universes.items():
    prices = {k: rnd(v) for k, v in prices.items()}
    ix = rnd(ix)
    funds = {k: v.round(6) for k, v in funds.items()}
    out.setdefault("universes", {})[uname] = {
        "prices": {k: bars(v) for k, v in prices.items()}, "index": bars(ix),
        "fund": {k: qrows(v) for k, v in funds.items()},
        "meta": {} if meta is None else {s: (None if pd.isna(meta.loc[s, "listing_date"]) else pd.Timestamp(meta.loc[s, "listing_date"]).strftime("%Y-%m-%d"))
                                          for s in meta.index if "listing_date" in meta.columns},
    }
    last = ix.index[-1]
    for back in ([0, 3, 15] if uname != "full" else [0]):
        as_of = ix.index[-1 - back]
        p2 = {k: v.loc[:as_of] for k, v in prices.items()}
        p2 = {k: v for k, v in p2.items() if len(v)}
        cfg = SEPAConfig()
        cfg.liquidity.min_avg_value = 0
        t, res, mh = run_screen(p2, ix.loc[:as_of], funds, meta, cfg, equity=1e9)
        rows = {}
        for s, r in res.items():
            rows[s] = {"danh_sach": r["danh_sach"], "diem_SEPA": r["diem_SEPA"], "so_bo_loc_dat": r["so_bo_loc_dat"],
                       "bo_loc": r["bo_loc"], "canh_bao": r["canh_bao"], "rs": r["rs"], "dan_dat": r["dan_dat"],
                       "co_ban": fres(r["co_ban"]),
                       "best": None if r["mo_hinh_tot_nhat"] is None else r["mo_hinh_tot_nhat"].name}
        out["screens"].append({"universe": uname, "as_of": as_of.strftime("%Y-%m-%d"), "order": list(t["Mã"]) if len(t) else [],
                               "market": J(mh), "rows": J(rows)})

with gzip.open(OUT, "wt", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("fund", len(out["fund"]), "screens", len(out["screens"]),
      {s["universe"] + "@" + s["as_of"]: len(s["rows"]) for s in out["screens"]})
for s in out["screens"]:
    from collections import Counter
    print(s["universe"].encode("ascii","replace").decode(), s["as_of"], len(Counter(r["danh_sach"] for r in s["rows"].values()), s["market"].get("danh_gia")) >= 0))
