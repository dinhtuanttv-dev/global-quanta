export default function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button onClick={onRetry} style={{
      background: "rgba(148,163,184,0.1)", border: "1px solid var(--border)",
      borderRadius: 6, padding: "5px 14px", color: "var(--text-secondary)", fontSize: 11, fontWeight: 700,
      cursor: "pointer", marginTop: 8,
    }}>
      Thu tai lai
    </button>
  );
}
