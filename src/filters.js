export const FILTER_DEFS = [
  ["sum", "번호 합계", 100, 190, 21, 255],
  ["m3", "3의 배수", 0, 3, 0, 6],
  ["m4", "4의 배수", 0, 3, 0, 6],
  ["m5", "5의 배수", 0, 2, 0, 6],
  ["m6", "6의 배수", 0, 2, 0, 6],
  ["m7", "7의 배수", 0, 6, 0, 6],
  ["m8", "8의 배수", 0, 6, 0, 6],
  ["m9", "9의 배수", 0, 6, 0, 6],
  ["prime", "소수", 0, 3, 0, 6],
  ["composite", "합성수 (1 제외)", 0, 6, 0, 6],
  ["consecutive", "연속번호 쌍", 0, 2, 0, 5],
  ["low", "저번호 (1~22)", 0, 6, 0, 6],
  ["doubles", "쌍수 (11·22·33·44)", 0, 4, 0, 4],
  ["overlap", "직전 회차 중복", 0, 6, 0, 6],
  ...["1~10", "11~20", "21~30", "31~40", "41~45"].map((label, i) => [
    "band" + i,
    label + " 번호대",
    0,
    6,
    0,
    6,
  ]),
];
export function defaultFilters() {
  return Object.fromEntries([
    ...FILTER_DEFS.map(([key, , min, max]) => [
      key,
      { enabled: !key.startsWith("band"), min, max },
    ]),
    ["odd", { enabled: true, values: [2, 3, 4] }],
  ]);
}
export function validateFilters(filters) {
  if (!filters || typeof filters !== "object")
    throw new Error("필터 설정 형식이 올바르지 않습니다.");
  for (const [key, label, , , floor, ceil] of FILTER_DEFS) {
    const f = filters[key];
    if (
      !f ||
      typeof f.enabled !== "boolean" ||
      !Number.isInteger(f.min) ||
      !Number.isInteger(f.max) ||
      f.min < floor ||
      f.max > ceil ||
      f.min > f.max
    )
      throw new Error(label + " 범위를 확인하세요.");
  }
  const odd = filters.odd;
  if (
    !odd ||
    typeof odd.enabled !== "boolean" ||
    !Array.isArray(odd.values) ||
    odd.values.some((n) => !Number.isInteger(n) || n < 0 || n > 6) ||
    (odd.enabled && !odd.values.length)
  )
    throw new Error("홀짝 비율을 하나 이상 선택하세요.");
}
export function passes(m, filters) {
  if (filters.odd.enabled && !filters.odd.values.includes(m.odd)) return false;
  return FILTER_DEFS.every(
    ([key]) =>
      !filters[key].enabled ||
      (m[key] >= filters[key].min && m[key] <= filters[key].max),
  );
}
