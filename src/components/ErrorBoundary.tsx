// ErrorBoundary - vas lo hong #8. Boc ngoai CotucTab, neu 1 ma du lieu
// hong (field undefined do sua tay sai) chi hien loi cuc bo, KHONG lam
// trang trang toan bo ung dung.

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode; fallbackLabel?: string; }
interface State { hasError: boolean; errorMessage: string | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)" }}
          className="rounded-2xl p-6 flex flex-col items-center gap-2 text-center">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <p className="text-sm font-bold text-red-300">{this.props.fallbackLabel ?? "Đã có lỗi xảy ra khi hiển thị dữ liệu"}</p>
          <p className="text-[10px] text-red-400/70 font-mono">{this.state.errorMessage}</p>
          <button onClick={() => this.setState({ hasError: false, errorMessage: null })}
            className="mt-2 text-[10px] text-red-300 border border-red-700 px-3 py-1 rounded-lg hover:bg-red-950/40">
            Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
