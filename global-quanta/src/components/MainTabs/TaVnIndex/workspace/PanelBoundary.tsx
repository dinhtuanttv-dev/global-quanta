"use client";
// A1 — cô lập lỗi theo từng panel của tab TA VN-Index: một panel lỗi khi hiển thị chỉ thay panel đó bằng khung báo lỗi + "Thử lại",
// phần còn lại (chart, dock, các bộ lọc khác) vẫn chạy. `resetKey` đổi (VD đổi mã / khung) -> tự thử lại với dữ liệu mới.
import { Component, type ReactNode } from "react";

interface Props { label: string; resetKey?: string; children: ReactNode; testid?: string }
interface State { error: Error | null; key: string | undefined }

export default class PanelBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { key: props.resetKey, error: null } : null;
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(`[TA] lỗi hiển thị "${this.props.label}"`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" data-testid={this.props.testid ?? "panel-error"} className="rounded-xl p-3 text-[10px] flex flex-wrap items-center gap-2"
        style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)" }}>
        <b className="text-red-300">Không hiển thị được {this.props.label}</b>
        <span className="text-red-400/70 font-mono truncate max-w-full">{this.state.error.message}</span>
        <span className="text-slate-500">Các phần khác của tab vẫn hoạt động.</span>
        <button type="button" className="ws-btn ws-btn-sm ml-auto" onClick={() => this.setState({ error: null })}>Thử lại</button>
      </div>
    );
  }
}
