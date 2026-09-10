// 訂位看板離線瀏覽用：只要之前連線時成功抓過一次資料，斷網後還能看上次抓到的資料（唯讀，不能操作）。
// 只在瀏覽器端用，伺服器端渲染時 window/localStorage 不存在，所有函式都要擋一下。

const PREFIX = "booking-board-cache:";

type CacheEntry<T> = { data: T; savedAt: number };

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function saveCache<T>(key: string, data: T) {
  if (!isBrowser()) return;
  try {
    const entry: CacheEntry<T> = { data, savedAt: Date.now() };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage 滿了或無痕模式擋寫入，離線快取只是加分功能，失敗就算了
  }
}

function loadCache<T>(key: string): CacheEntry<T> | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

// 抓資料時順便存一份快取；抓失敗（斷網／伺服器錯誤）就改用上次存的快取，
// 呼叫端可以用 fromCache 判斷要不要顯示「離線中」提示。完全沒有快取過的話就往外丟錯誤，
// 讓呼叫端維持原本的空狀態。
export async function fetchCached<T>(url: string, cacheKey: string): Promise<{ data: T; fromCache: boolean; savedAt: number | null }> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as T;
    saveCache(cacheKey, data);
    return { data, fromCache: false, savedAt: Date.now() };
  } catch {
    const cached = loadCache<T>(cacheKey);
    if (cached) return { data: cached.data, fromCache: true, savedAt: cached.savedAt };
    throw new Error("offline, no cache available for " + cacheKey);
  }
}
