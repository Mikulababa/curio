# 拾趣 · Curio

一个轻量级网页阅读器，聚合不同领域与媒体的公开文章，方便随时翻阅、发现新内容。

**在线访问：** https://mikulababa.github.io/curio/

## 功能

- **随手翻阅**：一次展示一篇文章，支持滑动、按钮和键盘切换；兼容桌面和移动设备。
- **中文优先**：英文标题与 RSS 摘要通过 Gemini 翻译成简体中文；繁体中文转换为简体。
- **忠实翻译**：翻译与标题编辑分开。`translated_title` 保存译文，`editor_title` 为未来独立标题编辑预留；目前不自动改写标题。
- **站内阅读**：可阅读 RSS 导读，查看原始标题和摘要；许可允许时可展示站内全文。
- **来源轮换**：分散不同来源和领域的文章，不依赖阅读时长构建个人画像。
- **本地收藏**：保存在浏览器中，无须注册。

还可以访问[标题盲读实验](https://mikulababa.github.io/curio/experiment.html)。

## 技术实现

网站由 GitHub Pages 托管。GitHub Actions 定时运行 Python 脚本，获取 RSS、去重、翻译标题和摘要，然后生成 `web/data/articles.json`。

英文翻译使用 Gemini 3.1 Flash-Lite。成功翻译结果在构建端缓存，以原文及模型版本作为缓存键；每次最多新增翻译 12 篇文章，避免频繁触及免费额度。可通过 `CURIO_MAX_NEW_TRANSLATIONS` 调整上限。免费额度因项目而异，超额时本轮保留原文并等待后续更新。

翻译使用的是 RSS 标题与摘要，而非文章全文。译文可能有错误，原文始终可查。缓存只含公开文章的翻译结果，不含 API 密钥或个人阅读记录。

## GitHub Pages 部署

1. 将代码上传到 `main` 分支。在 **Settings → Pages** 选择 **GitHub Actions**。
2. 前往 [Google AI Studio](https://aistudio.google.com/apikey) 创建 Gemini API 密钥，确认所选项目可使用免费层模型。
3. 在仓库 **Settings → Secrets and variables → Actions → New repository secret** 创建名为 `GEMINI_API_KEY` 的 Secret，填入密钥。**不要将密钥写入仓库或网页代码。**
4. 打开 **Actions → 更新并发布拾趣**，手动运行一次，或推送新代码触发发布。

工作流文件位于 `.github/workflows/publish.yml`。默认每六小时尝试更新文章。首次运行可能需要逐步积累英文翻译缓存；没有配置密钥时，工作流会停止以保留已经发布的网站。

如果使用免费层，请留意 Google AI Studio 中显示的项目配额与数据使用规则；免费配额不是无限的，具体额度以项目页面为准。

## 本地运行

建议 Python 3.11。安装构建依赖：

```powershell
py -3.11 -m pip install -r requirements.txt
```

如果只想启动已有网页，不需要 API 密钥：

```powershell
py -3.11 -m http.server 8765 --directory web
```

若要在本地重新抓取 RSS，先设置环境变量 `GEMINI_API_KEY`，然后执行 `py -3.11 scripts/build.py`。本地抓取测试可使用 `py -3.11 scripts/build.py --no-translate`，此时不会请求 AI 服务。

测试：

```powershell
py -3.11 -m unittest discover -s tests -v
```

## 项目结构

```text
.github/workflows/publish.yml   定时构建与发布
requirements.txt                Python 构建依赖
scripts/build.py                RSS 抓取、去重、输出数据
scripts/translation.py          Gemini 翻译、简繁转换与缓存
web/index.html                  阅读页面
web/app.js                      翻阅、站内阅读与收藏
web/styles.css                  页面样式
web/data/articles.json          构建生成的文章数据
web/experiment.html             标题盲读实验
```

仅展示公开来源的必要信息及导读，不默认转载第三方文章全文。
