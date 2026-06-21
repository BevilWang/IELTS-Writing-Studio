const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const CORPUS_PATH = path.join(PUBLIC_DIR, "data", "corpus.json");
const QUESTIONS_PATH = path.join(ROOT_DIR, "crawler_output", "questions_combined.json");

function getPdfFiles() {
  return fs
    .readdirSync(ROOT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ndash;/gi, "-");
}

function stripHtml(html) {
  return decodeHtmlEntities(String(html || ""))
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImageUrlsFromHtml(html) {
  const urlPattern = /https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|webp|gif|svg)(\?[^\s"'<>]*)?/gi;
  return [...new Set(String(html || "").match(urlPattern) || [])];
}

function getQuestionPayload() {
  if (!fs.existsSync(QUESTIONS_PATH)) {
    return null;
  }

  const rows = JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8"));
  const questions = rows.map((row) => {
    const contentRaw = row?.detail?.raw?.data?.contentList?.[0]?.content || "";
    let titleHtml = "";

    try {
      const parsed = JSON.parse(contentRaw);
      titleHtml = parsed?.title || "";
    } catch (_error) {
      titleHtml = "";
    }

    const promptText = stripHtml(titleHtml);
    const task2Topics = (row.task2Topics || []).filter((topic) => topic !== "全部话题");
    const imageUrls = row?.detail?.imageUrls?.length
      ? row.detail.imageUrls
      : extractImageUrlsFromHtml(titleHtml);

    return {
      questionId: row.questionId,
      title: row.title,
      subTitle: row.subTitle,
      doneNum: Number(row.doneNum || 0),
      task: row.task1Types?.length ? "Task 1" : "Task 2",
      task1Types: row.task1Types || [],
      task2Types: row.task2Types || [],
      task2Topics,
      groups: row.groups || [],
      type: row.task1Types?.[0] || row.task2Types?.[0] || "",
      topic: task2Topics[0] || "",
      promptText,
      promptHtml: titleHtml,
      imageUrls
    };
  });

  const task1Types = [...new Set(questions.flatMap((item) => item.task1Types))].sort((a, b) =>
    a.localeCompare(b, "zh")
  );
  const task2Types = [...new Set(questions.flatMap((item) => item.task2Types))].sort((a, b) =>
    a.localeCompare(b, "zh")
  );
  const task2Topics = [...new Set(questions.flatMap((item) => item.task2Topics))].sort((a, b) =>
    a.localeCompare(b, "zh")
  );

  return {
    generatedAt: new Date().toISOString(),
    count: questions.length,
    categories: {
      task1Types,
      task2Types,
      task2Topics
    },
    questions
  };
}

app.use(express.static(PUBLIC_DIR));

app.get("/api/files", (_req, res) => {
  const files = getPdfFiles().map((name) => ({
    name,
    url: `/pdf/${encodeURIComponent(name)}`
  }));

  res.json({ files });
});

app.get("/api/corpus", (_req, res) => {
  if (!fs.existsSync(CORPUS_PATH)) {
    return res.status(404).json({
      error: "Corpus not found. Run `npm run build:corpus` first."
    });
  }

  const corpus = fs.readFileSync(CORPUS_PATH, "utf8");
  res.type("application/json").send(corpus);
});

app.get("/api/questions", (_req, res) => {
  const payload = getQuestionPayload();
  if (!payload) {
    return res.status(404).json({
      error: "Question dataset not found. Run `npm run crawl:ieltscat` first."
    });
  }
  res.json(payload);
});

app.get("/pdf/:fileName", (req, res) => {
  const fileName = req.params.fileName;
  if (fileName !== path.basename(fileName)) {
    return res.status(400).send("Invalid file path");
  }

  const fullPath = path.join(ROOT_DIR, fileName);

  if (
    !fileName.toLowerCase().endsWith(".pdf") ||
    !fs.existsSync(fullPath) ||
    !fs.statSync(fullPath).isFile()
  ) {
    return res.status(404).send("PDF not found");
  }

  res.sendFile(fullPath);
});

app.listen(PORT, () => {
  console.log(`IELTS Writing Studio running on http://localhost:${PORT}`);
});
