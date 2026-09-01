import type { DataSource } from '../../../types/taVnIndex';

/** Badge nhỏ gắn nhãn HARD_DATA / ESTIMATED cạnh mọi số liệu định lượng. */
export function SourceBadge({ source }: { source: DataSource }) {
  const isEstimated = source === 'ESTIMATED';
  return (
    <span
      className={
        isEstimated
          ? 'ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/15 text-amber-400'
          : 'ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500/15 text-emerald-400'
      }
      title={isEstimated ? 'Giá trị ước tính từ mô hình' : 'Tính trực tiếp từ dữ liệu giá thật'}
    >
      {isEstimated ? 'ƯỚC TÍNH' : 'DỮ LIỆU THẬT'}
    </span>
  );
}
