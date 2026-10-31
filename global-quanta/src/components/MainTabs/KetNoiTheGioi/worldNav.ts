import { createContext, useContext } from "react";

/** Mở tab Bằng chứng từ bất kỳ nhãn bằng chứng nào trong Trung tâm kinh tế thế giới. Ngoài trung tâm thì null và nhãn không bấm được. */
export const WorldNavContext = createContext<{ openEvidence: () => void } | null>(null);
export const useWorldNav = () => useContext(WorldNavContext);
