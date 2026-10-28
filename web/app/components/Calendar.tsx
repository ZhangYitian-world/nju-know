"use client";

import { useState } from "react";
import type { Item } from "@/lib/data";

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function Calendar({ items }: { items: Item[] }) {
  const [cursor, setCursor] = useState(() => {
    // 默认显示最近一条活动所在的月份，数据不是最新时也不至于一片空白
    const latest = items.map((i) => i.deadline || i.date).sort().at(-1);
    const d = latest ? new Date(latest) : new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const byDay = new Map<string, Item[]>();
  for (const i of items) {
    const day = i.deadline || i.date;
    byDay.set(day, [...(byDay.get(day) ?? []), i]);
  }

  const first = new Date(cursor.y, cursor.m, 1);
  const offset = (first.getDay() + 6) % 7; // 周一为一周第一天
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  const move = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => move(-1)} className="rounded border border-stone-300 bg-white px-2">‹</button>
        <h1 className="text-lg font-semibold">{cursor.y} 年 {cursor.m + 1} 月</h1>
        <button onClick={() => move(1)} className="rounded border border-stone-300 bg-white px-2">›</button>
        <span className="text-xs text-stone-500">橙色为截止日，紫色为活动发布日</span>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-stone-200 ring-1 ring-stone-200">
        {WEEK.map((w) => (
          <div key={w} className="bg-stone-50 py-1 text-center text-xs text-stone-500">{w}</div>
        ))}
        {cells.map((d, idx) => {
          const key = d ? `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}` : `blank-${idx}`;
          const list = d ? byDay.get(key) ?? [] : [];
          return (
            <div key={key} className="min-h-24 bg-white p-1">
              {d && <div className="text-xs text-stone-400">{d}</div>}
              {list.map((i) => (
                <a
                  key={i.id}
                  href={i.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`${i.organizer}：${i.title}`}
                  className={`mt-1 block truncate rounded px-1 text-[11px] ${
                    i.deadline ? "bg-orange-50 text-orange-700" : "bg-[var(--nju-light)] text-[var(--nju)]"
                  }`}
                >
                  {i.title}
                </a>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
