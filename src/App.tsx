import { useAppStore } from './store/useAppStore';
import AuthGate from './components/AuthGate/AuthGate';
import TopBar from './components/TopBar/TopBar';
import Sidebar from './components/Sidebar/Sidebar';
import MainTabs from './components/MainTabs/MainTabs';
import InsightPanel from './components/InsightPanel/InsightPanel';
import UndoToast from './components/shared/UndoToast';

export default function App() {
  const { toast, clearToast } = useAppStore();

  return (
    <AuthGate>
      <div className="app">
        <TopBar />
        <Sidebar />
        <MainTabs />
        <InsightPanel />
      </div>
      {toast && <UndoToast message={toast.message} onUndo={toast.onUndo} onClose={clearToast} />}
    </AuthGate>
  );
}
