/** Pastry symbols for the board — decorative figures only, no real stakes. */

export const SCATTER_ID = 'freespin';

export const SYMBOLS = [
  { id: 'eclair', label: 'Эклер', glyph: '🥐', tint: '#e8a060', deep: '#b86a2e', weight: 18 },
  { id: 'pavlova', label: 'Анна Павлова', glyph: '🍨', tint: '#ffe4f0', deep: '#f0a0c0', weight: 16 },
  { id: 'cake', label: 'Тортик', glyph: '🎂', tint: '#ffb7c5', deep: '#e86b8a', weight: 16 },
  { id: 'macaron', label: 'Макарон', glyph: '🧁', tint: '#e0b4ff', deep: '#a86be0', weight: 15 },
  { id: 'tart', label: 'Тарт', glyph: '🥧', tint: '#ffd28a', deep: '#e09a3a', weight: 14 },
  { id: 'choco', label: 'Шоколад', glyph: '🍫', tint: '#8b5a3c', deep: '#4a2614', weight: 13 },
  { id: 'berry', label: 'Ягодный', glyph: '🍓', tint: '#ff6b7a', deep: '#c2283a', weight: 8 },
  // Scatter: 3+ in one spin → free spins (does not form cluster pays)
  { id: SCATTER_ID, label: 'Free Spin', glyph: '🍭', tint: '#ffe08a', deep: '#ff4d8d', weight: 5, scatter: true },
];

export const SYMBOL_BY_ID = Object.fromEntries(SYMBOLS.map((s) => [s.id, s]));

export function isScatter(symbolId) {
  return symbolId === SCATTER_ID;
}

export function countScatters(symbols) {
  return symbols.reduce((n, id) => n + (isScatter(id) ? 1 : 0), 0);
}

/** Base cluster pays (cosmetic points) by size — Sugar Rush style curve. */
export const CLUSTER_PAY = {
  eclair:  { 5: 0.2, 6: 0.4, 7: 0.6, 8: 0.8, 9: 1.0, 10: 1.5, 12: 2.0, 15: 5.0 },
  pavlova: { 5: 0.25, 6: 0.5, 7: 0.75, 8: 1.0, 9: 1.25, 10: 2.0, 12: 2.5, 15: 6.0 },
  cake:    { 5: 0.3, 6: 0.6, 7: 0.9, 8: 1.2, 9: 1.5, 10: 2.5, 12: 3.0, 15: 8.0 },
  macaron: { 5: 0.4, 6: 0.8, 7: 1.2, 8: 1.6, 9: 2.0, 10: 3.0, 12: 4.0, 15: 10 },
  tart:    { 5: 0.5, 6: 1.0, 7: 1.5, 8: 2.0, 9: 2.5, 10: 4.0, 12: 5.0, 15: 12 },
  choco:   { 5: 0.75, 6: 1.5, 7: 2.0, 8: 3.0, 9: 4.0, 10: 6.0, 12: 8.0, 15: 20 },
  berry:   { 5: 1.0, 6: 2.0, 7: 3.0, 8: 4.0, 9: 5.0, 10: 8.0, 12: 12, 15: 30 },
};

export function payForCluster(symbolId, size) {
  const table = CLUSTER_PAY[symbolId];
  if (!table) return 0;
  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  let pay = 0;
  for (const key of keys) {
    if (size >= key) pay = table[key];
  }
  return pay;
}

function normalizeMood(biasOrOpts = 3) {
  if (biasOrOpts && typeof biasOrOpts === 'object') return biasOrOpts;
  const bias = typeof biasOrOpts === 'number' ? biasOrOpts : 3;
  return { bias, chaosRate: 0.1, luckyId: null, luckyBoost: 1, scatterBoost: 1 };
}

