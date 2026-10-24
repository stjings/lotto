import { choose } from "./metrics.js";
export function unrank(pool, rank) {
  const result = [];
  let start = 0;
  for (let slots = 6; slots > 0; slots--) {
    for (let i = start; i <= pool.length - slots; i++) {
      const block = choose(pool.length - i - 1, slots - 1);
      if (rank < block) {
        result.push(pool[i]);
        start = i + 1;
        break;
      }
      rank -= block;
    }
  }
  return result;
}
