import { useEffect, useRef, useState } from 'react';

/**
 * usePriceFlash — theo dõi biến động giá theo tick để tạo hiệu ứng
 * "flash" (nhấp nháy nền xanh/đỏ) mỗi khi giá trị thay đổi, giống
 * bảng điện tử Bloomberg/Refinitiv. Độc lập với usePriceTick — không
 * sửa đổi hook đó, tránh ảnh hưởng các nơi khác đang dùng chung.
 */
export type FlashDirection = 'up' | 'down' | null;

export function usePriceFlash(value: number): FlashDirection {
  const [flash, setFlash] = useState<FlashDirection>(null);
  const prevRef = useRef(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    if (value !== prev) {
      const dir: FlashDirection = value > prev ? 'up' : 'down';
      setFlash(dir);
      prevRef.current = value;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setFlash(null), 650);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value]);

  return flash;
}
