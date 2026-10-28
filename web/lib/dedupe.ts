import type { Category, Kind } from "./classify";

export type Channel = "官网" | "公众号";
export type Origin = { title: string; organizer: string; channel: Channel; url: string; date: string };
export type Item = {
  id: string; title: string; organizer: string; channel: Channel;
  kind: Kind; category: Category; date: string; time: string;
  cover: string; deadline: string; needsSignup: boolean; summary: string; url: string;
  origins: Origin[]; channels: Channel[];
};

export function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return value;
    url.hash = "";
    if (url.hostname.endsWith(".nju.edu.cn") || url.hostname === "mp.weixin.qq.com") url.protocol = "https:";
    const articlePath = /\/c\d+a\d+\/page|\/info\/\d+\/\d+\.|\/\d{8}\/i\d+\.html/.test(url.pathname);
    for (const key of [...url.searchParams.keys()]) {
      if (articlePath || /^(utm_|fbclid$|gclid$|scene$|chksm$|from$|isappinstalled$|clicktime$|enterid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch { return value; }
}

export function normalizedTitle(value: string): string {
  return value.normalize("NFKC").toLowerCase()
    .replace(/^\s*(?:[【\[]?转发[】\]]?[：:丨|\s]*)+/, "")
    .replace(/×/g, "x")
    .replace(/[\p{P}\p{Z}\s]/gu, "");
}

const SCOPED = /公示|名单|推免|复试|实施细则|招生目录|评定办法|评审结果|招聘公告/;
function organizerKey(value: string) { return normalizedTitle(value).replace(/^南京大学/, ""); }
function explicitScope(title: string, a: string, b: string): boolean {
  const keys = [organizerKey(a), organizerKey(b)].filter(k => k.length >= 3);
  return keys.some(k => title.includes(k));
}
function numbers(title: string) {
  return (title.match(/\d+|第[一二三四五六七八九十百]+[届期轮批场次]/g) ?? []).join("|");
}
function bigrams(value: string) { return new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, i) => value.slice(i, i + 2))); }

export function sameStory(a: Pick<Item, "title" | "url" | "organizer" | "date">, b: Pick<Item, "title" | "url" | "organizer" | "date">): boolean {
  if (canonicalUrl(a.url) === canonicalUrl(b.url)) return true;
  const x = normalizedTitle(a.title), y = normalizedTitle(b.title);
  const days = Math.abs(Date.parse(`${a.date}T00:00:00+08:00`) - Date.parse(`${b.date}T00:00:00+08:00`)) / 86400000;
  if (!Number.isFinite(days) || days > 7) return false;
  const scoped = SCOPED.test(x) || SCOPED.test(y);
  if (scoped && organizerKey(a.organizer) !== organizerKey(b.organizer) && !explicitScope(x, a.organizer, b.organizer)) return false;
  if (x === y) return true;
  // Fuzzy merging is restricted to near-identical event titles. Administrative
  // notices from different schools, dates/editions and loosely similar titles stay separate.
  if (scoped || Math.min(x.length, y.length) < 24 || numbers(x) !== numbers(y)) return false;
  let prefix = 0;
  while (prefix < Math.min(x.length, y.length) && x[prefix] === y[prefix]) prefix++;
  if (prefix < 10 || Math.min(x.length, y.length) / Math.max(x.length, y.length) < 0.85) return false;
  const bx = bigrams(x), by = bigrams(y);
  const common = [...bx].filter(pair => by.has(pair)).length;
  return (2 * common) / (bx.size + by.size) >= 0.9;
}

export function mergeStories(input: Item[]): Item[] {
  const groups: Item[][] = [];
  for (const item of input) {
    // Require agreement with the representative, avoiding transitive fuzzy chains.
    const group = groups.find(g => sameStory(g[0], item));
    if (group) group.push(item); else groups.push([item]);
  }
  return groups.map(group => {
    const sorted = [...group].sort((a, b) => Number(b.channel === "官网") - Number(a.channel === "官网") || b.date.localeCompare(a.date));
    const primary = sorted[0];
    const origins = [...new Map(sorted.flatMap(i => i.origins).map(origin => [canonicalUrl(origin.url) + "|" + origin.organizer, { ...origin, url: canonicalUrl(origin.url) }])).values()];
    return {
      ...primary, id: canonicalUrl(primary.url), url: canonicalUrl(primary.url), origins,
      channels: [...new Set(origins.map(o => o.channel))],
      cover: sorted.find(i => i.cover)?.cover ?? "",
      summary: sorted.find(i => i.summary)?.summary ?? "",
      deadline: sorted.find(i => i.deadline)?.deadline ?? "",
    };
  }).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}

export function cleanSummary(value: string): string {
  if (/^\s*(?:编辑|责编|责任编辑|审核|来源|供稿)\s*[|｜:：]/.test(value)) return "";
  return value.replace(/\s+/g, " ").trim();
}
