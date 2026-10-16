import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "../../test/rtl-lite";
import { MarkdownLite } from "./MarkdownLite";

afterEach(cleanup);

describe("MarkdownLite", () => {
  it("bảng, danh sách, trích dẫn, đậm/nghiêng; không chèn HTML thô", () => {
    const md = ["# Báo cáo", "> **Lưu ý:** mô phỏng", "| A | B |", "| --- | --- |", "| x | **1,2** |", "", "- một", "- hai", "1. bước", "_ghi chú_", "<script>alert(1)</script>"].join("\n");
    const { container } = render(<MarkdownLite text={md} />);
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(1);
    expect(container.querySelector("td strong")?.textContent).toBe("1,2");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(1);
    expect(container.querySelector("em")?.textContent).toBe("ghi chú");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });
});
