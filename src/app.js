import { NUMBERS, choose, rankPrize } from "./metrics.js";
import { FILTER_DEFS, defaultFilters } from "./filters.js";
import { DEFAULT_WEIGHTS, SCORE_LABELS } from "./scoring.js";
import { validateConfig } from "./engine.js";
import { DATA_SOURCE, loadDraws, isStale } from "./data.js";
import { statisticalProvider } from "./recommendations.js";
import { readSaved, writeSaved, parseSettings } from "./storage.js";
const $ = (id) => document.getElementById(id);
const state = {
  draws: [],
  excluded: new Set(),
  origins: {},
  filters: defaultFilters(),
  weights: { ...DEFAULT_WEIGHTS },
  recommendation: null,
  result: null,
  busy: false,
  saved: readSaved(),
  preview: new Set(),
};
let worker, noticeTimer;
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function notify(message) {
  $("notice").textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("notice").textContent = ""), 7000);
}
function safely(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (e) {
      notify(e.message);
    }
  };
}
const ball = (n) =>
  `<span class="number-ball c${Math.floor((n - 1) / 10)}">${n}</span>`;
const balls = (numbers, bonus) =>
  `<div class="lotto-balls">${numbers.map(ball).join("")}${bonus ? `<span class="bonus-separator">+</span>${ball(bonus)}` : ""}</div>`;
