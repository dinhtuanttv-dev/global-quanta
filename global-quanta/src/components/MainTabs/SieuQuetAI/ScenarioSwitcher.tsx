import type { Scenario } from "../../../types/tang1";

interface Props {
  value: Scenario;
  onChange: (s: Scenario) => void;
}

const OPTIONS: { key: Scenario; label: string }[] = [
  { key: "growth", label: "Tang truong" },
  { key: "cautious", label: "Than trong" },
  { key: "defensive", label: "Phong thu" },
];

export default function ScenarioSwitcher({ value, onChange }: Props) {
  return (
    <div className="scenario-switcher">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={`scenario-btn ${value === opt.key ? "active" : ""}`}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
