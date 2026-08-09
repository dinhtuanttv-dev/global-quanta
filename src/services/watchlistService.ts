const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function fetchWatchlist() {
  const res = await fetch(`${API_BASE}/api/watchlist`);
  if (!res.ok) throw new Error(`Watchlist API loi: ${res.status}`);
  return res.json();
}
