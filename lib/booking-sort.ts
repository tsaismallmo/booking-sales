// 單據管理列表的排序：分店 → 日期 → 時段 → 訂位代號（都是由小到大，沒填的排最後）
const collator = new Intl.Collator("zh-Hant", { numeric: true });

type Sortable = { branch: string | null; bookingDate: string; timeSlot: string | null; bookingCode: string | null };

function cmp(a: string | null, b: string | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return collator.compare(a, b);
}

export function compareBookings(a: Sortable, b: Sortable) {
  return cmp(a.branch, b.branch) || cmp(a.bookingDate, b.bookingDate) || cmp(a.timeSlot, b.timeSlot) || cmp(a.bookingCode, b.bookingCode);
}
