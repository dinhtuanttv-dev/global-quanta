import { useCallback, useEffect, useRef } from 'react';

// Vạch kéo giữa khu trung tâm và cột phải (Radar / Action Center): kéo sang trái/phải để đổi bề rộng
// cột phải mượt mà (cập nhật biến CSS trực tiếp trong requestAnimationFrame, không vẽ lại React khi kéo).
// Kéo hẳn sang phải (< 200px) = thu gọn cột phải; nhấn đúp = về mặc định 380px. Phím ←/→ chỉnh 24px,
// Home/End = rộng nhất / thu gọn. Bề rộng nhớ theo trình duyệt. Mặc định 380px (320px khi màn hình < 1440px).

export const INSIGHT_DEFAULT = 380;
/** Mặc định theo màn hình: laptop (< 1440px) cột phải hẹp hơn để Bảng giá 23 cột vừa khung. */
export const defaultInsightWidth = () => (typeof window !== 'undefined' && window.innerWidth < 1440 ? 320 : INSIGHT_DEFAULT);
export const INSIGHT_MIN = 280;
export const INSIGHT_COLLAPSE_AT = 200;
const KEY = 'gq.insightWidth';

export const insightMax = () => Math.max(INSIGHT_MIN, Math.min(720, Math.round(window.innerWidth * 0.45)));

/** Chuẩn hoá bề rộng: < ngưỡng thu gọn -> 0 (ẩn), còn lại kẹp trong [MIN, MAX]. */
export function clampInsightWidth(w: number): number {
  if (w < INSIGHT_COLLAPSE_AT) return 0;
  return Math.max(INSIGHT_MIN, Math.min(insightMax(), Math.round(w)));
}

export function readInsightWidth(): number {
  try {
    const v = Number(window.localStorage.getItem(KEY));
    if (window.localStorage.getItem(KEY) !== null && Number.isFinite(v)) return clampInsightWidth(v);
  } catch { /* bỏ qua */ }
  return defaultInsightWidth();
}

export function applyInsightWidth(app: HTMLElement | null, w: number) {
  if (!app) return;
  app.style.setProperty('--insight-w', `${w}px`);
  app.toggleAttribute('data-insight-collapsed', w === 0);
}

export default function PanelResizer() {
  const widthRef = useRef(defaultInsightWidth());
  const handleRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number | null>(null);
  const app = () => handleRef.current?.closest('.app') as HTMLElement | null;

  const commit = useCallback((w: number) => {
    widthRef.current = w;
    applyInsightWidth(app(), w);
    handleRef.current?.setAttribute('aria-valuenow', String(w));
    try { window.localStorage.setItem(KEY, String(w)); } catch { /* bỏ qua */ }
  }, []);

  useEffect(() => {
    commit(readInsightWidth());
    // Màn hình thu nhỏ: kẹp lại để cột phải không lấn hết khu trung tâm.
    const onResize = () => { if (widthRef.current) commit(clampInsightWidth(widthRef.current)); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [commit]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const root = app();
    root?.setAttribute('data-resizing', '');
    let next = widthRef.current;
    const onMove = (ev: PointerEvent) => {
      // Cột phải nằm bên phải vạch kéo: bề rộng = mép phải cửa sổ − vị trí con trỏ.
      const raw = window.innerWidth - ev.clientX;
      next = raw < INSIGHT_COLLAPSE_AT ? 0 : Math.max(INSIGHT_MIN, Math.min(insightMax(), raw));
      if (frame.current === null) {
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          applyInsightWidth(root, next);
        });
      }
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      root?.removeAttribute('data-resizing');
      commit(next);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const w = widthRef.current;
    if (e.key === 'ArrowLeft') { e.preventDefault(); commit(clampInsightWidth((w || INSIGHT_COLLAPSE_AT) + 24)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); commit(w <= INSIGHT_MIN ? 0 : clampInsightWidth(w - 24)); }
    else if (e.key === 'Home') { e.preventDefault(); commit(insightMax()); }
    else if (e.key === 'End') { e.preventDefault(); commit(0); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(w ? 0 : defaultInsightWidth()); }
  };

  return (
    <div
      ref={handleRef}
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Kéo để đổi bề rộng cột Radar / Action Center (nhấn đúp: về mặc định)"
      aria-valuemin={0}
      aria-valuemax={720}
      aria-valuenow={defaultInsightWidth()}
      tabIndex={0}
      title="Kéo sang trái/phải để đổi bề rộng · kéo hẳn sang phải để thu gọn · nhấn đúp: về mặc định"
      onPointerDown={onPointerDown}
      onDoubleClick={() => commit(widthRef.current === defaultInsightWidth() ? 0 : defaultInsightWidth())}
      onKeyDown={onKeyDown}
    >
      <span className="panel-resizer-grip" aria-hidden="true" />
    </div>
  );
}
