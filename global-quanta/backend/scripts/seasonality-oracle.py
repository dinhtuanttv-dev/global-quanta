# MV1 — ORACLE độc lập cho engine mùa vụ SEAS-v1 (JS: src/market/seasonality/*). Cài đặt lại từ ĐẶC TẢ (docs SEASONAL_TIMING_V2_PLAN §2.2–2.3):
#   pandas lấy phiên cuối tháng; hàm Beta bằng tích phân số (Simpson, không dùng phân số liên tục như JS) + chia đôi cho phân vị.
#   Hoán vị dùng cùng bộ sinh số mulberry32 + seed FNV-1a để p-value so được từng số (đó là quy ước tái lập, không phải công thức).
# Chạy: python scripts/seasonality-oracle.py <input.json> <expected.json> [permutations]
import json, math, sys
import pandas as pd

CFG = dict(version="SEAS-v1", years=5, monthEndMinDay=20, roundTripCost=0.004, fdrQ=0.1, level=0.9, priorStrength=10, minSectorPeers=3, lowSampleN=4)
Z90 = 1.6448536269514722

def month_ends(bars):
  df = pd.DataFrame(bars)
  df = df[df["close"] > 0]
  df["ym"] = df["date"].str[:7]
  last = df.sort_values("date").groupby("ym").tail(1).set_index("ym")
  return {ym: (r["date"], r["close"], int(r["date"][8:10]) >= CFG["monthEndMinDay"]) for ym, r in last.iterrows()}

def prev_ym(ym):
  y, m = int(ym[:4]), int(ym[5:7])
  return f"{y-1}-12" if m == 1 else f"{y}-{m-1:02d}"

def monthly(bars, as_of):
  ends = month_ends(bars); now = as_of[:7]
  rets = {}
  for ym, (d, c, ok) in ends.items():
    p = ends.get(prev_ym(ym))
    if ym < now and ok and p and p[2]: rets[ym] = c / p[1] - 1
  mtd = None
  cur, base = ends.get(now), ends.get(prev_ym(now))
  if cur and base and base[2]: mtd = dict(ym=now, r=cur[1] / base[1] - 1)
  return rets, mtd

def wilson(k, n):
  if n <= 0: return None
  p = k / n; z2 = Z90 * Z90; den = 1 + z2 / n
  mid = (p + z2 / (2 * n)) / den
  half = Z90 * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / den
  return [max(0.0, mid - half), min(1.0, mid + half)]

def describe(xs):
  xs = [x for x in xs if x is not None]
  n = len(xs)
  if not n: return dict(n=0, mean=None, median=None, positive=0, positiveCi=None)
  s = sorted(xs)
  med = s[(n - 1) // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
  pos = sum(1 for x in xs if x > 0)
  return dict(n=n, mean=sum(xs) / n, median=med, positive=pos, positiveCi=wilson(pos, n))

# ---- Beta: CDF bằng tích phân Simpson của mật độ (log-space), phân vị bằng chia đôi ----
def beta_cdf(x, a, b, steps=4000):
  if x <= 0: return 0.0
  if x >= 1: return 1.0
  # đầu trên: đối xứng I_x(a,b) = 1 − I_{1−x}(b,a) -> kỳ dị (1−t)^(b−1) ở t=1 cũng được khử bằng cùng phép đổi biến
  if x > 0.5: return 1.0 - _beta_lower(1 - x, b, a, steps)
  return _beta_lower(x, a, b, steps)

def _beta_lower(x, a, b, steps):
  lb = math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)
  # đổi biến t = u^(1/a) khử kỳ dị ở 0 khi a < 1: ∫₀ˣ t^(a-1)(1-t)^(b-1) dt = (1/a)∫₀^{x^a} (1 - u^(1/a))^(b-1) du
  ua = x ** a
  f = lambda u: (1 - u ** (1 / a)) ** (b - 1) if u < 1 else (0.0 if b > 1 else 1.0)
  h = ua / steps
  s = f(0) + f(ua)
  for i in range(1, steps): s += (4 if i % 2 else 2) * f(i * h)
  return min(1.0, max(0.0, s * h / 3 / a / math.exp(lb)))

