import unittest
import os
from datetime import datetime
from unittest.mock import patch

from collect_wechat_local import article_notice, collect, merge_notices, BEIJING
import fetch_wechat


class LocalWechatTests(unittest.TestCase):
    def article(self, **changes):
        return {"title": "校园公开通知", "link": "https://mp.weixin.qq.com/s/public", "update_time": datetime.now(BEIJING).timestamp(), "cover": "https://mmbiz.qpic.cn/public.jpg", **changes}

    def test_public_metadata_keeps_publisher_and_beijing_time(self):
        raw = self.article(update_time=datetime(2026, 10, 28, 19, 20, tzinfo=BEIJING).timestamp())
        row = article_notice(raw, "南大就业")
        self.assertEqual((row["date"], row["time"], row["organizer"]), ("2026-10-28", "19:20", "南大就业"))
        self.assertNotIn("token", row)
        self.assertIsNone(article_notice(self.article(link="https://attacker.example/x"), "南大就业"))

    def test_partial_failure_preserves_existing_sources(self):
        old = article_notice(self.article(link="https://mp.weixin.qq.com/s/old"), "旧来源")
        def fetch(fakeid, *_args, **_kwargs):
            if fakeid == "bad":
                raise TimeoutError("private request details must not be saved")
            return [self.article()], 1, False
        rows, status, received = collect([{"name": "新来源", "fakeid": "ok"}, {"name": "旧来源", "fakeid": "bad"}], fetch, [old], delay=0)
        self.assertEqual({x["organizer"] for x in rows}, {"新来源", "旧来源"})
        self.assertEqual(received, 1)
        self.assertEqual(status[1]["error"], "TimeoutError")

    def test_empty_run_never_erases_existing_and_same_url_updates(self):
        old = article_notice(self.article(), "南大青年")
        rows, _, received = collect([{"name": "南大青年", "fakeid": "x"}], lambda *_a, **_kw: ([], 0, False), [old], delay=0)
        self.assertEqual(rows, [old])
        self.assertEqual(received, 0)
        merged = merge_notices([old], [{**old, "title": "更新后的公开通知"}])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["title"], "更新后的公开通知")

    def test_cloud_local_mode_cannot_overwrite_with_legacy_feed(self):
        with patch.dict(os.environ, {"WECHAT_PROVIDER": "local"}), patch.object(fetch_wechat, "collect") as old_feed, patch.object(fetch_wechat.scraper, "write_json") as write:
            fetch_wechat.main()
        old_feed.assert_not_called()
        write.assert_not_called()


if __name__ == "__main__":
    unittest.main()
