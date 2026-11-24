"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, CalendarDays, Check, Clock3, MapPin, Search, Sparkles } from "lucide-react";
import type { Item } from "@/lib/data";
import { inspectActivity, parseRequest } from "@/lib/query";
import type { RequestCriteria } from "@/lib/query";

const PARSE_API = "https://nju-know-search.zhangyitian-garden.workers.dev/parse";

const EXAMPLES = ["本周五下午3点之后，鼓楼校区", "最近的讲座，最好在仙林", "还可以报名的志愿活动"];

export default function Discovery({ items }: { items: Item[] }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [aiCriteria, setAiCriteria] = useState<RequestCriteria | null>(null);
  const requestId = useRef(0);
  const criteria = useMemo(() => aiCriteria ?? parseRequest(query), [query, aiCriteria]);
  useEffect(() => {
    if (!query.trim()) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      const controller = new AbortController();
      const slow = setTimeout(() => controller.abort(), 8000);
      fetch(PARSE_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((ai) => {
          clearTimeout(slow);
          if (!ai || id !== requestId.current) return;
          const base = parseRequest(query);
          const date = typeof ai.date === "string" ? ai.date : base.date;
          const keywords = Array.isArray(ai.keywords) && ai.keywords.length ? ai.keywords.slice(0, 5) : base.keywords;
          const next: RequestCriteria = {
            date,
            weekday: date ? new Date(`${date}T00:00:00`).getDay() : base.weekday,
            afterTime: typeof ai.afterTime === "string" && ai.afterTime ? ai.afterTime : base.afterTime,
            campus: typeof ai.campus === "string" && ai.campus ? ai.campus : base.campus,
            category: typeof ai.category === "string" && ai.category ? ai.category : base.category,
            keywords,
            count: 0,
          };
          next.count = Number(Boolean(next.weekday !== null)) + Number(Boolean(next.afterTime)) + Number(Boolean(next.campus)) + Number(Boolean(next.category));
          setAiCriteria(next);
        })
        .catch(() => clearTimeout(slow));
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);
  const candidates = useMemo(() => {
    if (!query.trim()) return [];
    return items
      .filter((item) => item.kind === "活动")
      .map((item) => ({ item, fit: inspectActivity(item, criteria) }))
      .filter(({ fit }) => !fit.conflicts.length)
      .filter(({ item }) => !/回顾|总结|圆满举办|顺利举办|成功举办|圆满落幕|取消通知/.test(`${item.title} ${item.summary}`))
      .sort((a, b) => Number(b.fit.confirmed) - Number(a.fit.confirmed)
        || Number(b.item.needsSignup) - Number(a.item.needsSignup)
        || b.item.date.localeCompare(a.item.date))
      .slice(0, 8);
  }, [items, query, criteria]);

  function search(value = draft) {
    const clean = value.trim();
    if (!clean) return;
    setAiCriteria(null);
    setDraft(clean);
    setQuery(clean);
  }

  return (
    <div className="discovery-page">
      <section className="discovery-hero" aria-labelledby="discovery-title">
        <div className="hero-map" aria-hidden="true" />
        <div className="hero-content">

          <h1 id="discovery-title">这周，想参加<em>什么活动？</em></h1>
          <p className="hero-copy">写下空闲时间、校区或兴趣，从南大的校园消息里找活动。</p>

          <form className="search-composer" onSubmit={(event) => { event.preventDefault(); search(); }}>
            <label className="sr-only" htmlFor="activity-query">描述你想找的活动</label>
            <textarea
              id="activity-query"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); search(); } }}
              placeholder="比如：本周五下午3点之后，鼓楼校区的活动……"
              rows={2}
            />
            <div className="composer-bottom">
              <span className="composer-hint"><Sparkles className="h-4 w-4" />用日常说法描述条件</span>
              <button className="search-submit" type="submit" aria-label="查找活动"><ArrowUp className="h-5 w-5" /><span>找活动</span></button>
            </div>
          </form>

          <div className="example-prompts" aria-label="试试这些搜索">
            <span>试试：</span>
            {EXAMPLES.map((example) => <button key={example} onClick={() => search(example)}>{example}</button>)}
          </div>
        </div>

      </section>

      {query && (
        <section className="results-section" aria-live="polite">
          <div className="results-heading">
            <div><h2>候选活动 <small>{candidates.length} 条</small></h2></div>
            <button className="edit-query" onClick={() => { setDraft(query); document.getElementById("activity-query")?.focus(); }}>修改条件</button>
          </div>
          <div className="criteria-row">
            {criteria.weekday !== null && <span><CalendarDays />{criteria.date} · 星期{["日", "一", "二", "三", "四", "五", "六"][criteria.weekday]}</span>}
            {criteria.afterTime && <span><Clock3 />{criteria.afterTime} 之后</span>}
            {criteria.campus && <span><MapPin />{criteria.campus}校区</span>}
            {criteria.category && <span><Search />{criteria.category}</span>}
            {criteria.keywords.map((word) => <span key={word}><Search />{word}</span>)}
            {criteria.count === 0 && <span><Search />按活动内容匹配</span>}
            <span className="criteria-source">{aiCriteria ? "由 AI 理解" : "按本地规则解析"}</span>
          </div>

          <div className="data-note"><Sparkles className="h-4 w-4 shrink-0" />
            时间和校区按收录的活动安排核对。标有“待核对”的候选，请打开原文确认。
          </div>

          {candidates.length ? <div className="candidate-list">
            {candidates.map(({ item, fit }) => <article className="candidate" key={item.id}>
              <div className="candidate-main">
                <div className="candidate-tags"><span className="activity-tag">{item.category}</span>{item.needsSignup && <span className="signup-tag">报名相关</span>}</div>
                <h3>{item.title}</h3>
                <p className="candidate-summary">{item.summary || "打开原文查看活动安排和参与方式。"}</p>
                <div className="candidate-meta"><span>{item.organizer}</span><span>信息发布于 {item.date}</span></div>
                <ul className="match-facts">
                  {fit.facts.map((fact) => <li className={fact.state} key={fact.label}>{fact.state === "yes" ? <Check /> : fact.state === "no" ? <MapPin /> : <Clock3 />}{fact.label}</li>)}
                </ul>
              </div>
              <a className="source-link" href={item.url} target="_blank" rel="noreferrer">查看原文 <ArrowUpRight /></a>
            </article>)}
          </div> : <div className="empty-results"><div className="empty-mark"><Search /></div><h3>暂时没有找到合适的活动</h3><p>可以换个说法，或者到信息流里看看最近收录的内容。</p><a href="/feed/">浏览信息流 <ArrowUpRight /></a></div>}
        </section>
      )}


    </div>
  );
}
