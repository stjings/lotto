export const PRIMES = new Set([
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43,
]);
export const NUMBERS = Array.from({ length: 45 }, (_, i) => i + 1);
export function choose(n, k = 6) {
  if (n < k || k < 0) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - i + 1)) / i;
  return Math.round(result);
}
export function metrics(numbers, latest = []) {
  const a = [...numbers].sort((x, y) => x - y);
  const m = {
    sum: a.reduce((x, y) => x + y, 0),
    odd: 0,
    prime: 0,
    composite: 0,
    consecutive: 0,
    low: 0,
    doubles: 0,
    overlap: 0,
  };
  for (let d = 3; d <= 9; d++) m["m" + d] = 0;
  for (let b = 0; b < 5; b++) m["band" + b] = 0;
  a.forEach((n, i) => {
    m.odd += n % 2;
    m.prime += Number(PRIMES.has(n));
    m.composite += Number(n > 1 && !PRIMES.has(n));
    m.low += Number(n <= 22);
    m.doubles += Number(n % 11 === 0);
    m.overlap += Number(latest.includes(n));
    m.consecutive += Number(i > 0 && n === a[i - 1] + 1);
    m["band" + Math.floor((n - 1) / 10)]++;
    for (let d = 3; d <= 9; d++) m["m" + d] += Number(n % d === 0);
  });
  return m;
}
export function rankPrize(numbers, draw) {
  const matches = numbers.filter((n) => draw.numbers.includes(n)).length;
  const rank =
    matches === 6
      ? 1
      : matches === 5
        ? numbers.includes(draw.bonus_no)
          ? 2
          : 3
        : matches === 4
          ? 4
          : matches === 3
            ? 5
            : 0;
  return {
    matches,
    rank,
    prize: rank ? (draw.divisions?.[rank - 1]?.prize ?? null) : 0,
  };
}
// Conditional on all six winning numbers surviving the exclusion. This is not a prediction probability.
export function conditionalProbability(remaining, tickets = 1) {
  const combinations = choose(remaining);
  if (!combinations) return 0;
  return Math.min(tickets, combinations) / combinations;
}
