import type { CurrentWindowInfo } from '../../../types/taVnIndex';

/**
 * MOI (2026-09-17): Ribbon hien thi cua so Time Engine dang active NGAY
 * TREN chart gia - nguoi dung biet ngay hanh dong phu hop ma khong can
 * cuon xuong Vung 2.5 rieng. Chi hien khi co du lieu THAT (khong bia).
 */
export function CurrentWindowRibbon({ currentWindow }: { currentWindow: CurrentWindowInfo | null }) {
  if (!currentWindow) return null;
  const positive = currentWindow.avgReturn > 0;
  return (
    <div
      className="mb-2 flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11px]"
      style={{
        background: positive ? 'rgba(31,224,138,0.08)' : 'rgba(255,77,94,0.08)',
        borderColor: positive ? 'rgba(31,224,138,0.35)' : 'rgba(255,77,94,0.35)',
        color: positive ? '#1fe08a' : '#ff4d5e',
      }}
    >
      <span className="font-bold">⏱ Đang trong {currentWindow.windowId} ({currentWindow.label})</span>
      <span style={{ color: 'var(--text-dim, #94a3b8)' }}>
        · TB {positive ? '+' : ''}{currentWindow.avgReturn}% · thắng {Math.round(currentWindow.winRate * 100)}%
        {currentWindow.isLowSample && <span style={{ color: '#fbbf24' }}> · mẫu nhỏ (n={currentWindow.sampleSize})</span>}
      </span>
    </div>
  );
}
