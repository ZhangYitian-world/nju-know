import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ACTIVITY_CATEGORIES, NOTICE_CATEGORIES, classify, requiresNotice, type Category, type Kind } from "./classify";
import { cleanSummary, mergeStories, type Item } from "./dedupe";
export type { Item } from "./dedupe";

// 直接读取上级目录里 Python 爬虫产出的 JSON（构建时执行）
const DATA_DIR = process.env.NJU_DATA_DIR || path.join(process.cwd(), "..", "data");
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
  confidence: number;
  input_hash: string;
  schema_version: number;
  status: string;
};

export type OfficialSource = {
  name: string;
  pages: string[];
  status: "ok" | "partial" | "unavailable";
  checked_at: string;
  last_success: string;
  latest_date: string;
  item_count: number;
};

export function loadOfficialSources(): OfficialSource[] {
  return readJson<OfficialSource[]>("source_status.json", []);
}

const SIGNUP = /报名|申报|招募|招新|纳新|预约/;

function readJson<T>(file: string, fallback: T): T {
  const full = path.join(DATA_DIR, file);
  return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, "utf8")) : fallback;
}

function validLlm(r: LlmResult | undefined, notice: RawNotice): r is LlmResult {
  if (!r || r.status !== "accepted" || r.schema_version !== 3 || r.confidence < 0.8 || !Number.isFinite(r.confidence)) return false;
  if (r.kind !== "活动" && r.kind !== "通知") return false;
  const input = [notice.title.trim(), notice.organizer || notice.source, notice.date, [...(notice.summary || "").replace(/\s+/g, " ").trim()].slice(0, 500).join("")].join("\n");
  if (r.input_hash !== createHash("sha256").update(input).digest("hex")) return false;
  if (typeof r.signup !== "boolean" || typeof r.summary !== "string") return false;
  const cats: readonly string[] = r.kind === "活动" ? ACTIVITY_CATEGORIES : NOTICE_CATEGORIES;
  return cats.includes(r.category);
}

export function loadItems(): Item[] {
  const llm = readJson<Record<string, LlmResult>>(LLM_FILE, {});
  const items: Item[] = [];
  for (const file of FILES) {
    for (const r of readJson<RawNotice[]>(file, [])) {
      const ai = llm[r.url];
      const useAi = validLlm(ai, r) && !(ai.kind === "活动" && requiresNotice(r.title, r.summary));
      const channel = r.source === "公众号" ? "公众号" : "官网";
      const organizer = r.organizer || r.source;
      items.push({
        id: `${file}-${items.length}`,
        title: r.title.trim(),
        organizer: r.organizer || r.source,
        channel,
        channels: [channel],
        origins: [{ title: r.title.trim(), organizer, channel, url: r.url, date: r.date }],
        ...(useAi ? { kind: ai.kind, category: ai.category } : classify(r.title, organizer, r.type, r.summary)),
        date: r.date,
        time: r.time ?? "",
        cover: r.cover ?? "",
        deadline: r.deadline,
        needsSignup: useAi ? ai.signup : SIGNUP.test(r.title),
        summary: cleanSummary((useAi && ai.summary) || r.summary || ""),
        url: r.url,
      });
    }
  }
  return mergeStories(items);
}
