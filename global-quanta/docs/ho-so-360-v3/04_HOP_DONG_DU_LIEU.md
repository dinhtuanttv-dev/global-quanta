# 04 — Hợp đồng dữ liệu: ảnh chụp hồ sơ một mã

## 1. Vì sao cần

- Góc Tổng hợp hiện dựa vào ≥ 8 nguồn rời: `panel`, `panel/:ticker`, `decision`, `decision/:ticker`, `evidence`, `confluence/ledger`, `leadership/:t`, `impact/:t`, `ai-room/ledger`.
- Góc Doanh nghiệp tải cả `/api/market/universe` và `/api/market/securities` chỉ để biết sàn / bước giá cho Price Action.
- Mỗi nguồn có giờ cập nhật riêng, nên một trang có thể trộn hai phiên.

## 2. Endpoint mới (Q5)

`GET /api/elite/profile/:ticker` — chỉ đọc, ghép từ các dịch vụ **đã có** trên Gateway; không tính lại engine nào.

- **Bộ đệm:** theo (mã, phiên E1); `Cache-Control: public, max-age=300`.
- **Lỗi:** một nguồn lỗi → phần đó `null` + `missing[]`, không làm hỏng cả tài liệu.
- **Endpoint cũ:** giữ nguyên (tab 1, tab 3, Bộ lọc Elite vẫn dùng).

```ts
interface ProfileSnapshot {
  version: "HS360-v3";
  ticker: string;
  session: string;                 // phiên bảng E1
  builtAt: string;
  missing: string[];               // nguồn lỗi / thiếu, VD ["researchFeatures", "impact"]
  freshness: Record<string, string | null>;   // nguồn -> giờ / phiên dữ liệu

  header: {
    name: string | null; icb: { l1?: string; l2?: string; l3?: string; nameVi?: string } | null;
    close: number | null; changePct: number | null; exchange: string | null; tick: number | null;   // sàn + bước giá cho Price Action
    hl: { held: boolean; rank: number | null; cls: string | null; weight: number | null; lane: string | null; exitBufferLs: number | null;
          queue: { hlRank: number; code: string; reasonVi: string } | null; against: { rrgVi: string } | null } | null;
    warnings: { level: "warn" | "info"; textVi: string }[];
  };

  thesis: {                        // thẻ Luận điểm (02 §3) — dựng bằng luật, không AI
    strengths: { layer: LayerId; textVi: string; seal: Seal }[];      // ≤ 3
    risks: { kind: "EXIT_NEAR" | "FA_WARN" | "LIQUIDITY" | "INVERTED_SIGNAL"; textVi: string }[];   // ≤ 3
    nextEvent: { date: string; kindVi: string; source: string } | null;
    gap: { conds: { id: string; ok: boolean | null; text: string }[]; verdictVi: string } | null;   // chỉ khi ngoài danh mục
  };

  layers: Array<{                  // ma trận Lớp × Bằng chứng (02 §4)
    id: LayerId; labelVi: string; stateVi: string; direction: 1 | 0 | -1 | null;
    seal: Seal; sealSource: string; asOf: string | null;
  }>;

  signals: Array<{                 // góc Tín hiệu (03 §2)
    id: string; tab: string; labelVi: string; unit: string; value: number | null; nullReason: "SOURCE_MISSING" | "NOT_SCANNED" | null;
    pctUniverse: number | null; pctSector: number | null;
    tier: "A" | "B" | "C"; change: "up" | "down" | "none";
    sqs: number | null; trendTag: string | null; icRegimeNow: { regime: string; n: number; mean: number | null } | null;
    contribution: number | null;
  }>;
  outsideE2: { structure_stage: number | null; log_rvol: number | null };

  eliteScore: { rank: number; of: number; Z: number; alpha5Pct: number | null; pOutperform: number | null;
                flowMissing: boolean; contributions: { id: string; contribution: number }[] } | null;   // đối chứng

  price: { bars: [string, number][]; pivot: number | null; zone: [number, number] | null; stop: number | null } | null;   // 90 phiên, giá điều chỉnh (Q7)
}
type LayerId = "LEADERSHIP" | "TECHNICAL" | "SECTOR" | "FLOW" | "FUNDAMENTAL" | "WORLD_CATALYST" | "TIMING" | "LIQUIDITY" | "AI";
type Seal = "ĐẠT" | "MỘT PHẦN" | "THĂM DÒ" | "KHÔNG ĐẠT" | "ĐANG TÍCH LUỸ" | "CHƯA KIỂM ĐỊNH" | "MÔ TẢ";
```

## 3. Nguồn của từng trường

| Trường | Hàm / dịch vụ có sẵn |
|---|---|
| `header.hl`, `thesis.gap` | `decisionService.decision()` + `hlScores` / `hlGap` (cùng hàm giao diện đang dùng) |
| `thesis.risks` EXIT_NEAR | `exitTriggers` (chuyển hàm sang dùng chung FE/BE hoặc tính ở Gateway) |
| `layers[].seal` | E2 / EV-4 (`evidenceEvolution`), `evidenceRegistry()` (ER-v1, IMPACT_EVIDENCE), ARL-v1 |
| `signals` | `elitePanel.panel()` + `evidence()` + `evidence-evolution` |
| `pctSector` | phân vị trong nhóm ICB cấp 2 của chính bảng E1 phiên đó |
| `header.exchange / tick` | danh sách chứng khoán của Gateway (thay cho tải `/securities` ở trình duyệt) |
| `price` | chuỗi giá điều chỉnh (`adjustedCloses`), PZ từ `decision.hl.pz`, ngưỡng cắt lỗ từ sổ |

## 4. Quy tắc

- **Không nhìn trước:** mọi phần lấy đúng phiên `session`; nguồn khác phiên → ghi vào `freshness` và `missing`.
- **Không suy diễn dấu:** `seal` chỉ chép từ sổ bằng chứng; thiếu → "CHƯA KIỂM ĐỊNH".
- **Không lời khuyên:** `textVi` dựng từ mẫu câu cố định, kiểm bằng danh sách từ cấm ("mua ngay", "nên mua", "chắc chắn", "tối ưu"), như kiểm thử C1 buồng lái.
- **Kích thước:** mục tiêu ≤ 40 KB JSON (gzip).
