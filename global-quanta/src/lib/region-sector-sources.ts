// MOI (2026-09-10): Danh muc cong cu dai dien theo tung khu vuc, dung chung
// sectorKey voi MACRO_MAPPING (macro-mapping.ts) de tai su dung logic anh xa
// sang ma CP VN - khong tao he thong mapping rieng.
//
// "verified: true" = ticker Yahoo Finance da duoc kiem chung qua nghien cuu
// thuc te (nguon: cong ty phat hanh ETF / du lieu holdings AAXJ...).
// "verified: false" = placeholder CAN xac nhan lai truoc khi dua vao
// production - KHONG tu bia ticker de tranh sai lech du lieu tai chinh.

export interface EuSectorInstrument {
  sectorKey: string;
  labelVi: string;
  ticker: string;
  fundNameVi: string;
  verified: boolean;
}

// Chau Au: dung ho ETF Amundi/Lyxor STOXX Europe 600 theo tung nganh (giong
// cau truc SPDR Sector ETF cua My) - day la du lieu HARD_DATA that, khong
// phai proxy, mien la dung ticker chinh xac.
export const EU_SECTOR_INSTRUMENTS: EuSectorInstrument[] = [
  {
    sectorKey: "BANKING_FINANCE",
    labelVi: "Ngân hàng",
    fundNameVi: "Amundi STOXX Europe 600 Banks UCITS ETF",
    ticker: "BNK.PA",
    verified: true,
  },
  {
    sectorKey: "ENERGY_OIL_GAS",
    labelVi: "Dầu khí",
    fundNameVi: "Amundi/Lyxor STOXX Europe 600 Oil & Gas UCITS ETF",
    ticker: "",
    verified: false,
  },
  {
    sectorKey: "SEMICONDUCTOR_TECH",
    labelVi: "Công nghệ",
    fundNameVi: "STOXX Europe 600 Technology UCITS ETF",
    ticker: "",
    verified: false,
  },
  {
    sectorKey: "STEEL_MATERIALS",
    labelVi: "Vật liệu cơ bản",
    fundNameVi: "STOXX Europe 600 Basic Resources UCITS ETF",
    ticker: "",
    verified: false,
  },
  {
    sectorKey: "REAL_ESTATE",
    labelVi: "Bất động sản",
    fundNameVi: "STOXX Europe 600 Real Estate UCITS ETF",
    ticker: "",
    verified: false,
  },
];

export interface AsiaSectorProxyBasket {
  sectorKey: string;
  labelVi: string;
  descriptionVi: string;
  tickers: string[];
  verified: boolean;
}

// Chau A: KHONG co ETF ngành thong nhat toan khu vuc (khac My/Au) - dung rổ
// co phieu dau nganh dai dien lam PROXY, giong dung cach du an da lam voi
// "Quang sat Proxy" (RIO/VALE/BHP) trong macro-mapping.ts. Backend can tinh
// trung binh % thay doi cua cac ticker trong rổ.
export const ASIA_SECTOR_PROXY_BASKETS: AsiaSectorProxyBasket[] = [
  {
    sectorKey: "SEMICONDUCTOR_TECH",
    labelVi: "Công nghệ / Bán dẫn",
    descriptionVi: "Rổ đại diện: TSMC (Đài Loan), Samsung Electronics, SK Hynix (Hàn Quốc)",
    tickers: ["2330.TW", "005930.KS", "000660.KS"],
    verified: true,
  },
  {
    sectorKey: "BANKING_FINANCE",
    labelVi: "Tài chính / Ngân hàng",
    descriptionVi: "Rổ đại diện: DBS Group (Singapore), HDFC Bank (Ấn Độ)",
    tickers: ["D05.SI", "HDFCBANK.NS"],
    verified: true,
  },
  {
    sectorKey: "ENERGY_OIL_GAS",
    labelVi: "Năng lượng",
    descriptionVi: "Cần xác nhận rổ đại diện chuẩn (ví dụ: Reliance Industries Ấn Độ)",
    tickers: [],
    verified: false,
  },
];
