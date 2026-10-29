import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import SectionBoundary from "../shared/SectionBoundary";
import SieuQuetAiTab from "./SieuQuetAI/SieuQuetAiTab";
import TaVnIndexTab from "./TaVnIndex/TaVnIndexTab";
import CotucTab from "./CoTuc/CotucTab";
import KetNoiTheGioiTab from "./KetNoiTheGioi/KetNoiTheGioiTab";
import LocNganhTab from "./LocNganh/LocNganhTab";
import ChatXucTacTab from "./ChatXucTac/ChatXucTacTab";
import Elite10Tab from "../elite10/Elite10Hub";
import { TabNavigationContext } from "../../lib/TabNavigationContext";

const TABS = ["Sieu quet AI", "Ket noi the gioi", "Loc nganh", "TA VN-Index", "Chat xuc tac", "Co tuc", "Elite 10"];
const KNOWN_TABS = new Set(TABS);

export default function MainTabs() {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  // Tìm mã trên thanh trên -> mở tab Siêu Quét (bảng tự cuộn tới mã và mở chi tiết).
  const scannerFocus = useAppStore((s) => s.scannerFocus);
  useEffect(() => { if (scannerFocus) setActiveTab("Sieu quet AI"); }, [scannerFocus]);
  return (
    <TabNavigationContext.Provider value={setActiveTab}>
      <div className="main">
        <div className="main-tabs">
          {TABS.map((tab) => (
            <div
              key={tab}
              className={`m-tab ${tab === activeTab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </div>
          ))}
        </div>
        {/* Lỗi vẽ trong một tab chỉ hiện thẻ lỗi tại chỗ; đổi tab là tự thử lại. */}
        <SectionBoundary label={`tab ${activeTab}`} resetKey={activeTab}>
        {activeTab === "Sieu quet AI" && <SieuQuetAiTab />}
        {activeTab === "TA VN-Index" && <TaVnIndexTab />}
        {activeTab === "Chat xuc tac" && <ChatXucTacTab />}
        {activeTab === "Co tuc" && <CotucTab />}
        {activeTab === "Ket noi the gioi" && <KetNoiTheGioiTab />}
        {activeTab === "Loc nganh" && <LocNganhTab />}
        {activeTab === "Elite 10" && <Elite10Tab />}
        </SectionBoundary>
        {!KNOWN_TABS.has(activeTab) && (
          <div className="main-placeholder">
            <b>Noi dung tab "{activeTab}" - chua component hoa</b>
            Se trien khai o cac buoc tiep theo, theo dung thu tu uu tien da thong nhat.
          </div>
        )}
      </div>
    </TabNavigationContext.Provider>
  );
}
