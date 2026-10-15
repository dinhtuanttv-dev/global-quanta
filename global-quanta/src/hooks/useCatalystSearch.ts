import { useState } from "react";
import type { CatalystSector, EmergingSourceSummary } from "../types/catalyst";

/** So khớp KHÔNG phân biệt dấu/hoa-thường: dữ liệu engine không dấu, người dùng gõ có dấu (và ngược lại). */
export const foldVi = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase();

export function useCatalystSearch(sectors: CatalystSector[], emerging: EmergingSourceSummary[]) {
  const [query, setQuery] = useState("");
  const q = foldVi(query.trim());

  const filteredSectors = sectors.filter((s) => {
    if (!q) return true;
    if (foldVi(s.sector).includes(q)) return true;
    return [...s.primaryCards, ...s.cascadeCards].some((c) => c.ticker.toUpperCase().includes(q));
  });

  const filteredEmerging = emerging.filter((e) => {
    if (!q) return true;
    return foldVi(e.title).includes(q) || foldVi(e.category).includes(q);
  });

  return { query, setQuery, filteredSectors, filteredEmerging };
}
