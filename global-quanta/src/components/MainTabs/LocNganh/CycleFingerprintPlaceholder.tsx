export default function CycleFingerprintPlaceholder() {
  return (
    <div className="panel-block" style={{ padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>??</div>
      <h3 style={{ color: "var(--gold)", marginBottom: 8 }}>Cycle Fingerprint & Phan Cum Chu Ky Gia</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: 13, maxWidth: 480, margin: "0 auto 16px" }}>
        Tinh nang dang trong giai doan phat trien Backend (thuat toan DTW/HDBSCAN
        de tim cac chu ky gia lich su tuong tu). Frontend da san sang, dang cho
        Backend Project A hoan thien truoc khi kich hoat du lieu that.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, textAlign: "left", maxWidth: 520, margin: "0 auto" }}>
        {[
          "So khop chu ky gia lich su (Top-K Similarity)",
          "Phan cum mo hinh (Cluster Gallery)",
          "Diem chat luong tin hieu (Quality Score)",
          "Mo phong Monte Carlo",
          "Du bao thoi diem (Timing Forecast)",
          "Ca nhan hoa trong so tin hieu",
        ].map((feature) => (
          <div key={feature} style={{
            fontSize: 11, color: "var(--text-tertiary)", padding: "6px 10px",
            background: "var(--bg-surface-2)", borderRadius: 6,
          }}>
            ? {feature}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 16, fontSize: 10, color: "var(--text-tertiary)",
        padding: "8px 12px", background: "var(--bg-surface-2)", borderRadius: 8,
        display: "inline-block",
      }}>
        ? Trang thai: Cho Backend (DTW/HDBSCAN Engine chua trien khai o Project A)
      </div>
    </div>
  );
}