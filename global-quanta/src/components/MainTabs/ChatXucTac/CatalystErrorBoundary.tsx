import { Component } from "react";
import type { ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

// Error Boundary bat loi render bat ky component con nao (SectorCard, CatalystCardRow...)
// Chi bat loi RENDER, khong bat loi fetch API (loi fetch da xu ly rieng qua useCatalystData).
export default class CatalystErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[ChatXucTac] Loi render:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)",
          borderRadius: 10, padding: 16, textAlign: "center", marginTop: 10,
        }}>
          <p style={{ color: "var(--negative)", fontWeight: 700, fontSize: 12, margin: "0 0 8px" }}>
            Da co loi xay ra khi hien thi du lieu chat xuc tac.
          </p>
          <button onClick={() => this.setState({ hasError: false })}
            style={{
              background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.4)",
              borderRadius: 6, padding: "5px 14px", color: "var(--negative)", fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>
            Thu lai
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
