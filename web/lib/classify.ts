// 关键词分类规则：按顺序匹配，命中第一个即返回。改分类效果只需要改这里。

export const ACTIVITY_CATEGORIES = ["文体", "社团", "讲座", "学习", "就业", "留学"] as const;
export const NOTICE_CATEGORIES = ["校园", "科研", "院系", "生活", "学业", "奖学金", "服务"] as const;

export type Kind = "活动" | "通知";
export type Category =
  | (typeof ACTIVITY_CATEGORIES)[number]
  | (typeof NOTICE_CATEGORIES)[number];

const ACTIVITY_RULES: [Category, RegExp][] = [
  ["就业", /招聘|校招|实习|就业|宣讲|职业|求职|访企拓岗|offer/i],
  ["留学", /留学|交换|海外|访学|出国|暑期学校|国际交流|联培/],
  ["讲座", /讲座|报告会|论坛|沙龙|分享会|讲堂|学术.{0,4}茶|对话会|思政课/],
  ["社团", /社团|招新|纳新|协会|志愿|实践|支教|学生会|研会|团委|部长团|代表大会|见面大会/],
  ["文体", /比赛|大赛|演出|音乐|晚会|运动|球赛|马拉松|电影|展览|艺术|游园|联谊|舞/],
  ["学习", /公开课|培训|训练营|工作坊|读书|导读|认证|微专业|实验班/],
];

const NOTICE_RULES: [Category, RegExp][] = [
  ["奖学金", /奖学金|助学|资助|评优|奖励|补助|励志/],
  ["科研", /科研|课题|立项|基金|创新训练|大创|创新年会|论文|新刊|研究/],
  ["学业", /选课|考试|四六级|学籍|课程|教务|成绩|重修|补缓考|毕业|学位|分流|普通话|教室|慕课|开课/],
  // 节日祝福类推文数量多但没有实际信息，归到「校园」，免得把「生活」挤满
  ["校园", /中秋|国庆|节日|快乐|祝福|安康|团圆/],
  ["生活", /宿舍|食堂|校园卡|校车|医院|疫苗|体检|后勤|放假|开放时间/],
  ["服务", /图书馆|网络|系统|维护|信息化|办理|服务|公示|公告/],
];

// 标题里出现这些词，基本可以认为是可以参与的「活动」
const ACTIVITY_HINT =
  /讲座|报告会|论坛|沙龙|分享会|招新|纳新|招募|比赛|大赛|演出|晚会|游园|宣讲|招聘|校招|实习|公开课|训练营|工作坊|对话会|学术.{0,4}茶|见面大会|思政课|访企拓岗|来袭/;

export function classify(title: string, organizer: string, rawType: string): { kind: Kind; category: Category } {
  if (ACTIVITY_HINT.test(title) || rawType === "活动") {
    for (const [cat, re] of ACTIVITY_RULES) if (re.test(title)) return { kind: "活动", category: cat };
    // 爬虫标成「活动」但标题看不出活动类型的（如考试报名），按通知处理
    if (ACTIVITY_HINT.test(title)) return { kind: "活动", category: "社团" };
  }
  for (const [cat, re] of NOTICE_RULES) if (re.test(title)) return { kind: "通知", category: cat };
  if (/学院|系|书院|研究院|研究所/.test(organizer)) return { kind: "通知", category: "院系" };
  return { kind: "通知", category: "校园" };
}
