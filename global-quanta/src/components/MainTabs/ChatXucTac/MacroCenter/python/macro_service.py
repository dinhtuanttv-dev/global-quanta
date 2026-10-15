"""
macro_service.py — multivariate cointegration service (Johansen / VECM) for the macro center.

STATUS: NOT EXECUTED in the environment that produced this package (no statsmodels there).
Treat as a reviewed draft: run `pytest`-style smoke checks on your side before relying on it.
Run:  pip install fastapi uvicorn statsmodels numpy   &&   uvicorn macro_service:app --port 8001

The TypeScript engine only has Engle-Granger for one regressor. When several non-stationary
series may share a long-run relation, this service tests the cointegration rank (Johansen trace)
and, if rank >= 1, fits a VECM so the UI can show error-correction instead of only differences.
"""
from typing import Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from statsmodels.tsa.vector_ar.vecm import VECM, coint_johansen, select_order

app = FastAPI(title="macro-service")


class JohansenIn(BaseModel):
    series: Dict[str, List[float]] = Field(..., description="id -> monthly levels (log for index/level kinds), equal length")
    det_order: int = Field(0, ge=-1, le=1, description="-1 none, 0 constant, 1 constant+trend")
    max_lags: int = Field(6, ge=1, le=12)


def _matrix(series: Dict[str, List[float]]):
    names = list(series)
    if len(names) < 2:
        raise HTTPException(422, "Cần ít nhất 2 chuỗi.")
    lens = {len(v) for v in series.values()}
    if len(lens) != 1:
        raise HTTPException(422, "Các chuỗi phải cùng độ dài.")
    data = np.column_stack([np.asarray(series[n], dtype=float) for n in names])
    if not np.isfinite(data).all():
        raise HTTPException(422, "Dữ liệu chứa NaN/Inf; hãy căn chỉnh và làm sạch trước.")
    if data.shape[0] < 12 * data.shape[1]:
        raise HTTPException(422, "Mẫu quá ngắn cho số chuỗi đã chọn.")
    return names, data


@app.post("/johansen")
def johansen(body: JohansenIn):
    names, data = _matrix(body.series)
    det = {-1: "n", 0: "co", 1: "colo"}[body.det_order]
    order = select_order(data, maxlags=body.max_lags, deterministic=det)
    k_ar_diff = max(int(order.bic), 1)  # select_order already returns the number of lagged differences
    res = coint_johansen(data, det_order=body.det_order, k_ar_diff=k_ar_diff)
    trace, crit = res.lr1.tolist(), res.cvt.tolist()  # crit columns: 90%, 95%, 99%
    rank = 0
    for r in range(len(trace)):
        if trace[r] > crit[r][1]:
            rank = r + 1
        else:
            break
    return {"names": names, "k_ar_diff": k_ar_diff, "trace": trace, "critical_95": [c[1] for c in crit], "rank_at_5pct": rank}


class VecmIn(JohansenIn):
    rank: Optional[int] = Field(None, ge=1)


@app.post("/vecm")
def vecm(body: VecmIn):
    names, data = _matrix(body.series)
    j = johansen(body)
    rank = body.rank or j["rank_at_5pct"]
    if rank < 1:
        return {"fitted": False, "reason": "Không phát hiện đồng liên kết ở mức 5%; dùng mô hình trên sai phân.", "johansen": j}
    det = {-1: "n", 0: "co", 1: "colo"}[body.det_order]
    fit = VECM(data, k_ar_diff=j["k_ar_diff"], coint_rank=rank, deterministic=det).fit()
    return {
        "fitted": True, "rank": rank, "names": names,
        "alpha": fit.alpha.tolist(), "beta": fit.beta.tolist(), "gamma": fit.gamma.tolist(), "johansen": j,
    }
