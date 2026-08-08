interface Props {
  active: boolean;
  onToggle: () => void;
}

export default function SortToggleButton({ active, onToggle }: Props) {
  return (
    <div className={`sb-sort-btn ${active ? 'active' : ''}`} onClick={onToggle}>
      ⇅ Sắp xếp theo hội tụ
    </div>
  );
}
