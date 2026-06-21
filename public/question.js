const state = {
  question: null,
  questions: [],
  editor: null,
  chartIndex: 0,
  guidance: null,
  viewMode: "writing",
  guidePanelCollapsed: false,
  activeGuideTab: "guidance",
  gptStatusTimer: null,
  guideScrollTop: 0,
  modelScrollTop: 0
};

const STORAGE_PREFIX = "ielts-writing-studio-v2";

const els = {
  rightPanel: document.querySelector(".right-panel"),
  previewTitle: document.getElementById("previewTitle"),
  previewMeta: document.getElementById("previewMeta"),
  promptCard: document.getElementById("promptCard"),
  previewPrompt: document.getElementById("previewPrompt"),
  chartStageWrap: document.getElementById("chartStageWrap"),
  chartImage: document.getElementById("chartImage"),
  chartControls: document.getElementById("chartControls"),
  prevChartBtn: document.getElementById("prevChartBtn"),
  nextChartBtn: document.getElementById("nextChartBtn"),
  chartIndexInfo: document.getElementById("chartIndexInfo"),
  openChatgptBtn: document.getElementById("openChatgptBtn"),
  gptCopyStatus: document.getElementById("gptCopyStatus"),
  applyGptHintsBtn: document.getElementById("applyGptHintsBtn"),
  viewModeSwitch: document.getElementById("viewModeSwitch"),
  toggleGuidePanelBtn: document.getElementById("toggleGuidePanelBtn"),
  composeWorkspace: document.getElementById("composeWorkspace"),
  modelWorkspace: document.getElementById("modelWorkspace"),
  guideTabs: document.getElementById("guideTabs"),
  guideContent: document.getElementById("guideContent"),
  modelContent: document.getElementById("modelContent"),
  writingGoal: document.getElementById("writingGoal"),
  stepChips: document.getElementById("stepChips"),
  wordCount: document.getElementById("wordCount")
};

const GUIDE_TAB_META = [
  { key: "guidance", label: "写作指导" },
  { key: "language", label: "语料积累" }
];

function createEmptyGuidance() {
  return {
    task: "",
    type: "",
    titleCn: "",
    writingThoughtSummary: "",
    targetWords: 0,
    thinking: {
      understanding: [],
      approach: [],
      structure: []
    },
    outline: [],
    paragraphPlan: [],
    highScoreStructures: [],
    usefulPhrases: [],
    topicVocab: [],
    modelSentences: [],
    modelEssay: [],
    integratedFramework: []
  };
}

state.guidance = createEmptyGuidance();

function getQuestionIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function getQuestionStorageId() {
  if (state.question?.questionId) {
    return String(state.question.questionId);
  }
  const seed = `${state.question?.task || ""}|${state.question?.subTitle || ""}|${state.question?.title || ""}`;
  const normalized = seed
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_|]/g, "")
    .slice(0, 120);
  return normalized || "default";
}

function getLegacyGuidanceRawStorageKey() {
  return state.question
    ? `ielts-gpt-guidance-${state.question.questionId}`
    : "ielts-gpt-guidance";
}

function getGuidanceRawStorageKey() {
  return `${STORAGE_PREFIX}-guidance-${getQuestionStorageId()}`;
}

function getLegacyGuideInteractionStorageKey() {
  return state.question
    ? `ielts-gpt-guide-state-${state.question.questionId}`
    : "ielts-gpt-guide-state";
}

function getGuideInteractionStorageKey() {
  return `${STORAGE_PREFIX}-guide-state-${getQuestionStorageId()}`;
}

function getLegacyDraftStorageKey() {
  return state.question
    ? `ielts-writing-draft-${state.question.questionId}`
    : "ielts-writing-draft";
}

function getDraftStorageKey() {
  return `${STORAGE_PREFIX}-draft-${getQuestionStorageId()}`;
}

function readStoredText(key, fallback = "") {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch (_error) {
    return fallback;
  }
}

function writeStoredText(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch (_error) {
    return false;
  }
}

function readStoredTextWithLegacy(newKey, legacyKey, fallback = "") {
  const current = readStoredText(newKey, "");
  if (current) return current;
  const legacy = readStoredText(legacyKey, "");
  if (legacy) {
    writeStoredText(newKey, legacy);
    return legacy;
  }
  return fallback;
}

function persistDraft() {
  if (!state.editor) return;
  writeStoredText(getDraftStorageKey(), state.editor.getValue());
}

// One-time purge of previously cached 写作指导 content (guidance + guide-state).
// Drafts (the user's own writing) are intentionally preserved.
const GUIDANCE_PURGE_FLAG = `${STORAGE_PREFIX}-guidance-purged`;

function purgeCachedGuidanceOnce() {
  try {
    if (localStorage.getItem(GUIDANCE_PURGE_FLAG)) return;

    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      keys.push(localStorage.key(i));
    }

    for (const key of keys) {
      if (!key) continue;
      const isGuidance =
        key.startsWith(`${STORAGE_PREFIX}-guidance-`) ||
        key.startsWith(`${STORAGE_PREFIX}-guide-state-`) ||
        key.startsWith("ielts-gpt-guidance") ||
        key.startsWith("ielts-gpt-guide-state");
      if (isGuidance) localStorage.removeItem(key);
    }

    localStorage.setItem(GUIDANCE_PURGE_FLAG, String(Date.now()));
  } catch (_error) {
    /* localStorage unavailable; nothing to purge */
  }
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTextList(list) {
  return [...new Set((list || []).map(normalizeText))].filter(
    (item) => item.length >= 2 && item.length <= 300
  );
}

function clampChartIndex() {
  const total = state.question?.imageUrls?.length || 0;
  if (!total) {
    state.chartIndex = 0;
    return;
  }
  if (state.chartIndex < 0) state.chartIndex = 0;
  if (state.chartIndex > total - 1) state.chartIndex = total - 1;
}

function renderChart() {
  const urls = state.question?.imageUrls || [];
  const total = urls.length;

  if (!total) {
    els.chartStageWrap.style.display = "none";
    return;
  }

  clampChartIndex();
  const current = urls[state.chartIndex];

  els.chartStageWrap.style.display = "grid";
  els.chartImage.src = current;
  els.chartImage.alt = `${state.question.subTitle} chart ${state.chartIndex + 1}`;
  els.chartIndexInfo.textContent = `${state.chartIndex + 1} / ${total}`;

  const showControls = total > 1;
  els.chartControls.style.display = showControls ? "flex" : "none";
  els.prevChartBtn.disabled = state.chartIndex <= 0;
  els.nextChartBtn.disabled = state.chartIndex >= total - 1;
}

