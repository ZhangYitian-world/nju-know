import { loadItems, loadOfficialSources, loadWechatSources, loadWechatHealth } from "@/lib/data";

export default function SourcesPage() {
  const sources = loadOfficialSources();
  const wechatSources = loadWechatSources();
  const health = loadWechatHealth();
  const wechatLabels: Record<string, string> = { auth_required: "登录需重新授权", verification_required: "需要微信验证", rate_limited: "请求受限，等待重试", network: "网络暂不可用", empty_result: "暂未取得文章", not_checked: "本轮待补采", collector_error: "采集暂不可用" };
  const statusLabels = { ok: "正常", partial: "部分栏目暂不可用", unavailable: "暂不可用" };
  const counts = new Map<string, { channel: string; n: number; latest: string }>();
  for (const i of loadItems().flatMap((item) => item.origins)) {
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
        共接入 {sources.length} 个官网来源{wechatSources.length > 0 ? `、${wechatSources.length} 个公众号来源` : ""}，当前展示 {rows.length} 个发布单位的内容。官网每 3 小时检查，公众号每天北京时间 08:30 检查。
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
      {wechatSources.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-base font-semibold">公众号来源与同步状态</h2>
          <p className="mb-3 text-xs leading-6 text-stone-500">
            下表为各公众号最近一次采集结果，文章日期为发布日期。采集端离线或来源暂不可用时保留已有内容；页面重新构建不代表来源重新采集。
            {health && ` 最近一轮新收录 ${health.new_count} 条；同一周期已成功检查的 ${health.resumed_sources} 个来源直接复用，未完成来源会在后续运行补采。`}
            登录失效与网络故障分别记录；超过 32 小时未成功采集时，页面会自动显示同步延迟。
          </p>
          <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200">
            <table className="w-full min-w-[640px] bg-white text-left text-sm">
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th className="px-3 py-2 font-normal">公众号</th>
                  <th className="px-3 py-2 font-normal">状态</th>
                  <th className="px-3 py-2 font-normal">本轮取得条数</th>
                  <th className="px-3 py-2 font-normal">最新文章日期</th>
                  <th className="px-3 py-2 font-normal">最近采集（北京时间）</th>
                </tr>
              </thead>
              <tbody>
                {wechatSources.map((source) => (
                  <tr key={source.name} className="border-t border-stone-100">
                    <td className="px-3 py-2">{source.name}</td>
                    <td className={`px-3 py-2 ${source.status === "ok" ? "text-emerald-700" : "text-amber-700"}`}>{source.status === "ok" ? "正常" : wechatLabels[source.error_reason || ""] || "暂不可用"}</td>
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
