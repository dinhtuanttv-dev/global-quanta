// @gq/quant-core · MTF v3 — dựng tài liệu cấu trúc ba khung từ một chuỗi nến ngày. DÙNG CHUNG cho Gateway (/api/market/structure3) và
// chế độ phát lại trên trình duyệt (chuỗi cắt tới ngày phát lại) -> hai nơi luôn cho cùng kết quả.
import type { Bar } from "../math";
import { analyze3, compactStructure3 } from "./frame";
import { compactRibbon3 } from "./ribbon";
import { elliott3 } from "./elliott3";
import { compactBases3 } from "./bases";
import { decisionAt } from "./decision3";
import { MTF3_VERSION } from "./version";

export function buildStructure3(daily: Bar[], opts: { window?: number; elliott?: boolean } = {}) {
  const win = opts.window ?? 260;
  const a = analyze3(daily), r = a.ribbon, t = daily.length - 1;
  let ew: ReturnType<typeof elliott3> | { error: string } | null = null;
  if (opts.elliott !== false) { try { ew = elliott3(daily, a); } catch (e) { ew = { error: (e as Error).message }; } }
  const target = ew && !("error" in ew) && ew.day?.dir === "up" ? ew.targets[0]?.price ?? null : null;
  return {
    version: MTF3_VERSION, asOf: daily[t].date,
    bars: { D: r.D.bars.length, W: r.W.bars.length, M: r.M.bars.length },
    ribbon: compactRibbon3(r, { window: win }),
    structure: compactStructure3(a, { window: win }),
    elliott: ew,
    bases: compactBases3(a),
    decision: decisionAt(a, t, target),
  };
}
