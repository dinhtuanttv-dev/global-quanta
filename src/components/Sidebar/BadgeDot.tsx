import type { StockTag } from '../../types';

interface Props {
  tag: StockTag;
}

/** Atom màu Core/Ring — tái sử dụng ở cả Sidebar lẫn Radar để giữ đồng bộ ý nghĩa màu. */
export default function BadgeDot({ tag }: Props) {
  const cls = tag === 'core' ? 'badge-core' : tag === 'ring' ? 'badge-ring' : 'badge-none';
  return <span className={`badge-dot-sb ${cls}`} />;
}
