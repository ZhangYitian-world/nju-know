"""用 DeepSeek 给通知做分类、判断是否需报名、写一句话摘要。

结果按 url 缓存在 data/llm.json，已处理过的文章不会重复调用。
未配置 DEEPSEEK_API_KEY 或调用失败时直接跳过，前端会退回关键词规则，绝不使构建失败。
"""

import json
import os
import sys
import time
from urllib.request import Request, urlopen

import scraper

DATA_DIR = scraper.BASE / "data"
SOURCE_FILES = [DATA_DIR / "notices.json", DATA_DIR / "wechat.json"]
CACHE_FILE = DATA_DIR / "llm.json"

API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
API_URL = os.environ.get("DEEPSEEK_API_URL", "https://api.deepseek.com/chat/completions")
MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
BATCH = 20

# 与 web/lib/classify.ts 中的分类保持一致
CATEGORIES = {
    "活动": ["文体", "社团", "讲座", "学习", "就业", "留学"],
    "通知": ["校园", "科研", "院系", "生活", "学业", "奖学金", "服务"],
}

PROMPT = """你是南京大学校园信息分类助手。对每条校园推文/通知，判断：
- kind：「活动」（学生可以报名或到场参与的事情，如讲座、比赛、招新、招聘宣讲、志愿）或「通知」（信息告知类，包括新闻报道、节日祝福、已结束活动的回顾）
- category：
  活动可选：文体（文艺体育比赛演出展览）、社团（社团招新、志愿公益、社会实践、学生组织）、讲座（讲座报告论坛沙龙）、学习（课程培训、技能、读书）、就业（招聘实习宣讲）、留学（交换访学、海外项目）
  通知可选：校园（学校动态、新闻、节日祝福）、科研（学术科研、项目申报、论文成果）、院系（院系资讯）、生活（后勤医疗住宿出行）、学业（教务选课考试学籍）、奖学金（奖助评优）、服务（图书馆、信息化、办事指南、公示）
- signup：是否需要报名/申报/预约（布尔）
- summary：不超过 40 字的一句话摘要，说清楚是什么、何时何地；信息不足就写空字符串，不要编造

只输出 JSON：{"results":[{"i":序号,"kind":"...","category":"...","signup":true,"summary":"..."}]}"""


def load_json(path, default):
    return json.loads(path.read_text("utf-8")) if path.exists() else default


def call_deepseek(batch):
    lines = [
        f'{i}. 标题：{n["title"]}｜发布：{n["organizer"]}｜简介：{(n.get("summary") or "")[:150]}'
        for i, n in enumerate(batch)
    ]
    body = json.dumps(
        {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": PROMPT},
                {"role": "user", "content": "\n".join(lines)},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0,
        }
    ).encode("utf-8")
    req = Request(
        API_URL,
        data=body,
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    )
    with urlopen(req, timeout=120) as resp:
        content = json.loads(resp.read().decode("utf-8"))["choices"][0]["message"]["content"]
    return json.loads(content).get("results") or []


def valid(r):
    return r.get("kind") in CATEGORIES and r.get("category") in CATEGORIES[r["kind"]]


def main():
    if not API_KEY:
        print("未配置 DEEPSEEK_API_KEY，跳过大模型分类（前端使用关键词规则）。")
        return

    cache = load_json(CACHE_FILE, {})
    todo, seen = [], set()
    for f in SOURCE_FILES:
        for n in load_json(f, []):
            if n["url"] and n["url"] not in cache and n["url"] not in seen:
                seen.add(n["url"])
                todo.append(n)
    print(f"大模型分类：缓存 {len(cache)} 条，待处理 {len(todo)} 条")

    done = 0
    for start in range(0, len(todo), BATCH):
        batch = todo[start:start + BATCH]
        try:
            results = call_deepseek(batch)
        except Exception as e:
            print(f"  第 {start // BATCH + 1} 批调用失败：{e}，跳过")
            continue
        for r in results:
            i = r.get("i")
            if isinstance(i, int) and 0 <= i < len(batch) and valid(r):
                cache[batch[i]["url"]] = {
                    "kind": r["kind"],
                    "category": r["category"],
                    "signup": bool(r.get("signup")),
                    "summary": (r.get("summary") or "").strip(),
                }
                done += 1
        # 每批写一次，中途失败也不丢已完成的结果
        scraper.write_json(CACHE_FILE, cache)
        time.sleep(0.5)

    print(f"大模型分类完成：新增 {done} 条，已写入 {CACHE_FILE}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"大模型分类出错：{e}，跳过")
        sys.exit(0)
