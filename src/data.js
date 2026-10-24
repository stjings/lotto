import { NUMBERS } from "./metrics.js";
export const DATA_SOURCE = "https://smok95.github.io/lotto/results/all.json";
export function validateDraws(data) {
  if (!Array.isArray(data) || !data.length)
    throw new Error("당첨 데이터가 비어 있습니다.");
  const seen = new Set();
  for (const d of data) {
    if (
      !Number.isInteger(d.draw_no) ||
      d.draw_no < 1 ||
      seen.has(d.draw_no) ||
      !Array.isArray(d.numbers) ||
      d.numbers.length !== 6 ||
      new Set(d.numbers).size !== 6 ||
      d.numbers.some((n) => !NUMBERS.includes(n)) ||
      !NUMBERS.includes(d.bonus_no) ||
      d.numbers.includes(d.bonus_no) ||
      !Number.isFinite(Date.parse(d.date))
    )
      throw new Error("당첨 데이터 형식이 올바르지 않습니다.");
    seen.add(d.draw_no);
  }
  return [...data].sort((a, b) => b.draw_no - a.draw_no);
}
export function isStale(draw, now = Date.now()) {
  // Saturday 20:35 KST, plus a two-hour publication allowance for the following draw.
  return (
    now >
    Date.parse(draw.date.slice(0, 10) + "T11:35:00Z") +
      7 * 86400000 +
      2 * 3600000
  );
}
export async function loadDraws({
  fetcher = fetch,
  storage,
  base = "./",
} = {}) {
  const candidates = [];
  let cached;
  try {
    storage ??= globalThis.localStorage;
    cached = JSON.parse(storage.getItem("lotto-lab-data"));
    if (cached)
      candidates.push({
        ...cached,
        draws: validateDraws(cached.draws),
        source: "마지막 정상 캐시",
      });
  } catch {
    /* A corrupt or inaccessible cache cannot replace a validated local file. */
  }
  for (const file of ["data/all.json", "data/recent.json"]) {
    try {
      const response = await fetcher(base + file, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const draws = validateDraws(await response.json());
      const modified = response.headers.get("last-modified");
      candidates.push({
        draws,
        source: file,
        updatedAt:
          modified && Number.isFinite(Date.parse(modified)) ? modified : null,
        checkedAt: new Date().toISOString(),
      });
    } catch {
      /* Try the next same-origin source and the last known valid cache. */
    }
  }
  candidates.sort(
    (a, b) =>
      b.draws[0].draw_no - a.draws[0].draw_no ||
      b.draws.length - a.draws.length ||
      Number(a.source === "마지막 정상 캐시") -
        Number(b.source === "마지막 정상 캐시"),
  );
  if (!candidates.length)
    throw new Error(
      "당첨 데이터를 불러올 수 없습니다. 네트워크를 확인하고 다시 시도하세요. 예시 결과는 사용하지 않습니다.",
    );
  const result = candidates[0];
  try {
    storage.setItem("lotto-lab-data", JSON.stringify(result));
  } catch {
    /* Usable without storage. */
  }
  return result;
}
