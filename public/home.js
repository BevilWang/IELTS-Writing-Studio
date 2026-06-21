const state = {
  questions: [],
  categories: {
    task1Types: [],
    task2Types: [],
    task2Topics: [],
    series: []
  },
  filters: {
    task: "all",
    series: "all",
    type: "all",
    topic: "all",
    search: ""
  },
  filtered: []
};

const els = {
  taskSelect: document.getElementById("taskSelect"),
  seriesSelect: document.getElementById("seriesSelect"),
  typeSelect: document.getElementById("typeSelect"),
  topicSelect: document.getElementById("topicSelect"),
  searchInput: document.getElementById("searchInput"),
  resultCount: document.getElementById("resultCount"),
  questionList: document.getElementById("questionList")
};

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractSeries(question) {
  if (question.series) return question.series;

  const titleMatch = String(question.title || "").match(/剑雅\s*([0-9]+)/i);
  if (titleMatch) return `剑雅${titleMatch[1]}`;

  const subTitleMatch = String(question.subTitle || "").match(/C(\d+)/i);
  if (subTitleMatch) return `剑雅${subTitleMatch[1]}`;

  return "";
}

function compareSeriesDesc(a, b) {
  const na = Number(String(a).replace(/\D/g, ""));
  const nb = Number(String(b).replace(/\D/g, ""));
  if (!Number.isNaN(na) && !Number.isNaN(nb)) {
    return nb - na;
  }
  return a.localeCompare(b, "zh");
}

function initTaskSelect() {
  els.taskSelect.innerHTML = `
    <option value="all">全部任务</option>
    <option value="Task 1">Task 1</option>
    <option value="Task 2">Task 2</option>
  `;
}

function initSeriesSelect() {
  els.seriesSelect.innerHTML = [
    `<option value="all">全部系列</option>`,
    ...state.categories.series.map(
      (series) => `<option value="${escapeHtml(series)}">${escapeHtml(series)}</option>`
    )
  ].join("");
}

function refreshTypeAndTopicSelect() {
  const isTask2 = state.filters.task === "Task 2";
  const types = isTask2 ? state.categories.task2Types : state.categories.task1Types;

  if (state.filters.task === "all") {
    els.typeSelect.innerHTML = `<option value="all">全部题型</option>`;
  } else {
    els.typeSelect.innerHTML = [
      `<option value="all">全部题型</option>`,
      ...types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
    ].join("");
  }

  els.topicSelect.disabled = !isTask2;
  if (!isTask2) {
    els.topicSelect.innerHTML = `<option value="all">Task 2 可选</option>`;
    return;
  }

  els.topicSelect.innerHTML = [
    `<option value="all">全部话题</option>`,
    ...state.categories.task2Topics.map(
      (topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`
    )
  ].join("");
}

function applyFilters() {
  const search = state.filters.search;

  state.filtered = state.questions.filter((q) => {
    if (state.filters.task !== "all" && q.task !== state.filters.task) return false;
    if (state.filters.series !== "all" && q.series !== state.filters.series) return false;

    if (state.filters.type !== "all") {
      const list = q.task === "Task 1" ? q.task1Types : q.task2Types;
      if (!list.includes(state.filters.type)) return false;
    }

    if (state.filters.task === "Task 2" && state.filters.topic !== "all") {
      if (!q.task2Topics.includes(state.filters.topic)) return false;
    }

    if (search) {
      const text = `${q.subTitle} ${q.title} ${q.series || ""} ${q.type || ""} ${q.topic || ""}`.toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  state.filtered.sort((a, b) => b.doneNum - a.doneNum);
  renderList();
}

function renderList() {
  els.resultCount.textContent = `${state.filtered.length} 道题`;
  els.questionList.innerHTML = "";

  if (!state.filtered.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "当前筛选条件下没有题目";
    els.questionList.appendChild(empty);
    return;
  }

  for (const q of state.filtered) {
    const li = document.createElement("li");
    li.className = "question-item";
    li.innerHTML = `
      <div>
        <div class="question-title">${escapeHtml(q.subTitle)} · ${escapeHtml(q.title)}</div>
        <div class="question-meta">
          <span class="badge">${escapeHtml(q.task)}</span>
          <span>${escapeHtml(q.series || "未知系列")}</span>
          <span>${escapeHtml(q.type || "未分类")}</span>
          <span>${escapeHtml(q.topic || "—")}</span>
        </div>
      </div>
      <a class="enter-btn" href="./question.html?id=${encodeURIComponent(
        q.questionId
      )}">进入作答</a>
    `;
    els.questionList.appendChild(li);
  }
}

function bindEvents() {
  els.taskSelect.addEventListener("change", () => {
    state.filters.task = els.taskSelect.value;
    state.filters.type = "all";
    state.filters.topic = "all";
    refreshTypeAndTopicSelect();
    applyFilters();
  });

  els.seriesSelect.addEventListener("change", () => {
    state.filters.series = els.seriesSelect.value;
    applyFilters();
  });

  els.typeSelect.addEventListener("change", () => {
    state.filters.type = els.typeSelect.value;
    applyFilters();
  });

  els.topicSelect.addEventListener("change", () => {
    state.filters.topic = els.topicSelect.value;
    applyFilters();
  });

  els.searchInput.addEventListener("input", () => {
    state.filters.search = els.searchInput.value.trim().toLowerCase();
    applyFilters();
  });
}

async function bootstrap() {
  const res = await fetch("./data/questions.json");
  if (!res.ok) {
    throw new Error("Question dataset missing");
  }
  const payload = await res.json();

  state.questions = (payload.questions || []).map((q) => ({
    ...q,
    series: extractSeries(q)
  }));
  state.categories = {
    ...state.categories,
    ...(payload.categories || {}),
    series: [...new Set(state.questions.map((q) => q.series).filter(Boolean))].sort(
      compareSeriesDesc
    )
  };

  initTaskSelect();
  initSeriesSelect();
  refreshTypeAndTopicSelect();
  bindEvents();
  applyFilters();
}

bootstrap().catch((error) => {
  console.error(error);
  alert("首页加载失败，请先运行 `npm run crawl:ieltscat`。");
});
