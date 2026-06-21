const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "public", "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "corpus.json");
const NOISE_MARKER = "Ran out of space in font private use area.";

function silencePdfNoise() {
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  console.warn = (...args) => {
    const msg = args.map(String).join(" ");
    if (msg.includes(NOISE_MARKER)) return;
    originalWarn(...args);
  };

  console.error = (...args) => {
    const msg = args.map(String).join(" ");
    if (msg.includes(NOISE_MARKER)) return;
    originalError(...args);
  };

  process.stdout.write = (chunk, encoding, cb) => {
    if (String(chunk).includes(NOISE_MARKER)) return true;
    return originalStdoutWrite(chunk, encoding, cb);
  };

  process.stderr.write = (chunk, encoding, cb) => {
    if (String(chunk).includes(NOISE_MARKER)) return true;
    return originalStderrWrite(chunk, encoding, cb);
  };
}

function cleanText(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isGoodSnippet(line) {
  if (!line) return false;
  if (line.length < 35 || line.length > 220) return false;
  if (/\b(page|copyright|worksheet)\b/i.test(line)) return false;
  if (/^\d+(\.\d+)?$/.test(line)) return false;

  const letters = (line.match(/[a-zA-Z]/g) || []).length;
  const digits = (line.match(/[0-9]/g) || []).length;

  if (letters < 18) return false;
  if (digits > letters * 0.7) return false;
  return true;
}

function extractPromptCandidates(lines) {
  const promptRegex =
    /(chart|graph|table|diagram|map|process|summar(y|ise|ize)|compare|opinion|discuss|problem|solution|essay|question)/i;

  const result = [];
  const seen = new Set();
  for (const line of lines) {
    if (result.length >= 8) break;
    if (!line || line.length < 20) continue;
    if (!(/[?]/.test(line) || promptRegex.test(line))) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    result.push(line);
  }
  return result;
}

async function main() {
  silencePdfNoise();

  const pdfFiles = fs
    .readdirSync(ROOT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));

  if (!pdfFiles.length) {
    throw new Error("No PDF files found in workspace root.");
  }

  const globalSnippetCount = new Map();
  const docs = [];

  for (const fileName of pdfFiles) {
    const fullPath = path.join(ROOT_DIR, fileName);
    const buffer = fs.readFileSync(fullPath);
    const parsed = await pdf(buffer);
    const text = cleanText(parsed.text || "");
    const lines = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const sentenceCandidates = text
      .split(/(?<=[.!?])\s+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(isGoodSnippet);

    const snippetSet = new Set();
    const snippets = [];
    for (const sentence of sentenceCandidates) {
      if (snippetSet.has(sentence)) continue;
      snippetSet.add(sentence);
      snippets.push(sentence);
      globalSnippetCount.set(sentence, (globalSnippetCount.get(sentence) || 0) + 1);
      if (snippets.length >= 60) break;
    }

    docs.push({
      fileName,
      promptCandidates: extractPromptCandidates(lines),
      snippets
    });
  }

  const topSnippets = Array.from(globalSnippetCount.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 300)
    .map(([text, score]) => ({ text, score }));

  const techniqueHints = [
    "Overall, it is clear that ...",
    "A striking feature of the data is that ...",
    "In contrast, ...",
    "By comparison, ...",
    "The figure for A was significantly higher than that for B.",
    "There was a steady increase in ...",
    "This trend can be attributed to ...",
    "One possible explanation is that ...",
    "From my perspective, ...",
    "I acknowledge that ..., but I would argue that ..."
  ];

  const result = {
    generatedAt: new Date().toISOString(),
    sourceDir: ROOT_DIR,
    documentCount: docs.length,
    docs,
    topSnippets,
    techniqueHints
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), "utf8");
  console.log(`Corpus generated: ${OUTPUT_FILE}`);
  console.log(`Documents: ${docs.length}`);
  console.log(`Global snippets: ${topSnippets.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
