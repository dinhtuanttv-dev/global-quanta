import { useAppStore } from './store/useAppStore';
import AuthGate from './components/AuthGate/AuthGate';
import TopBar from './components/TopBar/TopBar';
import MarketFeed from './components/MarketFeed';
import PanelResizer from './components/PanelResizer';
import MainTabs from './components/MainTabs/MainTabs';
import InsightPanel from './components/InsightPanel/InsightPanel';
import UndoToast from './components/shared/UndoToast';

export default function App() {
  const { toast, clearToast } = useAppStore();

  return (
    <AuthGate>
      <div className="app">
        <TopBar />
        <MainTabs />
        <PanelResizer />
        <InsightPanel />
        <MarketFeed />
      </div>
      {toast && <UndoToast message={toast.message} onUndo={toast.onUndo} onClose={clearToast} />}
    </AuthGate>
  );
}
