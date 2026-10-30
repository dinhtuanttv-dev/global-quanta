// Câu hỏi mồi của bảng "Tác động ngành & cổ phiếu" gửi sang Hỏi đáp. 31/10/2026: gỡ phần ghép engine Chất xúc tác.
export const askSector = (nameVi: string, icb: string) =>
  `Phân tích tác động của thế giới và hàng hoá tới ngành ${nameVi} (ICB ${icb}) và các cổ phiếu chính của ngành: tư thế ngắn hạn, bối cảnh trung hạn, rủi ro.`;
export const askTicker = (ticker: string) =>
  `Phân tích chuyên sâu ${ticker}: ngành ICB, tác động của thế giới và hàng hoá, bối cảnh vĩ mô và rủi ro.`;
