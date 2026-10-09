"""Chuẩn đối chiếu SP1: chạy bản Python SEPA tại nhiều phiên t trên dữ liệu giả lập + ví dụ, xuất JSON (gz).
Chạy: python -I oracle.py <thu_muc_sepa_screener> <file_ra.json.gz>"""
import gzip, json, math, os, sys

ROOT, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, ROOT)

import numpy as np
import pandas as pd
from sepa_screener import synthetic as S
from sepa_screener.config import SEPAConfig, RiskConfig
from sepa_screener.data import CSVSource
from sepa_screener.patterns import scan_all_bases, scan_vcp, post_breakout_monitor
from sepa_screener.risk import plan_trade
from sepa_screener.screener import _best_pattern
from sepa_screener.trend import classify_stage, trend_template
from sepa_screener.indicators import rs_ratings

cfg = SEPAConfig()


def rnd(df):
    d = df.copy()
    for c in ["open", "high", "low", "close"]:
        d[c] = d[c].round(4)
    d["volume"] = d["volume"].round(0)
    return d


def J(x):
    if isinstance(x, dict):
        return {str(k): J(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [J(v) for v in x]
    if isinstance(x, (pd.Timestamp,)):
        return x.strftime("%Y-%m-%d")
    if isinstance(x, (np.bool_, bool)):
        return bool(x)
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.floating, float)):
        x = float(x)
        if math.isnan(x):
            return None
        if math.isinf(x):
            return "Infinity" if x > 0 else "-Infinity"
        return x
    return x


def pat(p):
    return J({"name": p.name, "detected": p.detected, "status": p.status, "pivot": p.pivot,
              "base_start": p.base_start, "base_end": p.base_end, "base_weeks": p.base_weeks, "depth": p.depth,
              "footprint": p.footprint, "stop_ref": p.stop_ref, "score": p.score, "details": p.details,
              "notes": p.notes, "reasons_failed": p.reasons_failed, "breakout": p.breakout})


series = {}
for seed in range(1, 7):
    series[f"vcp{seed}"] = (S.make_vcp(False, seed), None)
for seed in range(1, 5):
    series[f"vcpbo{seed}"] = (S.make_vcp(True, seed), None)
series["down"] = (S.make_downtrend(), None)
series["flat"] = (S.make_flat_base(), None)
series["cup"] = (S.make_cup_handle(), None)
series["threec"] = (S.make_three_c(), None)
series["power"] = (S.make_power_play(), None)
ipo = S.make_ipo_primary()
series["ipo"] = (ipo, ipo.index[0])
VCP_SEGS = S.stage2_runup() + [(14, -0.26, 1.3), (16, 0.30, 0.9), (10, -0.14, 0.8), (12, 0.14, 0.7),
                               (7, -0.07, 0.55), (8, 0.065, 0.5), (8, -0.025, 0.3), (4, 0.012, 0.28)]
BO = [(1, 0.05, 2.6), (1, 0.01, 1.8)]
series["squat"] = (S._path(VCP_SEGS + BO + [(3, -0.07, 1.0)], seed=21, noise=0.004), None)
series["failed"] = (S._path(VCP_SEGS + BO + [(8, -0.16, 1.6)], seed=22, noise=0.004), None)
series["extended"] = (S._path(VCP_SEGS + BO + [(6, 0.12, 1.5)], seed=23, noise=0.004), None)
series["weakbo"] = (S._path(VCP_SEGS + [(1, 0.05, 0.6), (1, 0.005, 0.5)], seed=24, noise=0.004), None)
series["tennis"] = (S._path(VCP_SEGS + BO + [(6, 0.08, 1.4), (5, -0.05, 0.6), (6, 0.08, 1.3), (4, -0.03, 0.5), (5, 0.05, 1.2)], seed=25, noise=0.004), None)
series["multibase"] = (S._path([(120, 0.02, 1.0), (50, 0.40, 1.6), (25, -0.15, 0.8), (30, 0.30, 1.5), (30, -0.18, 0.8),
                                (35, 0.35, 1.5), (25, -0.14, 0.8), (30, 0.30, 1.5), (30, -0.2, 0.9), (30, 0.3, 1.4),
                                (20, -0.12, 0.8)], seed=26, noise=0.005), None)
