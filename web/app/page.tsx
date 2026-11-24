import { loadItems } from "@/lib/data";
import Discovery from "./components/Discovery";

export default function Home() {
  return <Discovery items={loadItems()} />;
}
