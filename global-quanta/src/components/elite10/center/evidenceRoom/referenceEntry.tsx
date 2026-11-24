import { createRoot } from "react-dom/client";
import MainTabs from "../../../MainTabs/MainTabs";
import { roomReference } from "./referenceFixture";
import "../../../../styles/tailwind.css";
import "../../../../styles/tokens.css";
import "../../../../styles/App.css";

// Vite's production entry is index.html. This separate local page contains only simulation data.
if (import.meta.env.DEV) {
  createRoot(document.getElementById("root")!).render(
    <div className="app"><MainTabs roomReference={roomReference} /></div>,
  );
}
