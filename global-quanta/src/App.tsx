import { useAppStore } from './store/useAppStore';
import AuthGate from './components/AuthGate/AuthGate';
import TopBar from './components/TopBar/TopBar';
import MarketFeed from './components/MarketFeed';
import PanelResizer from './components/PanelResizer';
import MainTabs from './components/MainTabs/MainTabs';
import InsightPanel from './components/InsightPanel/InsightPanel';
import UndoToast from './components/shared/UndoToast';
import SectionBoundary from './components/shared/SectionBoundary';
import GatewayStatusBanner from './components/shared/GatewayStatusBanner';

export default function App() {
  const { toast, clearToast } = useAppStore();

  return (
    <>
    <AuthGate>
      <div className="app">
        <SectionBoundary label="thanh trên cùng" compact><TopBar /></SectionBoundary>
        <SectionBoundary label="khu vực tab chính"><MainTabs /></SectionBoundary>
        <PanelResizer />
        <SectionBoundary label="cột phải (Radar · tin tức)"><InsightPanel /></SectionBoundary>
        <SectionBoundary label="luồng giá" compact><MarketFeed /></SectionBoundary>
      </div>
      {toast && <UndoToast message={toast.message} onUndo={toast.onUndo} onClose={clearToast} />}
    </AuthGate>
    {/* Thông báo chung khi máy chủ dữ liệu gián đoạn — ngoài AuthGate để cả màn hình đăng nhập cũng thấy. */}
    <GatewayStatusBanner />
    </>
  );
}
