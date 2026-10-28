"""Parse public NJU notice lists without executing JavaScript or requiring packages."""

import json
import re
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit

BEIJING = timezone(timedelta(hours=8))
ARTICLE_PATH = re.compile(r"/(?:c\d+a\d+/pagem?\.htm|info/\d+/\d+\.htm|\d{8}/i\d+\.html)(?:$|[?#])")


def article_url(base, href):
    parts = urlsplit(urljoin(base, (href or "").strip()))
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return ""
    if not parts.hostname.endswith(".nju.edu.cn") or not ARTICLE_PATH.search(parts.path):
        return ""
    # The supported institutional sites also serve these public articles via HTTPS.
    return urlunsplit(("https", parts.netloc, re.sub(r"/{2,}", "/", parts.path), parts.query, ""))


def parse_date(text):
    # Some Webplus lists put MM-DD and YYYY in separate spans, in that order.
    for pattern, order in (
        (r"(?<!\d)(20\d{2})\s*[-./年]\s*(\d{1,2})\s*[-./月]\s*(\d{1,2})(?!\d)", (1, 2, 3)),
        (r"(?<!\d)(\d{1,2})-(\d{1,2})\s+(20\d{2})(?!\d)", (3, 1, 2)),
        (r"(?<!\d)(\d{1,2})\s+(20\d{2})-(\d{1,2})(?!\d)", (2, 3, 1)),
    ):
        match = re.search(pattern, text)
        if match:
            try:
                return date(*(int(match.group(i)) for i in order)).isoformat()
            except ValueError:
                pass
    return ""


class Node:
    def __init__(self, tag, attrs=(), parent=None):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.children = []

    def nodes(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.nodes()

    def text(self, skip_links=False):
        if self.tag in ("script", "style") or (skip_links and self.tag == "a"):
            return ""
        return " ".join(c.text(skip_links) if isinstance(c, Node) else c for c in self.children)


class NoticeListParser(HTMLParser):
    """Dated rows in Webplus and VSB, including split publication dates."""
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, base_url):
        super().__init__()
        self.base_url = base_url
        self.root = Node("root")
        self.current = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.current)
        self.current.children.append(node)
        if tag not in self.VOID:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.current.children.append(Node(tag, attrs, self.current))

    def handle_endtag(self, tag):
        node = self.current
        while node is not self.root:
            if node.tag == tag:
                self.current = node.parent
                return
            node = node.parent

    def handle_data(self, data):
        self.current.children.append(data)

    @property
    def items(self):
        result, seen = [], set()
        for row in self.root.nodes():
            if row.tag not in ("li", "tr", "dd", "a"):
                continue
            links = []
            for node in row.nodes():
                if node.tag == "a":
                    url = article_url(self.base_url, node.attrs.get("href"))
                    if url:
                        links.append((node, url))
            # A navigation section containing an entire list is not one article.
            urls = {url for _, url in links}
            if len(urls) != 1:
                continue
            node, url = max(links, key=lambda pair: len(pair[0].attrs.get("title", pair[0].text())))
            title_node = next((part for part in node.nodes() if re.search(r"(?:^|\s)(?:text_one|bt|news_title)(?:\s|$)", part.attrs.get("class", ""))), node)
            title = re.sub(r"\s+", " ", node.attrs.get("title") or title_node.text()).strip()
            title = re.sub(r"^\[[^\]]+\]\s*", "", title)
            published = ""
            for part in row.nodes():
                if part.tag == "time" or re.search(r"date|time|news_meta", part.attrs.get("class", ""), re.I):
                    published = parse_date(part.attrs.get("datetime", "") or part.text())
                    if published:
                        break
            published = published or parse_date(row.text(skip_links=True))
            if not published:
                # VSB often wraps both its date and title in the same anchor.
                published = next((parsed for part in row.nodes() if len(part.text().strip()) <= 24 and (parsed := parse_date(part.text()))), "")
            if not title or not published or url in seen:
                continue
            seen.add(url)
            result.append({"title": title, "url": url, "date": published, "category": ""})
        return result


class EmbeddedListParser:
    """NJU CMS embeds literal JSON in dataList for its client-rendered lists."""
    def __init__(self, base_url):
        self.base_url, self.items = base_url, []

    def feed(self, text):
        match = re.search(r"\bvar\s+dataList\s*=\s*", text)
        if not match:
            return
        try:
            pages, _ = json.JSONDecoder().raw_decode(text[match.end():])
        except (ValueError, TypeError):
            return
        if not isinstance(pages, list):
            return
        seen = set()
        for page in pages:
            if not isinstance(page, dict):
                continue
            for row in page.get("infolist", []):
                url = article_url(self.base_url, row.get("url"))
                title = (row.get("title") or "").strip()
                try:
                    published = datetime.fromtimestamp(float(row.get("releaseTime") or row.get("releasetime")) / 1000, BEIJING).date().isoformat()
                except (TypeError, ValueError, OverflowError, OSError):
                    continue
                if title and url and url not in seen:
                    seen.add(url)
                    self.items.append({"title": title, "url": url, "date": published, "category": ""})