const int = (id) => Number($(id).value);
function config() {
  return {
    excluded: [...state.excluded].sort((a, b) => a - b),
    filters: structuredClone(state.filters),
    weights: { ...state.weights },
    count: int("count"),
    top: int("top"),
    seed: $("seed").value,
    mode: $("mode").value,
    maxOverlap: int("max-overlap"),
  };
}
function persist() {
  writeSaved(state.saved);
  renderSaved();
}
function download(filename, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderNumbers(focusNumber) {
  $("number-grid").innerHTML = NUMBERS.map(
    (n) =>
      `<button type="button" data-number="${n}" class="pick c${Math.floor((n - 1) / 10)}${state.excluded.has(n) ? " excluded" : ""}" aria-label="${n}번 제외" aria-pressed="${state.excluded.has(n)}">${n}${state.excluded.has(n) ? `<span class="origin">${state.origins[n] === "statistics" ? "S" : "M"}</span>` : ""}</button>`,
  ).join("");
  const remaining = 45 - state.excluded.size,
    total = choose(remaining);
  $("pool-info").innerHTML =
    `<div><small>제외한 번호</small><strong>${state.excluded.size}<span> / 39</span></strong></div><div><small>남은 번호</small><strong>${remaining}<span>개</span></strong></div><div><small>가능한 조합</small><strong>${total.toLocaleString()}<span>줄</span></strong></div>`;
  $("capacity").textContent =
    int("count") > total
      ? `요청 ${int("count").toLocaleString()}줄 > 가능한 ${total.toLocaleString()}줄. 전체 ${total.toLocaleString()}개 조합만 검사합니다.`
      : "";
  renderRecommendationDiff();
  renderStudioSummary();
  renderFrequency();
  if (focusNumber)
    $("number-grid")
      .querySelector(`[data-number="${focusNumber}"]`)
      ?.focus({ preventScroll: true });
}
function addExcluded(numbers, origin = "manual") {
  const next = new Set([...state.excluded, ...numbers]);
  if (next.size > 39)
    throw new Error(
      "최소 6개 번호가 남아야 합니다. 한 번에 적용할 제외수를 줄이세요.",
    );
  numbers.forEach((n) => {
    if (!state.excluded.has(n)) state.origins[n] = origin;
  });
  state.excluded = next;
  renderNumbers();
}
function renderRecommendationDiff() {
  const added = [...state.preview].filter((n) => !state.excluded.has(n));
  const shared = [...state.preview].filter((n) => state.excluded.has(n));
  $("recommend-diff").textContent =
    `현재 ${state.excluded.size}개 → 적용 후 ${new Set([...state.excluded, ...state.preview]).size}개 · 추가 ${added.length}개 (${added.join("·") || "없음"}) · 공통 ${shared.length}개. 기존 선택은 유지됩니다.`;
}
function renderRecommendation() {
  if (!state.draws.length) return;
  const count = int("recommend-count");
  if (!Number.isInteger(count) || count < 0 || count > 39) {
    notify("추천 개수는 0~39로 입력하세요.");
    return;
  }
  state.recommendation = statisticalProvider.recommend(state.draws, {
    window: int("window"),
    count,
    method: $("recommend-method").value,
  });
  state.preview = new Set(state.recommendation.candidates.map((r) => r.n));
  $("recommend-preview").innerHTML = state.recommendation.candidates
    .map(
      (r) =>
        `<label class="recommend-choice"><input type="checkbox" data-recommend="${r.n}" checked>${r.n}<small>${r.frequency}회</small></label>`,
    )
    .join("");
  $("recommend-reason").textContent =
    `${state.recommendation.from}~${state.recommendation.through}회 근거 · ${$("recommend-method").value === "frequency" ? "많이 출현한 번호, 최근 출현 순" : "기록 내 마지막 출현이 오래된 순"} · 체크를 해제하여 부분 채택하세요.`;
  renderRecommendationDiff();
  $("statistics").innerHTML = state.recommendation.stats
    .map(
      (r, i) =>
        `<tr><td>${i + 1} · <b>${r.n}</b></td><td>${r.frequency}회</td><td>${r.f3}/${r.f5}/${r.f10}</td><td>${state.draws[0].numbers.includes(r.n) ? "●" : "—"}</td><td>${r.lastDraw ? `${r.lastDraw}회` : "기록 없음"}</td></tr>`,
    )
    .join("");
}
function renderHistory() {
  const count =
    $("history-limit").value === "all"
      ? state.draws.length
      : int("history-limit");
  $("history").innerHTML = state.draws
    .slice(0, count)
    .map(
      (d) =>
        `<div class="history-row"><span><b>${d.draw_no}회</b><br>${d.date.slice(0, 10)}</span><span class="numbers">${d.numbers.join(" · ")} + ${d.bonus_no}</span><button class="secondary" data-draw="${d.draw_no}">일괄 토글</button></div>`,
    )
    .join("");
}
async function load() {
  $("reload").disabled = true;
  try {
    const data = await loadDraws();
    state.draws = data.draws;
    const latest = state.draws[0],
      stale = isStale(latest);
    $("header-draw").textContent =
      `${latest.draw_no}회 기록까지 보관${stale ? " · 갱신 확인 필요" : ""}`;
    $("data-status").innerHTML =
      `<a href="${DATA_SOURCE}" target="_blank" rel="noreferrer">smok95 공개 데이터셋</a> · ${escape(data.source)} · ${state.draws.length.toLocaleString()}회 보관<br>파일 갱신 ${data.updatedAt ? escape(new Date(data.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })) + " KST" : "시각 미제공"} · 확인 ${escape(new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))} KST${stale ? '<br><span class="warning">다음 추첨 예정 시각이 지났습니다. 최신 결과 반영 여부를 확인하세요.</span>' : ""}<br><span class="muted">제3자 데이터이므로 구매·당첨 확인은 동행복권 공식 결과와 대조하세요.</span>`;
    $("latest-draw").innerHTML =
      `<div class="latest"><div><span class="muted">보유 데이터 최신 회차</span><h3>${latest.draw_no}회 <small class="muted">${latest.date.slice(0, 10)}</small></h3></div>${balls(latest.numbers, latest.bonus_no)}${stale ? '<p class="warning latest-warning">새 회차 반영을 확인해주세요. 현재 보유한 마지막 정상 기록입니다.</p>' : ""}</div>`;
    $("compare-draw").innerHTML = state.draws
      .map(
        (d) =>
          `<option value="${d.draw_no}">${d.draw_no}회 · ${d.date.slice(0, 10)}</option>`,
      )
      .join("");
    renderHistory();
    renderRecommendation();
    renderFrequency();
    renderSaved();
    $("run").disabled = false;
  } catch (error) {
    $("data-status").textContent = error.message;
    notify(error.message);
  } finally {
    $("reload").disabled = false;
  }
}
function renderFilters() {
  const main = FILTER_DEFS.filter(([key]) =>
    ["sum", "m3", "prime", "consecutive", "low"].includes(key),
  );
  const advanced = FILTER_DEFS.filter((d) => !main.includes(d));
  const control = ([key, label, , , floor, ceil]) => {
    const f = state.filters[key];
    return `<div class="filter-row" data-filter="${key}"><label class="toggle-label"><input type="checkbox" data-key="${key}" data-kind="enabled" ${f.enabled ? "checked" : ""}> ${label}</label><div class="range-control" aria-disabled="${!f.enabled}">${["min", "max"].map((side, i) => `<label>${i ? "최대" : "최소"}<div class="range-side"><input aria-label="${label} ${i ? "최대" : "최소"} 슬라이더" data-key="${key}" data-kind="${side}" type="range" min="${floor}" max="${ceil}" value="${f[side]}" ${!f.enabled ? "disabled" : ""}><input aria-label="${label} ${i ? "최대" : "최소"}" data-key="${key}" data-kind="${side}" type="number" min="${floor}" max="${ceil}" value="${f[side]}" ${!f.enabled ? "disabled" : ""}></div></label>`).join("")}</div></div>`;
  };
  $("filter-controls").innerHTML =
    main.map(control).join("") +
    `<details><summary>배수 · 합성수 · 번호대 등 상세 조건</summary>${advanced.map(control).join("")}</details>`;
  $("odd-enabled").checked = state.filters.odd.enabled;
  $("odd-values").innerHTML = Array.from(
    { length: 7 },
    (_, n) =>
      `<button class="chip" data-odd="${n}" aria-label="홀수 ${n}개 짝수 ${6 - n}개" aria-pressed="${state.filters.odd.values.includes(n)}">${n}:${6 - n}</button>`,
  ).join("");
  $("weight-controls").innerHTML = Object.entries(state.weights)
    .map(
      ([key, value]) =>
        `<label>${SCORE_LABELS[key]}<input type="number" data-weight="${key}" value="${value}" min="0" max="100"></label>`,
    )
    .join("");
}
function applyConfig(c) {
  validateConfig(c);
  state.filters = structuredClone(c.filters);
  state.weights = { ...c.weights };
  state.excluded = new Set(c.excluded);
  state.origins = {};
  for (const [id, key] of [
    ["count", "count"],
    ["top", "top"],
    ["seed", "seed"],
    ["mode", "mode"],
    ["max-overlap", "maxOverlap"],
  ])
    $(id).value = c[key];
  $("count-preset").value = [
    "100",
    "500",
    "1000",
    "5000",
    "10000",
    "50000",
    "100000",
  ].includes(String(c.count))
    ? c.count
    : "custom";
  renderFilters();
  renderNumbers();
  renderStudioSummary();
}
function resultRows() {
  if ($("result-view").value === "baseline")
    return state.result.randomBaseline ?? [];
  return $("result-view").value === "random"
    ? state.result.randomComparison
    : state.result.selected;
}
function renderResults() {
  if (!state.result) return;
  const result = state.result,
    rows = resultRows();
  $("result-count").textContent = rows.length + " LINES";
  $("result-summary").innerHTML = `
    <div class="result-summary-stats"><div><span>만든 후보</span><b>${result.generated.toLocaleString()}</b></div><div><span>조건 통과</span><b>${result.passed.toLocaleString()}</b></div><div><span>필터 탈락</span><b>${result.rejected.toLocaleString()}</b></div></div>
    <div class="result-meta">${(result.elapsedMs / 1000).toFixed(2)}초 · ${result.historyThrough ?? "없음"}회 기록 기준 · ${result.cancelled ? "취소한 실험의 부분 결과" : "실험 완료"}</div>
    ${result.capped ? `<p class="warning">가능한 전체 ${result.total.toLocaleString()}개 조합으로 제한했습니다.</p>` : ""}
    ${rows.length < result.config.top ? '<p class="warning">필터 또는 중복도 제한으로 TOP 요청량보다 결과가 적습니다. 조건을 완화하세요.</p>' : ""}
    <details class="result-method"><summary>실험 정보와 비교 방식</summary><p>시드 <b>${escape(result.config.seed)}</b> · 같은 설정과 시드로 다시 실행하면 결과를 재현할 수 있어요.</p><p>통과 후보 랜덤은 필터를 적용한 뒤 고릅니다. 완전 랜덤은 1~45 전체에서 제외수·필터·중복도 제한 없이 고른 비교군이에요.</p></details>`;
  $("result-list").innerHTML = rows.length
    ? rows
        .map(
          (r, i) =>
            `<article class="result-card"><div class="result-heading"><strong>${$("result-view").value === "selected" ? "TOP" : "RANDOM"} ${String(i + 1).padStart(2, "0")}</strong><b>${r.score.toFixed(1)} <small>/ 100</small></b></div>${balls(r.numbers)}<div class="metrics"><span>합 ${r.metrics.sum}</span><span>홀짝 ${r.metrics.odd}:${6 - r.metrics.odd}</span><span>소수 ${r.metrics.prime}</span><span>합성 ${r.metrics.composite}</span><span>연번 ${r.metrics.consecutive}</span><span>저:고 ${r.metrics.low}:${6 - r.metrics.low}</span><span>직전 중복 ${r.metrics.overlap}</span></div><details><summary>점수 세부 내역 · 배수</summary><div>${Object.entries(
              r.breakdown,
            )
              .map(([k, v]) => `${SCORE_LABELS[k]} ${v.toFixed(2)}`)
              .join(
                " · ",
              )}</div><div>${Array.from({ length: 7 }, (_, i) => `${i + 3}배수 ${r.metrics["m" + (i + 3)]}개`).join(" · ")}</div></details><button class="secondary" data-save="${i}">구매 후보에 저장 ＋</button></article>`,
        )
        .join("")
    : '<p class="warning">통과한 조합이 없습니다. 필터를 완화하고 다시 실행하세요.</p>';
}
function renderSaved() {
  $("saved-count").textContent = state.saved.tickets.length;
  $("presets").innerHTML = state.saved.presets.length
    ? state.saved.presets
        .map(
          (p, i) =>
            `<div class="saved-item"><span>${escape(p.name)} · 제외 ${p.config?.excluded?.length ?? 0}개</span><div><button class="secondary" data-preset="${i}">적용</button><button class="text-button" data-delete-preset="${i}">삭제</button></div></div>`,
        )
        .join("")
    : '<p class="muted">저장된 설정이 없습니다.</p>';
  $("runs").innerHTML = state.saved.runs.length
    ? state.saved.runs
        .map(
          (r, i) =>
            `<div class="saved-item"><span>${escape(r.date)} · ${r.generated.toLocaleString()}줄 / 통과 ${r.passed.toLocaleString()}<br>시드 ${escape(r.config.seed)}</span><div><button class="secondary" data-run="${i}">결과 보기</button><button class="text-button" data-delete-run="${i}">삭제</button></div></div>`,
        )
        .join("")
    : '<p class="muted">완료된 실험이 자동 기록됩니다 (최근 10개 TOP 보관).</p>';
  const draw = state.draws.find((d) => d.draw_no === int("compare-draw"));
  $("tickets").innerHTML = state.saved.tickets.length
    ? state.saved.tickets
        .map((t, i) => {
          const outcome = draw ? rankPrize(t.numbers, draw) : null;
          return `<div class="saved-item"><span>${t.numbers.join(" · ")}<br><small class="muted">저장 시 기준 ${t.historyThrough ?? "미상"}회 · ${outcome ? `${outcome.matches}개 일치 · ${outcome.rank ? outcome.rank + "등" : "미당첨"}${outcome.rank ? ` · ${outcome.prize === null ? "당첨금 자료 없음" : outcome.prize.toLocaleString() + "원"}` : ""}` : "데이터 로딩 후 비교 가능"}</small></span><button class="text-button" data-delete-ticket="${i}">삭제</button></div>`;
        })
        .join("")
    : '<p class="muted">결과에서 구매 후보를 저장하세요.</p>';
}
function setBusy(busy) {
  state.busy = busy;
  $("run").disabled = busy || !state.draws.length;
  $("cancel").hidden = !busy;
  $("reload").disabled = busy;
  // Other controls remain responsive; all results retain the immutable configuration captured at start.
}
function start() {
  if (state.busy) return;
  const c = config();
  validateConfig(c);
  if (!state.draws.length) throw new Error("당첨 데이터를 먼저 불러오세요.");
  worker?.terminate();
  worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  setBusy(true);
  $("progress").value = 0;
  $("run-status").textContent = "후보 생성 중…";
  worker.onmessage = ({ data }) => {
    if (data.type === "progress") {
      $("progress").value =
        (data.progress.generated / data.progress.target) * 100;
      $("run-status").textContent =
        `${data.progress.generated.toLocaleString()} / ${data.progress.target.toLocaleString()}줄 · 통과 ${data.progress.passed.toLocaleString()}`;
    } else if (data.type === "error") {
      setBusy(false);
      notify(data.message);
      $("run-status").textContent = data.message;
      worker.terminate();
    } else if (data.type === "done") {
      state.result = data.result;
      setBusy(false);
      $("csv").disabled = false;
      $("run-status").textContent =
        `${data.result.cancelled ? "취소 · 부분 결과" : "완료"} · ${data.result.generated.toLocaleString()}줄 · ${(data.result.elapsedMs / 1000).toFixed(2)}초`;
      renderResults();
      if (location.hash === "#simulation") location.hash = "results";
      state.saved.runs.unshift({
        date:
          new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) +
          " KST",
        ...data.result,
        candidateCSV: undefined,
      });
      state.saved.runs = state.saved.runs.slice(0, 10);
      try {
        persist();
      } catch (e) {
        notify(e.message);
      }
      worker.terminate();
    }
  };
  worker.onerror = (e) => {
    setBusy(false);
    notify("Worker 오류: " + e.message);
    $("run-status").textContent = "실행 실패";
    worker.terminate();
  };
  worker.postMessage({
    type: "start",
    config: c,
    history: state.draws.slice(0, 10),
  });
}
$("number-grid").onclick = safely((e) => {
  const b = e.target.closest("[data-number]");
  if (!b) return;
  const n = Number(b.dataset.number);
  if (state.excluded.has(n)) {
    state.excluded.delete(n);
    delete state.origins[n];
  } else {
    if (state.excluded.size >= 39)
      throw new Error("최대 39개까지 제외할 수 있습니다.");
    state.excluded.add(n);
    state.origins[n] = "manual";
  }
  renderNumbers(n);
});
$("clear").onclick = () => {
  state.excluded.clear();
  state.origins = {};
  renderNumbers();
};
$("exclude-recent").onclick = safely(() =>
  addExcluded(state.draws.slice(0, int("window")).flatMap((d) => d.numbers)),
);
$("history").onclick = safely((e) => {
  const b = e.target.closest("[data-draw]");
  if (!b) return;
  const numbers = state.draws.find(
    (d) => d.draw_no === Number(b.dataset.draw),
  ).numbers;
  if (numbers.every((n) => state.excluded.has(n))) {
    numbers.forEach((n) => {
      state.excluded.delete(n);
      delete state.origins[n];
    });
    renderNumbers();
  } else addExcluded(numbers);
});
$("recommend-preview").onchange = (e) => {
  const n = Number(e.target.dataset.recommend);
  e.target.checked ? state.preview.add(n) : state.preview.delete(n);
  renderRecommendationDiff();
};
$("apply-recommend").onclick = safely(() =>
  addExcluded([...state.preview], "statistics"),
);
$("recommend-method").onchange = renderRecommendation;
$("recommend-count").onchange = renderRecommendation;
$("window").innerHTML = Array.from(
  { length: 10 },
  (_, i) =>
    `<option value="${i + 1}" ${i === 9 ? "selected" : ""}>최근 ${i + 1}회</option>`,
).join("");
$("window").onchange = renderRecommendation;
$("history-limit").onchange = renderHistory;
$("reload").onclick = load;
$("filter-controls").oninput = (e) => {
  const { key, kind } = e.target.dataset;
  if (!key || kind === "enabled") return;
  state.filters[key][kind] = Number(e.target.value);
  $("filter-controls")
    .querySelectorAll(`[data-key="${key}"][data-kind="${kind}"]`)
    .forEach((input) => {
      if (input !== e.target) input.value = e.target.value;
    });
};
$("filter-controls").onchange = (e) => {
  const { key, kind } = e.target.dataset;
  if (!key || kind !== "enabled") return;
  state.filters[key].enabled = e.target.checked;
  const row = e.target.closest(".filter-row");
  row
    .querySelector(".range-control")
    .setAttribute("aria-disabled", String(!e.target.checked));
  row
    .querySelectorAll("input:not([type=checkbox])")
    .forEach((input) => (input.disabled = !e.target.checked));
};
$("odd-enabled").onchange = (e) =>
  (state.filters.odd.enabled = e.target.checked);
