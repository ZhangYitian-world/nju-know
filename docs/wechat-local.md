# 本机公众号采集

当前公众号通道使用 [wechatAutoRSSTool](https://github.com/x554960766/wechatAutoRSSTool) 的微信读书采集模块。已验证版本为 `1b24c1d388ab3ff0262cbb7ada5533f23c7b4689`，原项目及许可证保留在本机安装目录中。

NJU Know 只调用公开文章列表，保留标题、原文链接、发布单位、时间、封面和已有简介，不批量下载正文、评论或互动数据。原有 WeRSS 适配仍保留，但本机模式下不让旧上游覆盖新数据。

## 自动更新如何工作

```text
本机微信读书授权（凭据在 .local/，不提交）
  → 本机每 6 小时运行 publish.sh
  → collect_wechat_local.py 顺序抓取公众号元数据
  → data/wechat.json + data/wechat_source_status.json
  → git push
  → GitHub Actions 抓官网、DeepSeek 分类与摘要、构建并部署
```

公众号采集依赖本机运行，电脑关机或休眠期间暂停。GitHub 上的官网抓取与部署仍每 3 小时运行；云端没有微信读书登录凭据，也不尝试直接抓取本机通道。

本机采集每个公众号最多取最近 8 条，各来源间等待 2 秒，合并已有内容后最多保留 480 条并过滤过期文章。单个来源失败时保留旧内容，全部失败时不覆盖 `wechat.json`。新增或修改公开来源可编辑根目录 `wechat_sources.json`。

## 安装与登录

在仓库根目录运行，使用独立的 Python 3.12 虚拟环境：

```bash
mkdir -p .local
git clone https://github.com/x554960766/wechatAutoRSSTool.git .local/wechat-collector
git -C .local/wechat-collector checkout 1b24c1d388ab3ff0262cbb7ada5533f23c7b4689
uv venv --python 3.12 .local/wechat-collector/.venv
uv pip install --python .local/wechat-collector/.venv/bin/python -r requirements-wechat.txt
.local/wechat-collector/.venv/bin/python wechat_login.py
```

打开 <http://127.0.0.1:5291/nju-setup>，生成二维码，用自己的微信扫码并在手机上确认登录微信读书。完成后可以关闭登录服务；定时采集直接调用本机模块，不需要一直开着这个网页。

`.local/` 已加入 Git 忽略规则。登录数据、虚拟环境和采集器源码都保留在该目录；不要复制账号池文件、Token 或原始服务日志到公开仓库。登录窗口仅监听本机回环地址。

## 启用本机模式

在已有的 `.env` 中添加或修改一项，保留其他已有凭据：

```dotenv
WECHAT_PROVIDER=local
```

然后在 GitHub 仓库的 **Actions Variables** 中同样设置 `WECHAT_PROVIDER=local`。这是模式开关，不是密钥；原有 `DEEPSEEK_API_KEY` 继续保留在 Actions Secrets。

本机手动更新并发布：

```bash
sh publish.sh
```

只采集、不提交时：

```bash
.local/wechat-collector/.venv/bin/python collect_wechat_local.py
```

`publish.sh` 会读取 `.env`。自行运行采集命令时也可用 `WECHAT_COLLECTOR_ROOT` 指定外部采集器目录；发布脚本支持 `WECHAT_COLLECTOR_PYTHON` 覆盖虚拟环境的 Python 路径。

## 状态和重新授权

`data/wechat_source_status.json` 仅包含公开来源名称、检查时间、状态、条数、最新文章日期及简化的异常类型，不包含账号登录信息。模型仍在云端处理，首次新增较多文章时会分轮处理，未处理内容先使用规则。

如果所有来源都不再取得文章，先重新运行 `wechat_login.py` 查看登录状态；授权失效时重新扫码。某个公众号长期没有新内容也可能是该号未更新、未被微信读书收录或受接口限制，不应直接清空其历史记录。

切回旧服务时，把本机和 GitHub 变量的 `WECHAT_PROVIDER` 都改为 `werss`；应先确认旧服务有新数据，再切换。