function weightWithMood(symbol, random, mood) {
  let w = symbol.weight;
  if (symbol.scatter) {
    w *= mood.scatterBoost ?? 1;
  } else if (mood.luckyId && symbol.id === mood.luckyId) {
    w *= mood.luckyBoost ?? 1;
  }
  // Micro-jitter so identical boards still diverge.
  w *= 0.82 + random() * 0.4;
  return w;
}

export function pickWeightedSymbol(random = Math.random, biasOrOpts = 3) {
  const mood = normalizeMood(biasOrOpts);
  const weights = SYMBOLS.map((s) => weightWithMood(s, random, mood));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  for (let i = 0; i < SYMBOLS.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return SYMBOLS[i].id;
  }
  return SYMBOLS[SYMBOLS.length - 1].id;
}

/**
 * Per-wave drop mood: cold / normal / hot cluster pressure + lucky symbol.
 * Makes each spin and cascade feel less scripted.
 */
export function createDropMood(random = Math.random) {
  const roll = random();
  let bias;
  let chaosRate;
  if (roll < 0.2) {
    // Cold — more pure random, fewer forced matches
    bias = 1.35 + random() * 0.9;
    chaosRate = 0.26 + random() * 0.18;
  } else if (roll < 0.78) {
    // Normal — clusters still appear, but not every drop
    bias = 2.2 + random() * 1.8;
    chaosRate = 0.08 + random() * 0.14;
  } else {
    // Hot — cluster party
    bias = 4.0 + random() * 2.4;
    chaosRate = 0.02 + random() * 0.07;
  }

  const paySymbols = SYMBOLS.filter((s) => !s.scatter);
  const luckyId = random() < 0.58
    ? paySymbols[Math.floor(random() * paySymbols.length)].id
    : null;

  return {
    bias,
    chaosRate,
    luckyId,
    luckyBoost: 1.7 + random() * 1.6,
    // Occasional soft scatter surge (still rare overall)
    scatterBoost: random() < 0.14 ? 1.25 + random() * 0.45 : 1,
  };
}

/**
 * Pick a symbol with neighbour bias — strength and chaos vary per mood.
 * `biasOrOpts` may be a number (legacy) or a mood from createDropMood().
 */
export function pickBiasedSymbol(symbols, index, gridSize, random = Math.random, biasOrOpts = 3) {
  const mood = normalizeMood(biasOrOpts);

  // Chaos drop: ignore neighbours entirely this cell.
  if (random() < (mood.chaosRate ?? 0)) {
    return pickWeightedSymbol(random, mood);
  }

  const r = Math.floor(index / gridSize);
  const c = index % gridSize;
  const neighbourIds = [];
  const deltas = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
    // Diagonals — weaker influence via single push (more spatial variety)
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (let d = 0; d < deltas.length; d += 1) {
    const [dr, dc] = deltas[d];
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
    const id = symbols[nr * gridSize + nc];
    if (!id) continue;
    // Cardinals count twice, diagonals once
    neighbourIds.push(id);
    if (d < 4) neighbourIds.push(id);
  }

  // Also peek one cell below (common cascade neighbour).
  if (r + 1 < gridSize) {
    const below = symbols[(r + 1) * gridSize + c];
    if (below) neighbourIds.push(below);
  }

  if (!neighbourIds.length) return pickWeightedSymbol(random, mood);

  const boost = new Map();
  for (const id of neighbourIds) {
    boost.set(id, (boost.get(id) || 0) + 1);
  }

  // Per-pick bias jitter around the wave mood
  const bias = Math.max(1, (mood.bias ?? 3) * (0.65 + random() * 0.75));

  const weights = SYMBOLS.map((s) => {
    let w = weightWithMood(s, random, mood);
    // Scatters stay free of neighbour clustering bias.
    if (s.scatter) return w;
    const hits = boost.get(s.id) || 0;
    if (hits > 0) w *= bias * hits;
    return w;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  for (let i = 0; i < SYMBOLS.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return SYMBOLS[i].id;
  }
  return SYMBOLS[SYMBOLS.length - 1].id;
}
