import { getMealPeriod } from "@/lib/quote";

// 監控程式（島語 inline/EZTABLE、饗賓）用的客人需求參數檔。
// 需求看板的「下載參數檔」按鈕和 /api/monitor-file（監控程式直接抓）共用這裡，內容保證一樣。

type MonitorOption = {
  branch: string | null;
  bookingDate: string; // YYYY-MM-DD
  timeSlot: string | null;
  partySize: number | null;
  status: string;
};
export type MonitorRequest = {
  customerName: string | null;
  customerPhone: string | null;
  status: string;
  options: MonitorOption[];
};

const MEAL_ORDER = ["午餐", "下午茶", "晚餐", "都可"];
const customerName = (r: MonitorRequest) => (r.customerName || r.customerPhone || "客人").replace(/\s+/g, "");
const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// ── 島語：每行「客人 分店 日期 時段」 ──
const MONITOR_RESTAURANT = "島語";
const MONITOR_CITIES = ["台北", "台中", "桃園", "高雄"];
function monitorCity(branch: string | null) {
  const [restaurant, name = ""] = (branch ?? "").split("｜");
  if (restaurant !== MONITOR_RESTAURANT) return null;
  // 大巨蛋的分店名稱是「台北大巨蛋」，開頭也是台北，要先判斷，不然會被當成台北店
  if (name.includes("大巨蛋")) return "大巨蛋";
  return MONITOR_CITIES.find((c) => name.startsWith(c)) ?? null;
}
export function buildMonitorFile(requests: MonitorRequest[]) {
  // 每個候選一行，不合併；完全一樣的行只留一行
  const lines = new Map<string, string>();
  for (const r of requests) {
    if (r.status !== "pending") continue;
    const name = customerName(r);
    for (const o of r.options) {
      const city = o.status === "pending" ? monitorCity(o.branch) : null;
      if (!city) continue;
      const slot = getMealPeriod(o.timeSlot) ?? "都可";
      lines.set(`${name} ${city} ${shortDate(o.bookingDate)} ${slot}`, `${o.bookingDate} ${MEAL_ORDER.indexOf(slot)}`);
    }
  }
  const body = [...lines.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([text]) => text);
  return [
    "# 客人需求：每行「客人 分店 日期 時段」",
    "# 分店：台北 / 台中 / 桃園 / 高雄 / 大巨蛋（多間用 、 隔開，例如 台北、桃園）",
    "# 時段：午餐 / 下午茶 / 晚餐 / 都可，或具體時間如 17:30",
    "# 日期過了會自動不比對；訂到的客人直接刪掉那一行",
    ...body,
    "",
  ].join("\n");
}

// ── 饗賓：每行「客人 分店 日期 餐期 人數」 ──
// 系統分店（餐廳｜分店）→ 監控程式 STORES 的正式名稱＝把「｜」拿掉（旭集｜中茂店 → 旭集中茂店）。
// 饗賓的餐廳都放，新開的分店不用再改這裡，只要監控程式 STORES 有加那間店
const FEAST_RESTAURANTS = ["旭集", "饗饗", "饗AJOY"];
const feastBranch = (branch: string) => {
  const [restaurant, store] = branch.split("｜");
  return FEAST_RESTAURANTS.includes(restaurant) && store ? `${restaurant}${store}` : undefined;
};
export function buildFeastFile(requests: MonitorRequest[]) {
  const lines = new Map<string, string>();
  for (const r of requests) {
    if (r.status !== "pending") continue;
    const name = customerName(r);
    for (const o of r.options) {
      const branch = o.status === "pending" && o.branch ? feastBranch(o.branch) : undefined;
      if (!branch) continue;
      const meal = getMealPeriod(o.timeSlot) ?? "都可";
      // 2 位的需求寫成 2-3（饗賓 2、3 人的位子都可以給 2 位客人）
      const size = o.partySize === 2 ? "2-3" : o.partySize ? String(o.partySize) : "";
      lines.set([name, branch, shortDate(o.bookingDate), meal, size].filter(Boolean).join(" "), `${o.bookingDate} ${MEAL_ORDER.indexOf(meal)}`);
    }
  }
  const body = [...lines.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([text]) => text);
  return [
    "# 饗賓客人需求：每行「客人 分店 日期 餐期 人數」",
    "# 分店：旭集台中 / 旭集信義 / 旭集微風 / 旭集天母 / 旭集中茂 / 旭集竹北 / 旭集台南 / 旭集義享 / 饗AJOY / 饗饗（全名也可以）",
    "# 餐期：午餐 / 下午茶 / 晚餐 / 都可",
    "# 人數：可省略（旭集台中＝人數不限；其他分店會用 2 人去查）",
    "# 日期過了自動不比對；訂到的客人直接刪掉那一行",
    ...body,
    "",
  ].join("\n");
}
