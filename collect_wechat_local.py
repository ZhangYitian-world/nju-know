"""Collect public article metadata using a locally authorised WeRead collector.

The external collector and its private login files stay in ignored .local/.
CI initialises this directory temporarily from the authorised cloud secret.
No article body downloads, account credentials or personal profile are exported.
"""
import argparse
import hashlib
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
from wechat_health import bootstrap_health, cooldown_state, read_json, summarize

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


def collect(sources, fetch_page, existing, per_source=8, delay=2, *, previous_states=None,
            completed=None, on_progress=None, observer=None, max_seconds=None):
    incoming, states = [], []
    prior = {s["name"]: s for s in (previous_states or [])}
    started = time.monotonic()
    rate_failures = 0

    def deferred(start, reason):
        for pending in sources[start:]:
            name = pending["name"]
            if completed and name in completed:
                states.append({**completed[name], "resumed": True})
                continue
            old = prior.get(name, {})
            states.append({"name": name, "status": "pending", "error_reason": reason,
                           "checked_at": old.get("checked_at", ""), "last_success": old.get("last_success", old.get("checked_at", "") if old.get("status") == "ok" else ""),
                           "item_count": 0, "latest_date": old.get("latest_date", "")})
    for index, source in enumerate(sources):
        name = source["name"]
        checked = datetime.now(BEIJING).isoformat(timespec="seconds")
        old = prior.get(name, {})
        state = {"name": name, "checked_at": checked, "status": "unavailable", "item_count": 0, "latest_date": ""}
        state["last_success"] = old.get("last_success", old.get("checked_at", "") if old.get("status") == "ok" else "")
        if completed and name in completed:
            states.append({**completed[name], "resumed": True})
            continue
        if max_seconds is not None and time.monotonic() - started >= max_seconds:
            deferred(index, "not_checked")
            break
        if observer:
            observer.reset()
        try:
            articles, _, _ = fetch_page(source["fakeid"], 0, per_source, account_name=name)
            rows = [notice for raw in articles if (notice := article_notice(raw, name))]
            rows.sort(key=lambda row: (row["date"], row["time"]), reverse=True)
            rows = rows[:per_source]
            if rows:
                incoming.extend(rows)
                state.update(status="ok", item_count=len(rows), latest_date=rows[0]["date"], last_success=datetime.now(BEIJING).isoformat(timespec="seconds"))
                print(f"{name}：获取 {len(rows)} 条，最新 {rows[0]['date']}。", flush=True)
            else:
                state["error"] = "empty_result"
                state["error_reason"] = observer.reason if observer and observer.reason else "empty_result"
                print(f"{name}：未获取新数据，保留已有文章。", flush=True)
        except Exception as error:
            # Service exceptions may include request details; only retain type.
            state["error"] = type(error).__name__
            state["error_reason"] = observer.reason if observer and observer.reason else "network" if isinstance(error, (TimeoutError, ConnectionError)) else "collector_error"
            print(f"{name}：采集暂不可用（{type(error).__name__}），保留已有文章。", flush=True)
        states.append(state)
        if on_progress:
            on_progress(merge_notices(existing, incoming) if incoming else existing, states)
        rate_failures = rate_failures + 1 if state.get("error_reason") == "rate_limited" else 0
        reason = state.get("error_reason")
        if reason in ("auth_required", "verification_required") or rate_failures >= 2:
            deferred(index + 1, reason)
            print("本轮已暂停后续请求并保存进度，等待后续周期补采。", flush=True)
            break
        if index + 1 < len(sources) and delay:
            time.sleep(delay)
    rows = merge_notices(existing, incoming) if incoming else existing
    if on_progress:
        on_progress(rows, states)
    return rows, states, len(incoming)


