import assert from 'node:assert/strict';
import {
  GRID_SIZE,
  MIN_CLUSTER,
  MULT_LADDER,
  MATCH_BIAS,
  createGameState,
  fillEmptyCells,
  findClusters,
  applyExplodeMarks,
  resolveTumbleStep,
  playBaseSpin,
  buyBonus,
  playFreeSpin,
  nextMultiplier,
  multTier,
  freeSpinsForScatters,
} from './engine.js';
import {
  pickBiasedSymbol,
  createDropMood,
  countScatters,
  SCATTER_ID,
  isScatter,
} from './symbols.js';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

{
  const symbols = Array(GRID_SIZE * GRID_SIZE).fill('cake');
  assert.equal(findClusters(symbols).length, 1);
}

{
  const symbols = Array(GRID_SIZE * GRID_SIZE).fill(null);
  for (let i = 0; i < MIN_CLUSTER - 1; i += 1) symbols[i] = 'eclair';
  assert.equal(findClusters(symbols).length, 0);
}

// Sticky: explode does not grow or move multipliers
{
  const state = createGameState(seeded(1));
  const cell = 10;
  state.multipliers[cell] = 4;
  state.marks[cell] = true;

  applyExplodeMarks(state, [cell]);
  assert.equal(state.multipliers[cell], 4);
  assert.equal(state.marks[cell], true);

  applyExplodeMarks(state, [cell]);
  assert.equal(state.multipliers[cell], 4);
  assert.equal(state.marks[cell], true);
}

{
  assert.equal(nextMultiplier(512), 1024);
  assert.equal(nextMultiplier(1024), 1024);
  assert.equal(MULT_LADDER.at(-1), 1024);
  assert.equal(multTier(2), 2);
  assert.equal(freeSpinsForScatters(3), 10);
  assert.equal(freeSpinsForScatters(5), 15);
  assert.equal(freeSpinsForScatters(7), 30);
}

{
  const state = createGameState(seeded(21));
  state.bet = 100;
  const bought = buyBonus(state, { superBonus: true });
  assert.equal(bought.ok, true);
  assert.equal(state.mode, 'super');
  assert.ok(state.multipliers.every((m) => m === 2));
}

{
  const state = createGameState(seeded(22));
  state.bet = 100;
  const bought = buyBonus(state, { superBonus: false });
  assert.equal(bought.ok, true);
  assert.equal(state.mode, 'bonus');
  assert.ok(state.multipliers.every((m) => m === 0));
  assert.ok(state.marks.every((m) => m === false));
}

{
  const state = createGameState(seeded(99));
  state.symbols = Array(GRID_SIZE * GRID_SIZE).fill('berry');
  state.multipliers[0] = 8;
  state.marks[0] = true;
  const step = resolveTumbleStep(state);
  assert.ok(step);
  assert.ok(step.stepWin > 0);
  // Multipliers stay put through explode + cascade
  assert.equal(step.multipliersAfter[0], 8);
  assert.equal(step.marksAfter[0], true);
  for (const cell of step.winningCells) {
    assert.equal(step.multipliersAfter[cell], cell === 0 ? 8 : 0);
  }
}

{
  const state = createGameState(seeded(3));
  fillEmptyCells(state);
  const spin = playBaseSpin(state);
  assert.equal(spin.ok, true);
  if (!spin.triggeredBonus) {
    assert.ok(state.multipliers.every((m) => m === 0));
  }
}

{
  const state = createGameState(seeded(11));
  state.bet = 100;
  buyBonus(state, { superBonus: false });
  state.multipliers[0] = 8;
  state.marks[0] = true;
  const fs = playFreeSpin(state);
  assert.equal(fs.ok, true);
  assert.equal(state.mode, 'bonus');
  assert.ok(state.multipliers[0] >= 8);
}

{
  assert.ok(MATCH_BIAS >= 3);
  const board = Array(GRID_SIZE * GRID_SIZE).fill(null);
  board[1] = 'cake';
  let cake = 0;
  const n = 2000;
  for (let i = 0; i < n; i += 1) {
    if (pickBiasedSymbol(board, 0, GRID_SIZE, Math.random, 3) === 'cake') cake += 1;
  }
  assert.ok(cake / n > 0.22, `expected frequent cake matches, got ${cake / n}`);
}

{
  const mood = createDropMood(seeded(42));
  assert.ok(mood.bias >= 1);
  assert.ok(mood.chaosRate >= 0 && mood.chaosRate < 1);
  assert.ok(mood.scatterBoost >= 1);

  // High chaos + no lucky → more non-neighbour variety than tight bias
  const board = Array(GRID_SIZE * GRID_SIZE).fill(null);
  board[1] = 'cake';
  const chaosMood = { bias: 1.5, chaosRate: 0.9, luckyId: null, luckyBoost: 1, scatterBoost: 1 };
  const tightMood = { bias: 6, chaosRate: 0, luckyId: null, luckyBoost: 1, scatterBoost: 1 };
  let chaosCake = 0;
  let tightCake = 0;
  const n = 1500;
  for (let i = 0; i < n; i += 1) {
    if (pickBiasedSymbol(board, 0, GRID_SIZE, Math.random, chaosMood) === 'cake') chaosCake += 1;
    if (pickBiasedSymbol(board, 0, GRID_SIZE, Math.random, tightMood) === 'cake') tightCake += 1;
  }
  assert.ok(
    tightCake > chaosCake,
    `tight bias should beat chaos (${tightCake} vs ${chaosCake})`,
  );
}

{
  // Different seeds should diverge board composition (randomness smoke test)
  const a = createGameState(seeded(7));
  const b = createGameState(seeded(8));
  fillEmptyCells(a);
  fillEmptyCells(b);
  const same = a.symbols.every((id, i) => id === b.symbols[i]);
  assert.equal(same, false);
}

{
  assert.equal(isScatter(SCATTER_ID), true);
  const board = Array(GRID_SIZE * GRID_SIZE).fill('cake');
  board[0] = SCATTER_ID;
  board[3] = SCATTER_ID;
  board[8] = SCATTER_ID;
  assert.equal(countScatters(board), 3);
  assert.equal(findClusters(board).every((c) => c.symbolId !== SCATTER_ID), true);
}

console.log('engine.test.mjs: all passed');
