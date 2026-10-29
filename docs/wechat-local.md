# 公众号采集：云端自动更新与本机授权

当前使用 [wechatAutoRSSTool](https://github.com/x554960766/wechatAutoRSSTool) 的微信读书采集模块，固定版本为 `1b24c1d388ab3ff0262cbb7ada5533f23c7b4689`。只取公开文章的标题、原文链接、发布单位、时间、封面和已有简介，不批量下载正文、评论或互动数据。

`wechat_sources.json` 配置 47 个公众号，包含原有数据的全部 45 个发布单位，并新增南京大学与南京大学学生会。每个来源每轮取最新 8 条，顺序请求、间隔 2 秒，合并后最多保留 480 条并过滤过期文章。单个来源失败时保留其旧文章；全部失败时不覆盖文章文件。

## 云端模式

在 GitHub Actions Variables 中设置 `WECHAT_PROVIDER=cloud`，公众号每天北京时间 08:30 采集一次；官网仍每 3 小时检查。代码发布、普通手动运行与官网定时更新均跳过公众号请求，只有每日计划或明确勾选 collect_wechat 的手动运行才会采集：

```text
GitHub Actions 每日公众号计划
  → 安装固定版本采集模块
  → 从 Secret 和加密缓存恢复微信读书授权
  → 采集公众号 + 抓取官网
  → DeepSeek 分类与摘要
  → Next.js 静态构建和 GitHub Pages 部署
```

个人电脑关机、休眠不影响该模式。GitHub 定时任务可能排队延迟；微信读书授权到期、验证或上游限制仍可能需要本人重新扫码，不能保证永久免维护。

### 授权如何保存

- `WECHAT_CLOUD_AUTH` 是仓库 Actions Secret，包含必要的登录／刷新 Token、设备标识及授权缓存加密密钥。不保存聊天记录，也不迁移头像和昵称等无关字段。
- 工作流只在采集步骤使用该 Secret，实际登录文件位于 runner 的 `.local/` 私密目录；SDK 的原始日志不输出到公开日志。
- 跨运行的授权状态先用 Fernet 认证加密，缓存中只有 `.local/wechat-auth.enc` 密文。密钥不随缓存保存，普通文章缓存不包含授权信息。
- 采集完成后删除 runner 中的明文授权目录；静态网站只读取公开文章数据。
- 新文章和来源状态使用独立的公开数据缓存保存，不需要工作流修改仓库或推送提交。

## 初次登录与重新授权

先在自己的电脑安装独立 Python 3.12 环境：

```bash
mkdir -p .local
git clone https://github.com/x554960766/wechatAutoRSSTool.git .local/wechat-collector
git -C .local/wechat-collector checkout 1b24c1d388ab3ff0262cbb7ada5533f23c7b4689
uv venv --python 3.12 .local/wechat-collector/.venv
uv pip install --python .local/wechat-collector/.venv/bin/python -r requirements-wechat.txt cryptography==50.0.2
.local/wechat-collector/.venv/bin/python wechat_login.py
```

打开 <http://127.0.0.1:5291/nju-setup>，用自己的微信扫码，在手机上确认登录微信读书。登录页只监听本机地址。凭据保存在忽略目录 `.local/` 中，不得提交到仓库。

本人同意将此账号授权用于指定仓库的云端采集后，执行：

```bash
.local/wechat-collector/.venv/bin/python upload_wechat_auth.py --upload --repo ZhangYitian-world/nju-know
```

此命令会把必要登录凭据发送到指定仓库的 `WECHAT_CLOUD_AUTH` Secret；不打印私密值，也不把 Secret 放入代码。新密钥会安全地替代旧授权缓存。然后在 Actions 中手动运行 Build and Deploy，明确勾选 collect_wechat，查看真实来源采集结果。普通手动运行默认只更新网站，不会采集公众号。

## 本机模式和旧服务

如需本机运行，在 `.env` 中设置 `WECHAT_PROVIDER=local`，使用原有每 6 小时的 launchd / publish.sh；该模式才依赖本机开机。直接采集而不提交可运行：

```bash
.local/wechat-collector/.venv/bin/python collect_wechat_local.py
```

本机路径可通过 `WECHAT_COLLECTOR_ROOT` 和 `WECHAT_COLLECTOR_PYTHON` 覆盖。云端模式下本机 `.env` 可设为 `WECHAT_PROVIDER=cloud`，避免旧任务再次抓取或使用旧 WeRSS 覆盖云端来源。

旧 WeRSS 适配仍保留；只有先确认旧服务确实返回新数据后，才把模式切回 `werss`。

## 查看更新状态

网站信息源页展示公众号检查时间、状态和最新文章日期。`data/wechat_source_status.json` 只记录公开来源状态和简化异常类型。站点构建时间不代表文章或来源的更新时间；来源不可用时继续保留已有内容。

## 采集进度、状态与提醒

连续两个来源触发明确频率限制时，暂停本轮后续请求并保留未完成来源；明确授权失效或微信验证则立即暂停。受限后至少冷却 30 分钟，期间仅发布代码的运行不会再次请求上游，也不算作新一次采集失败。下一轮定时运行到达后再尝试。

采集按北京时间自然日保存公开检查点：每完成一个来源就写入文章与进度，同一周期内重跑会跳过已成功的来源，失败或未完成的来源继续补采。进入新周期重新检查，适配每日一次计划。配置变化也会重新检查。检查点和健康摘要均不含登录凭据，与授权密文缓存分开。

首页和信息源页展示最近成功采集时间。页面每分钟按当前时间判断：超过 32 小时没有成功采集时显示同步延迟；每 5 分钟尝试读取公开健康摘要，打开着的页面也能跟随部署更新。公众号没有发布新文章不等于采集失败。

只有接口明确认证失败且自动续期未恢复时，才记录“登录需重新授权”。微信验证、频率限制和普通暂不可用分别显示；接口信息不足时不猜测为授权过期。新增文章数表示相对上次保留的公开数据快照新收录的数量。

工作流的“公众号健康检查”在页面部署之后独立执行：明确授权／验证问题立即失败；连续两轮完全未成功或超过 32 小时未成功也失败。网站仍可部署已有内容。邮件由 GitHub 自带通知发送，需账号在 Settings → Notifications 中开启 Actions 的失败通知，详情见 [GitHub 官方说明](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications)。没有新增邮件服务或密钥。

若整个工作流停跑，旧页面仍能按时间显示延迟；GitHub 失败邮件依赖工作流实际运行，并不是独立于 GitHub 的外部监控。

## 候选来源验证

wechat_candidates.json 只保存待核验的公开公众号名称与标识，不自动加入正式来源。手动运行 Verify candidate WeChat sources 工作流，会使用既有加密授权检查这些候选，公开结果保存在 wechat-candidate-results artifact 中，不部署网站、不覆盖正式公开文章缓存。仅验证通过的来源才加入 wechat_sources.json。

## 明天怎样确认恢复

每天 08:30（北京时间）尝试公众号采集，GitHub 排队时可能延迟。09:00 以后可检查当日运行的“云端采集公众号”步骤是否实际执行、成功来源数量，以及网站“最近成功”是否推进到当日。新收录数为零仍可能采集正常，不能只看是否有新文章。未实际尝试时应说明排队／未运行；仍为上游受限时应说明未恢复，不把部署成功当作恢复。

每日计划的延迟告警阈值是 32 小时，给正常的每日间隔留出 8 小时余量。已存在的请求受限或授权异常会持续显示，改计划不会将其变成正常。
