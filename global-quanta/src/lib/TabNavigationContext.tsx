import { createContext, useContext } from 'react';

/**
 * Giai Trinh Hoi Tu - Giai doan 4: cho phep component O SAU (VD
 * ConfluenceWaterfall, nam sau trong cay: MainTabs -> Elite10Tab ->
 * TaVnIndexPanel -> ConfluenceWaterfall) GOI NGUOC LEN de doi tab dang
 * chon O CAP MainTabs.tsx (activeTab la state cuc bo o do, khong co
 * Redux/global store) - tranh prop drilling qua nhieu lop.
 */
export const TabNavigationContext = createContext<((tabName: string) => void) | null>(null);

export function useTabNavigation(): ((tabName: string) => void) | null {
  return useContext(TabNavigationContext);
}
