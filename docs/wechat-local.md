# 公众号采集：云端自动更新与本机授权

当前使用 [wechatAutoRSSTool](https://github.com/x554960766/wechatAutoRSSTool) 的微信读书采集模块，固定版本为 `1b24c1d388ab3ff0262cbb7ada5533f23c7b4689`。只取公开文章的标题、原文链接、发布单位、时间、封面和已有简介，不批量下载正文、评论或互动数据。

`wechat_sources.json` 配置 47 个公众号，包含原有数据的全部 45 个发布单位，并新增南京大学与南京大学学生会。每个来源每轮取最新 8 条，顺序请求、间隔 2 秒，合并后最多保留 480 条并过滤过期文章。单个来源失败时保留其旧文章；全部失败时不覆盖文章文件。

## 云端模式

在 GitHub Actions Variables 中设置 `WECHAT_PROVIDER=cloud`，使用现有的每 3 小时工作流：

```text
GitHub Actions 定时运行
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

此命令会把必要登录凭据发送到指定仓库的 `WECHAT_CLOUD_AUTH` Secret；不打印私密值，也不把 Secret 放入代码。新密钥会安全地替代旧授权缓存。然后在 Actions 中手动运行 Build and Deploy，查看真实来源采集结果。

## 本机模式和旧服务

如需本机运行，在 `.env` 中设置 `WECHAT_PROVIDER=local`，使用原有每 6 小时的 launchd / publish.sh；该模式才依赖本机开机。直接采集而不提交可运行：

```bash
.local/wechat-collector/.venv/bin/python collect_wechat_local.py
```

本机路径可通过 `WECHAT_COLLECTOR_ROOT` 和 `WECHAT_COLLECTOR_PYTHON` 覆盖。云端模式下本机 `.env` 可设为 `WECHAT_PROVIDER=cloud`，避免旧任务再次抓取或使用旧 WeRSS 覆盖云端来源。

旧 WeRSS 适配仍保留；只有先确认旧服务确实返回新数据后，才把模式切回 `werss`。

## 查看更新状态

网站信息源页展示公众号检查时间、状态和最新文章日期。`data/wechat_source_status.json` 只记录公开来源状态和简化异常类型。站点构建时间不代表文章或来源的更新时间；来源不可用时继续保留已有内容。
