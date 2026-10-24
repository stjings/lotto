import { validateDraws } from "./data.js";
import { statisticalProvider } from "./recommendations.js";
import { rankPrize } from "./metrics.js";
// Only this history is passed into recommendation/scoring/generation. The target stays outside the engine.
export function historyBefore(draws, targetDraw) {
  return validateDraws(draws).filter((d) => d.draw_no < targetDraw);
}
export function prepareBacktest(draws, targetDraw, options = {}) {
  const history = historyBefore(draws, targetDraw);
  if (!history.length) throw new Error("선택 회차 이전 데이터가 없습니다.");
  return {
    mode: "prospective",
    history,
    recommendation: statisticalProvider.recommend(history, options),
  };
}
export function evaluateBacktest(result, target, excluded) {
  return {
    mode: "prospective",
    targetDraw: target.draw_no,
    excludedWinners: target.numbers.filter((n) => excluded.includes(n)),
    rows: result.selected.map((row) => ({
      ...row,
      ...rankPrize(row.numbers, target),
    })),
  };
}
