import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import enrich_llm as enrich


ARTICLE = {"title": "南京大学商学院研究系列人员招聘公告", "organizer": "商学院", "source": "商学院", "date": "2026-10-28", "summary": "", "url": "https://nubs.nju.edu.cn/e8/a5/c8896a845989/page.htm"}
CLASSIFICATION = {"i": 0, "kind": "通知", "category": "院系", "signup": False, "summary": "商学院研究系列岗位招聘", "confidence": 0.95}


class ProviderTests(unittest.TestCase):
    def test_jev_uses_closed_choices_and_reads_confidence(self):
        response = {"answers": {"label0": {"type": "choice", "choice": "1_2", "confidence": 0.92, "probabilities": {"1_2": 0.98}}, "signup0": {"type": "noul", "noul": 0.02}}}
        with patch.object(enrich, "post_json", return_value=response) as api:
            result = enrich.call_jev([ARTICLE], "test-only", "jev-1.14.0", "https://api.typesafe.ai/v1/systemone")
        self.assertEqual(result[0]["kind"], "通知")
        self.assertEqual(result[0]["category"], "院系")
        self.assertEqual(result[0]["summary"], "")
        body = api.call_args.args[2]
        self.assertEqual(len(body["questions"]["label0"]["criteria"]), 13)
        self.assertEqual(body["questions"]["label0"]["type"], "choice")
        self.assertEqual(body["state"]["article0"]["title"], ARTICLE["title"])

    def test_jev_uncertainty_falls_back_and_unknown_choices_are_rejected(self):
        with patch.object(enrich, "post_json", return_value={"answers": {"label0": {"type": "choice", "choice": "1_2", "confidence": 0.4, "probabilities": {"1_2": 0.8}}}}):
            result = enrich.call_jev([ARTICLE], "test-only", "jev-1.14.0", "https://api.typesafe.ai/v1/systemone")
        self.assertTrue(result[0]["abstained"])
        with patch.object(enrich, "post_json", return_value={"answers": {"label0": {"type": "choice", "choice": "unknown", "confidence": 1, "probabilities": {"unknown": 1}}}}):
            self.assertEqual(enrich.call_jev([ARTICLE], "test-only", "jev-1.14.0", "https://api.typesafe.ai/v1/systemone"), [])

    def test_deepseek_json_mode_and_non_thinking_request(self):
        with patch.object(enrich, "post_json", return_value={"choices": [{"message": {"content": json.dumps({"results": [CLASSIFICATION]})}}]}) as api:
            results = enrich.call_deepseek([ARTICLE], "test-only", "deepseek-flash", "https://api.deepseek.com/chat/completions")
        self.assertTrue(enrich.valid(results[0]))
        body = api.call_args.args[2]
        self.assertEqual(body["thinking"], {"type": "disabled"})
        self.assertEqual(body["response_format"], {"type": "json_object"})

    def test_rejects_wrong_taxonomy_and_ambiguous_booleans(self):
        self.assertFalse(enrich.valid({**CLASSIFICATION, "kind": "活动", "category": "院系"}))
        self.assertFalse(enrich.valid({**CLASSIFICATION, "signup": "false"}))
        self.assertFalse(enrich.valid({**CLASSIFICATION, "confidence": float("nan")}))


