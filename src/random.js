// FNV-1a string seed + Mulberry32. Deterministic, non-cryptographic PRNG.
export function seededRandom(seed) {
  let state = 2166136261;
  for (const c of String(seed))
    state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Sparse Fisher-Yates permutation of combination ranks: no retries or duplicate combinations.
export function rankSampler(total, random) {
  const swaps = new Map();
  let remaining = total;
  return () => {
    if (!remaining) return null;
    const i = Math.floor(random() * remaining),
      value = swaps.get(i) ?? i;
    remaining--;
    swaps.set(i, swaps.get(remaining) ?? remaining);
    swaps.delete(remaining);
    return value;
  };
}
