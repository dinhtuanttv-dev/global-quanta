import { describe, expect, it } from "vitest";
import { classifyWyckoffV2 } from "./wyckoff";
import { staleSpringSeries } from "./__fixtures__/wyckoffSeries";

describe("Wyckoff — cấu trúc cũ không được trình bày như pha hiện tại (lỗi trong ảnh)", () => {
  it("v2: Spring cũ đã bị thủng, giá xa dưới range 90 phiên -> pha hiện tại 'undetermined', Spring chỉ là lịch sử", () => {
    const bars = staleSpringSeries(90);
    const w = classifyWyckoffV2(bars);
    expect(w.phase).toBe("undetermined");
    expect(w.status).toBe("historical");
    expect(w.historical?.phase).toBe("spring");
    expect(w.statusReason).toMatch(/Spring|hiệu lực|range/);
    // range cũ vẫn được trả về để vẽ, nhưng gắn nhãn lịch sử
    expect(w.rangeLow).not.toBeNull();
  });

  it("v2: ngay sau Spring (chưa bị thủng, còn mới) -> vẫn là pha hiện tại 'spring' / active", () => {
    const bars = staleSpringSeries(0);
    const w = classifyWyckoffV2(bars);
    expect(w.status).toBe("active");
    expect(["spring", "test"]).toContain(w.phase);
  });
});
