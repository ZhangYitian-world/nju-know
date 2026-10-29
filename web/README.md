# 南大知道 NJU Know

南京大学校园活动与通知聚合站的 Next.js 前端。构建时读取 `../data/*.json`，使用可选的 Jev / DeepSeek 结果辅助分类；未配置或模型不确定时使用关键词规则。默认四列等高卡片，支持搜索、渠道过滤和合并内容的原始来源展开。

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

云端分类由 `enrich_llm.py` 在每次抓取后执行。双模型模式需要在 GitHub Actions Secrets 配置以下两项：

- `TYPESAFE_API_KEY`：使用 Jev 的封闭类别 Choice 与报名 Noul 判断，默认固定模型 `jev-1.14.0`。不生成自由文本摘要。[官方接口](https://docs.typesafe.ai/api/system-one)、[模型及语言说明](https://docs.typesafe.ai/models)。
- `DEEPSEEK_API_KEY`：使用 `deepseek-flash` 的非思考 JSON 输出，支持分类与简短摘要。[官方 JSON 模式](https://api-docs.deepseek.com/guides/json_mode)。

`CLASSIFIER_PROVIDER` 仓库变量可设为 `hybrid`、`jev`、`deepseek` 或 `auto`。本站配置 hybrid：Jev 负责分类；DeepSeek 为同一批条目补摘要，Jev 不确定时再使用 DeepSeek 的分类复核结果。只有一个 Key 时暂用对应的单模型，两者都没有时不调用模型，继续用规则。auto 在两种 Key 都存在时也使用双模型。单个服务失败时本轮停用该服务，保留另一方结果，缺少的步骤在后续轮次重试。

可选模型名通过本地环境变量 `TYPESAFE_MODEL` / `DEEPSEEK_MODEL` 覆盖；云端当前使用默认模型名。本地运行时将需要的变量添加到现有 `.env`，不要覆盖已有的 WeRSS 凭证；格式见根目录 `.env.example`。本地 `.env` 不会自动同步到 GitHub Secrets。配置云端两项 Key 后，可在 Actions 的 Build and Deploy 手动 Run workflow 立即开始；也可等待下一次三小时定时更新。

分类结果存放在 `data/llm.json`，通过独立 Actions Cache 在云端构建之间保存，无需赋予工作流仓库写权限。缓存包含输入指纹、版本、提供方及模型名，文章标题、发布单位、日期或简介变化时才重新处理。每轮最多处理 100 条新内容、约 120 秒；API 失败时保留缓存并使用规则。低置信度也会记录，避免同一条模糊内容每三小时重复付费查询。达到轮次上限的内容在后续更新中继续处理。模型步骤日志显示当前唯一文章数，以及缓存接受、低置信度和待处理数量，可据此确认回填进度与缓存复用；失败时仅输出异常类型和 HTTP 状态，不输出密钥或服务响应正文。

Jev 的输出类型保证不代表语义判断永远正确。官方说明英语是主要训练语言，中文需用实际样本评估。目前以 Choice 置信度 ≥0.8 且获选概率 ≥0.55 为接收条件；低置信度或不合法结果回退规则。DeepSeek 的自评置信度不视为校准概率。适配器有模拟 API 回归测试；2026-10-29 已通过 DeepSeek 的真实云端分类、摘要及部署验证，Jev 尚待真实 Key 验证。调用成功不代表已测定中文分类准确率，实际效果仍需抽样核对。

网页仅发布校园公开通知与文章信息，不包含运行密钥。构建时间与文章最新发布日期分别显示，避免把重新构建误认为来源已更新。

## 官网来源与自动更新

当前共接入 23 个官网来源：原有教务处、图书馆，以及 19 个学院、研究生院和信息化中心。新增来源列表和公开栏目地址在根目录 `official_sources.json` 中；`source_parsers.py` 适配 Webplus、VSB 与包含字面 JSON 的南大 CMS 列表，不执行网站脚本，不访问需登录的正文。

电子科学与工程学院目前接入公开讲座栏目。院内通知列表在本机可读，但 GitHub 云端连续两次无法解析出文章，暂不纳入稳定抓取范围；不通过代理或登录绕过站点限制。其他学院按配置接入通知、招生、教学或学术活动栏目，不代表覆盖该学院的所有网页。

官网自动更新不需要 DeepSeek 或其他 API Key。GitHub Actions 每三小时抓取，最多同时访问 4 个来源，每个来源最多处理最新 60 条；活动默认保留 30 天，通知保留 120 天。新增来源读取列表的标题、发布日期和原文链接，截止时间以原文为准。学术报告与讲坛纳入讲座分类。

`data/notices.json` 和 `data/source_status.json` 通过 Actions Cache 在构建间保存。单个站点超时、改版或某个栏目不可用时，保留该来源未过期的旧文章，其他来源仍正常更新。信息源页面分别显示接入官网、抓取状态、检查时间及当前有内容的发布单位。

本地验证：在根目录运行 `python3 -m unittest discover -s tests -v`、`python3 scraper.py`，再在 `web/` 下运行 `npm run build`。抓取会更新本地 `data/notices.json`，请先保留已有的手动修改。

GitHub 定时任务可能排队延迟；公共仓库长期无活动时，GitHub 也可能停用定时工作流，需要在 Actions 页面恢复。公众号授权状态独立于官网更新。

## 分类、重复与排版

规则会优先区分教师/教职招聘、活动回顾、招生考核与科研，避免仅因标题含“招聘”或“研究生”就分错。模型结果也必须通过类别和输入指纹检查；明显回顾与教职招聘不会被模型放回学生活动。

重复合并按原文链接、规范化标题和很严格的活动标题近似判断，保留全部原文链接与发布单位；合并后的条目可以同时属于官网和公众号渠道。不同学院的同名名单、公示等行政内容不会仅因标题相同就合并。暂不做未经实测的模型语义去重，也不引入向量数据库。

首页使用响应式 Grid，桌面卡片统一 340px，手机统一 308px，封面、标题区和底部日期对齐。标题最多三行，完整标题保留在原文链接上；手机有独立的紧凑分类导航。开发时可用 `NJU_DATA_DIR` 指向独立的测试数据目录，避免覆盖本地待确认数据。

测试：根目录运行 `python3 -m unittest discover -s tests -v` 与 `node --experimental-strip-types --test tests/*.test.mjs`，再构建前端。

## 致谢

产品形态与分类体系（活动：文体/社团/讲座/学习/就业/留学；通知：校园/科研/院系/生活/学业/奖学金/服务）参考自
[「北大知道」PKU Know](https://pkuknow.cn)，开发者涂增基（Zengji Tu），合作贡献者杨宣风、时豪。

PKU Know 未公开源码，也未声明许可证。本项目为独立实现，没有使用其代码、接口或视觉素材（logo、吉祥物等）。
