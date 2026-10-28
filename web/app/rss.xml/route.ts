import { loadItems } from "@/lib/data";

export const dynamic = "force-static";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function GET() {
  const entries = loadItems()
    .slice(0, 100)
    .map(
      (i) => `    <item>
      <title>${esc(i.title)}</title>
      <link>${esc(i.url)}</link>
      <guid>${esc(i.url)}</guid>
      <category>${i.kind}/${i.category}</category>
      <author>${esc(i.organizer)}</author>
      <pubDate>${new Date(`${i.date}T00:00:00+08:00`).toUTCString()}</pubDate>
    </item>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>南大知道 NJU Know</title>
    <description>南京大学校园活动与通知聚合</description>
    <link>https://njuknow.zhangyitian.com/</link>
${entries}
  </channel>
</rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
