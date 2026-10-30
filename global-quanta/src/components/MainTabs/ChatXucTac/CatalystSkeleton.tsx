function SkeletonBar({ width = "100%", height = 12 }: { width?: string; height?: number }) {
  return (
    <div style={{
      width, height, borderRadius: 4, background: "var(--bg-surface-2)",
      backgroundImage: "linear-gradient(90deg, var(--bg-surface-2) 0%, rgba(148,163,184,0.12) 50%, var(--bg-surface-2) 100%)",
      backgroundSize: "200% 100%", animation: "catalyst-shimmer 1.4s ease-in-out infinite",
    }} />
  );
}

export default function CatalystSkeleton() {
  return (
    <div style={{ marginTop: 10 }}>
      <style>{`@keyframes catalyst-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

      <SkeletonBar width="70%" height={14} />
      <div style={{ height: 12 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
            <SkeletonBar width="50%" height={11} />
            <div style={{ height: 8 }} />
            {[0, 1, 2].map((j) => (
              <div key={j} style={{ marginBottom: 6 }}><SkeletonBar height={14} /></div>
            ))}
          </div>
        ))}
      </div>

      {[0, 1, 2].map((i) => (
        <div key={i} style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <SkeletonBar width="30%" height={13} />
          <div style={{ height: 10 }} />
          <SkeletonBar height={40} />
        </div>
      ))}
    </div>
  );
}