series["topping"] = (S._path(S.stage2_runup() + [(40, 0.25, 1.3), (30, -0.05, 1.2), (1, -0.09, 3.5), (6, 0.01, 1.0)], seed=27, noise=0.006), None)
series["stage1"] = (S._path([(150, -0.35, 1.2), (180, 0.03, 0.8)], seed=28, noise=0.008), None)
series["choppy"] = (S._path([(60, 0.1, 1), (60, -0.1, 1)] * 4, seed=29, noise=0.015), None)
src = CSVSource(os.path.join(ROOT, "examples", "data"))
meta = src.meta() if hasattr(src, "meta") else None
for sym in [x for x in src.symbols() if x in ("NEW", "VNINDEX", "AAA")]:
    ld = None
    if meta is not None and sym in meta.index and "listing_date" in meta.columns and not pd.isna(meta.loc[sym, "listing_date"]):
        ld = pd.Timestamp(meta.loc[sym, "listing_date"])
    series[f"ex_{sym}"] = (src.prices(sym), ld)

out = {"series": {}, "cases": []}
for name, (df, ld) in series.items():
    df = rnd(df)
    out["series"][name] = {
        "date": [d.strftime("%Y-%m-%d") for d in df.index],
        **{c: [J(v) for v in df[c].values] for c in ["open", "high", "low", "close", "volume"]},
        "listing_date": None if ld is None else pd.Timestamp(ld).strftime("%Y-%m-%d"),
    }
    n = len(df)
    for back in sorted({0, 2, 7, 19, 44, 90}):
        t = n - 1 - back
        if t < 59:
            continue
        d = df.iloc[: t + 1]
        tt = trend_template(d, 85.0, cfg.trend)
        st = classify_stage(d, cfg.stage)
        pats = [scan_vcp(d, cfg.vcp)] + scan_all_bases(
            d, {"flat": cfg.flat, "cup": cfg.cup, "three_c": cfg.three_c, "power": cfg.power, "primary": cfg.primary},
            ld, cfg.vcp.breakout_lookback)
        best = _best_pattern(pats)
        plan = mon = None
        if best is not None and best.pivot:
            entry = best.pivot * 1.001 if best.status in ("FORMING", "NEAR_PIVOT") else float(d["close"].iloc[-1])
            pl = plan_trade(entry, best.stop_ref, 1e9, RiskConfig(), False)
            plan = J(pl.__dict__)
            if best.breakout.get("ngay_pha_vo") is not None:
                mon = J(post_breakout_monitor(d, best.breakout["ngay_pha_vo"], best.pivot, pl.stop))
        out["cases"].append({
            "series": name, "t": t,
            "trend": J({"passed": tt.passed, "score": tt.score, "criteria": tt.criteria, "values": tt.values}),
            "stage": J({"stage": st.stage, "label": st.label, "confidence": st.confidence, "evidence": st.evidence,
                        "stage2_start": st.stage2_start, "base_count": st.base_count, "bases": st.bases,
                        "warnings": st.warnings}),
            "patterns": [pat(p) for p in pats],
            "best": None if best is None else best.name,
            "plan": plan, "monitor": mon,
        })

# Phá vỡ với pivot cố định (trước phá vỡ, 339 phiên) – phủ FAILED / SQUAT / EXTENDED + theo dõi sau phá vỡ
from sepa_screener.patterns.common import evaluate_breakout
out["breakouts"] = []
for name in ["vcpbo1", "squat", "failed", "extended", "weakbo", "tennis"]:
    sd = out["series"][name]
    df = pd.DataFrame({c: sd[c] for c in ["open", "high", "low", "close", "volume"]}, index=pd.to_datetime(sd["date"]))
    pre = scan_vcp(df.iloc[:339], cfg.vcp)
    for back in range(0, len(df) - 339):
        d = df.iloc[: len(df) - back]
        bo = evaluate_breakout(d, pre.pivot, 338, pre.stop_ref, cfg.vcp.breakout_vol_ratio, cfg.vcp.max_chase_pct)
        mon = post_breakout_monitor(d, bo["ngay_pha_vo"], pre.pivot, pre.stop_ref) if bo.get("ngay_pha_vo") is not None else None
        out["breakouts"].append({"series": name, "t": len(d) - 1, "pivot": pre.pivot, "stop_ref": pre.stop_ref,
                                 "breakout": J(bo), "monitor": J(mon)})

# RS rating phân vị trên các mã ví dụ (đối chiếu rs_ratings)
closes = {k: pd.Series(v["close"], index=pd.to_datetime(v["date"])) for k, v in out["series"].items()}
out["rs"] = J(rs_ratings(closes, periods=cfg.lead.rs_periods, weights=cfg.lead.rs_weights).to_dict())

with gzip.open(OUT, "wt", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("series", len(out["series"]), "cases", len(out["cases"]), "detected",
      sum(p["detected"] for c in out["cases"] for p in c["patterns"]))
