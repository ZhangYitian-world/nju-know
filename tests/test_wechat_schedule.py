import json
import tempfile
import unittest
from pathlib import Path

from wechat_schedule import DAILY_CRON, should_collect, update_health
from wechat_health import needs_alert


class ScheduleTests(unittest.TestCase):
    def test_code_push_and_official_schedule_never_contact_wechat(self):
        self.assertFalse(should_collect("push"))
        self.assertFalse(should_collect("push", manual=True))
        self.assertFalse(should_collect("schedule", "0 */3 * * *"))

    def test_daily_or_explicit_manual_collection_only_and_review_always_skips(self):
        self.assertTrue(should_collect("schedule", DAILY_CRON))
        self.assertFalse(should_collect("workflow_dispatch"))
        self.assertTrue(should_collect("workflow_dispatch", manual=True))
        self.assertFalse(should_collect("workflow_dispatch", manual=True, review_id="review"))

    def test_policy_migration_preserves_actual_collection_history(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "wechat_run_status.json"
            old = {"status": "rate_limited", "checked_at": "2026-10-29T10:00:00Z", "last_success_at": "2026-10-29T09:00:00Z", "consecutive_failures": 2}
            path.write_text(json.dumps(old))
            update_health(folder)
            value = json.loads(path.read_text())
            for field, expected in old.items():
                self.assertEqual(value[field], expected)
            self.assertEqual(value["interval_hours"], 24)
            self.assertEqual(value["stale_after_hours"], 32)

    def test_daily_health_check_does_not_alert_just_because_eight_hours_passed(self):
        last = "2026-10-29T00:00:00+00:00"
        from datetime import datetime
        now = datetime.fromisoformat(last).timestamp()
        health = {"status": "ok", "last_success_at": last, "interval_hours": 24, "stale_after_hours": 32}
        self.assertFalse(needs_alert(health, now + 25 * 3600))
        self.assertTrue(needs_alert(health, now + 33 * 3600))
