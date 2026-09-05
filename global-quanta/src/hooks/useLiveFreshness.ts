import { useState, useEffect } from "react";

// Tinh lai "X phut truoc" moi giay dua tren mot moc thoi gian co dinh (scannedAt),
// khong can goi lai API - chi la dong ho dem nguoc client-side thuan tuy.
export function useLiveFreshness(scannedAt: string | undefined): string {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!scannedAt) { setLabel(""); return; }

    const update = () => {
      const diffMs = Date.now() - new Date(scannedAt).getTime();
      const diffSec = Math.max(0, Math.floor(diffMs / 1000));
      if (diffSec < 60) { setLabel(`${diffSec} giay truoc`); return; }
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) { setLabel(`${diffMin} phut truoc`); return; }
      const diffHour = Math.floor(diffMin / 60);
      setLabel(`${diffHour} gio truoc`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [scannedAt]);

  return label;
}
