import { loadItems } from "@/lib/data";

export default function SourcesPage() {
  const counts = new Map<string, { channel: string; n: number; latest: string }>();
  for (const i of loadItems()) {
    const c = counts.get(i.organizer);
    if (c) {
      c.n++;
      if (i.date > c.latest) c.latest = i.date;
    } else {
      counts.set(i.organizer, { channel: i.channel, n: 1, latest: i.date });
    }
  }
  const rows = [...counts].sort((a, b) => b[1].n - a[1].n);

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">信息源</h1>
      <p className="mb-4 text-sm text-stone-500">
        共 {rows.length} 个发布单位。官网通知由爬虫抓取，公众号文章通过 WeRSS 获取。
      </p>
      <table className="w-full overflow-hidden rounded-xl bg-white text-sm ring-1 ring-stone-200">
        <thead className="bg-stone-50 text-left text-stone-500">
          <tr>
            <th className="px-3 py-2 font-normal">发布单位</th>
            <th className="px-3 py-2 font-normal">渠道</th>
            <th className="px-3 py-2 font-normal">条数</th>
            <th className="px-3 py-2 font-normal">最近更新</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, c]) => (
            <tr key={name} className="border-t border-stone-100">
              <td className="px-3 py-2">{name}</td>
              <td className="px-3 py-2 text-stone-500">{c.channel}</td>
              <td className="px-3 py-2">{c.n}</td>
              <td className="px-3 py-2 text-stone-500">{c.latest}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