$("odd-values").onclick = (e) => {
  const b = e.target.closest("[data-odd]");
  if (!b) return;
  const n = Number(b.dataset.odd),
    list = state.filters.odd.values;
  state.filters.odd.values = list.includes(n)
    ? list.filter((x) => x !== n)
    : [...list, n].sort();
  b.setAttribute("aria-pressed", String(state.filters.odd.values.includes(n)));
};
$("weight-controls").oninput = (e) => {
  if (e.target.dataset.weight)
    state.weights[e.target.dataset.weight] = Number(e.target.value);
};
$("reset-filters").onclick = () => {
  state.filters = defaultFilters();
  state.weights = { ...DEFAULT_WEIGHTS };
  renderFilters();
};
$("count-preset").onchange = () => {
  if ($("count-preset").value !== "custom")
    $("count").value = $("count-preset").value;
  renderNumbers();
};
$("count").oninput = () => {
  $("count-preset").value = "custom";
  renderNumbers();
};
$("new-seed").onclick = () => ($("seed").value = crypto.randomUUID());
$("run").onclick = safely(start);
$("cancel").onclick = () => {
  worker?.postMessage({ type: "cancel" });
  $("run-status").textContent = "취소 요청 중…";
};
$("result-view").onchange = renderResults;
$("csv").onclick = safely(() => {
  if (!state.result?.candidateCSV)
    throw new Error(
      "이전 기록에는 TOP만 보관됩니다. 전체 CSV는 다시 실행한 뒤 다운로드하세요.",
    );
  download(
    "lotto-lab-candidates.csv",
    state.result.candidateCSV,
    "text/csv;charset=utf-8",
  );
});
$("result-list").onclick = safely((e) => {
  const b = e.target.closest("[data-save]");
  if (!b || !state.result) return;
  const rows = resultRows();
  const row = rows[Number(b.dataset.save)];
  if (state.saved.tickets.some((t) => t.numbers.join() === row.numbers.join()))
    throw new Error("이미 저장한 번호입니다.");
  state.saved.tickets.push({
    numbers: row.numbers,
    historyThrough: state.result.historyThrough,
    seed: state.result.config.seed,
  });
  persist();
  notify("구매 후보에 저장했습니다.");
});
$("save-preset").onclick = safely(() => {
  const c = config();
  validateConfig(c);
  state.saved.presets.unshift({
    name: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    config: c,
  });
  state.saved.presets = state.saved.presets.slice(0, 30);
  persist();
  notify("제외수·필터·가중치·시드를 함께 저장했습니다.");
});
$("export-settings").onclick = safely(() => {
  const c = config();
  validateConfig(c);
  download(
    "lotto-lab-settings.json",
    JSON.stringify({ version: 2, config: c }, null, 2),
    "application/json",
  );
});
$("import-settings").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 100000)
      throw new Error("설정 파일은 100KB 이하만 지원합니다.");
    applyConfig(parseSettings(await file.text()));
    notify("설정을 불러왔습니다.");
  } catch (error) {
    notify(error.message);
  } finally {
    e.target.value = "";
  }
};
$("saved").onclick = safely((e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.preset !== undefined) {
    applyConfig(state.saved.presets[Number(d.preset)].config);
    location.hash = "exclusions";
    notify("저장 설정을 적용했습니다.");
  }
  if (d.run !== undefined) {
    state.result = state.saved.runs[Number(d.run)];
    $("csv").disabled = true;
    renderResults();
    location.hash = "results";
    notify(
      "저장된 TOP 결과입니다. 전체 후보 CSV는 재실행 후 받을 수 있습니다.",
    );
  }
  for (const [key, list] of [
    ["deletePreset", "presets"],
    ["deleteRun", "runs"],
    ["deleteTicket", "tickets"],
  ])
    if (d[key] !== undefined) {
      state.saved[list].splice(Number(d[key]), 1);
      persist();
    }
});
$("compare-draw").onchange = renderSaved;
try {
  document.documentElement.dataset.theme =
    localStorage.getItem("lotto-lab-theme") ?? "light";
} catch {
  document.documentElement.dataset.theme = "light";
}
$("theme").onclick = () => {
  const theme =
    document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("lotto-lab-theme", theme);
  } catch {}
};
const STEPS = [
  "analysis",
  "exclusions",
  "filters",
  "simulation",
  "results",
  "saved",
];
const PAGE_COPY = {
  analysis: [
    "작은 기록에서 시작하는, 나의 실험",
    "지난 당첨번호를 구경하고 어떤 번호를 남길지 생각해보세요.",
  ],
  exclusions: [
    "이번엔 어떤 번호를 쉬게 할까요?",
    "마음에 걸리는 번호는 잠깐 빼두세요. 언제든 다시 고를 수 있어요.",
  ],
  filters: [
    "나만의 기준을 더해보세요",
    "합계부터 홀짝까지, 원하는 조합의 모습을 정해보세요.",
  ],
  simulation: [
    "준비됐다면, 조합을 만나볼 시간",
    "지금 정한 기준으로 후보를 만들어요. 결과는 언제든 비교할 수 있어요.",
  ],
  results: [
    "내 기준을 통과한 조합들이에요",
    "점수와 번호 구성을 살펴보고 마음에 드는 후보를 모아보세요.",
  ],
  saved: [
    "마음에 드는 선택을 모아두세요",
    "나의 설정과 지난 실험, 구매 후보를 이 브라우저에서 보관해요.",
  ],
};
const STEP_LABELS = [
  "당첨 분석",
  "제외수 선택",
  "필터 설정",
  "시뮬레이션",
  "후보 비교",
  "내 저장함",
];
function renderRoute() {
  const requested = location.hash.slice(1);
  const view = STEPS.includes(requested) ? requested : "analysis";
  const index = STEPS.indexOf(view);
  document.body.dataset.view = view;
  for (const id of STEPS) $(id).hidden = id !== view;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === view) a.setAttribute("aria-current", "step");
    else a.removeAttribute("aria-current");
  });
  $("page-title").textContent = PAGE_COPY[view][0];
  $("page-description").textContent = PAGE_COPY[view][1];
  $("header-location").textContent = STEP_LABELS[index];
  $("page-eyebrow").textContent =
    view === "saved"
      ? "MY LITTLE NOTEBOOK"
      : `MY NUMBER LAB / ${String(index + 1).padStart(2, "0")}`;
  $("page-step").innerHTML =
    view === "saved"
      ? ""
      : `${String(index + 1).padStart(2, "0")} <span>/ 05</span>`;
  $("step-track").hidden = view === "saved";
  $("step-track").innerHTML = STEPS.slice(0, 5)
    .map(
      (id, i) =>
        `<a href="#${id}" class="${i === index ? "active" : i < index ? "complete" : ""}" aria-label="${STEP_LABELS[i]}"></a>`,
    )
    .join("");
  $("previous-step").hidden = index === 0 || view === "saved";
  $("previous-step").href = "#" + STEPS[Math.max(0, index - 1)];
  $("next-step").href = "#" + STEPS[Math.min(index + 1, 5)];
  $("next-step").textContent =
    view === "saved"
      ? "새 실험 시작하기 →"
      : index === 4
        ? "내 저장함 보기 →"
        : `${STEP_LABELS[index + 1]}${index === 0 ? "하기" : "으로"} →`;
  if (view === "saved") $("next-step").href = "#exclusions";
  if (index === 0)
    $("next-step").parentElement.style.justifyContent = "flex-end";
  else $("next-step").parentElement.style.justifyContent = "space-between";
  window.scrollTo({ top: 0, behavior: "instant" });
}
function renderFrequency() {
  if (!state.draws.length) return;
  const frequencies = NUMBERS.map(
    (n) => state.draws.slice(0, 10).filter((d) => d.numbers.includes(n)).length,
  );
  const max = Math.max(1, ...frequencies);
  $("frequency-map").innerHTML = NUMBERS.map(
    (n, i) =>
      `<button type="button" class="frequency-cell" data-frequency="${n}" style="--heat:${Math.round(8 + (frequencies[i] / max) * 33)}%" aria-label="${n}번 최근 10회 ${frequencies[i]}회 출현, 제외 ${state.excluded.has(n) ? "선택됨" : "선택 안 됨"}" aria-pressed="${state.excluded.has(n)}"><b>${n}</b><small>${frequencies[i]}회</small></button>`,
  ).join("");
}
function renderStudioSummary() {
  const remaining = 45 - state.excluded.size;
  $("summary-remaining").innerHTML = `${remaining}<small>개</small>`;
  $("summary-excluded").innerHTML = `${state.excluded.size}<small>개</small>`;
  $("summary-combinations").textContent = choose(remaining).toLocaleString();
  $("summary-numbers").innerHTML = state.excluded.size
    ? [...state.excluded]
        .sort((a, b) => a - b)
        .map(ball)
        .join("")
    : '<span class="muted">아직 제외한 번호가 없어요.</span>';
  const filters = [];
  if (state.filters.sum.enabled)
    filters.push(`합계 ${state.filters.sum.min}~${state.filters.sum.max}`);
  if (state.filters.odd.enabled)
    filters.push(`홀수 ${state.filters.odd.values.join("·")}개`);
  const other = Object.entries(state.filters).filter(
    ([k, v]) => !["sum", "odd"].includes(k) && v.enabled,
  ).length;
  if (other) filters.push(`그 외 ${other}개 조건`);
  $("summary-filters").innerHTML =
    filters.map((v) => `<span>${v}</span>`).join("") ||
    "<span>필터 없이 자유롭게</span>";
  $("summary-count").textContent = `${int("count").toLocaleString()}줄`;
  $("summary-top").textContent = `TOP ${int("top")}`;
  $("simulation-context").innerHTML =
    `<span>남은 번호 ${remaining}개</span><span>활성 필터 ${Object.values(state.filters).filter((f) => f.enabled).length}개</span><span>선정 ${int("top")}줄</span>`;
}
$("frequency-map").onclick = safely((e) => {
  const b = e.target.closest("[data-frequency]");
  if (!b) return;
  const n = Number(b.dataset.frequency);
  if (state.excluded.has(n)) {
    state.excluded.delete(n);
    delete state.origins[n];
    renderNumbers();
  } else addExcluded([n]);
  $("frequency-map")
    .querySelector(`[data-frequency="${n}"]`)
    ?.focus({ preventScroll: true });
});
document.addEventListener("input", renderStudioSummary);
document.addEventListener("change", renderStudioSummary);
$("odd-values").addEventListener("click", renderStudioSummary);
$("reset-filters").addEventListener("click", renderStudioSummary);
window.addEventListener("hashchange", renderRoute);
renderRoute();
renderFilters();
renderNumbers();
renderSaved();
load();
