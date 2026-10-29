"""Decide when WeChat may be contacted, independently of website releases."""
import os
import sys
from pathlib import Path

import scraper
from wechat_health import bootstrap_health, read_json

DAILY_CRON = "30 0 * * *"  # 08:30 Asia/Shanghai


def should_collect(event_name, schedule="", manual=False, review_id=""):
    if review_id:
        return False
    return ((event_name == "schedule" and schedule == DAILY_CRON)
            or (event_name == "workflow_dispatch" and manual is True))


def update_health(data_dir):
    path = Path(data_dir) / "wechat_run_status.json"
    health = read_json(path, {})
    if health:
        health = bootstrap_health(health, data_dir)
        # Policy changes never advance collection or success timestamps.
        health.update(interval_hours=24, stale_after_hours=32, daily_time="08:30",
                      schedule_timezone="Asia/Shanghai")
        scraper.write_json(path, health)


def main():
    if "--update-health" in sys.argv:
        update_health(Path(__file__).resolve().parent / "data")
        return
    enabled = should_collect(os.environ.get("EVENT_TYPE", ""), os.environ.get("EVENT_SCHEDULE", ""),
                             os.environ.get("MANUAL_COLLECTION") == "true", os.environ.get("REVIEW_BATCH", ""))
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a") as file:
            file.write(f"collect={'true' if enabled else 'false'}\n")
    print("本次允许公众号采集（每日计划或手动明确选择）。" if enabled
          else "本次只更新网站／官网，跳过公众号请求。公众号每天北京时间 08:30 检查一次。")


if __name__ == "__main__":
    main()
