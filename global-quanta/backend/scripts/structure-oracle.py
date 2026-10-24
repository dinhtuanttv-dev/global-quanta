# Oracle: chạy bản Python gốc (mtf_market_structure.py) trên dữ liệu mẫu 1H, lấy giai đoạn THÔ (bỏ phần gắn nhãn hồi tố + gộp đoạn)
# và tín hiệu, ghi JSON để so với engine v2 (JS).
import json, sys, types
src_path = r"C:\Users\HP\cấu trúc thị trương\mtf_market_structure.py"
src = open(src_path, encoding="utf8").read()
a = src.index("    # Gắn nhãn VÙNG cho mẫu hình đã xác nhận")
b = src.index("    st.stage = pd.Series(stage, index=d.index)")
raw_src = src[:a] + src[b:]
mod = types.ModuleType("mtf_raw"); mod.__file__ = src_path
sys.modules["mtf_raw"] = mod
exec(compile(raw_src, "mtf_raw", "exec"), mod.__dict__)
import pandas as pd
csv = sys.argv[1]; out = sys.argv[2]
df = mod._normalize(pd.read_csv(csv))
cfg = mod.Config()
d = mod.calculate_indicators(df, cfg)
st = mod.detect_market_structure(d, cfg)
res = {
  "dates": [t.strftime("%Y-%m-%d %H:%M") for t in d.index],
  "stage": [s or "" for s in st.stage.tolist()],
  "signals": [{"date": r["time"].strftime("%Y-%m-%d %H:%M"), "code": r["code"]} for _, r in st.signals.iterrows()],
  "patterns": [{"type": p["type"], "ready": int(p["ready"]), "break": (None if p["break_idx"] is None else int(p["break_idx"]))} for p in st.patterns],
  "pivots_mid": [{"kind": p["kind"], "idx": int(p["idx"]), "confirm": int(p["confirm"])} for p in st.pivots_mid],
}
json.dump(res, open(out, "w"), ensure_ascii=False)
print(len(res["stage"]), "bars", len(res["signals"]), "signals", len(res["patterns"]), "patterns")
