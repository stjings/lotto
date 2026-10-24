import { choose, metrics, NUMBERS } from "./metrics.js";
import { validateFilters, passes } from "./filters.js";
import { validateWeights, createScoreContext, score } from "./scoring.js";
import { seededRandom, rankSampler } from "./random.js";
import { unrank } from "./candidates.js";
import { selectTop } from "./selection.js";
export function validateConfig(config) {
  const { excluded, count, top, seed, mode, maxOverlap, filters, weights } =
    config;
  if (
    !Array.isArray(excluded) ||
    new Set(excluded).size !== excluded.length ||
    excluded.length > 39 ||
    excluded.some((n) => !Number.isInteger(n) || n < 1 || n > 45)
  )
    throw new Error("제외수는 1~45 사이의 서로 다른 번호 0~39개여야 합니다.");
  if (!Number.isInteger(count) || count < 100 || count > 100000)
    throw new Error("생성량은 100~100,000 사이의 정수로 입력하세요.");
  if (!Number.isInteger(top) || top < 5 || top > 50)
    throw new Error("TOP 개수는 5~50 사이로 입력하세요.");
  if (typeof seed !== "string" || !seed.length || seed.length > 200)
    throw new Error("시드는 1~200자로 입력하세요.");
  if (
    !["score", "random", "mixed"].includes(mode) ||
    !Number.isInteger(maxOverlap) ||
    maxOverlap < 0 ||
    maxOverlap > 6
  )
    throw new Error("TOP 선정 설정을 확인하세요.");
  validateFilters(filters);
  validateWeights(weights);
}
export async function simulate(
  config,
  history,
  {
    onProgress = () => {},
    isCancelled = () => false,
    yieldTask = () => new Promise((r) => setTimeout(r, 0)),
  } = {},
) {
  validateConfig(config);
  const pool = NUMBERS.filter((n) => !config.excluded.includes(n));
  const total = choose(pool.length),
    target = Math.min(total, config.count);
  const random = seededRandom(config.seed),
    selectionRandom = seededRandom(config.seed + "|selection");
  const next = rankSampler(total, random),
    context = createScoreContext(history, config.weights);
  const started = performance.now(),
    accepted = [];
  let generated = 0;
  while (generated < target && !isCancelled()) {
    const end = Math.min(target, generated + 500);
    for (; generated < end; generated++) {
      const numbers = unrank(pool, next()),
        m = metrics(numbers, history[0]?.numbers);
      if (passes(m, config.filters))
        accepted.push({
          numbers,
          metrics: m,
          ...score(m, context),
          random: selectionRandom(),
        });
    }
    onProgress({ generated, target, passed: accepted.length });
    await yieldTask();
  }
  const selected = selectTop(
    accepted,
    config.top,
    config.mode,
    config.maxOverlap,
  );
  // Independent uniform baseline across all 45 numbers, with no exclusion/filter/diversity rule.
  const baselineNext = rankSampler(
    choose(45),
    seededRandom(config.seed + "|baseline"),
  );
  const randomBaseline = Array.from({ length: config.top }, () => {
    const numbers = unrank(NUMBERS, baselineNext()),
      m = metrics(numbers, history[0]?.numbers);
    return { numbers, metrics: m, ...score(m, context) };
  });
  return {
    version: 2,
    config,
    historyThrough: history[0]?.draw_no ?? null,
    generated,
    passed: accepted.length,
    rejected: generated - accepted.length,
    total,
    target,
    capped: config.count > total,
    cancelled: isCancelled(),
    elapsedMs: performance.now() - started,
    selected,
    accepted,
    randomBaseline,
    randomComparison: selectTop(
      accepted,
      config.top,
      "random",
      config.maxOverlap,
    ),
  };
}
