import type { SimilarTo } from '../../types';

interface Props {
  similarTo: SimilarTo | null;
}

export default function SimilarToTag({ similarTo }: Props) {
  if (!similarTo) return null;
  return (
    <span
      className="sb-similar-tag"
      title={`Tương quan giá ~${similarTo.coeff} với ${similarTo.core} (Core) trong 3 tháng gần nhất`}
    >
      ≈ {similarTo.core} {similarTo.coeff}
    </span>
  );
}
