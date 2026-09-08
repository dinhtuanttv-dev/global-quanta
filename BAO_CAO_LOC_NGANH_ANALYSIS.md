# 📊 BÁO CÁO RÀ SOÁT TOÀN DIỆN - TAB "LỌC NGÀNH"
## Dự án: global-quanta-react_1 + quant-macro-scanner | **Ngày:** 2026-09-06

---

## 1. SƠ ĐỒ KIẾN TRÚC ARCHITECTURE DIAGRAM

### 1.1 Tổng Quan Luồng Dữ Liệu

```
┌────────────────────────────────────────────────────────────────────┐
│          FRONTEND (global-quanta-react_1) - Port: 5173           │
└────────────────────────────┬───────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────────┐
│  LocNganhTab.tsx │ │LocNganhPanel │ │ CycleScreenerPanel  │
│   (Main Tab)     │ │              │ │   ⚠️ COMPONENT      │
└────────┬─────────┘ └──────┬───────┘ └──────────┬───────────┘
         │                   │                    │
         └───────────────────┼────────────────────┘
                             ▼
                   ┌──────────────────┐
                   │   useAppStore    │
                   │   (Zustand)     │
                   └────────┬─────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
┌───────────────┐ ┌─────────────────┐ ┌───────────────┐
│useSectorRRG() │ │ useTop20Radar() │ │ (Other hooks) │
│ API: /api/    │ │ API: /api/      │ │               │
│ sector-filter │ │ sector-filter/   │ │               │
│ /rrg          │ │ top20           │ │               │
└───────┬───────┘ └───────┬─────────┘ └───────────────┘
        │                  │
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐
        │  SWR Cache +     │
        │  Fallback Logic  │
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐
        │ Vite Proxy       │
        │ localhost:3000   │
        └────────┬─────────┘
                 ▼
┌────────────────────────────────────────────────────────────────────┐
│          BACKEND (quant-macro-scanner) - Port: 3000              │
├────────────────────────────────────────────────────────────────────┤
│  /api/sector-filter/rrg    ──► RRG Calculator                   │
│  /api/sector-filter/top20  ──► Confluence Scorer                │
│                                                                    │
│  Dependencies:                                                     │
│  - lib/market-data/yahoo-finance-adapter.ts                      │
│  - lib/sector-filter/rrg/rrg-calculator.ts                      │
│  - lib/quant-data.ts (stock universe ~130 stocks)                │
└────────────────────────────────────────────────────────────────────┘
```

### 1.2 Chi Tiết Component Hierarchy

