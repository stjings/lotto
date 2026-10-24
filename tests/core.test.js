import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  metrics,
  choose,
  conditionalProbability,
  rankPrize,
  NUMBERS,
} from "../src/metrics.js";
import {
  defaultFilters,
  FILTER_DEFS,
  passes,
  validateFilters,
} from "../src/filters.js";
import { score, createScoreContext, DEFAULT_WEIGHTS } from "../src/scoring.js";
import { simulate, validateConfig } from "../src/engine.js";
import { unrank } from "../src/candidates.js";
import { seededRandom, rankSampler } from "../src/random.js";
import { selectTop, compareScore } from "../src/selection.js";
import {
  historyBefore,
  prepareBacktest,
  evaluateBacktest,
} from "../src/backtest.js";
import { statisticalProvider } from "../src/recommendations.js";
import { validateDraws, isStale, loadDraws } from "../src/data.js";
import { parseSettings, toCSV, readSaved, writeSaved } from "../src/storage.js";
const history = validateDraws(
  JSON.parse(await readFile(new URL("../data/all.json", import.meta.url))),
);
function config(overrides = {}) {
  return {
    excluded: [],
    count: 1000,
    top: 20,
    seed: "test-seed",
    mode: "score",
    maxOverlap: 6,
    filters: defaultFilters(),
    weights: { ...DEFAULT_WEIGHTS },
    ...overrides,
  };
}
function disabledFilters() {
  const f = defaultFilters();
  for (const v of Object.values(f)) v.enabled = false;
  return f;
}
const fast = { yieldTask: async () => {} };

