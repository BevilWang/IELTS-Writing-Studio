// Pre-renders the question dataset into a static JSON file so the site can run
// on GitHub Pages (or any static host) without the Express backend.
// Mirrors the transform that server.js exposes at /api/questions.
//
// Usage: npm run build:questions
// Output: public/data/questions.json

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const QUESTIONS_PATH = path.join(ROOT_DIR, "crawler_output", "questions_combined.json");
const OUTPUT_PATH = path.join(ROOT_DIR, "public", "data", "questions.json");

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

function buildPayload() {
  if (!fs.existsSync(QUESTIONS_PATH)) {
    throw new Error(
      `Missing ${QUESTIONS_PATH}. Run \`npm run crawl:ieltscat\` first.`
    );
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

function main() {
  const payload = buildPayload();
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload), "utf8");
  console.log(`Wrote ${payload.count} questions to ${path.relative(ROOT_DIR, OUTPUT_PATH)}`);
}

main();
