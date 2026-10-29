"""Collect public article metadata using a locally authorised WeRead collector.

The external collector and its login files live in ignored .local/, never in CI.
No article body downloads, account credentials or personal profile are exported.
"""
import argparse
import importlib
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import scraper
from fetch_wechat import to_notice

BASE = Path(__file__).resolve().parent
BEIJING = timezone(timedelta(hours=8))


def article_notice(article, publisher):
    title = str(article.get("title") or "").strip()
    url = urlsplit(str(article.get("link") or ""))
    if not title or url.scheme not in ("https", "http") or url.hostname != "mp.weixin.qq.com":
        return None
    try:
        published = datetime.fromtimestamp(int(article.get("create_time") or article.get("update_time") or 0), BEIJING)
    except (ValueError, TypeError, OverflowError, OSError):
        return None
    if published.year < 2000 or published > datetime.now(BEIJING) + timedelta(days=1):
        return None
    cover = str(article.get("cover") or "")
    if urlsplit(cover).scheme not in ("https", "http"):
        cover = ""
    return to_notice({
        "title": title, "url": urlunsplit(("https", url.netloc, url.path, url.query, "")),
        "date": published.strftime("%Y-%m-%d"), "time": published.strftime("%H:%M"),
        "cover": cover, "organizer": publisher, "summary": str(article.get("digest") or "").strip(),
    })


def merge_notices(existing, incoming, limit=480):
    by_url = {row["url"]: row for row in existing if row.get("url")}
    by_url.update({row["url"]: row for row in incoming})
    rows, _ = scraper.filter_expired(list(by_url.values()))
    rows.sort(key=lambda row: (row.get("date", ""), row.get("time", "")), reverse=True)
    if limit > 0:
        rows = rows[:limit]
    return [{**row, "id": index} for index, row in enumerate(rows, 1)]


def collect(sources, fetch_page, existing, per_source=8, delay=2):
    incoming, states = [], []
    checked = datetime.now(BEIJING).isoformat(timespec="seconds")
    for index, source in enumerate(sources):
        name = source["name"]
        state = {"name": name, "checked_at": checked, "status": "unavailable", "item_count": 0, "latest_date": ""}
        try:
            articles, _, _ = fetch_page(source["fakeid"], 0, per_source, account_name=name)
            rows = [notice for raw in articles if (notice := article_notice(raw, name))]
            rows.sort(key=lambda row: (row["date"], row["time"]), reverse=True)
            rows = rows[:per_source]
            if rows:
                incoming.extend(rows)
                state.update(status="ok", item_count=len(rows), latest_date=rows[0]["date"])
                print(f"{name}：获取 {len(rows)} 条，最新 {rows[0]['date']}。", flush=True)
            else:
                state["error"] = "empty_result"
                print(f"{name}：未获取新数据，保留已有文章。", flush=True)
        except Exception as error:
            # Service exceptions may include request details; only retain type.
            state["error"] = type(error).__name__
            print(f"{name}：采集暂不可用（{type(error).__name__}），保留已有文章。", flush=True)
        states.append(state)
        if index + 1 < len(sources) and delay:
            time.sleep(delay)
    return (merge_notices(existing, incoming) if incoming else existing), states, len(incoming)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=BASE / "data")
    parser.add_argument("--max-sources", type=int, default=0)
    args = parser.parse_args()
    collector = Path(os.environ.get("WECHAT_COLLECTOR_ROOT") or BASE / ".local/wechat-collector").resolve()
    if not (collector / "backend/articles.py").exists():
        print("本机采集器尚未安装，保留已有公众号数据。")
        return
    sys.path.insert(0, str(collector))
    try:
        fetch_page = importlib.import_module("backend.articles")._fetch_articles_page
    except Exception as error:
        print(f"本机采集器加载失败（{type(error).__name__}），保留已有公众号数据。")
        return
    sources = json.loads((BASE / "wechat_sources.json").read_text("utf-8"))
    if args.max_sources > 0:
        sources = sources[:args.max_sources]
    target = args.output_dir / "wechat.json"
    existing = json.loads(target.read_text("utf-8")) if target.exists() else []
    rows, states, received = collect(sources, fetch_page, existing)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    scraper.write_json(args.output_dir / "wechat_source_status.json", states)
    if received:
        scraper.write_json(target, rows)
        print(f"本机公众号采集完成：{len(sources)} 个来源，获取 {received} 条，合并保留 {len(rows)} 条。")
    else:
        print("本轮没有有效文章，未覆盖已有公众号数据。请检查微信读书登录状态。")


if __name__ == "__main__":
    main()
