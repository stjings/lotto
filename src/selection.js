// Stable ties use lexicographic numbers, independent of engine sort implementations.
export function compareScore(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  for (let i = 0; i < 6; i++)
    if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] - b.numbers[i];
  return 0;
}
export function selectTop(rows, count, mode = "score", maxOverlap = 6) {
  const ordered = [...rows].sort(
    mode === "random" ? (a, b) => a.random - b.random : compareScore,
  );
  const chosen = [];
  const add = (row) => {
    if (
      chosen.some(
        (c) =>
          c === row ||
          c.numbers.filter((n) => row.numbers.includes(n)).length > maxOverlap,
      )
    )
      return;
    chosen.push(row);
  };
  if (mode === "mixed") {
    for (const row of ordered) {
      if (chosen.length >= Math.ceil(count / 2)) break;
      add(row);
    }
    for (const row of [...rows].sort((a, b) => a.random - b.random)) {
      if (chosen.length >= count) break;
      add(row);
    }
  } else
    for (const row of ordered) {
      if (chosen.length >= count) break;
      add(row);
    }
  return chosen;
}
