"""纯离线测试：不需要 Gemini 密钥，也不请求 API。"""
from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest
import urllib.error

SCRIPTS = pathlib.Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import build
from translation import GeminiTranslator, has_chinese


class FakeTranslator:
    api_calls = 0
    cache_hits = 0
    def simplify(self, value):
        return value.replace("歷史", "历史").replace("發現", "发现")
    def translate_pair(self, title, summary):
        if "Scientists" in title:
            return "研究人员报告了一项新的发现", "研究人员介绍了具体实验结果"
        return None


class BuildTests(unittest.TestCase):
    def test_chinese_conversion_and_english_translation_separate_fields(self):
        items = [
            dict(title="Scientists made a discovery", editor_title="", translated_title="",
                 summary="Researchers tested a new method", original_summary="Researchers tested a new method",
                 display_language="en"),
            dict(title="歷史上的新發現", editor_title="", translated_title="",
                 summary="這是歷史資料", original_summary="這是歷史資料", display_language="zh"),
        ]
        build.localize(items, FakeTranslator())
        self.assertEqual(items[0]["translated_title"], "研究人员报告了一项新的发现")
        self.assertEqual(items[0]["editor_title"], "")  # 翻译绝不改写标题
        self.assertEqual(items[0]["summary"], "研究人员介绍了具体实验结果")
        self.assertEqual(items[0]["title"], "Scientists made a discovery")
        self.assertEqual(items[0]["original_summary"], "Researchers tested a new method")
        self.assertEqual(items[0]["translation_status"], "machine")
        self.assertEqual(items[1]["translated_title"], "历史上的新发现")

    def test_failed_translator_does_not_fabricate_content(self):
        item = dict(title="Unknown article", editor_title="", translated_title="",
                    summary="An original excerpt", original_summary="An original excerpt")
        build.localize([item], FakeTranslator())
        self.assertEqual(item["display_language"], "en")
        self.assertEqual(item["summary"], "An original excerpt")
        self.assertEqual(item["translation_status"], "unavailable")

    def test_rss_parsing_source_retained(self):
        rss = b'<rss><channel><item><title>Scientists explain the physics of cosmic rays</title><link>https://example.org/a</link><description>Researchers tested a new method, measured the result and published data.</description></item></channel></rss>'
        items = build.parse_feed(rss, "Example", "Science", "Example media", "discovery")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["original_summary"], items[0]["summary"])
        self.assertEqual(items[0]["display_language"], "en")
        self.assertEqual(items[0]["editor_title"], "")
        self.assertEqual(items[0]["translated_title"], "")

    def test_no_untrusted_url(self):
        self.assertEqual(build.safe_url("javascript:alert(1)"), "")
        self.assertEqual(build.safe_url("https://example.com/read"), "https://example.com/read")

    def test_fallback_data_is_chinese_readable(self):
        path = pathlib.Path(__file__).resolve().parents[1] / "web" / "data" / "articles.json"
        data = json.loads(path.read_text(encoding="utf8"))
        self.assertTrue(any(has_chinese(x.get("editor_title", "")) for x in data["articles"]))


class GeminiTests(unittest.TestCase):
    def test_cache_reuses_translation_across_instances(self):
        calls = []
        def fake_transport(request):
            calls.append(json.loads(request.data.decode("utf-8")))
            self.assertEqual(request.get_header("X-goog-api-key"), "test-key")
            return {"candidates": [{"content": {"parts": [{"text": json.dumps({
                "title_zh": "科学家发现了新现象", "summary_zh": "研究人员分析了样本并报告结果。"
            }, ensure_ascii=False)}]}}]}
        with tempfile.TemporaryDirectory() as root:
            cache = pathlib.Path(root) / "translations.json"
            first = GeminiTranslator(api_key="test-key", cache_path=cache, max_new=1, transport=fake_transport)
            result1 = first.translate_pair("Scientists discover a new phenomenon", "Researchers analyzed samples.")
            self.assertEqual(result1[0], "科学家发现了新现象")
            self.assertEqual(first.api_calls, 1)
            self.assertTrue(cache.exists())
            second = GeminiTranslator(api_key="", cache_path=cache, max_new=0, transport=fake_transport)
            result2 = second.translate_pair("Scientists discover a new phenomenon", "Researchers analyzed samples.")
            self.assertEqual(result2, result1)
            self.assertEqual(second.cache_hits, 1)
            self.assertEqual(len(calls), 1)

    def test_budget_and_no_key_skip_api(self):
        def no_calls(request):
            raise AssertionError("不应调用 API")
        with tempfile.TemporaryDirectory() as root:
            tr = GeminiTranslator(api_key="test-key", cache_path=pathlib.Path(root) / "x.json",
                                  max_new=0, transport=no_calls)
            self.assertIsNone(tr.translate_pair("A long title in English", "A short original summary"))
            self.assertEqual(tr.api_calls, 0)
            tr2 = GeminiTranslator(api_key="", cache_path=pathlib.Path(root) / "x.json",
                                   max_new=12, transport=no_calls)
            self.assertIsNone(tr2.translate_pair("A long title in English", "A short original summary"))

    def test_invalid_response_does_not_enter_cache(self):
        def fake_transport(request):
            return {"candidates": [{"content": {"parts": [{"text": '{"title_zh": "Hello", "summary_zh": ""}'}]}}]}
        with tempfile.TemporaryDirectory() as root:
            tr = GeminiTranslator(api_key="test-key", cache_path=pathlib.Path(root) / "x.json",
                                  transport=fake_transport)
            self.assertIsNone(tr.translate_pair("Scientists discover a new phenomenon", "Researchers analyzed samples"))
            self.assertEqual(tr.cache, {})

    def test_rate_limit_stops_following_requests(self):
        calls = []
        def fake_transport(request):
            calls.append(1)
            raise urllib.error.HTTPError(request.full_url, 429, "Too Many Requests", {}, None)
        with tempfile.TemporaryDirectory() as root:
            tr = GeminiTranslator(api_key="test-key", cache_path=pathlib.Path(root) / "x.json",
                                  transport=fake_transport)
            self.assertIsNone(tr.translate_pair("Scientists discover a new phenomenon", "Researchers analyzed samples"))
            self.assertIsNone(tr.translate_pair("Different title today", "Different summary"))
            self.assertEqual(len(calls), 1)

    def test_cache_invalidation_when_source_changes(self):
        with tempfile.TemporaryDirectory() as root:
            tr = GeminiTranslator(api_key="", cache_path=pathlib.Path(root) / "x.json")
            key_a = tr._cache_key("The original English article title", "Original excerpt A")
            key_b = tr._cache_key("The original English article title", "Original excerpt B")
            self.assertNotEqual(key_a, key_b)


if __name__ == "__main__":
    unittest.main()
