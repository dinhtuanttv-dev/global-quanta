import { useState } from "react";
import SieuQuetAiTab from "./SieuQuetAI/SieuQuetAiTab";
import TaVnIndexTab from "./TaVnIndex/TaVnIndexTab";

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
      {activeTab !== "Sieu quet AI" && activeTab !== "TA VN-Index" && (
        <div className="main-placeholder">
          <b>Noi dung tab "{activeTab}" - chua component hoa</b>
          Se trien khai o cac buoc tiep theo, theo dung thu tu uu tien da thong nhat.
        </div>
      )}
    </div>
  );
}
