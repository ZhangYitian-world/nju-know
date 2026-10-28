"use client";

import { useState } from "react";
import { ArrowUpRight, Layers } from "lucide-react";
import type { Item } from "@/lib/data";
import { CATEGORY_STYLE } from "@/lib/style";

function formatDate(item: Item) {
  const [, m, d] = item.date.split("-");
  return `${Number(m)}月${Number(d)}日${item.time ? ` ${item.time}` : ""}`;
}

export default function Card({ item }: { item: Item }) {
  const [broken, setBroken] = useState(false);
  const Icon = CATEGORY_STYLE[item.category].icon;
  return (
    <article className="notice-card">
      <a href={item.url} target="_blank" rel="noreferrer" className="notice-card-main" title={item.title}>
        <div className="notice-cover">
          {item.cover && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
          ) : (
            <div className="notice-placeholder">
              <span className="notice-campus">南京大学</span>
              <span className="notice-organizer">{item.organizer.replace(/^南京大学/, "")}</span>
              <Icon aria-hidden="true" className="notice-watermark" strokeWidth={1.2} />
            </div>
          )}
          <span className="notice-channel">{item.channels.join(" / ")}</span>
          <ArrowUpRight aria-hidden="true" className="notice-open" />
        </div>
        <div className="notice-body">
          <h3 className="notice-title">{item.title}</h3>
          <p className="notice-summary">{item.summary}</p>
          <div className="notice-meta">
            <time dateTime={item.date}>{formatDate(item)}</time>
            {item.deadline && <span className="notice-deadline">截止 {item.deadline.slice(5)}</span>}
            {item.needsSignup && !item.deadline && <span className="notice-signup">需报名</span>}
          </div>
        </div>
      </a>
      <div className="notice-footer">
        <span className="notice-publisher" title={item.organizer}>{item.organizer}</span>
        {item.origins.length > 1 && (
          <details className="notice-origins">
            <summary aria-label={`查看${item.origins.length}个原始来源`}><Layers size={12} aria-hidden="true" />{item.origins.length} 处来源</summary>
            <div className="notice-origin-list">
              {item.origins.map((origin) => (
                <a key={origin.url + origin.organizer} href={origin.url} target="_blank" rel="noreferrer">
                  <span>{origin.organizer}</span><small>{origin.channel} · {origin.date}</small>
                </a>
              ))}
            </div>
          </details>
        )}
      </div>
    </article>
  );
}
