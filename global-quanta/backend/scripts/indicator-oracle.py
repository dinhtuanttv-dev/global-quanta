"""A5 (Q-01/Q-03) — oracle ĐỘC LẬP cho RSI (Wilder), MACD (12/26/9), ADX (+DI/−DI) theo định nghĩa gốc của Wilder (1978) / Appel.
Viết lại từ đầu bằng Python thuần (không dùng mã TS của chart, không thư viện ngoài) để đối chiếu; sinh fixture JSON.
  python backend/scripts/indicator-oracle.py > src/lib/ta-command-center/__fixtures__/indicatorOracle.json
Quy ước (khớp chart, ghi rõ để người đọc kiểm): EMA khởi tạo bằng SMA `n` giá trị đầu; Signal = EMA9 của chuỗi MACD (bỏ phần chưa có);
RSI phẳng (không lãi không lỗ) = 50; ADX đầu tiên = TB `n` DX đầu, rồi làm trơn Wilder; DM theo quy tắc "lớn hơn và dương".
"""
import json, math

def rsi(c, n=14):
    out = [None] * len(c)
    if len(c) < n + 1: return out
    def val(g, l): return 50.0 if g == 0 and l == 0 else (100.0 if l == 0 else 100 - 100 / (1 + g / l))
    g = sum(max(c[i] - c[i-1], 0) for i in range(1, n + 1)) / n
    l = sum(max(c[i-1] - c[i], 0) for i in range(1, n + 1)) / n
    out[n] = val(g, l)
    for i in range(n + 1, len(c)):
        d = c[i] - c[i-1]
        g = (g * (n - 1) + max(d, 0)) / n
        l = (l * (n - 1) + max(-d, 0)) / n
        out[i] = val(g, l)
    return out

def ema(v, n):
    out = [None] * len(v)
    if len(v) < n: return out
    e = sum(v[:n]) / n; out[n-1] = e; k = 2 / (n + 1)
    for i in range(n, len(v)): e = v[i] * k + e * (1 - k); out[i] = e
    return out

def macd(c, f=12, s=26, sig=9):
    ef, es = ema(c, f), ema(c, s)
    m = [ef[i] - es[i] if ef[i] is not None and es[i] is not None else None for i in range(len(c))]
    idx = [i for i, x in enumerate(m) if x is not None]
    sg_vals = ema([m[i] for i in idx], sig)
    sg = [None] * len(c)
    for j, i in enumerate(idx): sg[i] = sg_vals[j]
    h = [m[i] - sg[i] if m[i] is not None and sg[i] is not None else None for i in range(len(c))]
    return m, sg, h

def adx(H, L, C, n=14):
    N = len(C); out = [None] * N; pdi = [None] * N; mdi = [None] * N
    if N < 2 * n: return out, pdi, mdi
    tr, pdm, mdm = [0.0], [0.0], [0.0]
    for i in range(1, N):
        up, dn = H[i] - H[i-1], L[i-1] - L[i]
        pdm.append(up if up > dn and up > 0 else 0.0); mdm.append(dn if dn > up and dn > 0 else 0.0)
        tr.append(max(H[i] - L[i], abs(H[i] - C[i-1]), abs(L[i] - C[i-1])))
    def smooth(a):
        o = [0.0] * N; s = sum(a[1:n+1]); o[n] = s
        for i in range(n + 1, N): s = s - s / n + a[i]; o[i] = s
        return o
    st, sp, sm = smooth(tr), smooth(pdm), smooth(mdm)
    dx = [None] * N
    for i in range(n, N):
        if st[i] == 0: continue
        p, m = 100 * sp[i] / st[i], 100 * sm[i] / st[i]
        pdi[i], mdi[i] = p, m
        dx[i] = 0.0 if p + m == 0 else 100 * abs(p - m) / (p + m)
    if sum(1 for x in dx if x is not None) < n: return out, pdi, mdi  # chưa đủ DX hợp lệ (VD chuỗi phẳng: TR = 0)
    first = next(i for i, x in enumerate(dx) if x is not None)
    a = sum(dx[first:first + n]) / n; out[first + n - 1] = a
    for i in range(first + n, N):
        if dx[i] is None: continue
        a = (a * (n - 1) + dx[i]) / n; out[i] = a
    return out, pdi, mdi

def series(kind, n=120):
    o = []
    for i in range(n):
        if kind == "up": c = 100 + i * 0.7 + (0.3 if i % 5 == 0 else 0)
        elif kind == "down": c = 200 - i * 0.6 - (0.2 if i % 4 == 0 else 0)
        elif kind == "flat": c = 50.0
        elif kind == "mixed": c = 100 + 8 * math.sin(i / 6) + 3 * math.sin(i / 2.3) + 0.05 * i
        else: c = 100 + (i % 7) - 3
        h = c + (0 if kind == "flat" else 1 + (i % 3) * 0.4); l = c - (0 if kind == "flat" else 1 + (i % 2) * 0.5)
        o.append({"date": f"d{i:03d}", "open": c, "high": h, "low": l, "close": c, "volume": 1000})
    return o

cases = {}
for kind, n in [("up", 120), ("down", 120), ("flat", 60), ("mixed", 160), ("warmup", 20)]:
    b = series(kind, n); C = [x["close"] for x in b]; H = [x["high"] for x in b]; L = [x["low"] for x in b]
    m, sg, h = macd(C); a, p, md = adx(H, L, C)
    cases[kind] = {"bars": b, "rsi": rsi(C), "macd": m, "signal": sg, "hist": h, "adx": a, "plusDI": p, "minusDI": md}
print(json.dumps({"source": "backend/scripts/indicator-oracle.py (Python thuần, độc lập)", "cases": cases}))