```
LocNganhTab (Main Container)
├── CycleScreenerPanel ⚙️ "Bộ Lọc Đa Tầng Chu Kỳ"
│   ├── Quadrant Buttons (Leading | Improving | Weakening | Lagging)
│   ├── RS Score Slider (0-100)
│   ├── Volume Score Slider (0-100)
│   └── Reset Button
│
└── LocNganhPanel 📊 "Ma Tran Vong Doi Nganh & RRG"
    ├── Quadrant Grid (2x2)
    │   ├── Leading (Dẫn đầu)
    │   ├── Improving (Cải thiện)
    │   ├── Weakening (Suy yếu)
---

## 2. RÀ SOÁT VÀ GIẢI THÍCH LỖI HIỂN THỊ

### 2.1 Kết Luận Quan Trọng

> ⚠️ **Component `CycleScreenerPanel` ĐƯỢC RENDER BÌNH THƯỜNG**
> 
> Sau khi rà soát kỹ lưỡng code, tôi xác nhận:
> - ✅ CycleScreenerPanel được import đúng (`LocNganhTab.tsx:6`)
> - ✅ CycleScreenerPanel được render đúng (`LocNganhTab.tsx:60-68`)
> - ✅ Không có CSS `display: none` hoặc `visibility: hidden`
> - ✅ Logic conditional rendering đúng nguyên tắc

### 2.2 Các Nguyên Nhân Có Thể Gây Lỗi

#### 🔴 Nguyên nhân 1: Backend API Timeout
**File:** `quant-macro-scanner/app/api/sector-filter/rrg/route.ts`
```typescript
export const maxDuration = 10;  // ⚠️ CHỈ 10 GIÂY!
```
- Yahoo Finance API fetch dữ liệu 6 tháng cho 9 tickers trong 10s có thể không đủ
- Hậu quả: API trả về 502/500 error → SWR fallback về mock data

#### 🔴 Nguyên nhân 2: Sector Keys Mismatch (CRITICAL)
**Backend** uses: `"BANKING"`, `"REAL_ESTATE"`, `"STEEL"`, `"TECH"`
**Frontend Mock Data** uses: `"banking"`, `"real_estate"`, `"steel"`, `"technology"`

- **Vấn đề:** Inconsistent sector key naming
- **Hậu quả:** Filter theo sector không hoạt động khi dùng mock data

#### 🟡 Nguyên nhân 3: CSS Container Missing
**File:** `src/styles/App.css` - KHÔNG CÓ CSS cho `.loc-nganh-tab`

---

## 3. LỖ HỔNG VÀ ĐIỂM NGHẼN

### 3.1 Performance Issues

| Issue | Severity | Description |
|-------|----------|-------------|
| API Timeout | 🔴 HIGH | maxDuration=10s quá ngắn |
| No Pagination | 🟡 MEDIUM | Fetch tất cả ~130 stocks |
| SWR Deduping | 🟡 MEDIUM | 15 phút dedupingInterval |
| No Cache Headers | 🟡 MEDIUM | Không set Cache-Control |

### 3.2 Security Concerns

| Issue | Severity |
|-------|----------|
| No Rate Limiting | 🔴 HIGH |
| No Auth on API | 🟡 MEDIUM |

---

## 4. ĐỀ XUẤT GIẢI PHÁP NÂNG CẤP

### 4.1 Fix CSS Container (Ngay lập tức)
```css
.loc-nganh-tab {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 400px;
}
```

### 4.2 Fix Sector Keys Consistency
```typescript
export const SECTOR_KEYS = {
  BANKING: 'banking',
  REAL_ESTATE: 'real_estate',
  STEEL: 'steel',
  TECH: 'technology',
  RETAIL: 'retail',
  SECURITIES: 'securities',
  OIL_GAS: 'oil_gas',
  SHIPPING: 'shipping',
} as const;
```

### 4.3 Tăng Backend Timeout
```typescript
export const maxDuration = 30; // TỪ 10 LÊN 30 GIÂY
```

---

## 5. CHECKLIST TRIỂN KHAI

### Immediate (1-2 giờ)
- [ ] Thêm CSS cho `.loc-nganh-tab`
- [ ] Standardize sector keys
- [ ] Tăng maxDuration lên 30s

### Short-term (1-2 ngày)
- [ ] Implement Redis caching
- [ ] Thêm rate limiting
- [ ] Thêm loading skeleton

### Long-term (1-2 tuần)
- [ ] WebSocket real-time updates
- [ ] Pagination cho Top 20
- [ ] Quadrant chart visualization
- [ ] Setup Sentry monitoring

---

## 6. KẾT LUẬN

**KHÔNG CÓ bug rõ ràng** khiến CycleScreenerPanel không hiển thị.

### Các khả năng cao nhất:
1. Backend timeout → fallback data
2. Sector key mismatch → filter không hoạt động
3. CSS override → layout issues

### Ưu tiên:
1. Tăng maxDuration + standardize sector keys
2. Thêm CSS container
3. Implement caching

**Document Version:** 1.0  
**Analyst:** Cline AI Agent  
**Status:** ✅ Analysis Complete
    │   └── Lagging (Tụt hậu)
    │
    └── Radar Top 20 Table
        └── Stock Rows (Ticker, Sector, RRG, RS, Vol, Confluence)
```

---
