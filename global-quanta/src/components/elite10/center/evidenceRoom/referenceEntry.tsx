import { createRoot } from "react-dom/client";
import { ReferenceRoomHeader, ReferenceRoomIntro, ReferenceWorkspace } from "./roomView";
import { roomReference } from "./referenceFixture";
import "../../elite10.css";
import "../../../../styles/tailwind.css";
import "../../../../styles/tokens.css";
import "../../../../styles/App.css";

// Vite's production entry is index.html. This separate local page contains only simulation data.
if (import.meta.env.DEV) {
  const tabs = ["1. Bảng quyết định hôm nay", "2. Hồ sơ 360°", "3. Phòng họp AI", "4. Bằng chứng & sổ theo dõi", "5. Rủi ro danh mục"];
  createRoot(document.getElementById("root")!).render(
    <div className="elite10-hub eb-room-page eb-reference-page">
      <ReferenceRoomHeader />
      <div className="eb-shell">
        <ReferenceRoomIntro />
        <nav className="subnav" aria-label="Các tab Quyết định trong mẫu">
          {tabs.map((label, index) => <button key={label} type="button" className={index === 2 ? "active" : undefined}
            aria-current={index === 2 ? "page" : undefined} tabIndex={index === 2 ? 0 : -1}>{label}</button>)}
        </nav>
        <ReferenceWorkspace fixture={roomReference} />
      </div>
    </div>,
  );
}
