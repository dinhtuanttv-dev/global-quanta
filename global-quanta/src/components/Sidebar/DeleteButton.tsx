interface Props {
  onDelete: () => void;
}

export default function DeleteButton({ onDelete }: Props) {
  return (
    <span
      className="sb-del-btn"
      title="Xoá khỏi danh sách"
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
    >
      ✕
    </span>
  );
}
