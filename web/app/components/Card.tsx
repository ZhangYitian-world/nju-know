"use client";

import { useState } from "react";
import type { Item } from "@/lib/data";
import { CATEGORY_STYLE } from "@/lib/style";

function formatDate(item: Item) {
  const [, m, d] = item.date.split("-");
  return `${Number(m)}月${Number(d)}日${item.time ? ` ${item.time}` : ""}`;
}

export default function Card({ item }: { item: Item }) {
  const [broken, setBroken] = useState(false);
  const style = CATEGORY_STYLE[item.category];
  const Icon = style.icon;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="group mb-3 block break-inside-avoid overflow-hidden rounded-xl bg-white ring-1 ring-stone-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-stone-300"
    >
      {item.cover && !broken ? (
        // 微信图床有防盗链，必须不带 Referer 才能显示
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.cover}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="aspect-[2.35/1] w-full bg-stone-100 object-cover"
        />
      ) : (
        <div
          className="relative flex aspect-[2.35/1] w-full items-center justify-center overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${style.from}, ${style.to})` }}
        >
          <Icon className="absolute -right-3 -bottom-4 h-24 w-24 text-white/20" strokeWidth={1.5} />
          <span className="px-4 text-center text-lg font-bold tracking-widest text-white drop-shadow-sm">
            {item.organizer}
          </span>
        </div>
      )}
      <div className="space-y-2 p-3">
        <h3 className="text-[15px] leading-6 font-medium text-stone-800 group-hover:text-[var(--nju)]">
          {item.needsSignup && (
            <span className="mr-1.5 inline-block rounded bg-stone-100 px-1 align-[2px] text-[11px] leading-4 text-stone-500">
              报
            </span>
          )}
          {item.title}
        </h3>
        {item.summary && <p className="line-clamp-2 text-xs leading-5 text-stone-500">{item.summary}</p>}
        <div className="flex items-center gap-1.5 text-xs text-stone-500">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--nju)]" />
          {formatDate(item)}
          {item.deadline && <span className="ml-auto text-orange-600">截止 {item.deadline.slice(5)}</span>}
        </div>
        <span className="inline-block max-w-full truncate rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">
          {item.organizer}
        </span>
      </div>
    </a>
  );
}
