# 拾趣 · Curio

一个轻量级网页阅读器，聚合不同领域与媒体的公开文章，方便随时翻阅、发现新内容。

**在线访问：** https://mikulababa.github.io/curio/

## 功能

- **随手翻阅**：一次展示一篇文章，支持滑动、按钮和键盘切换；桌面端与移动端采用居中的阅读布局。
- **中文优先**：英文文章的标题与 RSS 摘要在构建时离线翻译为简体中文；中文标题自动转换为简体。
- **站内阅读**：点击「阅读导读」，在本站阅读订阅源提供的完整导读，支持返回、收藏和核对原始信息。仅在内容明确允许转载时展示站内全文。
- **保留原文**：可以展开查看原始英文标题和摘要，并随时跳转媒体原文。
- **多元内容**：聚合科学、历史、文化、社会、经济等领域的公开 RSS 源。
- **来源轮换**：随机抽取并分散相邻文章来源；不根据阅读时长建立用户画像。
- **本地收藏**：收藏保存在当前浏览器，暂不跨设备同步。
- **移动端适配**：支持手机、平板与桌面浏览器，可添加到手机主屏幕。

页面也保留了独立的[标题盲读实验](https://mikulababa.github.io/curio/experiment.html)。

## 技术实现

项目使用 GitHub Pages 托管静态网页，通过 GitHub Actions 定时生成文章数据，无需常驻服务。

```text
公开 RSS 订阅源
        ↓
Python 解析、去重和简单过滤
        ↓
Argos Translate 离线英译中、OpenCC 简繁转换
        ↓
web/data/articles.json
        ↓
GitHub Pages 静态网页
```

目前仅翻译订阅源提供的标题与摘要，不抓取或翻译文章全文。**机器翻译可能有错误，也不保证消除原标题的夸张措辞**；中文译文仅供快速浏览，事实应以原文为准。翻译模型不可用时，不会将英文原样冒充中文译文；日常信息流优先展示已有中文内容。

站内阅读层不会绕过第三方网站的访问限制，也不会将 RSS 摘要冒充原文全文；外部媒体页面可能仍有广告或付费墙。

## 本地运行

建议 Python 3.11（与 GitHub Actions 一致）。

```powershell
py -3.11 -m pip install -r requirements.txt
py -3.11 scripts/build.py
py -3.11 -m http.server 8765 --directory web
```

然后打开 http://localhost:8765/。首次运行翻译时会下载开源英译中模型；以后可复用本地已安装模型。若只需要查看现有页面，直接执行最后一条命令即可。

不下载翻译模型、仅调试抓取：

```powershell
py -3.11 scripts/build.py --no-download
```

## 部署

1. 将项目提交至 GitHub 仓库 `main` 分支。
2. 在仓库 **Settings → Pages** 中将 **Source** 设为 **GitHub Actions**。
3. 在 **Actions** 中运行 **更新并发布拾趣**，或通过推送自动部署。
4. 等发布成功后访问对应的 GitHub Pages 地址。

工作流在 `.github/workflows/publish.yml`，默认每六小时尝试抓取和发布。翻译模型缓存用于减少重复下载；GitHub 的定时任务和第三方 RSS 可能延迟或暂时不可用。

## 目录

```text
.github/workflows/publish.yml   定时构建与发布
requirements.txt                构建环境依赖
scripts/build.py                RSS 抓取与文章数据生成
scripts/translation.py          离线英译中与简繁转换
web/index.html                  阅读页面
web/app.js                      翻阅、站内阅读与本地收藏
web/styles.css                  页面样式
web/data/articles.json          构建生成的文章数据
web/experiment.html             标题盲读实验
```

## 数据与隐私

- 文章来源于公开 RSS，保留来源和原文链接，不在本站重新托管原文全文。
- 翻译在 GitHub Actions 构建环境完成；浏览器不向翻译接口发送用户阅读行为。
- 收藏保存在浏览器本地，不上传到服务器，也不会在不同设备间同步。
- GitHub Pages 站点及发布内容公开，请勿将私人信息或密钥提交到仓库。
