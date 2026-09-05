import { useState } from "react";
import SieuQuetAiTab from "./SieuQuetAI/SieuQuetAiTab";
import TaVnIndexTab from "./TaVnIndex/TaVnIndexTab";
import CotucTab from "./CoTuc/CotucTab";
import KetNoiTheGioiTab from "./KetNoiTheGioi/KetNoiTheGioiTab";
import LocNganhTab from "./LocNganh/LocNganhTab";
import ChatXucTacTab from "./ChatXucTac/ChatXucTacTab";
import { TaVnIndexTab as Elite10Tab } from "../elite10/TaVnIndexTab";

const TABS = ["Sieu quet AI", "Ket noi the gioi", "Loc nganh", "TA VN-Index", "Chat xuc tac", "Co tuc", "Elite 10"];
const KNOWN_TABS = new Set(TABS);

export default function MainTabs() {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  return (
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
      {activeTab === "Sieu quet AI" && <SieuQuetAiTab />}
      {activeTab === "TA VN-Index" && <TaVnIndexTab />}
      {activeTab === "Chat xuc tac" && <ChatXucTacTab />}
      {activeTab === "Co tuc" && <CotucTab />}
      {activeTab === "Ket noi the gioi" && <KetNoiTheGioiTab />}
      {activeTab === "Loc nganh" && <LocNganhTab />}
      {activeTab === "Elite 10" && <Elite10Tab />}
      {!KNOWN_TABS.has(activeTab) && (
        <div className="main-placeholder">
          <b>Noi dung tab "{activeTab}" - chua component hoa</b>
          Se trien khai o cac buoc tiep theo, theo dung thu tu uu tien da thong nhat.
        </div>
      )}
    </div>
  );
}
