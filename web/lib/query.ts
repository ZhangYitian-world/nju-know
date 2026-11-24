import { ACTIVITY_CATEGORIES } from "./classify";
import type { Item } from "./dedupe";

export type RequestCriteria = {
  date: string;
  category: string;
  weekday: number | null;
  afterTime: string;
  campus: string;
  keywords: string[];
  count: number;
};

const WEEKDAYS: [RegExp, number][] = [
  [/(?:星期|周|礼拜)日|星期天|周天/, 0],
  [/(?:星期|周|礼拜)一/, 1],
  [/(?:星期|周|礼拜)二/, 2],
  [/(?:星期|周|礼拜)三/, 3],
  [/(?:星期|周|礼拜)四/, 4],
  [/(?:星期|周|礼拜)五/, 5],
  [/(?:星期|周|礼拜)六/, 6],
];

export function parseRequest(input: string, now = new Date()): RequestCriteria {
  let rest = input.normalize("NFKC");
  const nextWeek = /下(?:周|星期|礼拜)/.test(rest);
  const weekdayMatch = WEEKDAYS.find(([pattern]) => pattern.test(rest));
  if (weekdayMatch) rest = rest.replace(weekdayMatch[0], " ");

  let date = "";
  if (weekdayMatch) {
    const shanghaiDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const target = new Date(`${shanghaiDay}T00:00:00Z`);
    target.setUTCDate(target.getUTCDate() - (target.getUTCDay() + 6) % 7 + (weekdayMatch[1] + 6) % 7 + (nextWeek ? 7 : 0));
    date = target.toISOString().slice(0, 10);
    rest = rest.replace(/^[本这下]\s*/, " ");
  }
  let afterTime = "";
  const timeMatch = rest.match(/(?:下午|午后|傍晚)?[\s，,]*(\d{1,2})(?::(\d{2})|点(?:半|(\d{1,2})分?)?)[\s，,]*(?:以后|之后|往后|后|以后都可以)/);
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] ?? (timeMatch[3] === "半" ? 30 : timeMatch[3] || 0));
    if (/(下午|午后|傍晚)/.test(timeMatch[0]) && hour < 12) hour += 12;
    afterTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    rest = rest.replace(timeMatch[0], " ");
  } else {
    const afterHour = rest.match(/(?:下午|午后|傍晚)\s*(\d{1,2})\s*点(?:钟)?\s*(?:之后|以后|后)/);
    if (afterHour) {
      const hour = Number(afterHour[1]) < 12 ? Number(afterHour[1]) + 12 : Number(afterHour[1]);
      afterTime = `${String(hour).padStart(2, "0")}:00`;
      rest = rest.replace(afterHour[0], " ");
    }
  }

  const campusMatch = rest.match(/(鼓楼|仙林|苏州|浦口)\s*(?:校区)?/);
  const campus = campusMatch?.[1] ?? "";
  if (campusMatch) rest = rest.replace(campusMatch[0], " ");

  const category = ACTIVITY_CATEGORIES.find((label) => rest.includes(label)) ?? "";
  if (category) rest = rest.replace(category, " ");
  rest = rest.replace(/(?:下午|午后|傍晚|上午|晚上)?\s*\d{1,2}(?::\d{2}|点(?:半|\d{1,2}分?)?)\s*(?:才下课|之后|以后|往后|后|以后都可以)/g, " ");
  rest = rest.replace(/想听|听个|才下课|下课早?|本周|这周|下周|最近|之后|以后|下午|上午|晚上|傍晚|活动|找一下|帮我|最好|想要|想参加|想找个|不用报名|有什么|有没有|可以|的|在|校区|才|个|点/g, " ");
  const keywords = rest.split(/[\s，,。.!！?？、]+/).map((word) => word.trim()).filter((word) => word.length > 1);
  return { date, category, weekday: weekdayMatch?.[1] ?? null, afterTime, campus, keywords, count: Number(Boolean(weekdayMatch)) + Number(Boolean(afterTime)) + Number(Boolean(campus)) + Number(Boolean(category)) };
}

type Fact = { label: string; state: "yes" | "unknown" | "no" };
export function inspectActivity(item: Item, criteria: RequestCriteria): { confirmed: boolean; conflicts: string[]; facts: Fact[] } {
  const facts: Fact[] = [];
  const conflicts: string[] = [];
  if (criteria.category && item.category !== criteria.category) conflicts.push("category");
  const conditions = [
    { key: "date", label: "举办日期", wanted: criteria.date },
    { key: "start", label: "开始时间", wanted: criteria.afterTime },
    { key: "campus", label: "举办校区", wanted: criteria.campus },
  ] as const;
  for (const { key, label, wanted } of conditions) {
    if (!wanted) continue;
    const field = item.schedule?.[key];
    if (!field) {
      facts.push({ label: `${label}待核对`, state: "unknown" });
    } else if (key === "start" ? field.value >= wanted : field.value === wanted) {
      facts.push({ label: `${label} ${field.value}（原文：${field.quote}）`, state: "yes" });
    } else {
      conflicts.push(key);
    }
  }
  const searchText = `${item.title} ${item.summary} ${item.organizer}`.toLocaleLowerCase();
  for (const keyword of criteria.keywords) {
    if (!searchText.includes(keyword.toLocaleLowerCase())) conflicts.push(keyword);
  }

  return { confirmed: facts.length > 0 && facts.every((fact) => fact.state === "yes"), conflicts, facts };
}
