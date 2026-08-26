import { useEffect, useState } from "react";
import CommandCenterBar from "./CommandCenterBar";
import Tang1Table from "./Tang1Table";
import { fetchTang1 } from "../../../services/tang1Api";
import type { Scenario, Tang1ApiResponse } from "../../../types/tang1";

export default function SieuQuetAiTab() {
  const [scenario, setScenario] = useState<Scenario>("growth");
  const [data, setData] = useState<Tang1ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"default" | "scenario">("default");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTang1(scenario)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scenario]);

  return (
    <div className="sieu-quet-ai-tab">
      <CommandCenterBar scenario={scenario} onScenarioChange={setScenario} />

      <div className="t1-toolbar">
        <span className="t1-toolbar-title">TANG 1: SIEU QUET AI - TOP 20 THEO FA &amp; EPS GROWTH</span>
        <button
          type="button"
          className={`t1-view-toggle ${viewMode === "scenario" ? "active" : ""}`}
          onClick={() => setViewMode((v) => (v === "default" ? "scenario" : "default"))}
        >
          {viewMode === "scenario" ? "Dang xem theo kich ban" : "Xem theo kich ban"}
        </button>
      </div>

      {loading && <div className="t1-state-msg">Dang tai du lieu Tang 1...</div>}
      {error && <div className="t1-state-msg t1-error">Khong tai duoc du lieu: {error}</div>}

      {!loading && !error && data && (
        <Tang1Table
          rows={viewMode === "scenario" ? data.tang1WithScenario : data.tang1Result}
          showScenarioScore={viewMode === "scenario"}
        />
      )}
    </div>
  );
}
