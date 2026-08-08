interface Props {
  pinned: boolean;
  onClick: () => void;
}

export default function PinIcon({ pinned, onClick }: Props) {
  return (
    <span
      className={`pin-icon ${pinned ? 'pinned-on' : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={pinned ? 'Bỏ ghim' : 'Ghim mã này'}
    >
      {pinned ? '📌' : '☆'}
    </span>
  );
}
