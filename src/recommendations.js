import { NUMBERS } from "./metrics.js";
// Provider boundary: a future server-backed provider may implement the same recommend method.
export const statisticalProvider = {
  id: "statistics-v1",
  recommend(history, { count = 12, window = 10, method = "frequency" } = {}) {
    const recent = history.slice(0, window);
    const stats = NUMBERS.map((n) => {
      const last = history.find((d) => d.numbers.includes(n));
      const f = (k) =>
        history.slice(0, k).filter((d) => d.numbers.includes(n)).length;
      const index = history.findIndex((d) => d.numbers.includes(n));
      return {
        n,
        frequency: recent.filter((d) => d.numbers.includes(n)).length,
        f3: f(3),
        f5: f(5),
        f10: f(10),
        lastDraw: last?.draw_no ?? null,
        recency: index < 0 ? history.length : index,
      };
    });
    // Preserve the original high-frequency/recent exclusion heuristic, with explicit provenance.
    const ranked = [...stats].sort(
      method === "absence"
        ? (a, b) => b.recency - a.recency || a.n - b.n
        : (a, b) =>
            b.frequency - a.frequency || a.recency - b.recency || a.n - b.n,
    );
    return {
      provider: this.id,
      method,
      through: history[0]?.draw_no,
      from: recent.at(-1)?.draw_no,
      candidates: ranked.slice(0, count),
      stats: ranked,
    };
  },
};
