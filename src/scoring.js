import { metrics } from "./metrics.js";
export const DEFAULT_WEIGHTS = {
  sum: 20,
  odd: 20,
  m3: 15,
  prime: 15,
  consecutive: 10,
  recent3: 10,
  recent10: 10,
};
export const SCORE_LABELS = {
  sum: "합계",
  odd: "홀짝",
  m3: "3배수",
  prime: "소수",
  consecutive: "연번",
  recent3: "최근 3회 유사도",
  recent10: "최근 10회 유사도",
};
export function validateWeights(weights) {
  if (
    !weights ||
    Object.keys(weights).length !== Object.keys(DEFAULT_WEIGHTS).length ||
    Object.keys(DEFAULT_WEIGHTS).some(
      (k) => !Number.isFinite(weights[k]) || weights[k] < 0 || weights[k] > 100,
    ) ||
    !Object.keys(DEFAULT_WEIGHTS).some((k) => weights[k] > 0)
  )
    throw new Error("점수 가중치는 각각 0~100, 합계는 0보다 커야 합니다.");
}
export function createScoreContext(history, weights = DEFAULT_WEIGHTS) {
  return {
    weights,
    recent: history.slice(0, 10).map((d) => metrics(d.numbers)),
  };
}
export function score(m, context) {
  const near = (value, target, scale) =>
    Math.max(0, 1 - Math.abs(value - target) / scale);
  const similarity = (n) => {
    const rows = context.recent.slice(0, n);
    return rows.length
      ? rows.reduce(
          (s, r) =>
            s +
            (near(m.sum, r.sum, 100) +
              near(m.odd, r.odd, 6) +
              near(m.prime, r.prime, 6)) /
              3,
          0,
        ) / rows.length
      : 0;
  };
  const parts = {
    sum: near(m.sum, 145, 100),
    odd: near(m.odd, 3, 3),
    m3: near(m.m3, 2, 4),
    prime: near(m.prime, 2, 4),
    consecutive: near(m.consecutive, 1, 4),
    recent3: similarity(3),
    recent10: similarity(10),
  };
  const total = Object.values(context.weights).reduce((a, b) => a + b, 0);
  const breakdown = Object.fromEntries(
    Object.entries(parts).map(([k, v]) => [
      k,
      ((v * context.weights[k]) / total) * 100,
    ]),
  );
  return {
    score: Object.values(breakdown).reduce((a, b) => a + b, 0),
    breakdown,
  };
}
