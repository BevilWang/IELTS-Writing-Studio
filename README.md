# IELTS Writing Studio

一个**纯静态**的雅思写作练习应用：从本地题库筛选题目，进入作答页用 Monaco 编辑器写作，并配合「写作指导 / 语料积累」面板辅助提升。

> 在线访问：**https://bevilwang.github.io/IELTS-Writing-Studio/**

## 功能

- **题目筛选**（首页 `index.html`）：按 Task / 题型 / 话题 / 系列 / 关键词筛选题库。
- **作答页**（`question.html?id=<questionId>`）：
  - 左侧显示题干与图表（Task 1）。
  - 右侧 Monaco 编辑器，实时字数 / 进度统计。
  - 「复制题型专属提示词」一键生成可丢给 ChatGPT 的结构化 prompt，粘贴模型返回的 JSON 后即可渲染**引导式写作面板**（段落规划、高分句式、话题词汇、范文逐句分析等）。
- **范文分析** 视图：对照模型范文逐句研读。

## 写作指导缓存（本地浏览器）

写作指导与语料**不会上传到任何服务器**——它们生成后保存在你**当前浏览器的 `localStorage`** 中，按题目 ID 分别缓存：

- `ielts-writing-studio-v2-guidance-<id>`：写作指导内容
- `ielts-writing-studio-v2-guide-state-<id>`：面板交互状态
- `ielts-writing-studio-v2-draft-<id>`：你的作答草稿

因此同一浏览器下次打开同一题目时，指导与草稿都会自动恢复；换浏览器 / 设备或清除站点数据后需要重新生成。首次加载时会自动清理一次历史遗留的旧缓存（仅一次，不影响之后新生成的内容；草稿始终保留）。

## 本地运行

本项目已是静态站点，任意静态服务器均可：

```bash
# 方式一：Node（可选，仓库自带 server.js）
npm install
npm start          # http://localhost:3000

# 方式二：任意静态服务器，根目录指向 public/
npx serve public   # 或 python -m http.server -d public 8080
```

> 直接用 `file://` 打开 `public/index.html` 不行——浏览器会拦截 `fetch` 加载数据，必须经由 HTTP 服务。
```

## License

[MIT](LICENSE)