function renderQuestion() {
  const q = state.question;
  if (!q) {
    els.previewTitle.textContent = "题目不存在";
    els.previewMeta.textContent = "";
    els.promptCard.style.display = "none";
    els.chartStageWrap.style.display = "none";
    return;
  }

  els.previewTitle.textContent = `${q.subTitle} · ${q.title}`;
  els.previewMeta.textContent = `${q.task} | ${q.type || "未分类"}${q.topic ? ` | ${q.topic}` : ""}`;

  if (q.promptText) {
    els.promptCard.style.display = "block";
    els.previewPrompt.textContent = q.promptText;
  } else {
    els.promptCard.style.display = "none";
    els.previewPrompt.textContent = "";
  }

  renderChart();
}

function bindChartEvents() {
  els.prevChartBtn.addEventListener("click", () => {
    state.chartIndex -= 1;
    renderChart();
  });

  els.nextChartBtn.addEventListener("click", () => {
    state.chartIndex += 1;
    renderChart();
  });
}

function showStatus(message, isError = false) {
  if (!els.gptCopyStatus) return;
  if (state.gptStatusTimer) {
    clearTimeout(state.gptStatusTimer);
    state.gptStatusTimer = null;
  }
  els.gptCopyStatus.textContent = message || "";
  els.gptCopyStatus.classList.toggle("error", Boolean(isError));
  if (!message) return;
  state.gptStatusTimer = window.setTimeout(() => {
    els.gptCopyStatus.textContent = "";
    els.gptCopyStatus.classList.remove("error");
    state.gptStatusTimer = null;
  }, 5500);
}

function legacyCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.top = "-10000px";
  textarea.style.left = "-10000px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (_error) {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return copied;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_error) {
      // fallback below
    }
  }
  return legacyCopyText(text);
}

function detectMinimumWordCount(question) {
  const prompt = String(question?.promptText || "");
  const englishMatch = prompt.match(/at\s+least\s+(\d+)\s+words?/i);
  if (englishMatch?.[1]) return Number(englishMatch[1]);

  const chineseMatch = prompt.match(/至少\s*(\d+)\s*词/);
  if (chineseMatch?.[1]) return Number(chineseMatch[1]);

  const taskText = `${question?.task || ""}`.toLowerCase();
  return taskText.includes("task 1") ? 150 : 250;
}

function detectTaskAndSubtype(question) {
  const taskRaw = `${question?.task || ""}`.toLowerCase();
  const typeRaw = `${question?.type || ""}`.toLowerCase();
  const promptRaw = `${question?.promptText || ""}`.toLowerCase();

  const isTask1 = taskRaw.includes("task 1");
  if (isTask1) {
    const t = `${typeRaw} ${promptRaw}`;
    if (/(line|线|trend)/i.test(t)) return { task: "Task 1", subtype: "line", subtypeCn: "线图" };
    if (/(bar|柱)/i.test(t)) return { task: "Task 1", subtype: "bar", subtypeCn: "柱图" };
    if (/(pie|饼)/i.test(t)) return { task: "Task 1", subtype: "pie", subtypeCn: "饼图" };
    if (/(table|表格)/i.test(t)) return { task: "Task 1", subtype: "table", subtypeCn: "表格" };
    if (/(map|地图)/i.test(t)) return { task: "Task 1", subtype: "map", subtypeCn: "地图" };
    if (/(process|diagram|流程|工序)/i.test(t)) {
      return { task: "Task 1", subtype: "process", subtypeCn: "流程图" };
    }
    return { task: "Task 1", subtype: "mixed", subtypeCn: question?.type || "混合图" };
  }

  const t = `${typeRaw} ${promptRaw}`;
  if (/(discuss both views|双方观点|both views)/i.test(t)) {
    return { task: "Task 2", subtype: "discussion", subtypeCn: "双边讨论" };
  }
  if (/(outweigh|advantages.*disadvantages|利大于弊|优缺点)/i.test(t)) {
    return { task: "Task 2", subtype: "adv_dis", subtypeCn: "利弊分析" };
  }
  if (/(problem|cause|solution|问题|原因|解决)/i.test(t)) {
    return { task: "Task 2", subtype: "problem_solution", subtypeCn: "问题解决" };
  }
  if (/(agree or disagree|to what extent|同意|反对|程度)/i.test(t)) {
    return { task: "Task 2", subtype: "opinion", subtypeCn: "观点论证" };
  }
  if (/(two-part|two questions|两个问题)/i.test(t)) {
    return { task: "Task 2", subtype: "two_part", subtypeCn: "双问题" };
  }
  return { task: "Task 2", subtype: "general", subtypeCn: question?.type || "综合论证" };
}

function getSubtypeGuidanceLines(taskInfo) {
  if (taskInfo.task === "Task 1") {
    const map = {
      line: ["先总览趋势，再分时间段对比。", "重点写峰值、拐点和差距变化。"],
      bar: ["先比较最高/最低组，再写中间梯队。", "同一维度下做横向对比，避免逐条罗列。"],
      pie: ["突出占比最大和最小类别。", "必要时比较两期变化幅度。"],
      table: ["先总览极值和整体排序。", "再按指标或年份分组比较。"],
      map: ["按时间顺序描述区域变化。", "聚焦新增/消失/功能转变。"],
      process: ["按流程阶段描述，不遗漏起点和终点。", "强调被动语态和顺序连接词。"],
      mixed: ["先总览所有图共同趋势。", "再按图表类型分段对比。"]
    };
    return map[taskInfo.subtype] || map.mixed;
  }

  const map = {
    discussion: ["主体段分别论证双方观点，再给个人立场。", "确保立场在引言和结论保持一致。"],
    adv_dis: ["分别分析优势与劣势，最后判断哪方更强。", "用现实案例提升说服力。"],
    problem_solution: ["先明确核心问题及成因，再给可执行方案。", "方案要对应问题并说明效果。"],
    opinion: ["开头明确立场，主体段围绕两到三个理由展开。", "每段包含解释与例证。"],
    two_part: ["每个问题单独成段完整回答。", "避免只回答其一导致任务完成度扣分。"],
    general: ["优先保证任务回应完整，再优化论证深度。", "段落主题句应直接服务题目要求。"]
  };
  return map[taskInfo.subtype] || map.general;
}

