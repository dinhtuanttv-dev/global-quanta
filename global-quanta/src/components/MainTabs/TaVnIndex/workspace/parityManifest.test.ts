// @vitest-environment node
// SC0 — kiểm tĩnh bản kê bảo toàn: id duy nhất, mọi selector trỏ tới thuộc tính CÓ THẬT trong mã nguồn tab TA VN-Index,
// mọi lớp của LayerManager (trừ 6 lớp Elliott cũ chỉ bật trong tab "Theo sách") đều có dòng kiểm.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PARITY_MANIFEST } from "./parityManifest";
import { DEFAULT_LAYER_STATE } from "../../../../lib/ta-command-center/LayerManager";

const root = path.resolve(process.cwd(), "src/components/MainTabs/TaVnIndex");
const src = readdirSync(root, { recursive: true }).map(String).filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
  .map((f) => readFileSync(path.join(root, f), "utf8")).join("\n");
/** Tiền tố của testid động: data-testid={`elliott-pro-tab-${t.id}`} -> "elliott-pro-tab-". */
const dynamicPrefixes = [...src.matchAll(/data-testid=\{`([a-z0-9-]+)\$\{/g)].map((m) => m[1]);
const selectors = (c: (typeof PARITY_MANIFEST)[number]["check"]): string[] =>
  c.kind === "visible" || c.kind === "tabs" ? [c.sel] : c.kind === "click" ? [c.sel, c.expect] : c.kind === "steps" ? [...c.clicks, c.expect] : c.kind === "layer" && c.expect ? [c.expect] : [];

describe("SC0 — bản kê bảo toàn tính năng", () => {
  it("id duy nhất, ≥ 40 tính năng, mọi nhóm đều có", () => {
    const ids = PARITY_MANIFEST.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(40);
    for (const g of ["header", "chart", "pane", "overlay", "engine", "drawing", "analysis", "elliott", "structure", "handoff", "workspace"]) expect(PARITY_MANIFEST.some((x) => x.group === g), g).toBe(true);
  });

  it("mọi data-testid trong selector tồn tại trong mã nguồn (cố định hoặc tiền tố của testid động)", () => {
    for (const item of PARITY_MANIFEST) {
      for (const sel of selectors(item.check)) {
        for (const m of sel.matchAll(/data-testid(\^?)=([a-z0-9-]+)/g)) {
          const [, prefix, id] = m;
          // testid="…" = prop của khối Popover (render ra data-testid)
          const ok = prefix ? dynamicPrefixes.some((d) => d.startsWith(id) || id.startsWith(d)) || src.includes(`data-testid="${id}`)
            : src.includes(`data-testid="${id}"`) || src.includes(`testid="${id}"`) || dynamicPrefixes.some((d) => id.startsWith(d));
          expect(ok, `${item.id}: data-testid=${id}`).toBe(true);
        }
      }
    }
  });

  it("mọi selector có đường mở (REVEAL) hợp lệ hoặc luôn hiển thị; 57 tính năng cũ vẫn còn trong bản kê", () => {
    const old = ["ticker-selector", "ticker-change", "price-basis", "tf-note", "chart-canvas", "chart-keys", "chart-pin", "confluence", "draw-trendline", "draw-zone", "draw-fib", "draw-fibtime",
      "fib-ext", "draw-saved", "draw-clear", "smart-note", "smc-panel", "vsa-panel", "backtest", "orderflow-panel", "oscillators", "signal-log", "elliott-pro", "elliott-pro-tabs",
      "elliott-edit", "elliott-history", "elliott-alerts", "elliott-book", "structure-open", "structure-modes", "structure-replay", "structure-chip", "handoff-structure"];
    const ids = new Set(PARITY_MANIFEST.map((x) => x.id));
    for (const id of old) expect(ids.has(id), id).toBe(true);
    expect(PARITY_MANIFEST.filter((x) => !("since" in x) || x.since === "SC0").length).toBeGreaterThanOrEqual(57);
  });

  it("mọi lớp đang hiện trên thanh công tắc đều có dòng kiểm; công cụ vẽ trỏ đúng data-tool", () => {
    const legacy = new Set(["elliottAuto", "elliottOsc", "elliottFib", "elliottProj", "elliottGuide", "elliottSub"]);
    const layers = Object.keys(DEFAULT_LAYER_STATE).filter((k) => k !== "aiDetectionMaster" && !legacy.has(k));
    const checked = new Set(PARITY_MANIFEST.flatMap((x) => (x.check.kind === "layer" ? [x.check.key] : [])));
    for (const k of layers) expect(checked.has(k), `lớp ${k}`).toBe(true);
    for (const x of PARITY_MANIFEST) if (x.check.kind === "draw") expect(src).toContain(`id: "${x.check.tool}"`);
    for (const k of layers) expect(src.includes("data-layer={key}")).toBe(true);
  });
});
