import { useEffect, useRef, useState } from 'react';

/**
 * usePriceTick — mô phỏng WebSocket tick giá.
 * Cố ý KHÔNG đặt trong useAppStore (Zustand) để tránh mỗi tick giá làm
 * re-render toàn bộ Sidebar/Radar — chỉ component gọi hook này tự cập nhật.
 * Khi có backend thật: thay setInterval bằng subscribe qua WebSocketService.
 */
export function usePriceTick(basePrice: number, active = true): number {
  const [price, setPrice] = useState(basePrice);
  const baseRef = useRef(basePrice);

  useEffect(() => {
    baseRef.current = basePrice;
    setPrice(basePrice);
  }, [basePrice]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const jitter = (Math.random() - 0.5) * baseRef.current * 0.0006;
      setPrice((p) => Math.max(0, p + jitter));
    }, 2500);
    return () => clearInterval(id);
  }, [active]);

  return price;
}
