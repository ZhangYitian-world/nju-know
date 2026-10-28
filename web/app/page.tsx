import { loadItems } from "@/lib/data";
import Board from "./components/Board";

export default function Home() {
  return <Board items={loadItems()} />;
}
