import { loadItems } from "@/lib/data";
import Calendar from "../components/Calendar";

export default function CalendarPage() {
  // 有截止日期的条目都放进日历，活动按发布日期也放进去
  const items = loadItems().filter((i) => i.deadline || i.kind === "活动");
  return <Calendar items={items} />;
}
