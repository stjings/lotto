import { validateConfig } from "./engine.js";
const KEY = "lotto-lab-v2";
export function readSaved(storage) {
  try {
    storage ??= globalThis.localStorage;
    const value = JSON.parse(storage.getItem(KEY));
    if (value?.version !== 2)
      return { version: 2, presets: [], tickets: [], runs: [] };
    return {
      version: 2,
      presets: Array.isArray(value.presets) ? value.presets : [],
      tickets: Array.isArray(value.tickets) ? value.tickets : [],
      runs: Array.isArray(value.runs) ? value.runs : [],
    };
  } catch {
    return { version: 2, presets: [], tickets: [], runs: [] };
  }
}
export function writeSaved(value, storage) {
  try {
    storage ??= globalThis.localStorage;
    storage.setItem(KEY, JSON.stringify(value));
  } catch {
    throw new Error(
      "브라우저 저장 공간이 부족하거나 저장이 차단되었습니다. CSV 또는 JSON으로 내보내세요.",
    );
  }
}
export function parseSettings(text) {
  const value = JSON.parse(text);
  if (value.version !== 2)
    throw new Error("Lotto Lab v2 설정 파일이 아닙니다.");
  validateConfig(value.config);
  return value.config;
}
export function toCSV(rows) {
  return (
    "\uFEFF번호1,번호2,번호3,번호4,번호5,번호6,점수,합계,홀수,소수,합성수,연속쌍\r\n" +
    rows
      .map((r) =>
        [
          ...r.numbers,
          r.score.toFixed(4),
          r.metrics.sum,
          r.metrics.odd,
          r.metrics.prime,
          r.metrics.composite,
          r.metrics.consecutive,
        ].join(","),
      )
      .join("\r\n")
  );
}
