import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import scraper
from source_parsers import BEIJING, EmbeddedListParser, NoticeListParser, article_url


class ParserTests(unittest.TestCase):
    def parse(self, html):
        parser = NoticeListParser("https://cs.nju.edu.cn/1703/list.htm")
        parser.feed(html)
        return parser.items

    def test_publication_date_wins_over_event_date_in_title(self):
        items = self.parse("""<li><a href='/ed/0c/c1706a847116/page.htm'
            title='2026年10月30日学术报告'>报告</a><span class='news_meta'>2026-10-28</span></li>""")
        self.assertEqual(items[0]["date"], "2026-10-28")

    def test_split_dates_and_vsb_date_inside_anchor(self):
        items = self.parse("""<ul><li><div class='news_date'><span>10-20</span><span>2026</span></div>
            <a href='/ea/52/c905a846418/page.htm'>联合培养报名</a></li>
            <li><a href='/info/1088/28181.htm' title='名家论坛讲座'><i>2026-10-28</i><p>讲座</p></a></li></ul>""")
        self.assertEqual([i["date"] for i in items], ["2026-10-20", "2026-10-28"])

    def test_anchor_rows_day_before_month_and_navigation_rejected(self):
        items = self.parse("""<div><a href='/1703/list.htm'>通知公告 2026-10-28</a>
            <a href='/info/1138/53061.htm' title='复试安排'><div class='date'><span>12</span>2026-09</div></a>
            <li><a href='/info/1138/53062.htm'>错误日期</a><span>2026-02-30</span></li></div>""")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["date"], "2026-09-12")
        self.assertEqual(items[0]["title"], "复试安排")

    def test_embedded_json_uses_beijing_publication_date_and_deduplicates(self):
        timestamp = int(datetime(2026, 10, 28, 1, tzinfo=BEIJING).timestamp() * 1000)
        row = {"title": "奖学金通知", "url": "http://physics.nju.edu.cn/rcpy/zxtz/20261028/i123.html", "releaseTime": timestamp}
        parser = EmbeddedListParser("https://physics.nju.edu.cn/rcpy/zxtz/index.html")
        parser.feed("var dataList=" + json.dumps([{"infolist": [row, row]}]) + "; otherCode();")
        self.assertEqual(len(parser.items), 1)
        self.assertEqual(parser.items[0]["date"], "2026-10-28")
        self.assertTrue(parser.items[0]["url"].startswith("https://"))

    def test_non_institutional_and_login_urls_are_not_articles(self):
        for url in ("https://nju.edu.cn.attacker.example/info/1/2.htm", "javascript:alert(1)", "/njdx/front/authorized/read.do?infoid=1"):
            self.assertEqual(article_url("https://cs.nju.edu.cn/", url), "")


class RecoveryTests(unittest.TestCase):
    def run_scrape(self, failed_html=None):
        today = datetime.now(BEIJING).date().isoformat()
        sources = [
            {"name": "可用学院", "pages": ["https://cs.nju.edu.cn/ok.htm"], "parser": NoticeListParser, "enrich": False},
            {"name": "故障学院", "pages": ["https://cs.nju.edu.cn/fail.htm"], "parser": NoticeListParser, "enrich": False},
        ]
        old = {"id": 1, "title": "旧通知", "source": "故障学院", "organizer": "故障学院", "type": "通知", "date": today, "deadline": "", "url": "https://cs.nju.edu.cn/info/1/1.htm"}
        def fetch(url):
            if "fail" in url:
                if failed_html is not None:
                    return failed_html
                raise TimeoutError("simulated unavailable site")
            return f"<li><a href='/info/1/2.htm'>新通知</a><span class='date'>{today}</span></li>"
        with tempfile.TemporaryDirectory() as tmp:
            data, status = Path(tmp) / "notices.json", Path(tmp) / "source_status.json"
            data.write_text(json.dumps([old]))
            status.write_text(json.dumps([{"name": "故障学院", "last_success": "2026-10-27T20:00:00+08:00"}]))
            with patch.multiple(scraper, SOURCES=sources, DATA_FILE=data, SOURCE_STATUS_FILE=status), patch.object(scraper, "fetch", side_effect=fetch), patch.object(scraper.time, "sleep"):
                scraper.scrape()
            return json.loads(data.read_text()), json.loads(status.read_text())

    def test_one_failed_source_retained_while_other_source_updates(self):
        notices, statuses = self.run_scrape()
        self.assertEqual({i["title"] for i in notices}, {"新通知", "旧通知"})
        self.assertEqual(statuses[1]["status"], "unavailable")
        self.assertEqual(statuses[1]["last_success"], "2026-10-27T20:00:00+08:00")
        self.assertEqual(statuses[0]["status"], "ok")

    def test_markup_change_does_not_erase_existing_source(self):
        notices, statuses = self.run_scrape("<html>此栏目已改版</html>")
        self.assertEqual(len(notices), 2)
        self.assertEqual(statuses[1]["item_count"], 1)


if __name__ == "__main__":
    unittest.main()
