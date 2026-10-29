// Hàng rào lỗi theo VÙNG giao diện (30/10/2026): một thành phần lỗi khi vẽ chỉ hiện thẻ lỗi tại chỗ (kèm "Thử lại" / "Tải lại trang"),
// không làm React gỡ cả ứng dụng (trước đây: một lỗi ở bất kỳ tab nào = cả trang tối đen, không còn thanh trên / tab).
import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; label: string; resetKey?: unknown; compact?: boolean }
interface State { error: Error | null }

export default class SectionBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(`[SectionBoundary] ${this.props.label}:`, error, info?.componentStack);
    try { localStorage.setItem("gq.lastUiError", JSON.stringify({ at: new Date().toISOString(), label: this.props.label, message: String(error?.message ?? error).slice(0, 300) })); } catch { /* bỏ qua */ }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" data-testid="section-error" style={{ margin: 8, padding: this.props.compact ? 8 : 14, borderRadius: 10, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", fontSize: 12 }}>
        <b>⚠ Không hiển thị được {this.props.label}.</b>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, opacity: 0.8, margin: "4px 0 8px", wordBreak: "break-word" }}>{this.state.error.message}</div>
        <button type="button" onClick={() => this.setState({ error: null })} style={{ marginRight: 8, padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.5)", background: "transparent", color: "#fecaca", cursor: "pointer" }}>Thử lại</button>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#cbd5e1", cursor: "pointer" }}>Tải lại trang</button>
      </div>
    );
  }
}
