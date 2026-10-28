import { loadItems, loadOfficialSources } from "@/lib/data";

export default function SourcesPage() {
  const sources = loadOfficialSources();
  const statusLabels = { ok: "正常", partial: "部分栏目暂不可用", unavailable: "暂不可用" };
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
        共接入 {sources.length} 个官网来源，当前展示 {rows.length} 个发布单位的内容。官网每 3 小时自动检查，公众号文章通过 WeRSS 获取。
      </p>
      {sources.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-base font-semibold">官网来源与更新状态</h2>
          <p className="mb-3 text-xs leading-6 text-stone-500">
            点击来源名称可查看原网站。文章日期为发布日期；有效条数已过滤过期内容，首页还会合并重复标题。
            来源暂时不可用时会保留未过期的旧内容。
          </p>
          <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200">
            <table className="w-full min-w-[640px] bg-white text-left text-sm">
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th className="px-3 py-2 font-normal">官网来源</th>
                  <th className="px-3 py-2 font-normal">状态</th>
                  <th className="px-3 py-2 font-normal">有效条数</th>
                  <th className="px-3 py-2 font-normal">最新文章日期</th>
                  <th className="px-3 py-2 font-normal">最近检查（北京时间）</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.name} className="border-t border-stone-100">
                    <td className="px-3 py-2">
                      <a href={source.pages[0]} target="_blank" rel="noreferrer" className="text-[var(--nju)] hover:underline">{source.name}</a>
                    </td>
                    <td className={`px-3 py-2 ${source.status === "ok" ? "text-emerald-700" : "text-amber-700"}`}>{statusLabels[source.status]}</td>
                    <td className="px-3 py-2">{source.item_count}</td>
                    <td className="px-3 py-2 text-stone-500">{source.latest_date || "—"}</td>
                    <td className="px-3 py-2 text-stone-500">{source.checked_at.slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <h2 className="mb-2 text-base font-semibold">已收录的发布单位</h2>
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
