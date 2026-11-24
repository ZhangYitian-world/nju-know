import { loadItems } from "@/lib/data";
import Board from "../components/Board";

export default function FeedPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-[var(--nju)]">NJU KNOW / 信息流</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">校园信息，一页看全</h1>
        <p className="mt-2 text-sm text-stone-500">浏览已收录的官网通知与公众号文章。</p>
      </div>
      <Board items={loadItems()} />
    </div>
  );
}