function buildChartReferenceBlock(question) {
  const urls = question?.imageUrls || [];
  if (!urls.length) return "图表链接：无";
  return ["图表链接：", ...urls].join("\n");
}

function getWordCountGuardrail(minWords, taskLabel) {
  const minBuffer = taskLabel === "Task 1" ? 15 : 30;
  const maxBuffer = taskLabel === "Task 1" ? 40 : 70;
  return {
    recommendedMin: minWords + minBuffer,
    recommendedMax: minWords + maxBuffer
  };
}

function buildChatGptPrompt(question) {
  const prompt = question?.promptText || "";
  const minWords = detectMinimumWordCount(question);
  const taskInfo = detectTaskAndSubtype(question);
  const strategyLines = getSubtypeGuidanceLines(taskInfo);
  const chartRef = buildChartReferenceBlock(question);
  const wordCountGuardrail = getWordCountGuardrail(minWords, taskInfo.task);

  return [
    "分析以下题目并给band7-8结构化指导",
    "输出要求：",
    "1) 用中文。",
    "2) 严格输出 JSON，不要其他解释。",
    `3) JSON 字段: {\"task\":\"\",\"type\":\"\",\"paragraph_plan\":[{\"step\":1,\"title\":\"\",\"purpose\":\"\",\"key_points\":[\"\"],\"target_words\":0}],\"high_score_structures\":[\"\"],\"useful_phrases\":[\"\"],\"topic_vocab\":[\"\"],\"model_essay\":[{\"step\":1,\"paragraph_role\":\"\",\"paragraph_text\":\"\",\"sentences\":[{\"text\":\"\",\"analysis\":\"\"}]}],\"target_words\":${minWords},\"word_count_check\":{\"minimum_required\":${minWords},\"recommended_min\":${wordCountGuardrail.recommendedMin},\"recommended_max\":${wordCountGuardrail.recommendedMax},\"paragraph_word_counts\":[{\"step\":1,\"words\":0}],\"exact_total_words\":0,\"meets_requirement\":true}}`,
    "4) 词数统计规则（必须遵守）：只统计 model_essay.paragraph_text 的英文单词数，按空格分词；数字按 1 个词计；连字符词按 1 个词计；标点不单独计词。",
    `5) 字数硬性要求：model_essay 全文 exact_total_words 必须 >= ${minWords}；建议控制在 ${wordCountGuardrail.recommendedMin}-${wordCountGuardrail.recommendedMax} 词，宁可略多不要低于下限。`,
    `6) paragraph_plan 必须给每段 target_words，且各段 target_words 总和 >= ${minWords}（建议总和 ${wordCountGuardrail.recommendedMin}-${wordCountGuardrail.recommendedMax}）。`,
    "7) 先完成全文，再逐段精确计数并填写 word_count_check.paragraph_word_counts；exact_total_words 必须等于各段 words 之和，且必须与 model_essay 实际总词数一致。",
    "8) 若 exact_total_words < minimum_required，先扩写再重新计数，直到 meets_requirement=true 后再输出 JSON。",
    "9) high_score_structures/useful_phrases/topic_vocab 各给 6-12 条；paragraph_plan 按标准段落输出；model_essay 每段 3-6 句。",
    "10) 如有图表，请结合图表信息给建议。",
    "11) 不要输出 starter 字段；model_essay 必须按段对应 paragraph_plan；每段需给 paragraph_text，并保留 sentences 的逐句分析（每句必须有 analysis）；paragraph_text 与 sentences 内容需一致可拆分为单句。",
    "",
    `题目任务: ${taskInfo.task}`,
    `题型: ${taskInfo.subtypeCn}`,
    "题型写作策略：",
    ...strategyLines.map((line, idx) => `${idx + 1}. ${line}`),
    "题干：",
    prompt,
    "",
    chartRef
  ].join("\n");
}
function collectStringsDeep(node, bucket) {
  if (typeof node === "string") {
    const value = normalizeText(node);
    if (value) bucket.push(value);
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectStringsDeep(item, bucket);
    }
    return;
  }

  if (node && typeof node === "object") {
    for (const value of Object.values(node)) {
      collectStringsDeep(value, bucket);
    }
  }
}

function toTextList(value) {
  if (value == null) return [];
  if (typeof value === "string") {
    return uniqueTextList(value.split(/\n+|[;；]+/));
  }
  const bucket = [];
  collectStringsDeep(value, bucket);
  return uniqueTextList(bucket);
}

function extractJsonPayload(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return null;

  const candidates = [text];
  const codeFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeFenceMatch?.[1]) candidates.unshift(codeFenceMatch[1].trim());

  const firstObj = text.indexOf("{");
  const lastObj = text.lastIndexOf("}");
  if (firstObj >= 0 && lastObj > firstObj) {
    candidates.push(text.slice(firstObj, lastObj + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (_error) {
      // try next candidate
    }
  }

  return null;
}

function readValueByAliases(obj, aliases) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
  }
  return undefined;
}

function parseThinking(thinkingRaw) {
  const thinking = {
    understanding: [],
    approach: [],
    structure: []
  };

  if (thinkingRaw == null) return thinking;

  if (typeof thinkingRaw === "string" || Array.isArray(thinkingRaw)) {
    thinking.approach = toTextList(thinkingRaw);
    return thinking;
  }

  if (typeof thinkingRaw === "object") {
    thinking.understanding = toTextList(
      readValueByAliases(thinkingRaw, ["审题", "题目理解", "understanding", "prompt_analysis"])
    );
    thinking.approach = toTextList(
      readValueByAliases(thinkingRaw, ["写作思路", "思路", "approach", "ideas"])
    );
    thinking.structure = toTextList(
      readValueByAliases(thinkingRaw, ["结构策略", "结构", "structure", "organization"])
    );
  }

  return thinking;
}

