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

export function pickWeightedSymbol(random = Math.random) {
  const total = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let roll = random() * total;
  for (const symbol of SYMBOLS) {
    roll -= symbol.weight;
    if (roll <= 0) return symbol.id;
  }
  return SYMBOLS[SYMBOLS.length - 1].id;
}

/**
 * Pick a symbol with ~3× bias toward neighbours already on the board
 * so matching clusters form much more often.
 */
export function pickBiasedSymbol(symbols, index, gridSize, random = Math.random, bias = 3) {
  const r = Math.floor(index / gridSize);
  const c = index % gridSize;
  const neighbourIds = [];
  const deltas = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  for (const [dr, dc] of deltas) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
    const id = symbols[nr * gridSize + nc];
    if (id) neighbourIds.push(id);
  }

  // Also peek one cell below (common cascade neighbour).
  if (r + 1 < gridSize) {
    const below = symbols[(r + 1) * gridSize + c];
    if (below) neighbourIds.push(below);
  }

  if (!neighbourIds.length) return pickWeightedSymbol(random);

  const boost = new Map();
  for (const id of neighbourIds) {
    boost.set(id, (boost.get(id) || 0) + 1);
  }

  const weights = SYMBOLS.map((s) => {
    // Scatters stay rare — no neighbour clustering bias.
    if (s.scatter) return s.weight;
    const hits = boost.get(s.id) || 0;
    // Each neighbouring match multiplies weight by `bias` (~3× more similar drops).
    return s.weight * (hits > 0 ? bias * hits : 1);
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  for (let i = 0; i < SYMBOLS.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return SYMBOLS[i].id;
  }
  return SYMBOLS[SYMBOLS.length - 1].id;
}
