// SINH TỰ ĐỘNG bởi scripts/scanner-validate.mjs --write-constant (prereg SQ-prereg.md, SQ-v2-r1). KHÔNG sửa tay.
export const SCANNER_VALIDATION = Object.freeze({
 "prereg": "SQ-v2-r1",
 "status": "DONE",
 "ranAt": "2026-10-22",
 "sample": {
  "dates": 208,
  "from": "2022-07-21",
  "to": "2026-09-17",
  "symbols": 100,
  "avgNames": 96,
  "avgWithFa": 96
 },
 "primaryHorizon": 20,
 "isEnd": "2024-12-31",
 "verdicts": {
  "smartScore": "FAIL",
  "faScore": "FAIL",
  "taScore": "FAIL",
  "rsRating": "FAIL",
  "confluenceBoost": "FAIL",
  "riskAdjustedMomentum": "FAIL"
 },
 "ic": {
  "smartScore": {
   "5": {
    "is": {
     "mean": -0.0006,
     "lo": -0.0254,
     "hi": 0.0233,
     "dates": 123
    },
    "oos": {
     "mean": -0.0064,
     "lo": -0.0478,
     "hi": 0.0333,
     "dates": 85
    }
   },
   "10": {
    "is": {
     "mean": 0.0015,
     "lo": -0.028,
     "hi": 0.0297,
     "dates": 123
    },
    "oos": {
     "mean": -0.0112,
     "lo": -0.0605,
     "hi": 0.0369,
     "dates": 85
    }
   },
   "20": {
    "is": {
     "mean": 0.0042,
     "lo": -0.0335,
     "hi": 0.0374,
     "dates": 123
    },
    "oos": {
     "mean": -0.0157,
     "lo": -0.0808,
     "hi": 0.0455,
     "dates": 85
    }
   }
  },
  "faScore": {
   "5": {
    "is": {
     "mean": 0.0031,
     "lo": -0.0154,
     "hi": 0.0215,
     "dates": 123
    },
    "oos": {
     "mean": -0.0049,
     "lo": -0.0294,
     "hi": 0.0204,
     "dates": 85
    }
   },
   "10": {
    "is": {
     "mean": 0.0046,
     "lo": -0.0186,
     "hi": 0.0302,
     "dates": 123
    },
    "oos": {
     "mean": -0.006,
     "lo": -0.0334,
     "hi": 0.019,
     "dates": 85
    }
   },
   "20": {
    "is": {
     "mean": 0.0082,
     "lo": -0.0265,
     "hi": 0.0396,
     "dates": 123
    },
    "oos": {
     "mean": 0.0013,
     "lo": -0.0366,
     "hi": 0.0366,
     "dates": 85
    }
   }
  },
  "taScore": {
   "5": {
    "is": {
     "mean": -0.0082,
     "lo": -0.0412,
     "hi": 0.0233,
     "dates": 123
    },
    "oos": {
     "mean": -0.0081,
     "lo": -0.057,
     "hi": 0.0422,
     "dates": 85
    }
   },
   "10": {
    "is": {
     "mean": -0.0076,
     "lo": -0.0464,
     "hi": 0.0286,
     "dates": 123
    },
    "oos": {
     "mean": -0.0169,
     "lo": -0.081,
     "hi": 0.0425,
     "dates": 85
    }
   },
   "20": {
    "is": {
     "mean": -0.0132,
     "lo": -0.06,
     "hi": 0.0317,
     "dates": 123
    },
    "oos": {
     "mean": -0.0264,
     "lo": -0.1009,
     "hi": 0.0434,
     "dates": 85
    }
   }
  },
  "rsRating": {
   "5": {
    "is": {
     "mean": -0.0034,
     "lo": -0.0407,
     "hi": 0.0326,
     "dates": 123
    },
    "oos": {
     "mean": -0.0177,
     "lo": -0.0724,
     "hi": 0.037,
     "dates": 85
    }
   },
   "10": {
    "is": {
     "mean": 0.0026,
     "lo": -0.0443,
     "hi": 0.0434,
     "dates": 123
    },
    "oos": {
     "mean": -0.0317,
     "lo": -0.0977,
     "hi": 0.0308,
     "dates": 85
    }
   },
   "20": {
    "is": {
     "mean": 0.0062,
     "lo": -0.0457,
     "hi": 0.0551,
     "dates": 123
    },
    "oos": {
     "mean": -0.0421,
     "lo": -0.122,
     "hi": 0.0307,
     "dates": 85
    }
   }
  },
  "confluenceBoost": {
   "5": {
    "is": {
     "mean": -0.0053,
     "lo": -0.0321,
     "hi": 0.0209,
     "dates": 121
    },
    "oos": {
     "mean": -0.0012,
     "lo": -0.0401,
     "hi": 0.0389,
     "dates": 85
    }
   },
   "10": {
    "is": {
     "mean": 0.0031,
     "lo": -0.0313,
     "hi": 0.035,
     "dates": 121
    },
    "oos": {
     "mean": -0.0043,
     "lo": -0.0542,
     "hi": 0.0419,
     "dates": 85
    }
   },
   "20": {
    "is": {
     "mean": 0.009,
     "lo": -0.0328,
     "hi": 0.0526,
     "dates": 121
    },
    "oos": {
     "mean": 0.0004,
     "lo": -0.0614,
     "hi": 0.0534,
     "dates": 85
    }
   }
  },
  "riskAdjustedMomentum": {
   "5": {
    "is": {
     "mean": 0.0041,
     "lo": -0.0303,
     "hi": 0.0382,
     "dates": 123
    },
    "oos": {
     "mean": -0.0144,
     "lo": -0.0639,
     "hi": 0.0361,
     "dates": 85
    }
   },
   "10": {
    "is": {
     "mean": 0.0059,
     "lo": -0.0369,
     "hi": 0.0433,
     "dates": 123
    },
    "oos": {
     "mean": -0.0283,
     "lo": -0.0897,
     "hi": 0.0318,
     "dates": 85
    }
   },
   "20": {
    "is": {
     "mean": 0.0054,
     "lo": -0.0465,
     "hi": 0.0557,
     "dates": 123
    },
    "oos": {
     "mean": -0.0394,
     "lo": -0.113,
     "hi": 0.0292,
     "dates": 85
    }
   }
  }
 },
 "spreadTopBottomQuintile": {
  "5": {
   "is": -0.0018,
   "oos": 0.0009
  },
  "10": {
   "is": -0.0042,
   "oos": 0.0014
  },
  "20": {
   "is": -0.0092,
   "oos": 0.0023
  }
 }
});
