# 南大知道 NJU Know

南京大学校园活动与通知聚合站的 Next.js 前端。数据直接读取上级目录 `../data/*.json`（由 `scraper.py` / `fetch_wechat.py` 产出），构建时用 `lib/classify.ts` 的关键词规则分到「活动 / 通知」及细类。

```bash
npm install
npm run dev     # 本地开发 http://localhost:3000
npm run build   # 静态导出到 out/
```

页面：首页（搜索、来源筛选、分类 chip、多栏/双栏）、`/calendar/` 活动日历、`/sources/` 信息源、`/rss.xml`。

## 部署与密钥

网站地址：<https://njuknow.zhangyitian.com/>。源码仓库：<https://github.com/ZhangYitian-world/nju-know>。

GitHub Actions 每三小时抓取公众号与官网通知，使用 Node.js 24 构建，将 `web/out` 部署到 GitHub Pages。自定义域名使用根路径，Next.js 不设置 `basePath`。若切回默认项目站地址 `https://zhangyitian-world.github.io/nju-know/`，需配置 `basePath: "/nju-know"` 并重新构建。

WeRSS 的 `WERSS_AK` / `WERSS_SK` 在 GitHub 仓库的 Actions Secrets 中配置。本地密钥写入仓库根目录 `.env`（已忽略），不要提交任何真实密钥、登录凭证或本地交接记录。

AI 分类暂由本地 `publish.sh` 调用 `enrich_llm.py`：在本地 `.env` 配置 `DEEPSEEK_API_KEY` 后，新结果缓存到 `data/llm.json` 并随数据推送；未配置时使用关键词规则。当前 CI 只读取该缓存，不调用 DeepSeek，避免每次构建重复分类产生费用。后续在 CI 接入 AI 时，还需配置同名 Actions Secret 并处理缓存持久化。

网页仅发布校园公开通知与文章信息，不包含运行密钥。构建时间与文章最新发布日期分别显示，避免把重新构建误认为来源已更新。

## 官网来源与自动更新

当前共接入 23 个官网来源：原有教务处、图书馆，以及 19 个学院、研究生院和信息化中心。新增来源列表和公开栏目地址在根目录 `official_sources.json` 中；`source_parsers.py` 适配 Webplus、VSB 与包含字面 JSON 的南大 CMS 列表，不执行网站脚本，不访问需登录的正文。

电子科学与工程学院目前接入公开讲座栏目。院内通知列表在本机可读，但 GitHub 云端连续两次无法解析出文章，暂不纳入稳定抓取范围；不通过代理或登录绕过站点限制。其他学院按配置接入通知、招生、教学或学术活动栏目，不代表覆盖该学院的所有网页。

官网自动更新不需要 DeepSeek 或其他 API Key。GitHub Actions 每三小时抓取，最多同时访问 4 个来源，每个来源最多处理最新 60 条；活动默认保留 30 天，通知保留 120 天。新增来源读取列表的标题、发布日期和原文链接，截止时间以原文为准。学术报告与讲坛纳入讲座分类。

`data/notices.json` 和 `data/source_status.json` 通过 Actions Cache 在构建间保存。单个站点超时、改版或某个栏目不可用时，保留该来源未过期的旧文章，其他来源仍正常更新。信息源页面分别显示接入官网、抓取状态、检查时间及当前有内容的发布单位。

本地验证：在根目录运行 `python3 -m unittest discover -s tests -v`、`python3 scraper.py`，再在 `web/` 下运行 `npm run build`。抓取会更新本地 `data/notices.json`，请先保留已有的手动修改。

GitHub 定时任务可能排队延迟；公共仓库长期无活动时，GitHub 也可能停用定时工作流，需要在 Actions 页面恢复。公众号授权状态独立于官网更新。

## 致谢

产品形态与分类体系（活动：文体/社团/讲座/学习/就业/留学；通知：校园/科研/院系/生活/学业/奖学金/服务）参考自
[「北大知道」PKU Know](https://pkuknow.cn)，开发者涂增基（Zengji Tu），合作贡献者杨宣风、时豪。

PKU Know 未公开源码，也未声明许可证。本项目为独立实现，没有使用其代码、接口或视觉素材（logo、吉祥物等）。