class CacheTests(unittest.TestCase):
    def run_main(self, folder, response=None, key="test-only"):
        data = Path(folder)
        (data / "notices.json").write_text(json.dumps([ARTICLE]))
        cache = data / "llm.json"
        with patch.multiple(enrich, DATA_DIR=data, SOURCE_FILES=[data / "notices.json"], CACHE_FILE=cache), patch.object(enrich, "provider_config", return_value=("deepseek", key, "deepseek-flash", "https://api.deepseek.com/chat/completions")), patch.object(enrich, "call_deepseek", return_value=response if response is not None else [CLASSIFICATION]) as api:
            enrich.main()
        return json.loads(cache.read_text()), api.call_count

    def test_unchanged_articles_reuse_cache_but_changed_content_is_reclassified(self):
        with tempfile.TemporaryDirectory() as folder:
            cache, calls = self.run_main(folder)
            self.assertEqual(calls, 1)
            self.assertEqual(cache[ARTICLE["url"]]["status"], "accepted")
            _, calls = self.run_main(folder)
            self.assertEqual(calls, 0)
            cache[ARTICLE["url"]]["input_hash"] = "outdated-input"
            (Path(folder) / "llm.json").write_text(json.dumps(cache))
            _, calls = self.run_main(folder)
            self.assertEqual(calls, 1)

    def test_low_confidence_cached_as_abstention_and_no_key_never_calls_api(self):
        with tempfile.TemporaryDirectory() as folder:
            cache, _ = self.run_main(folder, [{**CLASSIFICATION, "confidence": 0.3}])
            self.assertEqual(cache[ARTICLE["url"]]["status"], "abstained")
            _, calls = self.run_main(folder)
            self.assertEqual(calls, 0)
        with tempfile.TemporaryDirectory() as folder:
            cache, calls = self.run_main(folder, key="")
            self.assertEqual(cache, {})
            self.assertEqual(calls, 0)

    def test_model_change_and_malformed_cache_invalidate_results(self):
        entry = {**CLASSIFICATION, "schema_version": enrich.SCHEMA_VERSION, "input_hash": enrich.input_hash(ARTICLE), "provider": "deepseek", "model": "deepseek-flash", "status": "accepted"}
        self.assertTrue(enrich.current(entry, ARTICLE, "deepseek", "deepseek-flash"))
        self.assertFalse(enrich.current(entry, ARTICLE, "jev", "jev-1.14.0"))
        self.assertFalse(enrich.current({**entry, "category": "invalid"}, ARTICLE, "deepseek", "deepseek-flash"))


class HybridTests(unittest.TestCase):
    def test_jev_selects_category_deepseek_supplies_summary(self):
        decision = {**CLASSIFICATION, "summary": ""}
        review = {**CLASSIFICATION, "category": "科研", "summary": "商学院发布研究岗位招聘公告"}
        with patch.object(enrich, "call_jev", return_value=[decision]), patch.object(enrich, "call_deepseek", return_value=[review]):
            result = enrich.call_hybrid([ARTICLE], {"jev": "test-only", "deepseek": "test-only"}, "jev-1.14.0|deepseek-flash", None)
        self.assertEqual(result[0]["category"], "院系")
        self.assertEqual(result[0]["summary"], review["summary"])
        self.assertTrue(result[0]["complete"])

    def test_deepseek_reviews_low_confidence_jev(self):
        with patch.object(enrich, "call_jev", return_value=[{"i": 0, "abstained": True}]), patch.object(enrich, "call_deepseek", return_value=[CLASSIFICATION]):
            result = enrich.call_hybrid([ARTICLE], {"jev": "test-only", "deepseek": "test-only"}, "jev-1.14.0|deepseek-flash", None)
        self.assertEqual(result[0]["classification_provider"], "deepseek")
        self.assertEqual(result[0]["category"], "院系")

    def test_failed_provider_is_not_repeated_and_incomplete_cache_is_retried_later(self):
        keys = {"jev": "test-only", "deepseek": "test-only"}
        with patch.object(enrich, "call_jev", return_value=[{**CLASSIFICATION, "summary": ""}]), patch.object(enrich, "call_deepseek", side_effect=TimeoutError) as api:
            result = enrich.call_hybrid([ARTICLE], keys, "jev-1.14.0|deepseek-flash", None)
            enrich.call_hybrid([ARTICLE], keys, "jev-1.14.0|deepseek-flash", None)
        self.assertEqual(api.call_count, 1)
        self.assertFalse(result[0]["complete"])
        entry = {**CLASSIFICATION, "schema_version": enrich.SCHEMA_VERSION, "input_hash": enrich.input_hash(ARTICLE), "provider": "hybrid", "model": "jev-1.14.0|deepseek-flash", "status": "accepted", "complete": False}
        self.assertFalse(enrich.current(entry, ARTICLE, "hybrid", "jev-1.14.0|deepseek-flash"))


if __name__ == "__main__":
    unittest.main()