function normalizeParagraphPlan(rawPlan, targetWords, taskLabel) {
  const list = [];

  if (Array.isArray(rawPlan)) {
    for (let i = 0; i < rawPlan.length; i += 1) {
      const item = rawPlan[i];
      if (typeof item === "string") {
        list.push({
          step: i + 1,
          title: `第${i + 1}段`,
          purpose: "",
          keyPoints: [normalizeText(item)],
          starter: "",
          targetWords: 0
        });
        continue;
      }

      const step = Number(readValueByAliases(item, ["step", "段落", "序号"])) || i + 1;
      const title =
        normalizeText(readValueByAliases(item, ["title", "标题", "段落名"])) || `第${step}段`;
      const purpose = normalizeText(readValueByAliases(item, ["purpose", "目的", "任务"])) || "";
      const keyPoints = toTextList(readValueByAliases(item, ["key_points", "要点", "points"]));
      const starter = normalizeText(readValueByAliases(item, ["starter", "起始句", "开头句"])) || "";
      const target = Number(
        readValueByAliases(item, ["target_words", "目标词数", "word_target"])
      );

      list.push({
        step,
        title,
        purpose,
        keyPoints,
        starter,
        targetWords: Number.isFinite(target) && target > 0 ? target : 0
      });
    }
  }

  if (!list.length) {
    const defaultTitles =
      taskLabel === "Task 1"
        ? ["引言改写", "总体概述", "细节段 1", "细节段 2"]
        : ["引言立场", "主体段 1", "主体段 2", "结论"];

    defaultTitles.forEach((title, idx) => {
      list.push({
        step: idx + 1,
        title,
        purpose: "",
        keyPoints: [],
        starter: "",
        targetWords: 0
      });
    });
  }

  const safeTarget = targetWords > 0 ? targetWords : 200;
  const perStep = Math.max(20, Math.round(safeTarget / Math.max(list.length, 1)));
  const normalized = list
    .sort((a, b) => a.step - b.step)
    .map((item, idx) => ({
      ...item,
      step: idx + 1,
      targetWords: item.targetWords > 0 ? item.targetWords : perStep
    }));

  const totalAssigned = normalized.reduce(
    (sum, item) => sum + (Number.isFinite(item.targetWords) ? item.targetWords : 0),
    0
  );
  if (totalAssigned >= safeTarget) return normalized;

  const deficit = safeTarget - totalAssigned;
  const bump = Math.ceil(deficit / Math.max(normalized.length, 1));
  return normalized.map((item) => ({
    ...item,
    targetWords: item.targetWords + bump
  }));
}

function normalizeIntegratedFramework(rawFramework, thinking, outline) {
  const lines = [];

  if (Array.isArray(rawFramework)) {
    for (const item of rawFramework) {
      if (typeof item === "string") {
        lines.push(item);
        continue;
      }
      if (item && typeof item === "object") {
        const title = normalizeText(
          readValueByAliases(item, ["title", "stage", "section", "模块", "标题"]) || ""
        );
        const details = toTextList(
          readValueByAliases(item, [
            "points",
            "key_points",
            "focus",
            "写作思路",
            "结构策略",
            "outline_point",
            "内容"
          ])
        );
        const merged = [title, details.join("；")].filter(Boolean).join("：");
        if (merged) lines.push(merged);
      }
    }
  } else if (rawFramework) {
    lines.push(...toTextList(rawFramework));
  }

  if (!lines.length) {
    lines.push(...(thinking.approach || []).map((item) => `思路：${item}`));
    lines.push(...(thinking.structure || []).map((item) => `结构策略：${item}`));
    lines.push(...(outline || []).map((item) => `文章大纲：${item}`));
  }

  return uniqueTextList(lines);
}

function normalizeModelEssay(rawModelEssay, paragraphPlan, fallbackModelSentences) {
  const cards = [];

  if (Array.isArray(rawModelEssay)) {
    for (let i = 0; i < rawModelEssay.length; i += 1) {
      const item = rawModelEssay[i];
      if (!item || typeof item !== "object") continue;

      const step = Number(readValueByAliases(item, ["step", "段落", "序号"])) || i + 1;
      const paragraphRole = normalizeText(
        readValueByAliases(item, ["paragraph_role", "role", "段落功能", "段落定位"]) || ""
      );
      const title = normalizeText(readValueByAliases(item, ["title", "段落标题", "heading"]) || "");
      const paragraphText = normalizeText(
        readValueByAliases(item, ["paragraph_text", "paragraphText", "段落文本", "范文段落"]) || ""
      );
      const paragraphAnalysis = toTextList(
        readValueByAliases(item, ["paragraph_analysis", "paragraphAnalysis", "段落分析", "段落点评"])
      );
      const sentenceItems = readValueByAliases(item, ["sentences", "句子解析", "sentence_analysis"]);
      const sentences = [];

      if (Array.isArray(sentenceItems)) {
        for (const sentenceItem of sentenceItems) {
          if (typeof sentenceItem === "string") {
            const text = normalizeText(sentenceItem);
            if (text) sentences.push({ text, analysis: "" });
            continue;
          }
          if (sentenceItem && typeof sentenceItem === "object") {
            const text = normalizeText(
              readValueByAliases(sentenceItem, ["text", "sentence", "句子", "content"]) || ""
            );
            const analysis = normalizeText(
              readValueByAliases(sentenceItem, ["analysis", "解析", "comment", "点评"]) || ""
            );
            if (text) sentences.push({ text, analysis });
          }
        }
      }

      cards.push({ step, title, paragraphRole, paragraphText, paragraphAnalysis, sentences });
    }
  }

  if (!cards.length && (fallbackModelSentences || []).length) {
    if ((paragraphPlan || []).length) {
      const temp = [...fallbackModelSentences];
      for (const plan of paragraphPlan) {
        const text = temp.shift();
        cards.push({
          step: plan.step,
          title: plan.title || "",
          paragraphRole: plan.purpose || "",
          paragraphText: text || "",
          paragraphAnalysis: [],
          sentences: text ? [{ text, analysis: "" }] : []
        });
      }
    } else {
      cards.push({
        step: 1,
        title: "范文段落",
        paragraphRole: "",
        paragraphText: fallbackModelSentences.join(" "),
        paragraphAnalysis: [],
        sentences: fallbackModelSentences.map((text) => ({ text, analysis: "" }))
      });
    }
  }

  if ((paragraphPlan || []).length) {
    const byStep = new Map(cards.map((item) => [item.step, item]));
    return paragraphPlan.map((plan) => {
      const matched = byStep.get(plan.step);
      if (matched) {
        return {
          step: plan.step,
          title: matched.title || plan.title || "",
          paragraphRole: matched.paragraphRole || plan.purpose || "",
          paragraphText: matched.paragraphText || "",
          paragraphAnalysis: matched.paragraphAnalysis || [],
          sentences: matched.sentences || []
        };
      }
      return {
        step: plan.step,
        title: plan.title || "",
        paragraphRole: plan.purpose || "",
        paragraphText: "",
        paragraphAnalysis: [],
        sentences: []
      };
    });
  }

  return cards.sort((a, b) => a.step - b.step);
}

