"""Public, credential-free collection progress and health summaries."""
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

import scraper

STALE_SECONDS = 8 * 60 * 60
REASONS = {"auth_required", "auth_missing", "verification_required", "rate_limited",
           "network", "empty_result", "not_checked", "collector_error"}


def read_json(path, fallback):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return fallback


def timestamp(value):
    try:
        return datetime.fromisoformat(value).timestamp()
    except (TypeError, ValueError):
        return 0


def summarize(previous, states, *, started_at, finished_at, new_count=0, fetched_count=0):
    good = [s for s in states if s.get("status") == "ok"]
    reasons = {s.get("error_reason") for s in states if s.get("status") != "ok"}
    if "auth_required" in reasons:
        status = "auth_required"
    elif "verification_required" in reasons:
        status = "verification_required"
    elif len(good) == len(states) and states:
        status = "ok"
    elif good:
        status = "partial"
    elif "rate_limited" in reasons:
        status = "rate_limited"
    else:
        status = "unavailable"
    successes = [previous.get("last_success_at", "")]
    successes += [s.get("last_success", "") for s in states]
    successes += [s.get("last_success", s.get("checked_at", "")) for s in good]
    last_success = max(successes, key=timestamp)
    health = {
        "version": 1, "status": status, "started_at": started_at, "checked_at": finished_at,
        "last_success_at": last_success,
        "last_full_success_at": max((s.get("checked_at", "") for s in good), key=timestamp)
        if status == "ok" else previous.get("last_full_success_at", ""),
        "total_sources": len(states), "succeeded_sources": len(good),
        "failed_sources": len(states) - len(good),
        "resumed_sources": sum(bool(s.get("resumed")) for s in states),
        "fetched_count": fetched_count, "new_count": new_count,
        "consecutive_failures": 0 if good else int(previous.get("consecutive_failures", 0)) + 1,
        "interval_hours": 3,
    }
    if "rate_limited" in reasons:
        health["retry_after"] = (datetime.fromisoformat(finished_at) + timedelta(minutes=30)).isoformat()
    return health


def cooldown_state(previous, states, now):
    """A deployment during an existing cooldown must not send more requests or count as another failure."""
    retry = timestamp(previous.get("retry_after"))
    if not retry and previous.get("status") == "rate_limited":
        retry = timestamp(previous.get("checked_at")) + 1800
    if not retry or now >= retry:
        return None
    candidates = [previous.get("last_success_at", "")] + [s.get("last_success", s.get("checked_at", "") if s.get("status") == "ok" else "") for s in states]
    return {**previous, "last_success_at": max(candidates, key=timestamp),
            "checked_at": datetime.fromtimestamp(now, timezone.utc).isoformat(),
            "retry_after": datetime.fromtimestamp(retry, timezone.utc).isoformat(),
            "new_count": 0, "fetched_count": 0, "cooldown_skipped": True}


def record_failure(data_dir, reason):
    path = Path(data_dir) / "wechat_run_status.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    previous = read_json(path, {})
    now = datetime.now(timezone.utc).isoformat()
    health = summarize(previous, [], started_at=now, finished_at=now)
    health.update(status=reason if reason in REASONS else "collector_error",
                  total_sources=previous.get("total_sources", 0), failed_sources=previous.get("total_sources", 0))
    scraper.write_json(path, health)
    return health


def needs_alert(health, now=None):
    """Explicit auth/verification issues alert immediately; transient failures need two runs."""
    if health.get("status") in ("auth_required", "auth_missing", "verification_required"):
        return True
    if int(health.get("consecutive_failures", 0)) >= 2:
        return True
    last = timestamp(health.get("last_success_at"))
    current = now if now is not None else datetime.now(timezone.utc).timestamp()
    return bool(last and current - last > STALE_SECONDS)


def main():
    path = Path(__file__).resolve().parent / "data/wechat_run_status.json"
    health = read_json(path, {})
    if not health or not timestamp(health.get("checked_at")):
        print("公众号健康摘要缺失，无法确认本轮采集；请查看采集任务。")
        raise SystemExit(1)
    print(f"公众号健康：{health.get('status', 'unknown')}；成功 {health.get('succeeded_sources', 0)}/{health.get('total_sources', 0)}；本轮新收录 {health.get('new_count', 0)} 条。")
    print("该检查独立于页面部署；失败通知由 GitHub 账号的 Actions 通知设置控制。")
    raise SystemExit(1 if needs_alert(health) else 0)


if __name__ == "__main__":
    main()
