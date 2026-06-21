const fs = require("fs");
const path = require("path");

const BASE_URL = "https://ieltscat.xdf.cn";
const OUTPUT_DIR = path.join(__dirname, "..", "crawler_output");
const TASK1_PAGE = `${BASE_URL}/practice/write/task1`;
const TASK2_PAGE = `${BASE_URL}/practice/write/task2`;
const COMMON_HEADERS = {
  FromURL: "ieltscat.xdf.cn",
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json,text/plain,*/*"
};
const COOKIE_HEADER = process.env.XDF_COOKIE || "";
const TOKEN_HEADER = process.env.XDF_TOKEN || "";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toUrl(pathname, query = {}) {
  const url = new URL(pathname, BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  if (!url.searchParams.has("_t")) {
    url.searchParams.set("_t", String(Date.now()));
  }
  return url.toString();
}

async function requestJson(pathname, query, referer) {
  const url = toUrl(pathname, query);
  const headers = {
    ...COMMON_HEADERS,
    Referer: referer
  };
  if (COOKIE_HEADER) headers.Cookie = COOKIE_HEADER;
  if (TOKEN_HEADER) {
    headers.token = TOKEN_HEADER;
    headers.timestamp = String(Date.now());
  }

  const response = await fetch(url, {
    headers
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      parseError: true,
      raw: text,
      statusCode: response.status
    };
  }
}

function normalizeLabel(raw) {
  return {
    id: raw.id,
    keyCode: String(raw.keyCode),
    tagZhName: raw.tagZhName,
    sort: raw.sort,
    typeCode: raw.typeCode,
    parentId: String(raw.parentId),
    used: raw.used
  };
}

async function getLabels({ funCode, typeCode, parentId, referer }) {
  const result = await requestJson(
    "/api/label/query/all",
    { funCode, typeCode, parentId, used: 1 },
    referer
  );
  if (result.code !== 200 || !Array.isArray(result.data)) {
    throw new Error(
      `Label API failed: funCode=${funCode}, typeCode=${typeCode}, parentId=${parentId}`
    );
  }
  return result.data.map(normalizeLabel);
}

async function getListByValue(value, referer) {
  const result = await requestJson(
    "/api/list/ielts/4/sppt",
    { value },
    referer
  );
  if (result.code !== 200 || !Array.isArray(result.data)) {
    return {
      value,
      code: result.code,
      msg: result.msg,
      data: []
    };
  }
  return result;
}

function pickQuestionCore(item) {
  return {
    questionId: String(item.questionId),
    title: item.title || "",
    subTitle: item.subTitle || "",
    doneNum: item.doneNum || "0",
    avgRightRate: item.avgRightRate || "",
    totalNum: item.totalNum || "",
    answerStatus: item.answerStatus ?? 0
  };
}

function createQuestionStore() {
  return new Map();
}

function addQuestionToStore(store, base, meta) {
  const id = base.questionId;
  const existing = store.get(id) || {
    ...base,
    task1Types: [],
    task2Types: [],
    task2Topics: [],
    groups: [],
    listValues: [],
    detail: null
  };

  if (meta.task === "task1" && meta.typeName && !existing.task1Types.includes(meta.typeName)) {
    existing.task1Types.push(meta.typeName);
  }

  if (meta.task === "task2") {
    if (meta.typeName && !existing.task2Types.includes(meta.typeName)) {
      existing.task2Types.push(meta.typeName);
    }
    if (meta.topicName && !existing.task2Topics.includes(meta.topicName)) {
      existing.task2Topics.push(meta.topicName);
    }
  }

  if (meta.groupName && !existing.groups.includes(meta.groupName)) {
    existing.groups.push(meta.groupName);
  }
  if (meta.value && !existing.listValues.includes(meta.value)) {
    existing.listValues.push(meta.value);
  }

  existing.doneNum = String(
    Math.max(Number(existing.doneNum || 0), Number(base.doneNum || 0))
  );
  store.set(id, existing);
}

function extractImageUrls(input) {
  const found = new Set();
  const stack = [input];
  const imagePattern = /(https?:\/\/[^\s"'<>]+|\/[^\s"'<>]+)\.(png|jpg|jpeg|webp|gif|svg)(\?[^\s"'<>]*)?/i;

  while (stack.length) {
    const current = stack.pop();
    if (current === null || current === undefined) continue;

    if (typeof current === "string") {
      const match = current.match(imagePattern);
      if (match) {
        found.add(match[0]);
      }
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    if (typeof current === "object") {
      for (const value of Object.values(current)) stack.push(value);
    }
  }

  return Array.from(found);
}

async function fetchQuestionDetail(questionId) {
  const result = await requestJson(
    `/api/questionPreviewQuestion/${questionId}`,
    {},
    TASK1_PAGE
  );

  if (result.status === 42) {
    return {
      ok: false,
      reason: "illegal_request",
      rawMessage: result.message || ""
    };
  }

  if (result.code === 200 || result.status === 200 || result.data) {
    const imageUrls = extractImageUrls(result.data || result);
    return {
      ok: true,
      imageUrls,
      raw: result
    };
  }

  return {
    ok: false,
    reason: "unknown_response",
    raw: result
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  const headers = [
    "questionId",
    "title",
    "subTitle",
    "doneNum",
    "task1Types",
    "task2Types",
    "task2Topics",
    "groups",
    "listValues",
    "detailOk",
    "chartCount",
    "detailReason"
  ];
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.questionId,
        row.title,
        row.subTitle,
        row.doneNum,
        row.task1Types.join("|"),
        row.task2Types.join("|"),
        row.task2Topics.join("|"),
        row.groups.join("|"),
        row.listValues.join("|"),
        row.detail?.ok ? "true" : "false",
        row.detail?.imageUrls?.length || 0,
        row.detail?.reason || ""
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

async function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(path.join(OUTPUT_DIR, "task1_lists"));
  ensureDir(path.join(OUTPUT_DIR, "task2_lists"));

  const task1TypeLabels = await getLabels({
    funCode: 4,
    typeCode: "TX",
    parentId: 1301,
    referer: TASK1_PAGE
  });

  const task2TypeLabels = await getLabels({
    funCode: 4,
    typeCode: "TX",
    parentId: 1302,
    referer: TASK2_PAGE
  });

  const task2TopicLabels = await getLabels({
    funCode: 4,
    typeCode: "HT",
    parentId: 1302,
    referer: TASK2_PAGE
  });

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "labels_task1_types.json"),
    JSON.stringify(task1TypeLabels, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "labels_task2_types.json"),
    JSON.stringify(task2TypeLabels, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "labels_task2_topics.json"),
    JSON.stringify(task2TopicLabels, null, 2),
    "utf8"
  );

  const store = createQuestionStore();

  for (const typeLabel of task1TypeLabels) {
    const value = `1301_0_${typeLabel.keyCode}`;
    const listData = await getListByValue(value, TASK1_PAGE);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "task1_lists", `${typeLabel.keyCode}.json`),
      JSON.stringify(listData, null, 2),
      "utf8"
    );

    for (const group of listData.data || []) {
      for (const item of group.sectionList || []) {
        addQuestionToStore(store, pickQuestionCore(item), {
          task: "task1",
          typeName: typeLabel.tagZhName,
          groupName: group.name,
          value
        });
      }
    }
  }

  for (const typeLabel of task2TypeLabels) {
    const valueAllTopic = `1302_0_${typeLabel.keyCode}`;
    const allTopicData = await getListByValue(valueAllTopic, TASK2_PAGE);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "task2_lists", `${typeLabel.keyCode}_all_topics.json`),
      JSON.stringify(allTopicData, null, 2),
      "utf8"
    );

    for (const group of allTopicData.data || []) {
      for (const item of group.sectionList || []) {
        addQuestionToStore(store, pickQuestionCore(item), {
          task: "task2",
          typeName: typeLabel.tagZhName,
          topicName: "全部话题",
          groupName: group.name,
          value: valueAllTopic
        });
      }
    }

    for (const topicLabel of task2TopicLabels) {
      const value = `1302_${topicLabel.keyCode}_${typeLabel.keyCode}`;
      const listData = await getListByValue(value, TASK2_PAGE);
      fs.writeFileSync(
        path.join(
          OUTPUT_DIR,
          "task2_lists",
          `${typeLabel.keyCode}_topic_${topicLabel.keyCode}.json`
        ),
        JSON.stringify(listData, null, 2),
        "utf8"
      );

      for (const group of listData.data || []) {
        for (const item of group.sectionList || []) {
          addQuestionToStore(store, pickQuestionCore(item), {
            task: "task2",
            typeName: typeLabel.tagZhName,
            topicName: topicLabel.tagZhName,
            groupName: group.name,
            value
          });
        }
      }
    }
  }

  const rows = Array.from(store.values()).sort(
    (a, b) => Number(b.doneNum) - Number(a.doneNum)
  );

  let detailOkCount = 0;
  let detailBlockedCount = 0;
  let chartUrlCount = 0;

  for (const row of rows) {
    const detail = await fetchQuestionDetail(row.questionId);
    row.detail = detail;

    if (detail.ok) {
      detailOkCount += 1;
      chartUrlCount += (detail.imageUrls || []).length;
    } else {
      detailBlockedCount += 1;
    }
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "questions_combined.json"),
    JSON.stringify(rows, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "questions_combined.csv"),
    toCsv(rows),
    "utf8"
  );

  const report = {
    generatedAt: new Date().toISOString(),
    task1TypeCount: task1TypeLabels.length,
    task2TypeCount: task2TypeLabels.length,
    task2TopicCount: task2TopicLabels.length,
    questionCount: rows.length,
    detailOkCount,
    detailBlockedCount,
    chartUrlCount,
    note:
      detailBlockedCount > 0
        ? "部分详情接口返回 `非法请求`，图表URL可能无法完整提取。"
        : "详情接口可访问，已提取图表URL。"
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "report.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log("Crawl finished");
  console.log(report);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
