// F0 (06/11/2026) — KHOÁ Timeline điểm mua. Người dùng yêu cầu: tính năng đang rất tốt, KHÔNG được thay đổi hay sửa.
// Hai lớp khoá:
//   1. Mã băm SHA-256 (đã chuẩn hoá xuống dòng) của các file Timeline dùng trực tiếp. Sửa dù một ký tự -> test đỏ.
//   2. Bản chụp nội dung hiển thị (thứ tự dòng, trạng thái, bậc, chữ) với một bộ dữ liệu cố định và ngày cố định.
// Muốn thay đổi Timeline: phải có quyết định của người dùng, rồi mới cập nhật mã băm / bản chụp trong cùng commit, ghi rõ lý do.
// Không khoá useBoardQuotes (giá trực tiếp, dùng chung nhiều tab) — Timeline chỉ đọc giá từ hook này.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuyTimelineTab } from "./BuyTimelineTab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LOCKED: Record<string, string> = {
  "src/components/MainTabs/CoTuc/timeline/BuyTimelineTab.tsx": "a170a75f632579b59ee1928873b6c36ef4788b6a115bdaf2005280786108e613",
  "src/hooks/useBuyTimeline.ts": "1811a9e59eedcc290d49ccdd2b4db6a3ac0d1b4d0a429304712469a6326fdcfa",
  "src/lib/cotuc/buy-timeline.ts": "dcbbd44037b0dacd5e83feb547c059cd69f84b98ead151633b6fb3354c814a7d",
  "src/lib/cotuc/format.ts": "a22b96e994684fc11250d87f061c9e8ed961554139020ec55888159718f551ea",
  "src/hooks/useCotucDecision.ts": "f021f24033ad1338b75147b5d445d141c5d9467b4734ba6cf1d94269db680bbc",
};

describe("F0 — khoá Timeline điểm mua", () => {
  it("mã nguồn Timeline không đổi (SHA-256, chuẩn hoá xuống dòng)", () => {
    for (const [file, hash] of Object.entries(LOCKED)) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
      expect(createHash("sha256").update(src).digest("hex"), `${file} đã bị sửa — Timeline điểm mua đang bị khoá`).toBe(hash);
    }
  });

  const row = (over: Record<string, unknown>) => ({
    id: "x", ticker: "FPT", sector: "Công nghệ", kind: "DIVIDEND", tier: "NEAR", status: "UPCOMING", eventLabel: "GDKHQ", eventDate: "2026-11-20",
    eventDateBasis: "ESTIMATED", windowId: "w3", windowLabel: "W3 · Trước GDKHQ (an toàn)", entryFrom: -25, entryTo: -15, exitOffset: 3,
    entryFromDate: "2026-10-16", entryToDate: "2026-10-30", exitDate: "2026-11-25", sessionsToEntry: 9, nEvents: 9, winRate: 0.78, probability: null,
    netExpectancy: 0.024, netExpectancyLcb: 0.017, fdrQValue: 0.11, decisionLevel: "AVOID", missing: ["q-value 0.11 > 0.1"], ...over,
  });
  const payload = {
    today: "2026-10-05",
    asOf: { decisions: "2026-10-05T02:00:00Z", seasonality: "2026-10-04T23:45:00Z" },
    coverage: { decisions: 260, seasonality: 240, universe: 281 },
    counts: { validated: 1, near: 3, inWindow: 1, upcoming: 3 },
    rows: [
      row({ id: "a", ticker: "BMP", kind: "EARNINGS", tier: "VALIDATED", status: "IN_WINDOW", eventLabel: "Công bố KQKD Q3/2026", eventDate: "2026-10-19", eventDateBasis: "HISTORICAL_LAG",
        windowId: "e2", windowLabel: "E2 · Nắm qua công bố", entryFrom: -5, entryTo: -2, exitOffset: 3, entryFromDate: "2026-10-05", entryToDate: "2026-10-15", sessionsToEntry: 0,
        probability: 0.64, decisionLevel: null, missing: [] }),
      row({ id: "b" }),
      row({ id: "d", ticker: "VNM", sector: "Thực phẩm", eventDate: "2026-12-10", eventDateBasis: "ANNOUNCED", entryFromDate: "2026-11-05", entryToDate: "2026-11-19", exitDate: "2026-12-15", sessionsToEntry: 23, winRate: 0.6, netExpectancy: -0.004, netExpectancyLcb: -0.01, decisionLevel: "WATCH" }),
      row({ id: "c", ticker: "MWG", status: "PASSED", entryFromDate: "2026-08-31", entryToDate: "2026-09-16", exitDate: "2026-10-12" }),
    ],
  };

  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-05T03:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });

  async function mount() {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes("buy-timeline") ? payload : { asOf: null, count: 0, states: [] }), { status: 200 })));
    const el = document.createElement("div");
    document.body.appendChild(el);
    await act(async () => { createRoot(el).render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><BuyTimelineTab /></SWRConfig>); });
    for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    return el;
  }
  const rowsOf = (el: HTMLElement) => [...el.querySelectorAll('[data-testid="timeline-row"]')].map((r) => ({
    status: r.getAttribute("data-status"), tier: r.getAttribute("data-tier"), text: (r.textContent ?? "").replace(/\s+/g, " ").trim(),
  }));

  it("nội dung hiển thị không đổi (thứ tự dòng, trạng thái, bậc, chữ) — bản chụp cố định", async () => {
    const el = await mount();
    expect(rowsOf(el)).toMatchSnapshot("rows-default");
    // Bộ lọc bên trong Timeline (giữ nguyên hành vi): bật "đã qua vùng mua"
    const passed = [...el.querySelectorAll("label")].find((l) => l.textContent?.includes("đã qua"))?.querySelector("input") as HTMLInputElement | undefined;
    if (passed) await act(async () => { passed.click(); });
    expect(rowsOf(el)).toMatchSnapshot("rows-with-passed");
    const headings = [...el.querySelectorAll("h2,h3,h4")].map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim());
    expect(headings).toMatchSnapshot("headings");
  });
});
