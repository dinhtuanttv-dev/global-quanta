"use client";
import { useCatalystData } from "../../../hooks/useCatalystData";
import { useCatalystSearch } from "../../../hooks/useCatalystSearch";
import { useLiveFreshness } from "../../../hooks/useLiveFreshness";
import SectorCard from "./SectorCard";
import MoversList from "./MoversList";
import UnmappedSectorsPanel from "./UnmappedSectorsPanel";

export default function ChatXucTacTab() {
  const { snapshot, noDataYet, isLoading, error } = useCatalystData();
  const { query, setQuery, filteredSectors, filteredEmerging } = useCatalystSearch(
    snapshot?.sectors ?? [], snapshot?.emerging ?? []
  );
  const freshnessLabel = useLiveFreshness(snapshot?.scannedAt);

  return (
    <div className="t1-toolbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 0 }}>
      <span className="t1-toolbar-title">CHAT XUC TAC - CATALYST ENGINE</span>

      {isLoading && <div className="t1-state-msg">Dang tai du lieu chat xuc tac...</div>}
      {error && <div className="t1-state-msg t1-error">Loi ket noi: {String(error)}</div>}
      {!isLoading && !error && noDataYet && (
        <div className="t1-state-msg">{noDataYet}</div>
      )}

      {snapshot && (
        <div style={{ marginTop: 10 }}>
          {snapshot.isStale && (
            <div style={{
              background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)",
              borderRadius: 8, padding: "6px 10px", fontSize: 10.5, color: "#fbbf24", marginBottom: 10,
            }}>
              ⚠ Du lieu cu ({snapshot.ageMinutes} phut truoc) - lan quet gan nhat co the da that bai.
            </div>
          )}

          <input
            type="text"
            placeholder="Tim theo ma co phieu hoac ten nganh..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%", padding: "7px 10px", marginBottom: 12, fontSize: 11.5,
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              borderRadius: 8, color: "var(--text-primary)", outline: "none",
            }}
          />

          <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-secondary)", marginBottom: 12, flexWrap: "wrap" }}>
            <span>Tich cuc: <b style={{ color: "var(--positive)" }}>{snapshot.totalBenefitCount}</b></span>
            <span>Tieu cuc: <b style={{ color: "var(--negative)" }}>{snapshot.totalHarmCount}</b></span>
            <span>Cap nhat: {freshnessLabel}</span>
          </div>

          <MoversList upMovers={snapshot.upMovers} downMovers={snapshot.downMovers} />

          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", margin: "16px 0 8px" }}>THEO NGANH</p>
          {filteredSectors.length === 0 && <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Khong tim thay ket qua phu hop.</p>}
          {filteredSectors.map((s) => <SectorCard key={s.sector} sector={s} />)}

          {filteredEmerging.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-bright)", margin: "16px 0 8px" }}>NGANH MOI NOI</p>
              {filteredEmerging.map((s) => <SectorCard key={s.sector} sector={s} />)}
            </>
          )}

          <UnmappedSectorsPanel />
        </div>
      )}
    </div>
  );
}