function parseGuidance(raw, question) {
  const text = String(raw || "").replace(/\u200B/g, "").trim();
  const empty = createEmptyGuidance();

  const taskInfo = detectTaskAndSubtype(question);
  empty.task = taskInfo.task;
  empty.type = taskInfo.subtypeCn;
  empty.targetWords = detectMinimumWordCount(question);

  if (!text) return empty;

  const payload = extractJsonPayload(text);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    const lines = toTextList(text);
    return {
      ...empty,
      writingThoughtSummary: lines.join("；"),
      thinking: {
        understanding: [],
        approach: lines,
        structure: []
      },
      integratedFramework: lines,
      highScoreStructures: []
    };
  }

  const parsed = createEmptyGuidance();
  parsed.task =
    normalizeText(readValueByAliases(payload, ["task", "任务"])) || empty.task;
  parsed.type =
    normalizeText(readValueByAliases(payload, ["type", "题型"])) || empty.type;
  parsed.titleCn = normalizeText(readValueByAliases(payload, ["title_cn", "题目中文", "中文题目"]));
  parsed.writingThoughtSummary = normalizeText(
    readValueByAliases(payload, [
      "writing_thought_summary",
      "writingThoughtSummary",
      "写作思路总结",
      "写作思路说明",
      "summary_cn"
    ])
  );

  const targetWordsRaw = Number(
    readValueByAliases(payload, ["target_words", "目标词数", "word_target"])
  );
  const candidateTargetWords = Number.isFinite(targetWordsRaw) && targetWordsRaw > 0
    ? targetWordsRaw
    : empty.targetWords;
  parsed.targetWords = Math.max(empty.targetWords, candidateTargetWords);

  parsed.thinking = parseThinking(
    readValueByAliases(payload, ["thinking_cn", "thinking", "思路解析", "写作思路"])
  );

  parsed.outline = toTextList(readValueByAliases(payload, ["outline", "大纲", "结构"]));

  parsed.paragraphPlan = normalizeParagraphPlan(
    readValueByAliases(payload, ["paragraph_plan", "段落规划", "plan", "paragraphs"]),
    parsed.targetWords,
    parsed.task
  );

  parsed.highScoreStructures = toTextList(
    readValueByAliases(payload, [
      "high_score_structures",
      "high_score_patterns",
      "sentence_patterns",
      "高分句式",
      "句式"
    ])
  );
  parsed.usefulPhrases = toTextList(
    readValueByAliases(payload, ["useful_phrases", "短语", "高分表达"])
  );
  parsed.topicVocab = toTextList(
    readValueByAliases(payload, ["topic_vocab", "词汇", "话题词汇"])
  );
  parsed.modelSentences = toTextList(
    readValueByAliases(payload, ["model_sentences", "范句", "句型"])
  );
  if (!parsed.highScoreStructures.length && parsed.modelSentences.length) {
    parsed.highScoreStructures = [...parsed.modelSentences];
  }
  parsed.integratedFramework = normalizeIntegratedFramework(
    readValueByAliases(payload, [
      "writing_thoughts",
      "writingThoughts",
      "integrated_framework",
      "integratedFramework",
      "写作框架整合",
      "写作思路",
      "framework"
    ]),
    parsed.thinking,
    parsed.outline
  );
  if (!parsed.writingThoughtSummary) {
    parsed.writingThoughtSummary = normalizeText(parsed.integratedFramework.join("；"));
  }
  if (!parsed.integratedFramework.length && parsed.writingThoughtSummary) {
    parsed.integratedFramework = [parsed.writingThoughtSummary];
  }
  parsed.modelEssay = normalizeModelEssay(
    readValueByAliases(payload, ["model_essay", "modelEssay", "范文", "范文拆解", "范文分析"]),
    parsed.paragraphPlan,
    parsed.modelSentences
  );

  if (!parsed.outline.length) {
    parsed.outline = parsed.paragraphPlan.map((item) => `${item.title}: ${item.purpose || "补充要点"}`);
  }

  if (!parsed.integratedFramework.length) {
    parsed.integratedFramework = parsed.paragraphPlan.map(
      (item) => `${item.title}：${item.purpose || item.keyPoints.join("；") || "按段落目标展开"}`
    );
  }
  if (!parsed.writingThoughtSummary) {
    parsed.writingThoughtSummary = normalizeText(parsed.integratedFramework.join("；"));
  }

  return parsed;
}

function hasGuidanceContent(guidance) {
  if (!guidance) return false;
  if (normalizeText(guidance.writingThoughtSummary)) return true;
  const hasModelEssay =
    (guidance.modelEssay || []).some((card) =>
      (card?.sentences || []).some((item) => normalizeText(item?.text).length > 0)
    );
  const arrays = [
    guidance.thinking.understanding,
    guidance.thinking.approach,
    guidance.thinking.structure,
    guidance.outline,
    guidance.integratedFramework,
    guidance.paragraphPlan,
    guidance.highScoreStructures,
    guidance.usefulPhrases,
    guidance.topicVocab
  ];
  return hasModelEssay || arrays.some((arr) => (arr || []).length > 0);
}

function loadSavedGuidance() {
  const raw = readStoredTextWithLegacy(
    getGuidanceRawStorageKey(),
    getLegacyGuidanceRawStorageKey(),
    ""
  );
  state.guidance = parseGuidance(raw, state.question);

  const interactionRaw = readStoredTextWithLegacy(
    getGuideInteractionStorageKey(),
    getLegacyGuideInteractionStorageKey(),
    "{}"
  );
  try {
    const parsed = JSON.parse(interactionRaw);
    const savedTab =
      parsed.activeGuideTab === "analysis" || parsed.activeGuideTab === "plan" || parsed.activeGuideTab === "model"
        ? "guidance"
        : parsed.activeGuideTab;
    const savedViewMode = parsed.viewMode === "model" ? "model" : "writing";
    state.activeGuideTab = GUIDE_TAB_META.some((item) => item.key === savedTab)
      ? savedTab
      : "guidance";
    state.viewMode = savedViewMode;
    state.guidePanelCollapsed = Boolean(parsed.guidePanelCollapsed);
    state.guideScrollTop =
      Number.isFinite(parsed.guideScrollTop) && parsed.guideScrollTop >= 0
        ? parsed.guideScrollTop
        : 0;
    state.modelScrollTop =
      Number.isFinite(parsed.modelScrollTop) && parsed.modelScrollTop >= 0
        ? parsed.modelScrollTop
        : 0;
  } catch (_error) {
    state.viewMode = "writing";
    state.guidePanelCollapsed = false;
    state.activeGuideTab = "guidance";
    state.guideScrollTop = 0;
    state.modelScrollTop = 0;
  }

  renderGuideTabs();
  renderViewModeSwitch();
  renderGuidePanelToggle();
  applyWorkspaceMode();
  renderWritingBridge();
  renderGuideContent();
  renderModelContent();
}

