/** Pastry symbols for the board — decorative figures only, no real stakes. */

export const SYMBOLS = [
  { id: 'eclair', label: 'Эклер', glyph: '🥐', tint: '#c47a4a', weight: 18 },
  { id: 'pavlova', label: 'Анна Павлова', glyph: '🍨', tint: '#f3d6e0', weight: 16 },
  { id: 'cake', label: 'Тортик', glyph: '🎂', tint: '#e8b4b8', weight: 16 },
  { id: 'macaron', label: 'Макарон', glyph: '🧁', tint: '#d4a5c9', weight: 15 },
  { id: 'tart', label: 'Тарт', glyph: '🥧', tint: '#d4a574', weight: 14 },
  { id: 'choco', label: 'Шоколад', glyph: '🍫', tint: '#6b3f2a', weight: 13 },
  { id: 'berry', label: 'Ягодный', glyph: '🍓', tint: '#c23b4a', weight: 8 },
];

export const SYMBOL_BY_ID = Object.fromEntries(SYMBOLS.map((s) => [s.id, s]));

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
