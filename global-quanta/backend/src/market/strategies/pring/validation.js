// Pattern Scanner v2 (Pring) — P3: KẾT QUẢ kiểm định đặt trước (prereg 2026-10-10), sinh bằng scripts/pring-validate.mjs trên
// chuỗi giá điều chỉnh 269 mã (10/2024–09/2026, OOS từ 2026-03-07). Không sửa tay — chạy lại script khi đổi engine.
export const PRING_VALIDATION = Object.freeze({
 "version": "pring/P3",
 "prereg": "pring/P3-prereg-2026-10-10",
 "engine": "pring/P2",
 "ranAt": "2026-10-09",
 "period": {
  "from": "2024-10-22",
  "to": "2026-09-10",
  "oosFrom": "2026-03-07",
  "sessions": 468,
  "symbols": 269
 },
 "rules": "Sự kiện = mô hình được xác nhận (phá vỡ dứt khoát giữ ≥ 2 thanh); lợi suất vượt trội mở cửa T+1 → đóng cửa T+20 so TB cùng ngày của tập mã đủ điều kiện tại ngày đó (≥ 260 nến, giá ≥ 5.000đ, GTGD TB20 ≥ 5 tỷ), mua trừ phí 0,6%; KTC 95% bootstrap cụm ngày; ĐẠT khi OOS n ≥ 30, TB đúng dấu, cận KTC đúng dấu và trong mẫu cùng dấu.",
 "label": "EXPERIMENTAL",
 "H1": {
  "G1": {
   "label": "Đảo chiều cổ điển (đôi/ba, vai-đầu-vai, đảo)",
   "verdict": "INSUFFICIENT",
   "is": {
    "n": 127,
    "mean": -1.8,
    "ci": [
     -3.25,
     -0.32
    ],
    "hit": 33.86
   },
   "oos": {
    "n": 19,
    "mean": 1.32,
    "ci": [
     -1.47,
     4.73
    ],
    "hit": 57.89
   },
   "q": 0.36,
   "placeboP": 1
  },
  "G2": {
   "label": "Tam giác + chữ nhật",
   "verdict": "FAIL",
   "is": {
    "n": 466,
    "mean": -1.73,
    "ci": [
     -2.7,
     -0.71
    ],
    "hit": 34.55
   },
   "oos": {
    "n": 113,
    "mean": -0.49,
    "ci": [
     -1.79,
     1.21
    ],
    "hit": 43.36
   },
   "q": 0.957,
   "placeboP": 1
  },
  "G3": {
   "label": "Nêm + mở rộng",
   "verdict": "FAIL",
   "is": {
    "n": 439,
    "mean": -0.4,
    "ci": [
     -1.3,
     0.57
    ],
    "hit": 41
   },
   "oos": {
    "n": 217,
    "mean": -0.79,
    "ci": [
     -1.79,
     0.2
    ],
    "hit": 42.4
   },
   "q": 0.957,
   "placeboP": 1
  },
  "G4": {
   "label": "Cờ, đáy/đỉnh tròn, cốc tay cầm",
   "verdict": "INSUFFICIENT",
   "is": {
    "n": 151,
    "mean": -0.62,
    "ci": [
     -2.36,
     1.29
    ],
    "hit": 44.37
   },
   "oos": {
    "n": 27,
    "mean": 2.96,
    "ci": [
     -0.53,
     6.61
    ],
    "hit": 70.37
   },
   "q": 0.184,
   "placeboP": 1
  }
 },
 "H2": {
  "verdict": "FAIL",
  "is": {
   "n": 1122,
   "mean": -0.31,
   "ci": [
    -1,
    0.41
   ],
   "hit": 57.49
  },
  "oos": {
   "n": 443,
   "mean": 0.04,
   "ci": [
    -0.75,
    0.89
   ],
   "hit": 52.14
  }
 },
 "H3": {
  "verdict": "FAIL",
  "high": {
   "is": {
    "n": 453,
    "mean": -1.65,
    "ci": [
     -2.63,
     -0.55
    ],
    "hit": 35.76
   },
   "oos": {
    "n": 106,
    "mean": -0.43,
    "ci": [
     -2.04,
     1.31
    ],
    "hit": 50
   }
  },
  "low": {
   "is": {
    "n": 351,
    "mean": -0.92,
    "ci": [
     -1.87,
     0.27
    ],
    "hit": 38.75
   },
   "oos": {
    "n": 139,
    "mean": -0.36,
    "ci": [
     -1.56,
     0.83
    ],
    "hit": 43.88
   }
  }
 },
 "trades": {
  "is": {
   "n": 1141,
   "winRate": 29.1,
   "avgNetPct": -0.61,
   "medianNetPct": -4.37,
   "profitFactor": 0.88,
   "expectancyR": -0.09,
   "avgBars": 18.66,
   "byReason": {
    "TIME": 121,
    "STOP": 717,
    "TARGET": 303
   }
  },
  "oos": {
   "n": 354,
   "winRate": 21.47,
   "avgNetPct": -3.03,
   "medianNetPct": -4.59,
   "profitFactor": 0.41,
   "expectancyR": -0.66,
   "avgBars": 17.68,
   "byReason": {
    "TIME": 32,
    "STOP": 252,
    "TARGET": 70
   }
  },
  "ciOos": [
   -4.07,
   -1.96
  ]
 },
 "targets": {
  "G1_bull": {
   "n": 142,
   "t1": 76.06,
   "t2": 60.56,
   "t3": 51.41,
   "failed": 18.31
  },
  "G1_bear": {
   "n": 55,
   "t1": 50.91,
   "t2": 30.91,
   "t3": 21.82,
   "failed": 16.36
  },
  "G2_bull": {
   "n": 545,
   "t1": 21.83,
   "t2": 8.26,
   "t3": 3.67,
   "failed": 65.14
  },
  "G2_bear": {
   "n": 595,
   "t1": 28.07,
   "t2": 8.74,
   "t3": 3.19,
   "failed": 49.24
  },
  "G3_bull": {
   "n": 588,
   "t1": 27.55,
   "t2": 11.05,
   "t3": 5.95,
   "failed": 58.5
  },
  "G3_bear": {
   "n": 664,
   "t1": 33.28,
   "t2": 15.51,
   "t3": 6.33,
   "failed": 52.41
  },
  "G4_bull": {
   "n": 172,
   "t1": 21.51,
   "t2": 6.4,
   "t3": 1.16,
   "failed": 56.4
  },
  "G4_bear": {
   "n": 131,
   "t1": 16.79,
   "t2": 2.29,
   "t3": 0.76,
   "failed": 54.96
  }
 },
 "falseBreakoutPct": 13.45,
 "weekly": {
  "bull": {
   "is": {
    "n": 315,
    "mean": 1.68,
    "ci": [
     0.23,
     3.51
    ],
    "hit": 40.95
   },
   "oos": {
    "n": 100,
    "mean": 0.2,
    "ci": [
     -1.29,
     1.54
    ],
    "hit": 52
   }
  },
  "bear": {
   "is": {
    "n": 249,
    "mean": -0.2,
    "ci": [
     -1.42,
     1.05
    ],
    "hit": 55.42
   },
   "oos": {
    "n": 133,
    "mean": 0.55,
    "ci": [
     -0.71,
     1.49
    ],
    "hit": 51.88
   }
  }
 },
 "claims": {
  "C1": {
   "volHigh": {
    "is": {
     "n": 643,
     "mean": -1.2,
     "ci": [
      -2.04,
      -0.26
     ],
     "hit": 37.64
    },
    "oos": {
     "n": 168,
     "mean": -0.76,
     "ci": [
      -2,
      0.51
     ],
     "hit": 44.05
    }
   },
   "volLow": {
    "is": {
     "n": 540,
     "mean": -0.99,
     "ci": [
      -1.7,
      -0.24
     ],
     "hit": 38.7
    },
    "oos": {
     "n": 208,
     "mean": 0.03,
     "ci": [
      -1.05,
      1.24
     ],
     "hit": 46.63
    }
   }
  },
  "C2": {
   "withTrend": {
    "is": {
     "n": 572,
     "mean": -1.81,
     "ci": [
      -2.67,
      -0.9
     ],
     "hit": 36.19
    },
    "oos": {
     "n": 124,
     "mean": 0.69,
     "ci": [
      -0.67,
      2.23
     ],
     "hit": 54.84
    }
   },
   "counterTrend": {
    "is": {
     "n": 338,
     "mean": 0.17,
     "ci": [
      -0.87,
      1.49
     ],
     "hit": 41.72
    },
    "oos": {
     "n": 161,
     "mean": -1.39,
     "ci": [
      -2.63,
      -0.16
     ],
     "hit": 37.27
    }
   }
  },
  "C3": {
   "sweetSpot": {
    "is": {
     "n": 186,
     "mean": -0.91,
     "ci": [
      -2.41,
      0.84
     ],
     "hit": 39.25
    },
    "oos": {
     "n": 74,
     "mean": -0.2,
     "ci": [
      -2.3,
      2.08
     ],
     "hit": 41.89
    }
   },
   "outside": {
    "is": {
     "n": 672,
     "mean": -1.19,
     "ci": [
      -1.92,
      -0.39
     ],
     "hit": 36.9
    },
    "oos": {
     "n": 246,
     "mean": -0.77,
     "ci": [
      -1.8,
      0.25
     ],
     "hit": 43.09
    }
   }
  },
  "C5": {
   "pullback": {
    "is": {
     "n": 962,
     "mean": -0.62,
     "ci": [
      -1.25,
      0.02
     ],
     "hit": 38.98
    },
    "oos": {
     "n": 283,
     "mean": -0.46,
     "ci": [
      -1.23,
      0.35
     ],
     "hit": 44.17
    }
   }
  },
  "C6": {
   "withWarning": {
    "is": {
     "n": 184,
     "mean": -0.92,
     "ci": [
      -2.41,
      0.65
     ],
     "hit": 40.22
    },
    "oos": {
     "n": 43,
     "mean": -0.3,
     "ci": [
      -3.06,
      2.28
     ],
     "hit": 46.51
    }
   },
   "noWarning": {
    "is": {
     "n": 999,
     "mean": -1.14,
     "ci": [
      -1.73,
      -0.48
     ],
     "hit": 37.74
    },
    "oos": {
     "n": 333,
     "mean": -0.33,
     "ci": [
      -1.12,
      0.44
     ],
     "hit": 45.35
    }
   }
  }
 },
 "conclusion": "Không nhóm nào đạt: G2 và G3 không đạt (OOS TB âm), G1 và G4 thiếu mẫu OOS (n 19, 27). Cảnh báo giảm (H2) không đạt. Điểm số không xếp hạng được (H3). Mô phỏng lệnh OOS: PF 0,41. Mô hình giá chỉ để hiển thị (EXPERIMENTAL); danh sách xếp theo trạng thái, không theo điểm."
});
