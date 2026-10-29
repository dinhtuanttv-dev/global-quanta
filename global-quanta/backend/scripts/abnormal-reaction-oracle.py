"""N0 oracle — đối chiếu abnormalReaction.js (Campbell–Wasley 1996 log-value market model + market-model AR) bằng numpy (lstsq).

Sinh dữ liệu tổng hợp tất định (seed cố định), tính kỳ vọng độc lập, ghi fixture JSON cho test JS:
    python -I scripts/abnormal-reaction-oracle.py test/fixtures/abnormal-reaction-oracle.json
"""
import json
import sys

import numpy as np

rng = np.random.default_rng(20261029)
N = 160
dates = [str(np.datetime64("2026-03-02") + int(i)) for i in range(N)]
m_val = np.exp(rng.normal(30.0, 0.25, N))            # giá trị GD toàn sàn
idx = 1200 * np.exp(np.cumsum(rng.normal(0, 0.009, N)))
beta_v, beta_r = 0.8, 1.15
v = np.exp(2.0 + beta_v * np.log1p(m_val) + rng.normal(0, 0.3, N))
rm = np.diff(np.log(idx), prepend=np.log(idx[0]))
r = 0.0002 + beta_r * rm + rng.normal(0, 0.012, N)
e0 = 140                                              # phiên phản ứng của tin
v[e0] *= 6.0; v[e0 + 1] *= 3.0                        # khối lượng đột biến sau tin
r[e0] += 0.035                                        # giá phản ứng
price = 50 * np.exp(np.cumsum(r))

rows = [{"date": d, "close": float(price[i]), "volume": 0, "value": float(v[i])} for i, d in enumerate(dates)]
market = [{"date": d, "close": float(idx[i]), "value": float(m_val[i])} for i, d in enumerate(dates)]

lo, hi = e0 - 120, e0 - 11
sl = slice(lo, hi + 1)
lv, lm = np.log1p(v), np.log1p(m_val)
lr = np.log(price[1:] / price[:-1]); lrm = np.log(idx[1:] / idx[:-1])     # lợi suất phiên i = index i-1 của mảng diff
def fit(x, y):
    A = np.column_stack([np.ones_like(x), x]); coef = np.linalg.lstsq(A, y, rcond=None)[0]
    return coef, y - A @ coef
pv, res = fit(lm[sl], lv[sl]); sv = 1.4826 * np.median(np.abs(res - np.median(res)))
ri = np.arange(lo, hi + 1); pr_, rres = fit(lrm[ri - 1], lr[ri - 1])
sr = np.sqrt(np.sum(rres ** 2) / (len(ri) - 2))
k = 3
av = [lv[e0 + j] - (pv[0] + pv[1] * lm[e0 + j]) for j in range(k)]
ar = [lr[e0 + j - 1] - (pr_[0] + pr_[1] * lrm[e0 + j - 1]) for j in range(k)]
expected = {
    "volumeBeta": float(pv[1]), "beta": float(pr_[1]), "sigmaVolume": float(sv), "sigmaReturn": float(sr),
    "sav0": float(av[0] / sv), "volumeMultiple0": float(np.exp(av[0])), "cav": float(sum(av)), "zVolume": float(sum(av) / (sv * np.sqrt(k))),
    "car": float(np.expm1(sum(ar))), "zReturn": float(sum(ar) / (sr * np.sqrt(k))),
}
# tin công bố 10:00 giờ VN của ngày phiên e0 -> phiên phản ứng = e0
published = f"{dates[e0]}T03:00:00Z"
json.dump({"rows": rows, "market": market, "publishedAt": published, "expected": expected}, open(sys.argv[1], "w"), indent=0)
print(json.dumps(expected, indent=1))
