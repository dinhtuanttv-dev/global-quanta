import type { IndexCompareItem } from "../hooks/useIndicesCompare";

/**
 * Sinh nhan dinh ngan gon so sanh VN-Index voi VN30/HNX/UPCOM,
 * dua tren chenh lech % thay doi thuc te - thay the note tinh (mock).
 */
export function generateCompareNote(vnIndexChangePct: number, compare: IndexCompareItem[]): string {
  const vn30 = compare.find((c) => c.index === "VN30");
  if (!vn30) return "Dang cap nhat du lieu so sanh chi so.";

  const diff = vn30.changePct - vnIndexChangePct;

  if (Math.abs(diff) < 0.15) {
    return "VN30 va VN-Index dien bien tuong dong — dong tien lan toa deu giua cac nhom von hoa.";
  }
  if (diff > 0) {
    return `VN30 tang ${diff.toFixed(2)} diem % manh hon VN-Index — dong tien dang tap trung vao nhom von hoa lon, do rong thi truong co the chua lan toa deu.`;
  }
  return `VN30 tang cham hon VN-Index ${Math.abs(diff).toFixed(2)} diem % — dong tien co dau hieu lan sang nhom vua va nho, tin hieu tich cuc ve do rong.`;
}
