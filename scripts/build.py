#!/usr/bin/env python3
"""拾趣：用公开 RSS 生成静态文章列表。只用 Python 标准库。"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import email.utils
import hashlib
import html
import json
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from translation import LocalTranslator, has_chinese

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "web" / "data" / "articles.json"
MAX_BYTES = 2_500_000
MAX_PER_FEED = 12

# (显示名, 栏目, 机构, 类型, RSS URL)
# 先保留数量有限、直接可访问的源，不采用第三方 RSSHub 代理。
# 中文与英文混合；英文标题与 RSS 导读将在构建时离线译为中文。
FEEDS = [
    ("中新网·文化", "文化与人文", "中国新闻网", "discovery", "https://www.chinanews.com.cn/rss/culture.xml"),
    ("中新网·生活", "生活与社会", "中国新闻网", "discovery", "https://www.chinanews.com.cn/rss/life.xml"),
    ("中新网·财经", "商业与经济", "中国新闻网", "discovery", "https://www.chinanews.com.cn/rss/finance.xml"),
    ("中新网·社会", "社会与生活", "中国新闻网", "news", "https://www.chinanews.com.cn/rss/society.xml"),
    ("科学网", "科学与研究", "科学网", "discovery", "https://www.sciencenet.cn/xml/news-0.aspx?di=0"),
    ("Smithsonian", "历史与自然", "Smithsonian", "discovery", "https://www.smithsonianmag.com/rss/latest_articles/"),
    ("JSTOR Daily", "历史与知识", "JSTOR Daily", "discovery", "https://daily.jstor.org/feed/"),
    ("Quanta Magazine", "数学与科学", "Quanta Magazine", "discovery", "https://www.quantamagazine.org/feed/"),
    ("Kottke", "艺术与杂谈", "Kottke", "discovery", "https://kottke.org/index.xml"),
    ("3 Quarks Daily", "人文与杂谈", "3 Quarks Daily", "discovery", "https://3quarksdaily.com/feed"),
    ("BBC World", "国际与社会", "BBC", "news", "https://feeds.bbci.co.uk/news/world/rss.xml"),
]

# 只做轻量栏目过滤，不按政治主张或特定媒体的立场过滤。
# 保留原始标题：未阅读正文时，不让规则算法擅自改变事实或语义。
OPINION_PREFIX = re.compile(r"^(?:墙外文摘[:：]|德语媒体[:：]|观点[:：]|社论[:：]|评论[:：]|opinion[:：\s-]|editorial[:：\s-])", re.I)
CLICKBAIT = re.compile(r"(?:震惊！|震惊!|万万没想到|真相竟然|你绝对想不到|you won.t believe)", re.I)


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].rsplit(":", 1)[-1].lower()


def field(node: ET.Element, *names: str) -> str:
    wanted = set(names)
    for child in node:
        if local(child.tag) in wanted and child.text and child.text.strip():
            return child.text.strip()
    return ""


def plain(text: str, limit: int = 360) -> str:
    text = re.sub(r"<\s*(?:br|/p|/div)\b[^>]*>", " ", text or "", flags=re.I)
    text = re.sub(r"<[^>]*>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit].rstrip() + ("…" if len(text) > limit else "")


def safe_url(url: str) -> str:
    url = html.unescape(url or "").strip()
    try:
        p = urlsplit(url)
        if p.scheme.lower() in ("http", "https") and p.netloc and not p.username and not p.password:
            return url
    except ValueError:
        pass
    return ""


def read_date(node: ET.Element) -> str:
    raw = field(node, "pubdate", "published", "updated", "date")
    if not raw:
        return ""
    try:
        return email.utils.parsedate_to_datetime(raw).date().isoformat()
    except (ValueError, TypeError, OverflowError):
        try:
            return dt.datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
        except ValueError:
            return ""


def entry_link(node: ET.Element) -> str:
    direct = safe_url(field(node, "link"))
    if direct:
        return direct
    for child in node:
        if local(child.tag) == "link" and child.attrib.get("rel", "alternate") == "alternate":
            candidate = safe_url(child.attrib.get("href", ""))
            if candidate:
                return candidate
    return ""


def entry_image(node: ET.Element, raw: str) -> str:
    for child in node:
        name = local(child.tag)
        if name in ("thumbnail", "enclosure", "content"):
            candidate = safe_url(child.attrib.get("url", ""))
            kind = child.attrib.get("type", "")
            if candidate and (kind.startswith("image/") or name == "thumbnail" or re.search(r"\.(?:jpg|jpeg|png|webp)(?:\?|$)", candidate, re.I)):
                return candidate
    match = re.search(r"<img\b[^>]*?src=['\"]([^'\"]+)", raw or "", re.I)
    return safe_url(match.group(1)) if match else ""


def title_is_weak(title: str) -> bool:
    return bool(OPINION_PREFIX.search(title) or CLICKBAIT.search(title))


def parse_feed(raw: bytes, source: str, topic: str, publisher: str, lane: str) -> list[dict]:
    root = ET.fromstring(raw)
    out = []
    for node in root.iter():
        if local(node.tag) not in ("item", "entry"):
            continue
        title = plain(field(node, "title"), 250)
        url = entry_link(node)
        if len(title) < 10 or not url or title_is_weak(title):
            continue
        raw_summary = field(node, "description", "summary", "encoded", "content")
        summary = plain(raw_summary, 340)
        if len(summary) < 15:
            summary = "暂时没有足够的摘要信息，可以打开原文了解内容。"
        out.append({
            "id": hashlib.sha256(url.encode("utf-8")).hexdigest()[:18],
            "title": title,
            "editor_title": "",  # 只有人工确认后才填写；空值显示原标题
            "summary": summary,
            "original_summary": summary if raw_summary and len(plain(raw_summary, 340)) >= 15 else "",
            "display_language": "zh" if has_chinese(title) else "en",
            "translation_status": "original",
            "source": source,
            "publisher": publisher,
            "topic": topic,
            "lane": lane,
            "url": url,
            "image": entry_image(node, raw_summary),
            "date": read_date(node),
        })
        if len(out) >= MAX_PER_FEED:
            break
    return out


def fetch(feed: tuple[str, str, str, str, str]) -> tuple[str, list[dict], str]:
    source, topic, publisher, lane, url = feed
    request = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; CurioReader/0.4; personal feed reader)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    })
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            return source, [], "内容过大"
        articles = parse_feed(raw, source, topic, publisher, lane)
        return source, articles, "" if articles else "没有符合条件的条目"
    except (urllib.error.URLError, TimeoutError, ET.ParseError, OSError, ValueError) as exc:
        return source, [], type(exc).__name__


def dedupe(articles: list[dict]) -> list[dict]:
    seen = set()
    result = []
    for a in articles:
        p = urlsplit(a["url"])
        key = urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/"), "", ""))
        if key in seen:
            continue
        seen.add(key)
        result.append(a)
    return result


def localize(items: list[dict], translator: LocalTranslator) -> None:
    """仅转换 RSS 标题和摘要；保留原始信息供读者核对。"""
    translated = 0
    failed = 0
    for item in items:
        original_title = item.get("title", "")
        original_summary = item.get("original_summary", "")
        if has_chinese(original_title):
            simplified_title = translator.simplify(original_title)
            simplified_summary = translator.simplify(item.get("summary", ""))
            if simplified_title != original_title:
                item["editor_title"] = simplified_title
            item["summary"] = simplified_summary
            item["display_language"] = "zh"
            item["translation_status"] = "converted" if simplified_title != original_title or simplified_summary != item.get("original_summary", "") else "original"
            continue
        chinese_title = translator.to_chinese(original_title)
        if not chinese_title:
            item["display_language"] = "en"
            item["translation_status"] = "unavailable"
            failed += 1
            continue
        item["editor_title"] = chinese_title[:200]
        if original_summary:
            chinese_summary = translator.to_chinese(original_summary)
            if chinese_summary:
                item["summary"] = chinese_summary[:260]
                item["translation_status"] = "machine"
            else:
                item["summary"] = "该文章暂时没有可用的中文导读，可以打开原文了解详情。"
                item["translation_status"] = "partial"
        else:
            item["summary"] = "订阅源未提供足够的文章摘要，可以打开原文了解详情。"
            item["translation_status"] = "partial"
        item["display_language"] = "zh"
        translated += 1
    print(f"Localization: {translated} English titles translated, {failed} untranslated")


def main() -> None:
    parser = argparse.ArgumentParser(description="生成拾趣阅读数据")
    parser.add_argument("--no-download", action="store_true", help="不自动下载翻译模型；本地调试适用")
    args = parser.parse_args()
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(fetch, FEEDS))
    all_items = [item for _, items, _ in results for item in items]
    items = dedupe(all_items)
    failures = [f"{source}: {error}" for source, _, error in results if error]
    for line in failures:
        print("SOURCE WARNING:", line)
    print(f"Found {len(items)} articles from {len(FEEDS) - len(failures)} / {len(FEEDS)} sources")

    if items:
        localize(items, LocalTranslator(allow_download=not args.no_download))
    else:
        # 保留项目内现有快照，避免偶发网络故障导致网站无内容。
        fallback = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {}
        items = fallback.get("articles", [])
        if not items:
            raise SystemExit("No available feeds and no local cached articles; aborting deployment")
        print("All sources unavailable; retaining bundled fallback articles")

    chinese_count = sum(1 for item in items if item.get("display_language") == "zh" or has_chinese(item.get("editor_title", "")))
    if not chinese_count:
        raise SystemExit("No Chinese-readable articles available; aborting deployment")
    payload = {
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
        "articles": items,
        "sources_ok": len(FEEDS) - len(failures),
        "sources_total": len(FEEDS),
        "chinese_ready": chinese_count,
        "note": "只使用公开 RSS 摘要。英文条目采用离线机器翻译，非全文翻译或人工审稿。",
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Wrote", OUTPUT, f"({chinese_count} Chinese-readable articles)")


if __name__ == "__main__":
    main()