def beta_q(p, a, b):
  # Trọng tài chuẩn: scipy.special.betaincinv (Cephes) khi có; không có thì chia đôi trên CDF tích phân số ở trên.
  try:
    from scipy.special import betaincinv
    return float(betaincinv(a, b, p))
  except ImportError:
    pass
  lo, hi = 0.0, 1.0
  for _ in range(60):
    mid = (lo + hi) / 2
    if beta_cdf(mid, a, b) < p: lo = mid
    else: hi = mid
  return (lo + hi) / 2

def prior_from_rates(rates, strength_cap):
  r = [x for x in rates if x is not None and 0 <= x <= 1]
  if not r: return (1.0, 1.0)
  m = sum(r) / len(r)
  if len(r) == 1: return (m * strength_cap, (1 - m) * strength_cap)
  v = sum((x - m) ** 2 for x in r) / (len(r) - 1)
  implied = max(0.0, m * (1 - m) / v - 1) if v > 1e-9 else strength_cap
  s = min(strength_cap, max(2.0, implied))
  return (max(m * s, 1e-6), max((1 - m) * s, 1e-6))

# ---- hoán vị (quy ước tái lập giống JS) ----
M32 = 0xFFFFFFFF
def imul(a, b): return (a * b) & M32
def mulberry32(seed):
  st = [seed & M32]
  def nxt():
    st[0] = (st[0] + 0x6D2B79F5) & M32
    t = st[0]
    t = imul(t ^ (t >> 15), t | 1)
    t ^= (t + imul(t ^ (t >> 7), t | 61)) & M32
    return ((t ^ (t >> 14)) & M32) / 4294967296
  return nxt
def fnv(s):
  h = 0x811C9DC5
  for ch in s: h ^= ord(ch); h = imul(h, 0x01000193)
  return h

def between_var(rows):
  sums = [0.0] * 12; cnt = [0] * 12; tot = 0.0; N = 0
  for r in rows:
    for m, v in enumerate(r):
      if v is None: continue
      sums[m] += v; cnt[m] += 1; tot += v; N += 1
  if not N: return 0.0
  g = tot / N
  return sum(cnt[m] * (sums[m] / cnt[m] - g) ** 2 for m in range(12) if cnt[m]) / N

def strength(rows, B, seed):
  N = sum(1 for r in rows for v in r if v is not None)
  months = {m for r in rows for m, v in enumerate(r) if v is not None}
  S = between_var(rows)
  if N < 24 or len(months) < 6: return S, None
  rng = mulberry32(seed)
  slots = [[m for m, v in enumerate(r) if v is not None] for r in rows]
  work = [list(r) for r in rows]
  ge = 0
  for _ in range(B):
    for y, idx in enumerate(slots):
      vals = [rows[y][m] for m in idx]
      for i in range(len(vals) - 1, 0, -1):
        j = math.floor(rng() * (i + 1)); vals[i], vals[j] = vals[j], vals[i]
      for k, m in enumerate(idx): work[y][m] = vals[k]
    if between_var(work) >= S - 1e-15: ge += 1
  return S, (1 + ge) / (1 + B)

def bh(ps):
  idx = sorted([(p, i) for i, p in enumerate(ps) if p is not None])
  m = len(idx); q = [None] * len(ps); run = 1.0
  for k in range(m - 1, -1, -1):
    run = min(run, idx[k][0] * m / (k + 1)); q[idx[k][1]] = run
  return q

