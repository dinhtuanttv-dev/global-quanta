interface Props {
  reason: string | null;
  onEdit: () => void;
}

export default function ReasonTag({ reason, onEdit }: Props) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  if (!reason) {
    return (
      <span className="sb-add-reason" onClick={handleClick}>
        + thêm ghi chú
      </span>
    );
  }
  return (
    <span className="sb-reason-tag" onClick={handleClick}>
      {reason}
    </span>
  );
}
