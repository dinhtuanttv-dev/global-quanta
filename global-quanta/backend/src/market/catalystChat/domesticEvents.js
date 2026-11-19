// V4 (19/11/2026) — Sự kiện CƠ CẤU THỊ TRƯỜNG trong nước, chuyển từ Project A (lib/domestic-events/domestic-events-data.ts).
// Khác bản cũ: có dấu tiếng Việt, các giai đoạn SẮP THEO NGÀY (bản cũ đặt "Xác nhận nâng hạng 07/04/2026" trước "Đánh giá 03/2026"),
// giai đoạn đang diễn ra tính theo ngày hiện tại thay vì gán cứng.
// Nguyên tắc giữ nguyên: chỉ thêm sự kiện khi có nguồn CHÍNH THỨC (cơ quan ra quyết định), không phải dự báo của công ty chứng khoán.
// Hợp đồng route giữ nguyên: { events: [{ id, tag, title, stages[{label,date}], activeStageIndex, effectiveDate, sourceUrl, sourceName, note, daysUntil, isPast }] }

export const DOMESTIC_EVENTS = [
  {
    id: "ftse-russell-upgrade-2026",
    tag: "NANG_HANG_THI_TRUONG",
    title: "FTSE Russell nâng hạng Việt Nam lên Thị trường mới nổi thứ cấp",
    stages: [
      { label: "Đưa vào danh sách theo dõi (2018)", date: "2018-09-01" },
      { label: "Đánh giá giữa kỳ (tháng 3)", date: "2026-03-01" },
      { label: "Xác nhận nâng hạng", date: "2026-04-07" },
      { label: "Chính thức hiệu lực", date: "2026-09-21" },
    ],
    effectiveDate: "2026-09-21",
    sourceUrl: "https://www.lseg.com/en/media-centre/press-releases/ftse-russell/2026/ftse-russell-announces-results-march-2026-semi-annual-country-classification-review-equities-fixed-income",
    sourceName: "LSEG (công ty mẹ FTSE Russell) — thông cáo báo chí chính thức",
    note: "Dự báo dòng vốn thụ động khoảng 1,5 tỷ USD, chia làm 4 đợt từ 9/2026 đến 9/2027. Danh sách mã cổ phiếu cụ thể được đưa vào chỉ số do chính FTSE Russell công bố gần ngày hiệu lực — không dự đoán trước để tránh sai lệch.",
  },
];

const DAY_MS = 86_400_000;

/** Giai đoạn đang diễn ra = giai đoạn có ngày gần nhất đã tới (chưa tới giai đoạn nào -> 0). */
export function activeStageIndex(stages, todayIso) {
  let idx = 0;
  stages.forEach((s, i) => { if (s.date && s.date <= todayIso) idx = i; });
  return idx;
}

export function domesticEventsWithCountdown(now = Date.now(), events = DOMESTIC_EVENTS) {
  const todayIso = new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
  return events.map((ev) => {
    const stages = [...ev.stages].sort((a, b) => (a.date ?? "9999") < (b.date ?? "9999") ? -1 : 1);
    const daysUntil = Math.round((Date.parse(`${ev.effectiveDate}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / DAY_MS);
    return { ...ev, stages, activeStageIndex: activeStageIndex(stages, todayIso), daysUntil, isPast: daysUntil < 0 };
  });
}
