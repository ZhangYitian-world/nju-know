import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock

from collect_wechat_local import CollectorObserver, collect, BEIJING, article_notice
from wechat_health import summarize, needs_alert

NOW = "2026-10-29T12:00:00+00:00"
OLD = "2026-10-29T00:00:00+00:00"


class HealthTests(unittest.TestCase):
    def test_empty_and_failed_results_preserve_success_time_and_need_two_failed_runs(self):
        previous = {"last_success_at": NOW, "consecutive_failures": 0}
        states = [{"name": "fixture", "status": "unavailable", "error_reason": "empty_result"}]
        first = summarize(previous, states, started_at=NOW, finished_at=NOW)
        self.assertEqual(first["last_success_at"], NOW)
        self.assertFalse(needs_alert(first, datetime.fromisoformat(NOW).timestamp()))
        second = summarize(first, states, started_at=NOW, finished_at=NOW)
        self.assertTrue(needs_alert(second, datetime.fromisoformat(NOW).timestamp()))

    def test_explicit_auth_alerts_immediately_but_network_failure_does_not(self):
        h = summarize({}, [{"name": "fixture", "status": "unavailable", "error_reason": "auth_required"}], started_at=NOW, finished_at=NOW)
        self.assertTrue(needs_alert(h))
        self.assertEqual(h["status"], "auth_required")

    def test_resume_does_not_invent_a_new_success_time_and_staleness_uses_wall_time(self):
        h = summarize({}, [{"name": "fixture", "status": "ok", "checked_at": OLD, "resumed": True}], started_at=NOW, finished_at=NOW)
        self.assertEqual(h["last_success_at"], OLD)
        self.assertEqual(h["resumed_sources"], 1)
        self.assertTrue(needs_alert(h, datetime.fromisoformat(NOW).timestamp()))

    def test_recovered_source_resets_failure_counter(self):
        h = summarize({"consecutive_failures": 4}, [{"name": "fixture", "status": "ok", "checked_at": NOW}], started_at=NOW, finished_at=NOW, new_count=2)
        self.assertEqual(h["consecutive_failures"], 0)
        self.assertEqual(h["new_count"], 2)


class ObserverTests(unittest.TestCase):
    def test_successful_automatic_refresh_is_not_reported_as_expired(self):
        pool = SimpleNamespace(report=Mock(), _load=lambda: [{"id": "fixture", "status": "active"}])
        observer = CollectorObserver(pool)
        pool.report("fixture", status_code=401)
        self.assertEqual(observer.reason, "")
        pool._load = lambda: [{"id": "fixture", "status": "invalid"}]
        pool.report("fixture", status_code=401)
        self.assertEqual(observer.reason, "auth_required")

    def test_rate_limit_and_verification_are_distinct(self):
        pool = SimpleNamespace(report=Mock(), _load=lambda: [])
        observer = CollectorObserver(pool)
        pool.report("fixture", status_code=429, ret=-2014)
        self.assertEqual(observer.reason, "rate_limited")
        pool.report("fixture", status_code=499, ret=-2041)
        self.assertEqual(observer.reason, "verification_required")


class CheckpointTests(unittest.TestCase):
    def test_interrupted_run_can_resume_without_refetching_successful_source(self):
        sources = [{"name": "one", "fakeid": "1"}, {"name": "two", "fakeid": "2"}]
        def fetch(fakeid, *_args, **_kwargs):
            return [{"title": "校园通知", "link": "https://mp.weixin.qq.com/s/" + fakeid,
                     "create_time": datetime.now(BEIJING).timestamp()}], 1, False
        saved = {}
        def interrupt(rows, states):
            saved.update(rows=rows, states=list(states))
            raise KeyboardInterrupt
        with self.assertRaises(KeyboardInterrupt):
            collect(sources, fetch, [], delay=0, on_progress=interrupt)
        api = Mock(side_effect=fetch)
        rows, states, received = collect(sources, api, saved["rows"], delay=0,
                                         completed={s["name"]: s for s in saved["states"]})
        self.assertEqual(api.call_count, 1)
        self.assertEqual(api.call_args.args[0], "2")
        self.assertEqual(len(rows), 2)
        self.assertEqual(received, 1)
        self.assertTrue(states[0]["resumed"])

    def test_exhausted_budget_keeps_pending_sources_and_existing_articles(self):
        old = {"title": "旧数据", "url": "https://mp.weixin.qq.com/s/old", "date": "2026-10-29"}
        api = Mock()
        rows, states, received = collect([{"name": "fixture", "fakeid": "1"}], api, [old], max_seconds=0)
        api.assert_not_called()
        self.assertEqual(rows, [old])
        self.assertEqual(states[0]["status"], "pending")
        self.assertEqual(received, 0)
