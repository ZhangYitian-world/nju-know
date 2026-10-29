"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarCheck, LayoutGrid, Newspaper, Pin, Search } from "lucide-react";
import { ACTIVITY_CATEGORIES, NOTICE_CATEGORIES, type Category, type Kind } from "@/lib/classify";
import type { Item } from "@/lib/data";
import { CATEGORY_STYLE } from "@/lib/style";
import Card from "./Card";

const GROUPS: { kind: Kind; icon: typeof Newspaper; categories: readonly Category[] }[] = [
  { kind: "活动", icon: CalendarCheck, categories: ACTIVITY_CATEGORIES },
  { kind: "通知", icon: Newspaper, categories: NOTICE_CATEGORIES },
];

// Tailwind 只能识别完整类名，所以列数用查表
const COLUMNS = {
  6: "grid-cols-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6",
  4: "grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
  2: "grid-cols-1 sm:grid-cols-2",
} as const;
type Cols = keyof typeof COLUMNS;

type Filter = { kind: Kind | null; category: Category | null };

export default function Board({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<Item["channel"] | null>(null);
  const [filter, setFilter] = useState<Filter>({ kind: null, category: null });
  const [cols, setCols] = useState<Cols>(4);

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (!channel || i.channels.includes(channel)) &&
        (!q || i.origins.some(o => o.title.toLowerCase().includes(q) || o.organizer.toLowerCase().includes(q))),
    );
  }, [items, query, channel]);

  const count = (kind: Kind | null, category: Category | null) =>
    matched.filter((i) => (!kind || i.kind === kind) && (!category || i.category === category)).length;

  // 置顶：截止日最近、且还没过期的一条
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const pinned = matched.filter((i) => i.deadline >= today && (!filter.kind || i.kind === filter.kind) && (!filter.category || i.category === filter.category)).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];

  const panels = filter.category
    ? [filter.category]
    : GROUPS.filter((g) => !filter.kind || g.kind === filter.kind).flatMap((g) => g.categories);

  const title = filter.category ?? filter.kind ?? "全部";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 basis-64 flex-1 items-center gap-2 rounded-xl bg-white px-4 py-3 ring-1 ring-stone-300 focus-within:ring-2 focus-within:ring-[var(--nju)]">
          <Search className="h-4 w-4 text-stone-400" />
          <input
            type="search"
            aria-label="搜索校园信息"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题、公众号、发布单位"
            className="w-full bg-transparent outline-none"
          />
        </label>
        <div className="flex shrink-0 rounded-xl bg-white p-1 ring-1 ring-stone-200">
          {([null, "官网", "公众号"] as const).map((c) => (
            <Pill key={c ?? "all"} on={channel === c} onClick={() => setChannel(c)}>
              {c ?? "全部来源"}
            </Pill>
          ))}
        </div>
      </div>

      {/* 分类导航：全部 | 活动 … | 通知 … */}
      <div className="space-y-2 sm:hidden">
        <nav aria-label="信息类型" className="flex gap-2">
          <Pill on={!filter.kind} onClick={() => setFilter({ kind: null, category: null })}>全部</Pill>
          {GROUPS.map((g) => <Pill key={g.kind} on={filter.kind === g.kind} onClick={() => setFilter({ kind: g.kind, category: null })}>{g.kind} {count(g.kind, null)}</Pill>)}
        </nav>
        <nav aria-label="详细分类" className="flex gap-1 overflow-x-auto pb-1 [&>button]:shrink-0">
          {GROUPS.filter(g => !filter.kind || g.kind === filter.kind).flatMap(g => g.categories.map(c => <Pill key={c} on={filter.category === c} onClick={() => setFilter({ kind: g.kind, category: c })}>{c}</Pill>))}
        </nav>
      </div>
      <nav className="hidden flex-wrap gap-3 sm:flex" aria-label="信息分类">
        <button
          onClick={() => setFilter({ kind: null, category: null })}
          className={`flex items-center gap-1.5 rounded-2xl px-4 py-3 text-sm ring-1 transition ${
            !filter.kind ? "bg-[var(--nju-light)] text-[var(--nju)] ring-[var(--nju)]/40" : "bg-white ring-stone-200"
          }`}
        >
          <LayoutGrid className="h-4 w-4" /> 全部
        </button>
        {GROUPS.map((g) => (
          <div key={g.kind} className="flex flex-wrap items-center gap-1 rounded-2xl bg-white px-2 py-1.5 ring-1 ring-stone-200">
            <Pill on={filter.kind === g.kind && !filter.category} onClick={() => setFilter({ kind: g.kind, category: null })}>
              <g.icon className="h-4 w-4" />
              <span className="font-medium">{g.kind}</span>
              <span className="text-xs opacity-60">{count(g.kind, null)}</span>
            </Pill>
            <span className="mx-1 h-4 w-px bg-stone-200" />
            {g.categories.map((c) => {
              const Icon = CATEGORY_STYLE[c].icon;
              return (
                <Pill key={c} on={filter.category === c} onClick={() => setFilter({ kind: g.kind, category: c })}>
                  <Icon className="h-3.5 w-3.5" />
                  {c}
                </Pill>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        <span className="rounded-md bg-stone-200/70 px-2 py-0.5 text-xs text-stone-600">
          {count(filter.kind, filter.category)}
        </span>
        {pinned && (
          <a
            href={pinned.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm text-rose-700 hover:underline"
          >
            <Pin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              即将截止（{pinned.deadline.slice(5)}）：{pinned.title}
            </span>
          </a>
        )}
        {([
          { visibility: "sm:hidden", divisor: 2 },
          { visibility: "hidden sm:block", divisor: 1 },
        ] as const).map(({ visibility, divisor }) => (
          <select
            key={divisor}
            aria-label="卡片列数"
            value={cols}
            onChange={(e) => setCols(Number(e.target.value) as Cols)}
            className={`${visibility} ml-auto rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-stone-200 outline-none`}
          >
            {([6, 4, 2] as const).map((value) => (
              <option key={value} value={value}>{value / divisor} 列</option>
            ))}
          </select>
        ))}
      </div>

      {filter.category && (
        <button
          onClick={() => setFilter({ kind: filter.kind, category: null })}
          className="flex items-center gap-1 text-sm text-stone-500 hover:text-[var(--nju)]"
        >
          <ArrowLeft className="h-4 w-4" /> 返回{filter.kind}
        </button>
      )}

      {panels.map((c) => {
        const list = matched.filter((i) => i.category === c && (!filter.kind || i.kind === filter.kind));
        if (list.length === 0) return null;
        const Icon = CATEGORY_STYLE[c].icon;
        const full = filter.category !== null;
        const preview = list.slice(0, cols * 2);
        return (
          <section key={c} className="board-panel" aria-label={`${c}分类`}>
            <header className="mb-3 flex items-center gap-2">
              <span className="rounded-full bg-stone-100 p-1.5">
                <Icon className="h-4 w-4 text-stone-600" />
              </span>
              <h2 className="text-lg font-semibold">{c}</h2>
              <span className="text-xs text-stone-500">{list.length}条</span>
              {!full && (
                <button
                  onClick={() => setFilter({ kind: list[0].kind, category: c })}
                  className="ml-auto flex items-center gap-1 text-xs text-stone-500 hover:text-[var(--nju)]"
                >
                  查看全部 {list.length} 条 <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </header>
              <div className={`grid ${COLUMNS[cols]} gap-4 items-stretch`}>
                {(full ? list : preview).map((i) => (
                  <Card key={i.id} item={i} />
                ))}
              </div>
          </section>
        );
      })}

      {matched.length === 0 && <p className="py-20 text-center text-stone-400">没有找到相关内容</p>}
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition ${
        on ? "bg-[var(--nju-light)] text-[var(--nju)]" : "text-stone-600 hover:bg-stone-100"
      }`}
    >
      {children}
    </button>
  );
}
