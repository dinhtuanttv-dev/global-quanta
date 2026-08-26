import { useState } from "react";
import SieuQuetAiTab from "./SieuQuetAI/SieuQuetAiTab";
import TaVnIndexTab from "./TaVnIndex/TaVnIndexTab";
import CotucTab from "./CoTuc/CotucTab";
import KetNoiTheGioiTab from "./KetNoiTheGioi/KetNoiTheGioiTab";
const TABS = ["Sieu quet AI", "Ket noi the gioi", "Loc nganh", "TA VN-Index", "Chat xuc tac", "Co tuc", "Elite 10"];
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
      {activeTab === "Co tuc" && <CotucTab />}
      {activeTab === "Ket noi the gioi" && <KetNoiTheGioiTab />}
      {activeTab !== "Sieu quet AI" && activeTab !== "TA VN-Index" && activeTab !== "Co tuc" && activeTab !== "Ket noi the gioi" && (
        <div className="main-placeholder">
          <b>Noi dung tab "{activeTab}" - chua component hoa</b>
          Se trien khai o cac buoc tiep theo, theo dung thu tu uu tienda thong nhat.
        </div>
      )}
    </div>
  );
}