def main():
  data = json.load(open(sys.argv[1], encoding="utf8"))
  B = int(sys.argv[3]) if len(sys.argv) > 3 else 199
  as_of = data["asOf"]; y1 = int(as_of[:4]) - 1; years = list(range(y1 - CFG["years"] + 1, y1 + 1))
  brets, bmtd = monthly(data["bench"], as_of)
  items = []
  for t in data["tickers"]:
    rets, mtd = monthly(t["bars"], as_of)
    cells = [dict(years=[], r=[], ex=[]) for _ in range(12)]; rows = []
    for y in years:
      row = [None] * 12
      for m in range(12):
        k = f"{y}-{m+1:02d}"
        if k not in rets: continue
        cells[m]["years"].append(y); cells[m]["r"].append(rets[k])
        ex = rets[k] - brets[k] if k in brets else None
        cells[m]["ex"].append(ex); row[m] = ex
      rows.append(row)
    raw = []
    for c in cells:
      ex = [v for v in c["ex"] if v is not None]
      w = sum(1 for v in ex if v - CFG["roundTripCost"] > 0)
      raw.append(dict(n=len(c["r"]), ret=describe(c["r"]), excess=describe(ex), wins=w, losses=len(ex) - w, exMean=(sum(ex) / len(ex) if ex else None), exN=len(ex)))
    ss = 0.0; N = 0; M = 0
    for c in cells:
      ex = [v for v in c["ex"] if v is not None]
      if not ex: continue
      mu = sum(ex) / len(ex); ss += sum((x - mu) ** 2 for x in ex); N += len(ex); M += 1
    items.append(dict(ticker=t["ticker"], sector=t["sector"], rows=rows, raw=raw, within=(ss / (N - M) if N - M > 0 else None), mtd=mtd))
  wv = sorted(i["within"] for i in items if i["within"] is not None)
  typical = wv[len(wv) // 2] if wv else 0.01
  out = []
  for it in items:
    within = it["within"] if it["within"] is not None else typical
    months = []
    for m in range(12):
      c = it["raw"][m]
      sec = [p for p in items if p is not it and p["sector"] == it["sector"] and p["raw"][m]["exN"] > 0]
      if len(sec) >= CFG["minSectorPeers"]: scope, peers = "SECTOR", sec
      else: scope, peers = "UNIVERSE", [p for p in items if p is not it and p["raw"][m]["exN"] > 0]
      pm = [p["raw"][m]["exMean"] for p in peers]
      prior_mean = sum(pm) / len(pm) if pm else 0.0
      tau2 = 0.0
      if len(pm) >= 2:
        v = sum((x - prior_mean) ** 2 for x in pm) / (len(pm) - 1)
        noise = sum((p["within"] if p["within"] is not None else typical) / p["raw"][m]["exN"] for p in peers) / len(peers)
        tau2 = max(0.0, v - noise)
      shrunk = None
      if c["exN"] > 0:
        den = tau2 + within / c["exN"]
        w = tau2 / den if den else 0.0
        shrunk = prior_mean + w * (c["exMean"] - prior_mean)
      a0, b0 = prior_from_rates([p["raw"][m]["wins"] / p["raw"][m]["exN"] for p in peers], CFG["priorStrength"])
      prob = None
      if c["exN"] > 0:
        a, b = a0 + c["wins"], b0 + c["losses"]
        prob = dict(mean=a / (a + b), ci=[beta_q(0.05, a, b), beta_q(0.95, a, b)], wins=c["wins"], losses=c["losses"], alpha0=a0, beta0=b0, scope=scope)
      months.append(dict(month=m + 1, n=c["n"], ret=c["ret"], excess=c["excess"], shrunkExcess=shrunk, prob=prob))
    S, p = strength(it["rows"], B, fnv(f"{it['ticker']}|{CFG['version']}"))
    out.append(dict(ticker=it["ticker"], S=S, p=p, months=months, mtd=it["mtd"]))
  q = bh([o["p"] for o in out])
  for o, qq in zip(out, q): o["q"] = qq
  json.dump(dict(asOf=as_of, years=years, permutations=B, items=out), open(sys.argv[2], "w", encoding="utf8"))
  print("ok", len(out), "mã")

main()
