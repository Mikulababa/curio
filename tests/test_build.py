"""小规模纯离线测试，无需安装机器翻译模型或访问网络。"""
from __future__ import annotations
import json
import pathlib
import sys
import unittest

SCRIPTS = pathlib.Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import build
from translation import LocalTranslator, has_chinese


class FakeTranslator:
    def simplify(self, value):
        return value.replace('歷史', '历史').replace('發現', '发现')
    def to_chinese(self, value):
        if 'Scientists' in value:
            return '研究人员提出了一项新的发现'
        if 'Researchers' in value:
            return '研究人员介绍了具体实验结果'
        return ''

class BuildTests(unittest.TestCase):
    def test_chinese_conversion_and_english_translation(self):
        items = [
            dict(title='Scientists made a discovery',editor_title='',summary='Researchers tested a new method', original_summary='Researchers tested a new method', display_language='en'),
            dict(title='歷史上的新發現',editor_title='',summary='這是歷史資料', original_summary='這是歷史資料', display_language='zh'),
        ]
        build.localize(items, FakeTranslator())
        self.assertEqual(items[0]['editor_title'], '研究人员提出了一项新的发现')
        self.assertEqual(items[0]['summary'], '研究人员介绍了具体实验结果')
        self.assertEqual(items[0]['title'], 'Scientists made a discovery')
        self.assertEqual(items[0]['original_summary'], 'Researchers tested a new method')
        self.assertEqual(items[0]['translation_status'], 'machine')
        self.assertEqual(items[1]['editor_title'], '历史上的新发现')

    def test_failed_translator_does_not_fabricate_content(self):
        item = dict(title='Unknown article',editor_title='',summary='An original excerpt',original_summary='An original excerpt')
        build.localize([item], FakeTranslator())
        self.assertEqual(item['display_language'], 'en')
        self.assertEqual(item['summary'], 'An original excerpt')
        self.assertEqual(item['translation_status'], 'unavailable')

    def test_rss_parsing_source_retained(self):
        rss = b'<rss><channel><item><title>Scientists explain the physics of cosmic rays</title><link>https://example.org/a</link><description>Researchers tested a new method, measured the result and published data.</description></item></channel></rss>'
        items = build.parse_feed(rss, 'Example', 'Science', 'Example media', 'discovery')
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['original_summary'], items[0]['summary'])
        self.assertEqual(items[0]['display_language'], 'en')
        self.assertFalse(items[0]['editor_title'])

    def test_no_untrusted_url(self):
        self.assertEqual(build.safe_url('javascript:alert(1)'), '')
        self.assertEqual(build.safe_url('https://example.com/read'), 'https://example.com/read')

    def test_fallback_data_is_chinese_readable(self):
        path = pathlib.Path(__file__).resolve().parents[1] / 'web' / 'data' / 'articles.json'
        data = json.loads(path.read_text(encoding='utf8'))
        self.assertTrue(any(has_chinese(x.get('editor_title','')) for x in data['articles']))

if __name__ == '__main__':
    unittest.main()
