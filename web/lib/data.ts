import fs from "node:fs";
import path from "node:path";
import { ACTIVITY_CATEGORIES, NOTICE_CATEGORIES, classify, type Category, type Kind } from "./classify";

// 直接读取上级目录里 Python 爬虫产出的 JSON（构建时执行）
const DATA_DIR = path.join(process.cwd(), "..", "data");
const FILES = ["notices.json", "wechat.json"];
// enrich_llm.py 产出的大模型分类结果，按 url 索引；没有这个文件时退回关键词规则
const LLM_FILE = "llm.json";

type RawNotice = {
  title: string;
  source: string;
  organizer: string;
  type: string;
  date: string;
  time?: string;
  cover?: string;
  deadline: string;
  url: string;
  summary?: string;
};

type LlmResult = {
  kind: Kind;
  category: Category;
  signup: boolean;
  summary: string;
};

export type Item = {
  id: string;
  title: string;
  organizer: string;
  channel: "官网" | "公众号";
  kind: Kind;
  category: Category;
  date: string;
  time: string;
  cover: string;
  deadline: string;
  needsSignup: boolean;
  summary: string;
  url: string;
};

const SIGNUP = /报名|申报|招募|招新|纳新|预约/;

function readJson<T>(file: string, fallback: T): T {
  const full = path.join(DATA_DIR, file);
  return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, "utf8")) : fallback;
}

function validLlm(r: LlmResult | undefined): r is LlmResult {
  if (!r) return false;
  const cats: readonly string[] = r.kind === "活动" ? ACTIVITY_CATEGORIES : NOTICE_CATEGORIES;
  return cats.includes(r.category);
}

export function loadItems(): Item[] {
  const llm = readJson<Record<string, LlmResult>>(LLM_FILE, {});
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const file of FILES) {
    for (const r of readJson<RawNotice[]>(file, [])) {
      // 多个公众号转发同一篇文章时只保留一条
      const key = r.title.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      const ai = llm[r.url];
      const useAi = validLlm(ai);
      items.push({
        id: `${file}-${items.length}`,
        title: r.title.trim(),
        organizer: r.organizer || r.source,
        channel: r.source === "公众号" ? "公众号" : "官网",
        ...(useAi ? { kind: ai.kind, category: ai.category } : classify(r.title, r.organizer, r.type)),
        date: r.date,
        time: r.time ?? "",
        cover: r.cover ?? "",
        deadline: r.deadline,
        needsSignup: useAi ? ai.signup : SIGNUP.test(r.title),
        summary: (useAi && ai.summary) || r.summary || "",
        url: r.url,
      });
    }
  }
  return items.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}