function saveGuideInteractionState() {
  const payload = {
    viewMode: state.viewMode,
    guidePanelCollapsed: state.guidePanelCollapsed,
    activeGuideTab: state.activeGuideTab,
    guideScrollTop: state.guideScrollTop,
    modelScrollTop: state.modelScrollTop
  };
  writeStoredText(getGuideInteractionStorageKey(), JSON.stringify(payload));
}

function calculateWords(text) {
  const normalized = String(text || "").trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

function updateStats(text) {
  renderWritingBridge(calculateWords(text));
}
function renderWritingBridge(currentWords) {
  const words = Number.isFinite(currentWords)
    ? currentWords
    : calculateWords(state.editor?.getValue?.() || "");

  const target = state.guidance?.targetWords || detectMinimumWordCount(state.question);
  const pct = target > 0 ? Math.min(200, Math.round((words / target) * 100)) : 0;
  const progressText = `写作进度：${pct}%（${words}/${target}）`;

  if (els.writingGoal) {
    els.writingGoal.textContent = `目标字数：至少 ${target} 词 | ${state.guidance.task || "Task"} ${state.guidance.type ? `- ${state.guidance.type}` : ""}`;
  }
  if (els.wordCount) {
    els.wordCount.textContent = progressText;
  }

  if (!els.stepChips) return;
  const steps = state.guidance?.paragraphPlan || [];
  if (!steps.length) {
    els.stepChips.innerHTML = "";
    return;
  }

  els.stepChips.innerHTML = steps
    .map((step) => {
      const title = escapeHtml(step.title || `第${step.step}段`);
      return `<button class="step-chip" type="button" data-action="insert-step" data-step="${step.step}">P${step.step} ${title}</button>`;
    })
    .join("");
}

function renderGuideTabs() {
  if (!els.guideTabs) return;
  const buttons = els.guideTabs.querySelectorAll("button[data-tab]");
  for (const button of buttons) {
    button.classList.toggle("active", button.dataset.tab === state.activeGuideTab);
  }
}

function renderViewModeSwitch() {
  if (!els.viewModeSwitch) return;
  const buttons = els.viewModeSwitch.querySelectorAll("button[data-view-mode]");
  for (const button of buttons) {
    button.classList.toggle("active", button.dataset.viewMode === state.viewMode);
  }
}

function renderGuidePanelToggle() {
  if (!els.toggleGuidePanelBtn) return;
  const collapsed = Boolean(state.guidePanelCollapsed);
  const label = collapsed ? "展开引导面板" : "折叠引导面板";
  els.toggleGuidePanelBtn.textContent = collapsed ? "展开" : "折叠";
  els.toggleGuidePanelBtn.setAttribute("aria-label", label);
  els.toggleGuidePanelBtn.setAttribute("title", label);
  els.toggleGuidePanelBtn.dataset.collapsed = collapsed ? "true" : "false";
  els.toggleGuidePanelBtn.setAttribute("aria-expanded", String(!collapsed));
}

function applyWorkspaceMode() {
  if (!els.rightPanel) return;
  els.rightPanel.classList.toggle("mode-model", state.viewMode === "model");
  els.rightPanel.classList.toggle("mode-writing", state.viewMode !== "model");
  els.rightPanel.classList.toggle("guide-collapsed", state.guidePanelCollapsed);
  if (state.viewMode === "writing" && state.editor?.layout) {
    window.requestAnimationFrame(() => state.editor.layout());
  }
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSimpleListSection(title, items) {
  if (!items.length) return "";
  const li = items
    .map((text) => {
      const safe = escapeHtml(text);
      return `<li><span>${safe}</span></li>`;
    })
    .join("");
  return `<section class="guide-section"><h4>${escapeHtml(title)}</h4><ul class="guide-list">${li}</ul></section>`;
}

function renderPlanCards() {
  const plan = state.guidance.paragraphPlan || [];
  if (!plan.length) {
    return '<div class="guide-empty">未识别到段落规划，可让 ChatGPT 重新生成 paragraph_plan。</div>';
  }

  return plan
    .map((item) => {
      const points = item.keyPoints.length
        ? `<ul class="guide-list">${item.keyPoints
            .map((point) => `<li>${escapeHtml(point)}</li>`)
            .join("")}</ul>`
        : "";
      const purpose = item.purpose ? `<div class="plan-meta">目的：${escapeHtml(item.purpose)}</div>` : "";
      return `
        <article class="plan-card">
          <div class="plan-head">
            <strong>P${item.step} ${escapeHtml(item.title || `第${item.step}段`)}</strong>
            <span class="plan-meta">建议 ${item.targetWords || 0} 词</span>
          </div>
          ${purpose}
          ${points}
        </article>
      `;
    })
    .join("");
}

function renderGuidanceTab() {
  const guidance = state.guidance;
  const understandingSection = renderSimpleListSection("审题要点", guidance.thinking.understanding);
  const planSection = renderPlanCards();

  return [understandingSection, planSection]
    .filter(Boolean)
    .join("") || '<div class="guide-empty">暂无写作指导内容。</div>';
}

function renderLanguageTab() {
  return [
    renderSimpleListSection("高分句式", state.guidance.highScoreStructures),
    renderSimpleListSection("高分短语", state.guidance.usefulPhrases),
    renderSimpleListSection("话题词汇", state.guidance.topicVocab)
  ]
    .filter(Boolean)
    .join("") || '<div class="guide-empty">暂无语料积累内容，先解析 ChatGPT JSON。</div>';
}

function renderModelTab() {
  const modelEssay = state.guidance.modelEssay || [];
  if (!modelEssay.length) {
    return '<div class="guide-empty">暂无范文分析内容，先解析 ChatGPT JSON。</div>';
  }

  const essayParagraphs = modelEssay
    .map((item) => ({
      step: item.step,
      title: item.title || `第${item.step}段`,
      text: buildModelEssayParagraph(item),
      sentences: buildModelEssaySentences(item)
    }))
    .filter((item) => item.text);

  if (!essayParagraphs.length) {
    return '<div class="guide-empty">未识别到完整范文文本。</div>';
  }

  return `<div class="essay-overview">${essayParagraphs
    .map((item) => {
      const sentenceButtons = item.sentences.length
        ? `<div class="essay-sentence-grid">${item.sentences
            .map(
              (line, idx) => `
                <div class="essay-sentence-item">
                  <button type="button" class="essay-sentence-btn" data-action="toggle-model-sentence-analysis" data-step="${item.step}" data-sentence-index="${idx}" aria-expanded="false">
                    <span class="essay-sentence-text">${escapeHtml(line.text)}</span>
                  </button>
                  <div class="essay-sentence-analysis" hidden>${escapeHtml(line.analysis || "该句暂无点评。")}</div>
                </div>
              `
            )
            .join("")}</div>`
        : `<div class="essay-sentence-grid"><div class="essay-sentence-item">
            <button type="button" class="essay-sentence-btn" data-action="toggle-model-sentence-analysis" data-step="${item.step}" data-sentence-index="0" aria-expanded="false">
                  <span class="essay-sentence-text">${escapeHtml(item.text)}</span>
                </button>
                <div class="essay-sentence-analysis" hidden>该句暂无点评。</div>
              </div></div>`;
      return `
        <article class="plan-card">
          <div class="plan-head">
            <strong>P${item.step} ${escapeHtml(item.title)}</strong>
            <span class="plan-actions"><button type="button" data-action="insert-model-step" data-step="${item.step}">插入整段</button></span>
          </div>
          ${sentenceButtons}
        </article>
      `;
    })
    .join("")}</div>`;
}

function renderGuideContent() {
  if (!els.guideContent) return;

  if (!hasGuidanceContent(state.guidance)) {
    els.guideContent.innerHTML =
      '<div class="guide-empty">先点击上方按钮复制题型专属提示词，在 ChatGPT 得到 JSON 后复制结果，再点击“从剪贴板解析并生成引导式写作面板”。</div>';
    els.guideContent.scrollTop = 0;
    return;
  }

  if (state.activeGuideTab === "guidance") {
    els.guideContent.innerHTML = renderGuidanceTab();
    els.guideContent.scrollTop = state.guideScrollTop || 0;
    return;
  }

  if (state.activeGuideTab === "language") {
    els.guideContent.innerHTML = renderLanguageTab();
    els.guideContent.scrollTop = state.guideScrollTop || 0;
    return;
  }

  els.guideContent.innerHTML = renderGuidanceTab();
  els.guideContent.scrollTop = state.guideScrollTop || 0;
}

function renderModelContent() {
  if (!els.modelContent) return;
  if (!hasGuidanceContent(state.guidance)) {
    els.modelContent.innerHTML =
      '<div class="guide-empty">先点击上方按钮复制题型专属提示词，在 ChatGPT 得到 JSON 后复制结果，再点击“从剪贴板解析并生成引导式写作面板”。</div>';
    els.modelContent.scrollTop = 0;
    return;
  }
  els.modelContent.innerHTML = renderModelTab();
  els.modelContent.scrollTop = state.modelScrollTop || 0;
}

function insertTextAtCursor(text, appendBlankLine = true) {
  const payload = normalizeText(text);
  if (!payload || !state.editor) return;
  const selection = state.editor.getSelection();
  const output = appendBlankLine ? `${payload}\n` : payload;
  state.editor.executeEdits("guided-insert", [
    { range: selection, text: output, forceMoveMarkers: true }
  ]);
  state.editor.focus();
}

function buildModelEssayParagraph(step) {
  if (!step) return "";
  const paragraphText = normalizeText(step.paragraphText);
  if (paragraphText) return paragraphText;
  const lines = (step.sentences || [])
    .map((sentence) => normalizeText(sentence?.text))
    .filter(Boolean);
  return lines.join(" ");
}

function splitParagraphToSentences(text) {
  const content = normalizeText(text);
  if (!content) return [];
  const chunks = content.match(/[^.!?。！？]+[.!?。！？]?/g) || [];
  return chunks.map((chunk) => normalizeText(chunk)).filter(Boolean);
}

function buildModelEssaySentences(step) {
  if (!step) return [];
  const fromStructured = (step.sentences || [])
    .map((sentence) => ({
      text: normalizeText(sentence?.text),
      analysis: normalizeText(sentence?.analysis)
    }))
    .filter((sentence) => sentence.text);
  if (fromStructured.length) return fromStructured;
  return splitParagraphToSentences(buildModelEssayParagraph(step)).map((text) => ({
    text,
    analysis: ""
  }));
}

function insertModelEssayByStep(stepNo) {
  const n = Number(stepNo);
  if (!Number.isFinite(n)) return;
  const step = (state.guidance.modelEssay || []).find((item) => Number(item.step) === n);
  const text = buildModelEssayParagraph(step);
  if (!text) {
    showStatus(`P${n} 暂无可插入范文句。`, true);
    return;
  }
  insertTextAtCursor(text, true);
  showStatus(`已插入 P${n} 范文。`);
}

function toggleModelSentenceAnalysis(button) {
  if (!button) return;
  const sentenceItem = button.closest(".essay-sentence-item");
  if (!sentenceItem) return;

  const current = sentenceItem.querySelector(".essay-sentence-analysis");
  if (!current) return;
  const willExpand = current.hidden;
  button.classList.toggle("active", willExpand);
  button.setAttribute("aria-expanded", String(willExpand));
  current.hidden = !willExpand;
}

function handleGuideTabsClick(event) {
  const button = event.target.closest("button[data-tab]");
  if (!button) return;
  state.activeGuideTab = button.dataset.tab || "guidance";
  state.guideScrollTop = 0;
  renderGuideTabs();
  renderGuideContent();
  saveGuideInteractionState();
}

function handleViewModeSwitchClick(event) {
  const button = event.target.closest("button[data-view-mode]");
  if (!button) return;
  const nextMode = button.dataset.viewMode === "model" ? "model" : "writing";
  if (state.viewMode === nextMode) return;
  if (state.viewMode === "model" && els.modelContent) {
    state.modelScrollTop = els.modelContent.scrollTop;
  }
  if (state.viewMode === "writing" && els.guideContent) {
    state.guideScrollTop = els.guideContent.scrollTop;
  }
  state.viewMode = nextMode;
  renderViewModeSwitch();
  applyWorkspaceMode();
  if (state.viewMode === "model") {
    renderModelContent();
  } else {
    renderGuideContent();
  }
  saveGuideInteractionState();
}

function handleToggleGuidePanel() {
  state.guidePanelCollapsed = !state.guidePanelCollapsed;
  renderGuidePanelToggle();
  applyWorkspaceMode();
  saveGuideInteractionState();
}

function handleGuideContentClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;

  if (action === "insert-model-step") {
    insertModelEssayByStep(button.dataset.step);
    return;
  }

  if (action === "toggle-model-sentence-analysis") {
    toggleModelSentenceAnalysis(button);
    return;
  }

}
async function handleOpenChatGpt() {
  const prompt = buildChatGptPrompt(state.question);
  const copied = await copyTextToClipboard(prompt);

  if (copied) {
    showStatus("题型专属引导提示词已复制。");
  } else {
    showStatus("自动复制失败，已弹出手动复制窗口。", true);
    window.prompt("浏览器限制了剪贴板复制。请复制后粘贴到 ChatGPT：", prompt);
  }
}

async function readGuidanceFromClipboard() {
  if (!navigator.clipboard || !window.isSecureContext) {
    return "";
  }
  try {
    return (await navigator.clipboard.readText()).trim();
  } catch (_error) {
    return "";
  }
}

async function handleApplyGuidance() {
  const raw = await readGuidanceFromClipboard();
  if (!raw) {
    showStatus("未读取到剪贴板内容。请先复制 ChatGPT 的 JSON 输出后重试。", true);
    return;
  }
  writeStoredText(getGuidanceRawStorageKey(), raw);

  const parsed = parseGuidance(raw, state.question);
  state.guidance = parsed;
  state.activeGuideTab = "guidance";

  saveGuideInteractionState();
  renderGuideTabs();
  renderViewModeSwitch();
  renderGuidePanelToggle();
  applyWorkspaceMode();
  renderWritingBridge();
  renderGuideContent();
  renderModelContent();

  if (!hasGuidanceContent(parsed)) {
    showStatus("解析失败：未识别到有效引导内容，请检查 JSON 格式。", true);
    return;
  }

  const planCount = parsed.paragraphPlan.length;
  const structureCount = parsed.highScoreStructures.length;
  const modelParagraphCount = (parsed.modelEssay || []).filter((item) =>
    normalizeText(buildModelEssayParagraph(item)).length > 0
  ).length;
  const modelSentenceCount = (parsed.modelEssay || []).reduce(
    (sum, item) => sum + (item.sentences || []).filter((sentence) => normalizeText(sentence?.text)).length,
    0
  );
  showStatus(
    `解析成功：已生成引导面板（段落引导 ${planCount} 段，高分句式 ${structureCount} 条，范文段落 ${modelParagraphCount} 段，范文句 ${modelSentenceCount} 句）。`
  );
}

function bindGuideEvents() {
  els.openChatgptBtn.addEventListener("click", handleOpenChatGpt);
  els.applyGptHintsBtn.addEventListener("click", handleApplyGuidance);
  els.guideTabs.addEventListener("click", handleGuideTabsClick);
  if (els.viewModeSwitch) {
    els.viewModeSwitch.addEventListener("click", handleViewModeSwitchClick);
  }
  if (els.toggleGuidePanelBtn) {
    els.toggleGuidePanelBtn.addEventListener("click", handleToggleGuidePanel);
  }
  els.guideContent.addEventListener("click", handleGuideContentClick);
  els.guideContent.addEventListener("scroll", () => {
    state.guideScrollTop = els.guideContent.scrollTop;
    saveGuideInteractionState();
  });
  if (els.modelContent) {
    els.modelContent.addEventListener("click", handleGuideContentClick);
    els.modelContent.addEventListener("scroll", () => {
      state.modelScrollTop = els.modelContent.scrollTop;
      saveGuideInteractionState();
    });
  }
}

function persistSessionState() {
  persistDraft();
  saveGuideInteractionState();
}

function initMonacoEditor() {
  return new Promise((resolve) => {
    require.config({
      paths: {
        vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs"
      }
    });

    require(["vs/editor/editor.main"], () => {
      const draftCache = readStoredTextWithLegacy(
        getDraftStorageKey(),
        getLegacyDraftStorageKey(),
        ""
      );

      state.editor = monaco.editor.create(document.getElementById("editor"), {
        value: draftCache,
        language: "plaintext",
        theme: "vs-dark",
        minimap: { enabled: true },
        fontSize: 15,
        lineHeight: 24,
        fontFamily: "Consolas, 'Courier New', monospace",
        automaticLayout: true,
        wordWrap: "on",
        smoothScrolling: true,
        tabSize: 2,
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        wordBasedSuggestions: "off",
        parameterHints: { enabled: false },
        acceptSuggestionOnEnter: "off"
      });

      state.editor.onDidChangeModelContent(() => {
        const text = state.editor.getValue();
        writeStoredText(getDraftStorageKey(), text);
        updateStats(text);
      });

      updateStats(draftCache);
      resolve();
    });
  });
}

async function bootstrap() {
  purgeCachedGuidanceOnce();

  const questionsRes = await fetch("./data/questions.json");
  if (!questionsRes.ok) {
    throw new Error("Question dataset missing");
  }

  const payload = await questionsRes.json();
  state.questions = payload.questions || [];

  const id = getQuestionIdFromUrl();
  state.question =
    state.questions.find((q) => q.questionId === id) || state.questions[0] || null;

  state.chartIndex = 0;

  bindChartEvents();
  bindGuideEvents();
  window.addEventListener("pagehide", persistSessionState);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) persistSessionState();
  });
  renderQuestion();
  loadSavedGuidance();
  await initMonacoEditor();
}

function renderProgressFallback() {
  const draftCache = readStoredTextWithLegacy(
    getDraftStorageKey(),
    getLegacyDraftStorageKey(),
    ""
  );
  updateStats(draftCache);
}

bootstrap().catch((error) => {
  console.error(error);
  renderProgressFallback();
  alert("题目页初始化失败，请先运行 `npm run crawl:ieltscat`。");
});
