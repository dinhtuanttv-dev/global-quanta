interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function GroupChip({ label, active, onClick }: ChipProps) {
  return (
    <div className={`sb-group-chip ${active ? 'active' : ''}`} onClick={onClick}>
      {label}
    </div>
  );
}

const GROUPS: { key: string; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'core', label: 'Core' },
  { key: 'ring', label: 'Ring' },
  { key: 'pinned', label: '📌 Đã ghim' },
  { key: 'highDividend', label: 'Cổ tức cao' },
  { key: 'highRisk', label: 'Rủi ro cao' },
  { key: 'similarCore', label: '≈ Tương đồng Core' },
];

interface ListProps {
  activeGroup: string;
  onChange: (key: string) => void;
}

export default function GroupChipList({ activeGroup, onChange }: ListProps) {
  return (
    <div className="sb-groups">
      {GROUPS.map((g) => (
        <GroupChip key={g.key} label={g.label} active={activeGroup === g.key} onClick={() => onChange(g.key)} />
      ))}
    </div>
  );
}