class CollectorObserver:
    """Observe SDK status changes without exporting response bodies or account details."""
    def __init__(self, pool):
        self.pool = pool
        self.reason = ""
        original = pool.report

        def report(account_id, **kwargs):
            result = original(account_id, **kwargs)
            status, code = kwargs.get("status_code"), kwargs.get("ret")
            if status == 401 or code in (401, -2001, -2002) or kwargs.get("need_refresh"):
                account = next((a for a in pool._load() if a.get("id") == account_id), {})
                if account.get("status") == "invalid":
                    self.reason = "auth_required"
            elif code == -2041:
                self.reason = "verification_required"
            elif status in (429, 499) or code in (-2014, -2013, 200013):
                if self.reason not in ("auth_required", "verification_required"):
                    self.reason = "rate_limited"
            return result

        pool.report = report

    def reset(self):
        self.reason = ""


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
        pool = importlib.import_module("backend.account_pool").account_pool
        observer = CollectorObserver(pool)
    except Exception as error:
        print(f"本机采集器加载失败（{type(error).__name__}），保留已有公众号数据。")
        return
    sources = json.loads((BASE / "wechat_sources.json").read_text("utf-8"))
    if args.max_sources > 0:
        sources = sources[:args.max_sources]
    target = args.output_dir / "wechat.json"
    existing = json.loads(target.read_text("utf-8")) if target.exists() else []
    args.output_dir.mkdir(parents=True, exist_ok=True)
    started = datetime.now(BEIJING).isoformat(timespec="seconds")
    health_path = args.output_dir / "wechat_run_status.json"
    previous = bootstrap_health(read_json(health_path, {}), args.output_dir)
    previous_states = read_json(args.output_dir / "wechat_source_status.json", [])
    cooldown = cooldown_state(previous, previous_states, time.time())
    if cooldown:
        scraper.write_json(health_path, cooldown)
        print("当前仍在频率限制冷却期，本次不发送采集请求；已有内容与成功时间保留。")
        return
    checkpoint_path = args.output_dir / "wechat_checkpoint.json"
    checkpoint = read_json(checkpoint_path, {})
    cycle_id = datetime.now(BEIJING).strftime("%Y-%m-%d")
    config_hash = hashlib.sha256(json.dumps(sources, sort_keys=True).encode()).hexdigest()
    completed = {s["name"]: s for s in checkpoint.get("states", []) if s.get("status") == "ok"} if checkpoint.get("cycle_id") == cycle_id and checkpoint.get("config_hash") == config_hash else {}

    def save_progress(rows, states):
        scraper.write_json(target, rows)
        scraper.write_json(args.output_dir / "wechat_source_status.json", states)
        scraper.write_json(checkpoint_path, {"cycle_id": cycle_id, "config_hash": config_hash, "states": states})
        names = {s["name"] for s in states}
        pending = [{"name": s["name"], "status": "pending", "error_reason": "not_checked"} for s in sources if s["name"] not in names]
        progress = summarize(previous, states + pending, started_at=started,
                             finished_at=datetime.now(BEIJING).isoformat(timespec="seconds"),
                             new_count=len({r["url"] for r in rows} - {r["url"] for r in existing}))
        progress["in_progress"] = True
        scraper.write_json(health_path, progress)

    rows, states, received = collect(sources, fetch_page, existing, previous_states=previous_states,
                                     completed=completed, on_progress=save_progress, observer=observer, max_seconds=420)
    new_count = len({r["url"] for r in rows} - {r["url"] for r in existing})
    health = summarize(previous, states, started_at=started, finished_at=datetime.now(BEIJING).isoformat(timespec="seconds"), new_count=new_count, fetched_count=received)
    scraper.write_json(health_path, health)
    if received:
        scraper.write_json(target, rows)
        print(f"本机公众号采集完成：{len(sources)} 个来源，获取 {received} 条，合并保留 {len(rows)} 条。")
    else:
        print("本轮没有有效文章，未覆盖已有公众号数据。请检查微信读书登录状态。")


if __name__ == "__main__":
    main()
