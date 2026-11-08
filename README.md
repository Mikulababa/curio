# 拾趣 · Curio

一个轻量级的网页阅读器，聚合来自不同领域与媒体的公开文章，方便随时翻阅、发现感兴趣的新内容。

**在线访问：** https://mikulababa.github.io/curio/

## 功能

- **随手翻阅**：一次展示一篇文章，支持滑动、按钮与键盘切换。
- **多元内容**：汇集科学、历史、文化、社会、经济等领域的公开 RSS 订阅源。
- **来源轮换**：通过随机抽取和来源分散规则组织信息流，不依据阅读时长建立兴趣画像。
- **文章预览**：展示标题、简短摘要、发布时间及来源，并提供原文链接。
- **本地收藏**：收藏记录保存在当前浏览器，不需要注册账号。
- **移动端适配**：支持手机、平板及桌面浏览器，可添加到手机主屏幕。

页面同时提供独立的[标题盲读实验](https://mikulababa.github.io/curio/experiment.html)。

## 技术实现

项目由静态网页和定时数据构建任务组成，无需常驻服务器。

```text
RSS 订阅源
    ↓
Python 抓取、解析与去重
    ↓
web/data/articles.json
    ↓
GitHub Pages 静态网页
```

GitHub Actions 定时执行构建脚本并发布网页。网页直接读取生成的 JSON 数据；文章内容仍通过原始媒体链接访问。

## 本地运行

需要 Python 3.10 或更新版本。构建脚本仅使用 Python 标准库。

```powershell
# 更新文章数据
py scripts/build.py

# 在本地启动静态网页预览
py -m http.server 8765 --directory web
```

打开 http://localhost:8765/。

## 部署

1. 将项目推送到 GitHub 仓库的 `main` 分支。
2. 在仓库 **Settings → Pages** 中，将 **Source** 设为 **GitHub Actions**。
3. 在 **Actions** 中手动运行 **更新并发布拾趣**，或者通过推送触发首次部署。
4. 部署成功后访问对应的 GitHub Pages 地址。

工作流配置位于 `.github/workflows/publish.yml`，默认每六小时尝试更新一次。定时执行可能延迟，部分订阅源也可能暂时不可用。

## 项目结构

```text
.github/workflows/publish.yml   自动构建与部署
scripts/build.py                RSS 抓取及文章数据生成
web/index.html                 阅读界面
web/app.js                     阅读交互与收藏
web/styles.css                 页面样式
web/data/articles.json         构建生成的文章数据
web/experiment.html            标题盲读实验
```

## 数据与隐私

- 文章来源于公开 RSS，保留原文链接；本站展示简短的标题与摘要，不重新托管文章全文。
- 阅读记录不上传至服务器。收藏使用浏览器本地存储，因此不会自动跨设备同步。
- 标题默认沿用文章来源；只有明确提供编辑标题的文章才展示改写版本，原题仍可查看。
- GitHub Pages 网站和仓库内容为公开资源，请勿将私人资料或访问密钥提交到仓库。
