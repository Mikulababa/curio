# 拾趣 v0.4 · GitHub Pages 个人阅读版

一个不需要持续运行服务器的 RSS 杂志。网页托管在 GitHub Pages；GitHub Actions 定时运行 Python 抓取公开文章的标题、摘要、原文链接，生成静态 `articles.json`。不接收费 API、不做个性化画像。

## 最快部署（Windows / PowerShell）

1. 在 GitHub [新建仓库](https://github.com/new)，命名为 `curio`，选择 **Public**，不要勾选自动添加 README / .gitignore / license。
2. 解压本包。在**解压后的 `curio-pages` 文件夹内部**打开 PowerShell。
3. 执行下列命令，把 `你的用户名` 改成你的 GitHub 用户名：

```powershell
git init -b main
git add .
git commit -m "Initial Curio Pages"
git remote add origin https://github.com/你的用户名/curio.git
git push -u origin main
```

> 如果使用 GitHub CLI，也可以改用 `gh repo create curio --public --source=. --remote=origin --push`（不要先创建同名远端仓库）。

4. 打开仓库页面，进入 **Settings → Pages → Build and deployment → Source → GitHub Actions**。
5. 进入 **Actions**，找到“更新并发布拾趣”，点击 **Run workflow**（或检查初次 push 是否已自动触发）。首次发布需要 Python 在线抓取，查看任务日志是否成功。
6. 打开 `https://你的用户名.github.io/curio/`。若显示 404，请确认第 4 步配置正确，以及 Actions 中发布任务成功。
7. iPhone Safari 打开这个网址 → 分享 → **添加到主屏幕**。同一网址在 Windows、Mac 浏览器也可直接打开。

GitHub Pages 默认公开，不应放入私人资料、口令、API Key。GitHub Free 需要使用公开仓库才能使用 Pages。

## 开发与预览

无需安装 Python 第三方库。

```powershell
# 项目根目录：手动抓取一次真实 RSS，更新本地 web/data/articles.json
py scripts/build.py

# 用简易静态文件服务器预览（不是长期运行的服务器）
py -m http.server 8765 --directory web
```

打开 http://localhost:8765/ 。**不要直接双击 index.html**：浏览器可能阻止 `file://` 页面读取 JSON。

## 项目结构

- `web/`：部署到 GitHub Pages 的静态网页；使用相对路径兼容 `/curio/` 子路径
- `web/data/articles.json`：构建时生成的文章快照；仓库内自带 3 篇已核对原文链接的示例文章
- `web/experiment.html`：之前的“标题盲读”小实验
- `scripts/build.py`：RSS 抓取、解析、去重、少量明显评论栏目过滤；保留原始标题
- `.github/workflows/publish.yml`：推送代码、手动运行或约每六小时定时执行一次，直接部署 Pages；**不会每六小时自动提交代码**

## 这版明确没有做的事情

- **没有 AI 中性标题改写**。RSS 新文章默认展示原始标题，只有经过人工核对且填写 `editor_title` 的文章才会展示中性标题（内置 3 篇有示例）。下一阶段再考虑按正文做 AI 改写；无法核实正文不改写。
- **没有文章质量保证**。轻量过滤仅用于去掉部分明显评论性栏目/标题党表达，不能替代正文审核，也不能判断宣传或动机。
- **没有翻译**。英文源仍然是英文标题、摘要，原文链接保持不变。
- **没有跨设备同步**。收藏只保存在当前浏览器本地存储；不同设备互不共享。
- **没有实时后台服务**。静态快照每次由 Actions 重新抓取；某些源可能失效。Actions 定时任务可能延迟，也可能在公开仓库长期无活动后被停用。
- **没有大量未读/阅读目标**。浏览时采用来源轮换、少量新闻占比与随机抽样；不读取停留时间或点击兴趣画像。

## 常见问题

- **网页 404**：去 Settings → Pages 看是否选中 GitHub Actions，再去 Actions 确认部署任务成功。
- **Actions 红叉**：打开失败步骤日志。抓取失败通常是源连接失败；全部源失败时构建会保留仓库里的 3 篇示例，不会伪造实时新闻。
- **启动后看到 3 篇示例**：说明真实源没有取到，请看 Actions 日志的 `SOURCE WARNING`。
- **GitHub 权限问题**：确认默认分支是 `main`，Settings → Actions → General 没有禁用 Actions，并且 Pages 已允许发布。
- **网站能打开但没有最新文章**：手动运行 Actions 的工作流，检查源可用性；没有固定“未读数”。

这个项目是个人体验实验，不是商业新闻聚合平台。只存储来源提供的短标题、摘要、日期和原文链接，不抓取或重新托管全文。