test("metrics: primes/composites exclude 1; every multiple and band; sorting and pairs", () => {
  const m = metrics([3, 1, 2, 4, 22, 45], [1, 22, 30, 31, 40, 41]);
  assert.equal(m.sum, 77);
  assert.equal(m.prime, 2);
  assert.equal(m.composite, 3);
  assert.equal(m.odd, 3);
  assert.equal(m.consecutive, 3);
  assert.equal(m.low, 5);
  assert.equal(m.doubles, 1);
  assert.equal(m.overlap, 2);
  for (let d = 3; d <= 9; d++)
    assert.equal(
      m["m" + d],
      [3, 1, 2, 4, 22, 45].filter((n) => n % d === 0).length,
    );
  assert.deepEqual(
    [m.band0, m.band1, m.band2, m.band3, m.band4],
    [4, 0, 1, 0, 1],
  );
});
test("combinatorics and conditional probability", () => {
  assert.equal(choose(45), 8145060);
  assert.equal(choose(6), 1);
  assert.equal(choose(5), 0);
  assert.equal(choose(10, 0), 1);
  assert.equal(conditionalProbability(45), 1 / 8145060);
  assert.equal(conditionalProbability(6, 20), 1);
  assert.equal(conditionalProbability(5), 0);
});
test("every range filter accepts inclusive boundaries, rejects outside; disabled passes", () => {
  const m = metrics([1, 2, 3, 4, 5, 6]);
  for (const [key, , , , floor, ceil] of FILTER_DEFS) {
    const f = disabledFilters();
    f[key] = { enabled: true, min: m[key], max: m[key] };
    assert.equal(passes(m, f), true, key);
    f[key].min = m[key] + 1;
    f[key].max = m[key] + 1;
    assert.equal(passes(m, f), false, key);
    f[key].enabled = false;
    assert.equal(passes(m, f), true, key);
    f[key] = { enabled: true, min: floor, max: ceil };
    validateFilters(f);
  }
  const f = disabledFilters();
  f.odd = { enabled: true, values: [0, 2, 6] };
  assert.equal(passes(m, f), false);
  f.odd.values.push(3);
  assert.equal(passes(m, f), true);
  f.sum = { enabled: true, min: 200, max: 100 };
  assert.throws(() => validateFilters(f));
  f.sum = { enabled: false, min: 21, max: 255 };
  f.odd.values = [];
  assert.throws(() => validateFilters(f));
});
test("score is the exact sum of independent normalized parts and remains bounded", () => {
  const m = metrics([2, 3, 10, 30, 39, 45]);
  const ctx = createScoreContext(history);
  const value = score(m, ctx);
  assert.equal(
    value.score,
    Object.values(value.breakdown).reduce((a, b) => a + b, 0),
  );
  assert(value.score >= 0 && value.score <= 100);
  assert.equal(
    score(
      m,
      createScoreContext(history, {
        ...DEFAULT_WEIGHTS,
        sum: 40,
        odd: 40,
        m3: 30,
        prime: 30,
        consecutive: 20,
        recent3: 20,
        recent10: 20,
      }),
    ).score,
    value.score,
  );
  const ideal = score(
    { sum: 145, odd: 3, m3: 2, prime: 2, consecutive: 1 },
    createScoreContext([], { ...DEFAULT_WEIGHTS, recent3: 0, recent10: 0 }),
  );
  assert.equal(ideal.score, 100);
});
test("combination unranking covers all small-pool combinations once", () => {
  const pool = [1, 2, 3, 4, 5, 6, 7, 8];
  const rows = Array.from({ length: choose(8) }, (_, i) => unrank(pool, i));
  assert.equal(new Set(rows.map((a) => a.join())).size, 28);
  assert.deepEqual(rows[0], [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(rows.at(-1), [3, 4, 5, 6, 7, 8]);
  const next = rankSampler(28, seededRandom("x"));
  assert.equal(new Set(Array.from({ length: 28 }, next)).size, 28);
  assert.equal(next(), null);
});
test("100,000 unique candidates exclude every excluded number and repeat identically for a seed", async () => {
  const c = config({
    excluded: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    count: 100000,
    filters: disabledFilters(),
  });
  const a = await simulate(c, history, fast),
    b = await simulate(c, history, fast);
  assert.equal(a.generated, 100000);
  assert.equal(a.passed, 100000);
  assert.equal(new Set(a.accepted.map((r) => r.numbers.join())).size, 100000);
  for (const r of a.accepted) {
    assert.equal(r.numbers.length, 6);
    assert.equal(new Set(r.numbers).size, 6);
    assert(r.numbers.every((n) => n >= 11 && n <= 45));
  }
  assert.deepEqual(a.accepted, b.accepted);
  assert.deepEqual(a.selected, b.selected);
  assert.deepEqual(a.randomBaseline, b.randomBaseline);
  assert.equal(a.randomBaseline.length, c.top);
  assert(
    a.randomBaseline.some((r) => r.numbers.some((n) => c.excluded.includes(n))),
  );
  assert.deepEqual([...a.selected].sort(compareScore), a.selected);
  const other = await simulate(
    { ...c, seed: "different", count: 100 },
    history,
    fast,
  );
  assert.notDeepEqual(a.accepted[0], other.accepted[0]);
});
test("capacity cap at 39 exclusions, progress, impossible filters and invalid input", async () => {
  const c = config({
    excluded: NUMBERS.slice(0, 39),
    filters: disabledFilters(),
  });
  const progress = [];
  const r = await simulate(c, history, {
    ...fast,
    onProgress: (p) => progress.push(p),
  });
  assert.equal(r.generated, 1);
  assert.equal(r.total, 1);
  assert(r.capped);
  assert.deepEqual(r.accepted[0].numbers, [40, 41, 42, 43, 44, 45]);
  assert.equal(progress.at(-1).generated, 1);
  const none = config();
  none.filters.sum = { enabled: true, min: 21, max: 21 };
  assert.equal((await simulate(none, history, fast)).passed, 0);
  for (const override of [
    { count: 99 },
    { count: 100001 },
    { top: 4 },
    { seed: "" },
    { excluded: NUMBERS.slice(0, 40) },
    { excluded: [1, 1] },
    { weights: { ...DEFAULT_WEIGHTS, sum: NaN } },
    { weights: { ...DEFAULT_WEIGHTS, extra: 5 } },
    { maxOverlap: 8 },
  ])
    assert.throws(() => validateConfig(config(override)));
});
test("cooperative cancellation returns a clearly marked partial result", async () => {
  let cancel = false;
  const r = await simulate(config({ count: 100000 }), history, {
    onProgress: () => (cancel = true),
    isCancelled: () => cancel,
    yieldTask: async () => {},
  });
  assert(r.cancelled);
  assert.equal(r.generated, 500);
  assert(r.generated < r.target);
});
test("TOP score, random and mixed modes and diversity constraints", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    numbers: [1, 2, 3, 4, 5, i + 6],
    score: 100 - i,
    random: i / 20,
  }));
  assert.equal(selectTop(rows, 5)[0], rows[0]);
  assert.equal(selectTop(rows, 5, "score", 4).length, 1);
  assert.equal(selectTop(rows, 10, "mixed").length, 10);
  assert.equal(selectTop(rows, 10, "random").length, 10);
  assert.equal(new Set(selectTop(rows, 10, "mixed")).size, 10);
  const ties = [
    { numbers: [2, 3, 4, 5, 6, 7], score: 50 },
    { numbers: [1, 3, 4, 5, 6, 7], score: 50 },
  ];
  assert.equal(selectTop(ties, 1)[0], ties[1]);
});
test("all prize ranks including bonus and missing payouts", () => {
  const d = {
    numbers: [1, 2, 3, 4, 5, 6],
    bonus_no: 7,
    divisions: [
      { prize: 1000000000 },
      { prize: 50000000 },
      { prize: 1500000 },
      { prize: 50000 },
      { prize: 5000 },
    ],
  };
  for (const [nums, rank] of [
    [[1, 2, 3, 4, 5, 6], 1],
    [[1, 2, 3, 4, 5, 7], 2],
    [[1, 2, 3, 4, 5, 8], 3],
    [[1, 2, 3, 4, 8, 9], 4],
    [[1, 2, 3, 8, 9, 10], 5],
    [[1, 2, 8, 9, 10, 11], 0],
  ])
    assert.equal(rankPrize(nums, d).rank, rank);
  assert.equal(
    rankPrize([1, 2, 3, 4, 5, 6], { ...d, divisions: [] }).prize,
    null,
  );
});
test("backtest never passes target or future records to recommendation/scoring", async () => {
  const target = history[3];
  const prepared = prepareBacktest(history, target.draw_no);
  assert(prepared.history.every((d) => d.draw_no < target.draw_no));
  assert.equal(prepared.recommendation.through, target.draw_no - 1);
  const altered = history.map((d) =>
    d.draw_no >= target.draw_no
      ? { ...d, numbers: [1, 2, 3, 4, 5, 6], bonus_no: 7 }
      : d,
  );
  assert.deepEqual(historyBefore(altered, target.draw_no), prepared.history);
  const c = config({
    excluded: prepared.recommendation.candidates.map((r) => r.n),
  });
  const a = await simulate(c, prepared.history, fast),
    b = await simulate(c, historyBefore(altered, target.draw_no), fast);
  assert.deepEqual(a.selected, b.selected);
  assert.equal(evaluateBacktest(a, target, c.excluded).mode, "prospective");
});
test("recommendation has explicit historical provenance and selectable methods", () => {
  const r = statisticalProvider.recommend(history, { count: 12, window: 5 });
  assert.equal(r.candidates.length, 12);
  assert.equal(r.from, history[4].draw_no);
  assert.equal(r.through, history[0].draw_no);
  assert(r.stats[0].frequency >= r.stats.at(-1).frequency);
  const absence = statisticalProvider.recommend(history, { method: "absence" });
  assert(absence.stats[0].recency >= absence.stats.at(-1).recency);
});
test("data validation rejects invalid or duplicate results and stale detection uses draw timing", () => {
  assert.equal(history.length >= 100, true);
  assert.throws(() => validateDraws([]));
  assert.throws(() => validateDraws([history[0], history[0]]));
  assert.throws(() =>
    validateDraws([{ ...history[0], numbers: [1, 1, 2, 3, 4, 5] }]),
  );
  const d = { date: "2026-10-17T00:00:00Z" };
  assert.equal(isStale(d, Date.parse("2026-10-24T12:00:00Z")), false);
  assert.equal(isStale(d, Date.parse("2026-10-24T14:00:00Z")), true);
});
function memory() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}
test("data fallback uses validated recent and freshest known cache; no synthetic fallback", async () => {
  const storage = memory();
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return {
      ok: calls % 2 === 0,
      headers: new Headers(),
      json: async () => history.slice(0, 100),
    };
  };
  const data = await loadDraws({ fetcher, storage });
  assert.equal(data.source, "data/recent.json");
  const cached = await loadDraws({
    fetcher: async () => {
      throw Error("offline");
    },
    storage,
  });
  assert.equal(cached.source, "마지막 정상 캐시");
  assert.equal(cached.draws[0].draw_no, history[0].draw_no);
  await assert.rejects(
    loadDraws({
      fetcher: async () => {
        throw Error();
      },
      storage: memory(),
    }),
  );
});
test("settings roundtrip, malformed data, CSV and blocked local storage", () => {
  const c = config();
  assert.deepEqual(parseSettings(JSON.stringify({ version: 2, config: c })), c);
  assert.throws(() => parseSettings('{"version":1}'));
  assert.throws(() =>
    parseSettings(
      JSON.stringify({ version: 2, config: { ...c, count: Infinity } }),
    ),
  );
  const storage = memory(),
    value = { version: 2, presets: [{ config: c }], tickets: [], runs: [] };
  writeSaved(value, storage);
  assert.deepEqual(readSaved(storage), value);
  assert.deepEqual(readSaved({ getItem: () => "{broken" }), {
    version: 2,
    presets: [],
    tickets: [],
    runs: [],
  });
  assert.throws(() =>
    writeSaved(value, {
      setItem: () => {
        throw Error();
      },
    }),
  );
  assert(
    toCSV([
      {
        numbers: [1, 2, 3, 4, 5, 6],
        score: 99,
        metrics: metrics([1, 2, 3, 4, 5, 6]),
      },
    ]).includes("1,2,3,4,5,6,99.0000"),
  );
});
